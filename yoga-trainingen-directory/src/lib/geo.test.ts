import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceKm, cityCentroid, nearestKm, parsePostcode, pc4Centroid, placeCities } from "./geo";
import { loadDataset } from "./loader";

test("distanceKm is a real haversine, not a euclidean fudge", () => {
  // Amsterdam centraal → Utrecht centraal is ~35 km as the crow flies.
  const ams = { lat: 52.3791, lon: 4.9003 };
  const utr = { lat: 52.0907, lon: 5.124 };
  const d = distanceKm(ams, utr);
  assert.ok(d > 33 && d < 38, `expected ~35 km, got ${d}`);
  assert.equal(distanceKm(ams, ams), 0);
  assert.equal(Math.round(distanceKm(ams, utr)), Math.round(distanceKm(utr, ams)), "not symmetric");
});

test("every city in the dataset has a centroid, or is honestly unplaceable", () => {
  const { providers } = loadDataset();
  const cities = [...new Set(providers.flatMap((p) => p.locations.map((l) => l.city)).filter((c): c is string => c != null))];
  const missing = cities.filter((c) => cityCentroid(c) == null);
  // A miss is allowed — it renders under "locatie niet vermeld" — but it must
  // be rare, and it must be a deliberate, visible gap rather than a surprise.
  assert.ok(missing.length <= 2, `too many unplaceable cities: ${missing.join(", ")}`);
});

test("a provider with several locations matches on its NEAREST one", () => {
  // Balanzs runs the same training in Den Haag, Utrecht and Rotterdam.
  const utrecht = cityCentroid("Utrecht");
  assert.ok(utrecht);
  const d = nearestKm(["Den Haag", "Utrecht", "Rotterdam"], utrecht);
  assert.ok(d != null && d < 1, `expected ~0 km from Utrecht to itself, got ${d}`);
});

test("a provider places on its nearest PLACEABLE city, rather than being dropped", () => {
  // Inner Axis teaches in Utrecht and in "Salzburg (regio), Oostenrijk". The
  // Austrian location legitimately does not resolve against a Dutch register.
  // One unplaceable location must not make the whole provider unplaceable —
  // that would silently drop a training that genuinely runs in Utrecht.
  const utrecht = cityCentroid("Utrecht");
  assert.ok(utrecht);
  const d = nearestKm(["Utrecht", "Salzburg (regio), Oostenrijk"], utrecht);
  assert.notEqual(d, null, "a mixed placeable/unplaceable provider was dropped as unplaceable");
  assert.ok(d != null && d < 1, `expected ~0 km via its Utrecht location, got ${d}`);
});

test("nearestKm returns null when no city can be placed — never 0, never Infinity", () => {
  // 0 would mean "right here" and Infinity would sort it as far away. Both lie.
  assert.equal(nearestKm([], { lat: 52, lon: 5 }), null);
  assert.equal(nearestKm(["Nergenshuizen"], { lat: 52, lon: 5 }), null);
});

test("parsePostcode accepts what Dutch people actually type", () => {
  assert.equal(parsePostcode("3512 KT"), "3512");
  assert.equal(parsePostcode("3512kt"), "3512");
  assert.equal(parsePostcode("3512"), "3512");
  assert.equal(parsePostcode(" 1011 "), "1011");
  assert.equal(parsePostcode("nonsense"), null);
  assert.equal(parsePostcode("123"), null, "a 3-digit code is not a postcode");
  assert.equal(parsePostcode("0999"), null, "Dutch postcodes start at 1000");
});

/* ---------- pc4Centroid: every visitor's postcode goes through here ---------- */

test("pc4Centroid resolves the known ground truth — the table is not silently empty", async () => {
  // UNTESTED, and it is the lookup the whole location filter stands on. Rename a
  // key in pc4-centroids.json (`pc4` → `codes`, say, or ship a table keyed by
  // number instead of string) and this returns null for all 4,070 codes: the filter
  // reports "Deze postcode kennen we niet" for every postcode in the Netherlands,
  // and every test still passes, because nothing ever asked it for a real one.
  //
  // Ground truth, from the committed CBS/PDOK table: three cities, three provinces.
  assert.deepEqual(await pc4Centroid("3512"), { lat: 52.0907, lon: 5.124 }, "Utrecht");
  assert.deepEqual(await pc4Centroid("1011"), { lat: 52.3725, lon: 4.9058 }, "Amsterdam");
  assert.deepEqual(await pc4Centroid("7065"), { lat: 51.9174, lon: 6.4485 }, "Sinderen");
});

test("pc4Centroid returns null for a code it does not hold — never a wrong centroid", async () => {
  // The honest answer to "we do not know this postcode" is null, which the UI turns
  // into "Deze postcode kennen we niet". A neighbouring centroid, a zero, or a
  // default (Amsterdam, the Netherlands' geographic middle) would silently compute
  // every distance on the page from a place the visitor is not.
  assert.equal(await pc4Centroid("0000"), null);
  assert.equal(await pc4Centroid("not-a-code"), null);
  assert.equal(await pc4Centroid(""), null);
});

test("pc4Centroid agrees with the city table it is used alongside", async () => {
  // The two tables are generated separately and must describe the same country: a
  // visitor in 3512 is ~0 km from "Utrecht", not 200 km from it. A units slip
  // (lat/lon swapped in one table, degrees vs radians) would leave both tables
  // internally consistent and every distance on the site wrong.
  const pc4 = await pc4Centroid("3512");
  const utrecht = cityCentroid("Utrecht");
  assert.ok(pc4 && utrecht);
  assert.ok(distanceKm(pc4, utrecht) < 5,
    `postcode 3512 is ${distanceKm(pc4, utrecht)} km from the city centroid of Utrecht — the postcode ` +
    `table and the city table do not describe the same place`);
});

/* ---------- WHY a row has no distance: two different statements ---------- */

test("placeCities distinguishes 'no city in the record' from 'a city we cannot place'", () => {
  // nearestKm returns null for both, and the listing printed ONE heading over both:
  // "Locatie niet vermeld — wij kunnen deze niet plaatsen". Over a provider who DID
  // state a city our tables cannot geocode, that is a false statement about a named
  // business — printed above a row whose own city cell shows the location the
  // heading claims was never given.
  const origin = { lat: 52, lon: 5 };

  assert.deepEqual(placeCities([], origin), { kind: "no_city" },
    "a record with no city at all");
  assert.deepEqual(placeCities(["Nergenshuizen"], origin), { kind: "no_centroid", cities: ["Nergenshuizen"] },
    "they told us where they teach; WE cannot place it. That is our gap, and it must say so.");

  const placed = placeCities(["Utrecht"], cityCentroid("Utrecht")!);
  assert.equal(placed.kind, "placed");
  assert.ok(placed.kind === "placed" && placed.km < 1);

  // A mixed provider still places: one unplaceable location must not sink a
  // training that genuinely runs in Utrecht (Inner Axis teaches in Utrecht and in
  // "Salzburg (regio), Oostenrijk").
  const mixed = placeCities(["Utrecht", "Salzburg (regio), Oostenrijk"], cityCentroid("Utrecht")!);
  assert.equal(mixed.kind, "placed");

  // nearestKm stays the thin wrapper — same answer, minus the reason.
  assert.equal(nearestKm([], origin), null);
  assert.equal(nearestKm(["Nergenshuizen"], origin), null);
  assert.ok(nearestKm(["Utrecht"], cityCentroid("Utrecht")!) != null);
});
