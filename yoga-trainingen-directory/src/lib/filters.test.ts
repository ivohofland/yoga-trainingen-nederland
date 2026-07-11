import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDataset } from "./dataset";
import { toListingRows } from "./presenters";
import { cityCentroid } from "./geo";
import { EMPTY_FILTERS, filterRows, sortRows, partitionByDistance } from "./filters";

const { providers } = loadDataset();
const NOW = new Date("2026-07-01T00:00:00Z");
const ROWS = toListingRows(providers, NOW);
const UTRECHT = cityCentroid("Utrecht")!;

test("no filters returns everything", () => {
  assert.equal(filterRows(ROWS, EMPTY_FILTERS).length, ROWS.length);
});

test("every delivery mode in the data is reachable by a filter", () => {
  // The design offered only in_person and hybrid. The dataset also holds
  // `online` — those programmes must not be unreachable.
  const modes = new Set(ROWS.map((r) => r.mode));
  for (const mode of modes) {
    const got = filterRows(ROWS, { ...EMPTY_FILTERS, mode });
    assert.ok(got.length > 0, `mode '${mode}' matches nothing — programmes are unreachable`);
    assert.ok(got.every((r) => r.mode === mode));
  }
});

test("every format in the data is reachable by a filter", () => {
  const formats = new Set(ROWS.map((r) => r.formatLabel));
  for (const format of formats) {
    const got = filterRows(ROWS, { ...EMPTY_FILTERS, format });
    assert.ok(got.length > 0, `format '${format}' matches nothing`);
  }
});

test("the price filter never matches a programme whose price is not published", () => {
  for (const band of ["under3000", "from3000"]) {
    const got = filterRows(ROWS, { ...EMPTY_FILTERS, price: band });
    assert.ok(got.every((r) => r.priceAmount != null),
      `price band '${band}' matched a programme with no published price`);
  }
  const notPub = filterRows(ROWS, { ...EMPTY_FILTERS, price: "not_published" });
  assert.ok(notPub.every((r) => r.priceAmount == null));
});

/* ---------- distance (spec §6.3/§6.4) ---------- */

test("DISTANCE: nothing is ever silently dropped", () => {
  // The whole point. A radius filter that deletes rows it cannot place is the
  // same failure as the design's missing `online` chip.
  const g = partitionByDistance(ROWS, UTRECHT, 25);
  const accounted = g.near.length + g.farCount + g.online.length + g.unplaceable.length;
  assert.equal(accounted, ROWS.length,
    `${ROWS.length - accounted} rows vanished from the distance partition`);
});

test("DISTANCE: online programmes are kept, never distance-filtered", () => {
  const g = partitionByDistance(ROWS, UTRECHT, 25);
  const onlineRows = ROWS.filter((r) => r.mode === "online");
  assert.equal(g.online.length, onlineRows.length, "an online programme was distance-filtered away");
  assert.ok(g.near.every((r) => r.mode !== "online"), "an online row leaked into the distance results");
});

test("DISTANCE: providers we cannot place are kept and labelled, not dropped", () => {
  const g = partitionByDistance(ROWS, UTRECHT, 25);
  for (const r of g.unplaceable) {
    assert.equal(r.distanceKm, undefined, "an unplaceable row was given a distance");
  }
  assert.ok(g.near.every((r) => typeof r.distanceKm === "number"),
    "a matched row has no distance");
});

test("DISTANCE: the radius is honoured, and rows outside it are COUNTED", () => {
  const g = partitionByDistance(ROWS, UTRECHT, 25);
  assert.ok(g.near.every((r) => (r.distanceKm as number) <= 25), "a row beyond 25 km matched");
  const wide = partitionByDistance(ROWS, UTRECHT, 100);
  assert.ok(wide.near.length >= g.near.length, "a wider radius returned fewer rows");
  assert.ok(g.farCount > 0, "expected some programmes beyond 25 km of Utrecht");
});

