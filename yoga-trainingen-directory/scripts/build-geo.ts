/**
 * Generates the geo reference tables. Run by hand; the output is COMMITTED.
 *
 *   npx tsx scripts/build-geo.ts
 *
 * These are facts about the Netherlands, not facts about a provider — so they
 * live in src/data/, never in a provider record, and no schema knows about
 * them. Distance itself is derived at render and never stored (spec §6).
 *
 * Sources (open, Dutch government, no API key):
 *   cities — PDOK Locatieserver   https://api.pdok.nl/bzk/locatieserver
 *   PC4    — CBS Postcode4 / PDOK https://service.pdok.nl/cbs/postcode4/2023
 */
import fs from "node:fs";
import path from "node:path";
import { loadDataset } from "../src/lib/dataset";

const OUT = path.join(process.cwd(), "src", "data");
const RETRIEVED = new Date().toISOString().slice(0, 10);

const LOCATIESERVER = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";
const PC4_WFS =
  "https://service.pdok.nl/cbs/postcode4/2023/wfs/v1_0?service=WFS&version=2.0.0" +
  "&request=GetFeature&typeName=postcode4&outputFormat=application/json" +
  "&srsName=EPSG:4326&propertyName=postcode,geom&count=1000";

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
    const res = await fetch(url);
    const doc = (await res.json())?.response?.docs?.[0];
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

  // A city we cannot place is a GAP, and must be visible as one — never silently
  // dropped. It will render under "locatie niet vermeld".
  if (missed.length) console.warn(`could not geocode: ${missed.join(", ")}`);

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(
    path.join(OUT, "city-centroids.json"),
    JSON.stringify(
      { _source: { url: LOCATIESERVER, name: "PDOK Locatieserver", retrieved: RETRIEVED }, cities: table },
      null,
      2,
    ),
  );
  console.log(`cities: ${Object.keys(table).length} geocoded, ${missed.length} missed`);
}

async function buildPc4() {
  const table: Record<string, [number, number]> = {};
  // The WFS caps at 1000 features per request — page through.
  for (let start = 0; start < 5000; start += 1000) {
    const res = await fetch(`${PC4_WFS}&startIndex=${start}`);
    const gj = await res.json();
    if (!gj.features?.length) break;
    for (const f of gj.features) {
      const g = f.geometry;
      if (!g) continue;
      const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
      let best: number[][] | null = null;
      let bestLen = -1;
      for (const p of polys) if (p[0].length > bestLen) { bestLen = p[0].length; best = p[0]; }
      if (!best) continue;
      const [lon, lat] = ringCentroid(best);
      table[String(f.properties.postcode)] = [round(lat), round(lon)];
    }
  }
  fs.writeFileSync(
    path.join(OUT, "pc4-centroids.json"),
    JSON.stringify({
      _source: { url: PC4_WFS, name: "CBS Postcode4 via PDOK WFS (2023)", retrieved: RETRIEVED },
      pc4: table,
    }),
  );
  console.log(`pc4: ${Object.keys(table).length} centroids`);
}

async function main() {
  await buildCities();
  await buildPc4();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
