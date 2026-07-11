import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDataset } from "./dataset";
import { toListingRows } from "./presenters";
import { saysNotPublished } from "./quad";
import { cityCentroid } from "./geo";
import { EMPTY_FILTERS, filterRows, sortRows, partitionByDistance, type Row } from "./filters";

const { providers } = loadDataset();
const NOW = new Date("2026-07-01T00:00:00Z");
const ROWS = toListingRows(providers, NOW);
const UTRECHT = cityCentroid("Utrecht")!;

/** The record behind a row — a filter's claim is checked against the RECORD, never
 *  against the predicate the filter itself is built from. */
const programOf = (providerId: string, programId: string) =>
  providers.find((p) => p.id === providerId)!.programs.find((p) => p.id === programId)!;

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
    assert.ok(got.every((r) => r.formatLabel === format),
      `format filter '${format}' matched a programme with another format`);
  }
});

test("PRICE: the two amount bands match only programmes with a published amount", () => {
  for (const band of ["under3000", "from3000"]) {
    const got = filterRows(ROWS, { ...EMPTY_FILTERS, price: band });
    assert.ok(got.every((r) => r.priceAmount != null),
      `price band '${band}' matched a programme with no published price`);
  }
});

test("PRICE: 'niet gepubliceerd' selects the FINDING — never “we hold no amount”", () => {
  // The band is an accusation, so it must be made of findings ONLY. It selected
  // on `priceAmount == null` — a fact about OUR record, not about the provider —
  // and so returned 24 rows where only 19 are findings: it told the reader that
  // AALO Yoga Academie, de Blikopener, SanaYou and Yoga Academie Nederland
  // publish no price, while our own record (and their own record page, and the
  // Prijs cell in the very row the filter returned) says they do.
  const notPub = filterRows(ROWS, { ...EMPTY_FILTERS, price: "not_published" });
  assert.ok(notPub.length > 0, "the 'niet gepubliceerd' band matches nothing at all");

  for (const r of notPub) {
    // What the row itself RENDERS in its Prijs cell must be the finding the band
    // claims. A row cannot sit in an accusation and deny it in its own cell.
    assert.ok(saysNotPublished(r.priceState),
      `${r.providerId}/${r.programId}: the "niet gepubliceerd" band asserts this provider publishes no ` +
      `price, but the row's own Prijs cell says "${r.priceState}" — a false statement about a named business`);
    // and the record agrees, not just the row
    const published = programOf(r.providerId, r.programId).price.published;
    assert.ok(published === "not_published" || published === "no",
      `${r.providerId}/${r.programId}: the record says price.published is "${published}"`);
  }

  // Nothing dropped, either: every genuine finding is reachable through the band.
  assert.equal(notPub.length, ROWS.filter((r) => saysNotPublished(r.priceState)).length,
    "the 'niet gepubliceerd' band dropped a genuine finding");

  // Both literal RECORD values that mean "they do not publish it" are in there —
  // the band is not secretly just one of them. They are checked on the RECORD,
  // not on the rendered quad, because the rendered quad is now the same for both:
  // priceQuad() normalises `no` to `not_published` on this *_published field, so
  // the band's 19 rows render as ONE finding in ONE colour. They did not: 14 came
  // out amber "niet gepubliceerd" and 5 in fact-ink "nee" — one filter, one
  // asserted meaning, two renderings, on the same screen.
  const recordSays = (r: (typeof notPub)[number]) => programOf(r.providerId, r.programId).price.published;
  assert.ok(notPub.some((r) => recordSays(r) === "not_published"), "no 'not_published' row in the band");
  assert.ok(notPub.some((r) => recordSays(r) === "no"), "no 'no' row in the band — that finding is unreachable");
  assert.ok(notPub.every((r) => r.priceState === "not_published"),
    "a row in the 'niet gepubliceerd' band renders as something other than the finding the band asserts");
});

