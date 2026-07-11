import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceKm, cityCentroid, nearestKm, parsePostcode } from "./geo";
import { loadDataset } from "./dataset";

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
