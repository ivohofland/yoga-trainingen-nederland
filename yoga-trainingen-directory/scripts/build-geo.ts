/**
 * Generates the geo reference tables. Run by hand; the output is COMMITTED.
 *
 *   npx tsx scripts/build-geo.ts
 *
 * These are facts about the Netherlands, not facts about a provider — so they
 * live in src/data/, never in a provider record, and no schema knows about
 * them. Distance itself is derived at render and never stored (spec §6).
 *
 * THIS SCRIPT MUST NEVER WRITE A DEGRADED TABLE. Its output is committed and
 * served, and a shortfall here does not surface as an error on the site — it
 * surfaces as a confident lie: an empty pc4 table tells every visitor who types
 * a perfectly valid postcode "Deze postcode kennen we niet." Neither fetch used
 * to check `res.ok`, so a PDOK throttle or a WFS exception — both served with
 * HTTP 200 and no `features` key — broke the paging loop on page one, wrote a
 * near-empty file, printed "pc4: 0 centroids" and exited 0. Every failure below
 * therefore THROWS before anything is written. A missing table is a visible
 * problem; a wrong one is not.
 *
 * Sources (open, Dutch government, no API key):
 *   cities — PDOK Locatieserver   https://api.pdok.nl/bzk/locatieserver
 *   PC4    — CBS Postcode4 / PDOK https://service.pdok.nl/cbs/postcode4/2023
 */
import fs from "node:fs";
import path from "node:path";
import { loadDataset } from "../src/lib/loader";

const OUT = path.join(process.cwd(), "src", "data");
const RETRIEVED = new Date().toISOString().slice(0, 10);

const LOCATIESERVER = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";
const PC4_PAGE = 1000; // the WFS caps at 1000 features per request
const PC4_WFS =
  "https://service.pdok.nl/cbs/postcode4/2023/wfs/v1_0?service=WFS&version=2.0.0" +
  "&request=GetFeature&typeName=postcode4&outputFormat=application/json" +
  `&srsName=EPSG:4326&propertyName=postcode,geom&count=${PC4_PAGE}`;

/**
 * The floor the PC4 table must clear. CBS publishes ~4,070 PC4 areas; the number
 * moves a little between vintages, so this is a floor, not an equality — but a
 * table with 3,000 entries is not a smaller Netherlands, it is a truncated
 * download, and roughly a quarter of the country's postcodes would come back
 * "onbekend" from a file that reported success.
 */
const PC4_MIN = 4000;