test("PRICE: the bands honour the €3.000 boundary, and OUR gaps belong to no band", () => {
  const under = filterRows(ROWS, { ...EMPTY_FILTERS, price: "under3000" });
  const from = filterRows(ROWS, { ...EMPTY_FILTERS, price: "from3000" });
  const notPub = filterRows(ROWS, { ...EMPTY_FILTERS, price: "not_published" });
  assert.ok(under.length > 0 && from.length > 0, "a price band matches nothing at all");
  assert.ok(under.every((r) => (r.priceAmount as number) < 3000),
    "'onder €3.000' matched a programme costing €3.000 or more");
  assert.ok(from.every((r) => (r.priceAmount as number) >= 3000),
    "'€3.000 en hoger' matched a programme costing less than €3.000");

  // The bands used to be asserted as a partition of all 77 rows. They are not one,
  // and forcing them to be is precisely how the five gap rows ended up inside an
  // accusation: every row had to land in SOME band, so the leftover bucket took
  // them. A price band is a statement — "it costs this much", "they publish no
  // price" — and about these five we can honestly make neither. They are OUR gap;
  // they belong in no band, and they are visible in the unfiltered list, where a
  // reader meets them as "nog niet onderzocht".
  const ourGaps = ROWS.filter((r) => r.priceState === "unknown");
  assert.ok(ourGaps.length > 0, "no programme is a price gap any more — this test tests nothing");
  for (const g of ourGaps) {
    for (const band of ["under3000", "from3000", "not_published"] as const) {
      const got = filterRows(ROWS, { ...EMPTY_FILTERS, price: band });
      assert.ok(!got.some((r) => r.href === g.href),
        `${g.providerId}/${g.programId} is a gap in OUR record, yet the '${band}' band claims it`);
    }
  }

  // Nothing else is lost: the three bands plus our gaps account for every row.
  assert.equal(under.length + from.length + notPub.length + ourGaps.length, ROWS.length,
    "the price bands and the gaps do not account for every programme");
  // The bands are disjoint — no row is counted in two.
  const hrefs = [...under, ...from, ...notPub].map((r) => r.href);
  assert.equal(new Set(hrefs).size, hrefs.length, "a programme appears in two price bands");
});

test("REGISTER: the YA chip agrees with the Registerstatus cell it sits next to", () => {
  const ya = filterRows(ROWS, { ...EMPTY_FILTERS, register: "ya" });
  assert.ok(ya.length > 0, "no programme is YA register-verified — the chip matches nothing");

  // Yoga Alliance registers per programme (per RYS), and the column shows the
  // PROGRAMME's accreditation. The filter read `provider.registrations` instead —
  // a fact about the school — and so returned six programmes whose own
  // Registerstatus cell said "nog niet onderzocht": a filter asserting a
  // programme is register-verified, next to a cell saying we never checked.
  //
  // So the test is not `yaVerified === "yes"` (the implementation checking
  // itself). It is: whatever the ROW RENDERS must back the claim the chip makes.
  for (const r of ya) {
    const chip = r.registers.find((c) => c.bodyKey === "yoga_alliance");
    assert.ok(chip,
      `${r.providerId}/${r.programId}: returned by "YA register-geverifieerd", but the row shows no ` +
      `Yoga Alliance register status at all — the filter asserts what the cell does not`);
    assert.equal(chip.verified, "yes",
      `${r.providerId}/${r.programId}: the YA chip in this row renders "${chip.verified}", yet the filter ` +
      `claims it is register-verified`);
    // and it is the programme's accreditation that says so, not the provider's
    const prog = programOf(r.providerId, r.programId);
    assert.ok(prog.accreditation.some((a) => a.body === "yoga_alliance" && a.verified === "yes"),
      `${r.providerId}/${r.programId}: no verified Yoga Alliance accreditation on the PROGRAMME`);
  }

  // Nothing verified is dropped, and "not verified" is never "verified": a claim
  // we could not confirm must not be reachable through a filter that says we did.
  assert.equal(ya.length, ROWS.filter((r) => r.yaVerified === "yes").length,
    "the YA filter dropped a verified programme");
  assert.ok(ya.every((r) => r.yaVerified !== "not_published" && r.yaVerified !== "unknown"));

  // The rows the old provider-level filter wrongly swept in are gone: each is a
  // programme of a YA-registered school that carries no verified YA accreditation
  // of its own.
  const schoolYaButNotThisProgramme = ROWS.filter((r) => {
    const p = providers.find((x) => x.id === r.providerId)!;
    const schoolVerified = p.registrations.some(
      (reg) => reg.body === "yoga_alliance" && reg.verified_in_register === "yes",
    );
    return schoolVerified && r.yaVerified !== "yes";
  });
  assert.ok(schoolYaButNotThisProgramme.length > 0,
    "no programme separates the school-level fact from the programme-level one — this test tests nothing");
  for (const r of schoolYaButNotThisProgramme) {
    assert.ok(!ya.some((x) => x.href === r.href),
      `${r.providerId}/${r.programId}: the school is on the YA register, but THIS programme is not — ` +
      `the chip must not claim a programme-level fact from a school-level one`);
  }
});