test("DISTANCE: 'heel NL' (null radius) excludes nobody who can be placed", () => {
  const g = partitionByDistance(ROWS, UTRECHT, null);
  assert.equal(g.farCount, 0, "'heel NL' excluded someone");
});

test("DISTANCE: a multi-location provider matches on its NEAREST location", () => {
  // Balanzs runs the same training in Den Haag, Utrecht and Rotterdam.
  const g = partitionByDistance(ROWS, UTRECHT, 100);
  const balanzs = g.near.find((r) => r.providerId === "balanzs");
  assert.ok(balanzs, "Balanzs should be within 100 km of Utrecht");
  assert.ok((balanzs.distanceKm as number) < 5,
    `expected Balanzs to match on its Utrecht location, got ${balanzs.distanceKm} km`);
});

test("SORT: by distance puts the nearest first, and rows without one last", () => {
  const g = partitionByDistance(ROWS, UTRECHT, null);
  const sorted = sortRows([...g.near, ...g.online], "distance");
  const d = sorted.map((r) => r.distanceKm).filter((x): x is number => x != null);
  assert.deepEqual(d, [...d].sort((a, b) => a - b), "distances are not ascending");
  const firstUndefined = sorted.findIndex((r) => r.distanceKm == null);
  if (firstUndefined !== -1) {
    assert.ok(sorted.slice(firstUndefined).every((r) => r.distanceKm == null),
      "a row with a distance appears after one without");
  }
});

test("SORT: programmes without a computable €/contactuur sort LAST, never first", () => {
  // A programme that publishes no hours must not top a price ranking — that
  // would reward not publishing.
  const sorted = sortRows(ROWS, "pph");
  const firstNull = sorted.findIndex((r) => r.pph == null);
  if (firstNull !== -1) {
    assert.ok(sorted.slice(firstNull).every((r) => r.pph == null),
      "a computable price-per-contact-hour appears after a non-computable one");
  }
  const values = sorted.filter((r) => r.pph != null).map((r) => r.pph as number);
  assert.deepEqual(values, [...values].sort((a, b) => a - b),
    "computable price-per-contact-hour values are not in ascending order");
});

test("SORT: 'eerstvolgende start' puts programmes with no announced start last", () => {
  const sorted = sortRows(ROWS, "upcoming");
  const firstNull = sorted.findIndex((r) => r.nextCohort == null);
  if (firstNull !== -1) {
    assert.ok(sorted.slice(firstNull).every((r) => r.nextCohort == null),
      "a programme with an upcoming cohort appears after one without");
  }
});

test("SORT: A–Z is stable and alphabetical by provider then programme", () => {
  const sorted = sortRows(ROWS, "alphabetical");
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i];
    const cmp = a.providerName.localeCompare(b.providerName, "nl");
    assert.ok(cmp < 0 || (cmp === 0 && a.programName.localeCompare(b.programName, "nl") <= 0),
      `${a.providerName}/${a.programName} sorted before ${b.providerName}/${b.programName}`);
  }
});

test("sort never drops or duplicates a row", () => {
  for (const key of ["upcoming", "alphabetical", "pph", "verified", "distance"] as const) {
    const sorted = sortRows(ROWS, key);
    assert.equal(sorted.length, ROWS.length, `sort '${key}' changed the row count`);
    assert.equal(new Set(sorted.map((r) => r.href)).size, ROWS.length, `sort '${key}' duplicated a row`);
  }
});

test("filter, sort and partition are pure — they never mutate their input", () => {
  const before = ROWS.map((r) => r.href).join("|");
  sortRows(ROWS, "pph");
  filterRows(ROWS, { ...EMPTY_FILTERS, mode: "online" });
  partitionByDistance(ROWS, UTRECHT, 25);
  assert.equal(ROWS.map((r) => r.href).join("|"), before, "input array was mutated");
  assert.ok(ROWS.every((r) => !("distanceKm" in r)), "partitionByDistance mutated the source rows");
});