/** A 200 with a WFS exception in the body is still a failure. Say so, loudly. */
async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} from ${url}`);
  }
  return res.json();
}

/** "POINT(5.12723144 52.08832478)" → { lat, lon } */
function parsePoint(wkt: string): { lat: number; lon: number } {
  const m = /POINT\(([-\d.]+) ([-\d.]+)\)/.exec(wkt);
  if (!m) throw new Error(`unparseable point: ${wkt}`);
  return { lat: round(Number(m[2])), lon: round(Number(m[1])) };
}

const round = (n: number) => Math.round(n * 1e4) / 1e4;

/** Signed-area centroid of a ring. Exact enough that no PC4 lands in the wrong town. */
function ringCentroid(ring: number[][]): [number, number] {
  let x = 0, y = 0, a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x0, y0] = ring[j];
    const [x1, y1] = ring[i];
    const f = x0 * y1 - x1 * y0;
    a += f;
    x += (x0 + x1) * f;
    y += (y0 + y1) * f;
  }
  a *= 0.5;
  if (!a) return [ring[0][0], ring[0][1]];
  return [x / (6 * a), y / (6 * a)];
}

async function buildCities() {
  const { providers, errors } = loadDataset();
  if (errors.length) throw new Error(`dataset invalid:\n${errors.join("\n")}`);

  const cities = [
    ...new Set(providers.flatMap((p) => p.locations.map((l) => l.city)).filter((c): c is string => c != null)),
  ].sort();

  const table: Record<string, { lat: number; lon: number; provincie?: string }> = {};
  const missed: string[] = [];

  for (const city of cities) {
    const url = `${LOCATIESERVER}?q=${encodeURIComponent(city)}&fq=type:woonplaats&rows=1&fl=weergavenaam,centroide_ll`;
    const doc = (await getJson(url) as { response?: { docs?: { centroide_ll?: string; weergavenaam?: string }[] } })
      ?.response?.docs?.[0];
    if (!doc?.centroide_ll) {
      missed.push(city);
      continue;
    }
    const { lat, lon } = parsePoint(doc.centroide_ll);
    // "Sinderen, Oude IJsselstreek, Gelderland" → province is the last part.
    const provincie = String(doc.weergavenaam).split(",").pop()?.trim();
    table[city] = { lat, lon, provincie };
    await new Promise((r) => setTimeout(r, 120)); // be polite to a free public API
  }

  // THROW, never warn-and-write.
  //
  // `missed` conflates two very different things, and only one of them is
  // acceptable: "PDOK does not know this city" (a real gap) and "this request was
  // throttled" (a transient failure). Written out, they are indistinguishable —
  // a rate-limited Utrecht becomes a provider that renders forever under "Locatie
  // niet vermeld — wij kunnen deze niet plaatsen", a published statement about a
  // named business that our own record contradicts.
  //
  // Every city here comes from a provider record that names it, so a genuine miss
  // is a data question for a human (a typo, a hamlet PDOK files under its
  // municipality), not something a generator may resolve by shipping the gap. Run
  // it again; if the miss is real, fix the record or add a deliberate override.
  if (missed.length) {
    throw new Error(
      `could not geocode ${missed.length} of ${cities.length} cities: ${missed.join(", ")}\n` +
        `Refusing to write city-centroids.json. A rate-limited lookup and a city PDOK does not ` +
        `know land in this same list, and writing them out publishes "locatie niet vermeld" ` +
        `against a named provider whose city we do in fact hold. Re-run; if a miss is real, ` +
        `correct the record.`,
    );
  }

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(
    path.join(OUT, "city-centroids.json"),
    JSON.stringify(
      { _source: { url: LOCATIESERVER, name: "PDOK Locatieserver", retrieved: RETRIEVED }, cities: table },
      null,
      2,
    ),
  );
  console.log(`cities: ${Object.keys(table).length} geocoded (all of them)`);
}

interface Pc4Feature {
  geometry?: { type: string; coordinates: number[][][] | number[][][][] } | null;
  properties: { postcode: string | number };
}

async function buildPc4() {
  const table: Record<string, [number, number]> = {};

  // Page until a request returns fewer rows than it could have — the only signal
  // that says "that was the last page". The old loop capped at `start < 5000`,
  // which is a guess about how many PC4 areas the Netherlands has: publish a
  // 5,001st and the table silently loses everything past it, with no error and no
  // way to notice from the output. A short page is the end; a full page is not.
  for (let start = 0; ; start += PC4_PAGE) {
    const gj = (await getJson(`${PC4_WFS}&startIndex=${start}`)) as { features?: Pc4Feature[] };
    const features = gj.features;
    // No `features` key at all is a WFS exception served as 200, NOT an empty
    // page. Breaking on it is what turned a throttle into a committed, empty
    // table; the PC4_MIN floor below is the backstop that now catches it.
    if (!Array.isArray(features)) {
      throw new Error(
        `PC4 page at startIndex=${start} carried no \`features\` array — a WFS exception, not an ` +
          `empty page. Refusing to write a partial pc4-centroids.json.`,
      );
    }
    for (const f of features) {
      const g = f.geometry;
      if (!g) continue;
      const polys = (g.type === "Polygon" ? [g.coordinates] : g.coordinates) as number[][][][];
      let best: number[][] | null = null;
      let bestLen = -1;
      for (const p of polys) if (p[0].length > bestLen) { bestLen = p[0].length; best = p[0]; }
      if (!best) continue;
      const [lon, lat] = ringCentroid(best);
      table[String(f.properties.postcode)] = [round(lat), round(lon)];
    }
    if (features.length < PC4_PAGE) break; // a short page is the last page
  }

  // The floor. Below it, the download was truncated — and a truncated table does
  // not fail visibly, it tells a visitor with a real postcode that we have never
  // heard of it. Refuse to write.
  const count = Object.keys(table).length;
  if (count < PC4_MIN) {
    throw new Error(
      `pc4: only ${count} centroids, expected at least ${PC4_MIN} (CBS publishes ~4,070). ` +
        `Refusing to write pc4-centroids.json: a short table does not surface as an error, it ` +
        `surfaces as "Deze postcode kennen we niet." for postcodes that plainly exist.`,
    );
  }

  fs.writeFileSync(
    path.join(OUT, "pc4-centroids.json"),
    JSON.stringify({
      _source: { url: PC4_WFS, name: "CBS Postcode4 via PDOK WFS (2023)", retrieved: RETRIEVED },
      pc4: table,
    }),
  );
  console.log(`pc4: ${count} centroids`);
}

async function main() {
  await buildCities();
  await buildPc4();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