test("REGISTER: the CRKBO chip matches only CRKBO-registered schools", () => {
  // CRKBO registers institutions and teachers, not programmes — this chip is a
  // property of the SCHOOL and says so. There is no Registerstatus cell for it to
  // contradict.
  const crkbo = filterRows(ROWS, { ...EMPTY_FILTERS, register: "crkbo" });
  assert.ok(crkbo.length > 0, "no programme is CRKBO-registered — the chip matches nothing");
  for (const r of crkbo) {
    const p = providers.find((x) => x.id === r.providerId)!;
    assert.equal(p.crkbo.registered, "yes",
      `${r.providerId}: the CRKBO filter matched a school that is not CRKBO-registered`);
  }
  assert.equal(crkbo.length, ROWS.filter((r) => r.crkboRegistered === "yes").length,
    "the CRKBO filter dropped a registered programme");
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

test("DISTANCE: an UNPLACEABLE row is kept — proven with a row we know cannot be placed", () => {
  // Today's dataset happens to contain no unplaceable provider, so every
  // assertion about `unplaceable` above is vacuously true: replace
  // `unplaceable.push(...)` with `continue` and they all still pass. A rule
  // that only holds because the triggering data is absent is not a rule.
  //
  // So: manufacture the trigger. "Nergenshuizen" is in no centroid table, and
  // an in-person programme there is exactly the row a radius filter is tempted
  // to delete — the reader would never learn it existed.
  const ghost: Row = { ...ROWS[0], providerId: "nergens", href: "/aanbieder/nergens#programma-x", cities: ["Nergenshuizen"], mode: "in_person" };
  const input = [...ROWS, ghost];
  const g = partitionByDistance(input, UTRECHT, 25);

  const kept = g.unplaceable.find((r) => r.href === ghost.href);
  assert.ok(kept, "a provider we cannot place was silently dropped by the radius filter");
  assert.equal(kept.distanceKm, undefined, "an unplaceable row was given a distance it cannot have");
  assert.ok(!g.near.some((r) => r.href === ghost.href), "an unplaceable row leaked into the radius results");
  assert.ok(!g.online.some((r) => r.href === ghost.href), "an in-person row was counted as online");

  const accounted = g.near.length + g.farCount + g.online.length + g.unplaceable.length;
  assert.equal(accounted, input.length,
    `${input.length - accounted} rows vanished from the distance partition`);
  assert.equal(g.unplaceable.length, 1, "the unplaceable group did not hold exactly the one row it should");
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

test("SORT: 'eerstvolgende start' puts programmes with no announced start last, soonest first", () => {
  const sorted = sortRows(ROWS, "upcoming");
  const firstNull = sorted.findIndex((r) => r.nextCohort == null);
  if (firstNull !== -1) {
    assert.ok(sorted.slice(firstNull).every((r) => r.nextCohort == null),
      "a programme with an upcoming cohort appears after one without");
  }
  // Nulls-last alone would also hold for a comparator sorting the real starts
  // BACKWARDS. Pin the direction: soonest start first.
  const starts = sorted.map((r) => r.nextCohort?.start).filter((s): s is string => s != null);
  assert.ok(starts.length > 1, "not enough announced starts to prove the ordering");
  assert.deepEqual(starts, [...starts].sort(),
    "announced starts are not in ascending order — the soonest start must come first");
});

test("SORT: 'laatst geverifieerd' puts the most recently verified record first", () => {
  const sorted = sortRows(ROWS, "verified");
  const dates = sorted.map((r) => r.lastVerified);
  assert.ok(new Set(dates).size > 1, "every record shares one verification date — the sort proves nothing");
  assert.deepEqual(dates, [...dates].sort().reverse(),
    "verification dates are not in descending order — a stale record outranks a fresh one");
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
