import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDataset } from "./dataset";
import { toListingRows, datasetStats } from "./presenters";
import { nl } from "./strings";

const { providers } = loadDataset();
const NOW = new Date("2026-07-01T00:00:00Z"); // fixed — never let a test depend on the wall clock

test("every programme in the dataset becomes exactly one row", () => {
  const rows = toListingRows(providers, NOW);
  const programCount = providers.reduce((n, p) => n + p.programs.length, 0);
  assert.equal(rows.length, programCount);
});

test("an announced cohort is never labelled as one that ran", () => {
  // spec §8: recording an announcement as if it happened is the central trap.
  // "confirmed_ran" cohorts really did run — their Dutch label legitimately
  // contains "gedraaid", regardless of whether the start date happens to be
  // in the future (a cohort can be confirmed as running before its own start
  // month has fully passed). The invariant this guards is narrower than "no
  // cohort ever mentions running": only an ANNOUNCED cohort must never be
  // presented as one that ran.
  const rows = toListingRows(providers, NOW);
  for (const r of rows) {
    if (!r.nextCohort) continue;
    const { status, label } = r.nextCohort;
    // the status is never omitted from the label, whatever it is
    assert.ok(label.includes(nl.cohortStatus[status]),
      `programme ${r.programId} cohort label omits its status (${status})`);
    if (status === "announced") {
      assert.match(label, /aangekondigd/,
        `programme ${r.programId} shows an announced cohort without saying so`);
      assert.doesNotMatch(label, /gedraaid|gestart|liep/,
        `programme ${r.programId} implies an announced cohort ran`);
    }
    if (status === "confirmed_ran") {
      assert.match(label, /gedraaid/,
        `programme ${r.programId} confirms a cohort ran but the label doesn't say so`);
    }
  }
});

test("next cohort is never in the past", () => {
  const rows = toListingRows(providers, NOW);
  for (const r of rows) {
    if (r.nextCohort) {
      assert.ok(r.nextCohort.start >= "2026-07",
        `programme ${r.programId} offers a next cohort of ${r.nextCohort.start}, which is past`);
    }
  }
});

test("a programme with no computable price-per-contact-hour carries a caveat, not a zero", () => {
  const rows = toListingRows(providers, NOW);
  for (const r of rows) {
    if (r.pph == null) {
      assert.ok(r.pphCaveat && r.pphCaveat.length > 0,
        `programme ${r.programId} has no pph and no explanation why`);
    } else {
      assert.ok(r.pph > 0, `programme ${r.programId} has a non-positive pph`);
    }
  }
});

test("a price that is not published never renders as a number", () => {
  // pricePublished is quad-state (yes | no | not_published | unknown, spec's
  // quad-state convention); an amount is only legitimate when it is "yes" —
  // "no", "not_published", and "unknown" must all carry neither a number nor
  // a rendered price string.
  const rows = toListingRows(providers, NOW);
  for (const r of rows) {
    if (r.pricePublished !== "yes") {
      assert.equal(r.priceAmount, null,
        `programme ${r.programId} has an amount despite pricePublished=${r.pricePublished}`);
      assert.equal(r.priceDisplay, null,
        `programme ${r.programId} renders a price despite pricePublished=${r.pricePublished}`);
    }
  }
});

test("the disclosure flag is set for every provider that has one", () => {
  // content/methodologie.md promises: "Zulke banden staan expliciet vermeld
  // bij de betreffende vermelding."
  const rows = toListingRows(providers, NOW);
  const withDisclosure = new Set(providers.filter((p) => p.disclosure).map((p) => p.id));
  for (const r of rows) {
    assert.equal(r.hasDisclosure, withDisclosure.has(r.providerId),
      `disclosure flag wrong for ${r.providerId}`);
  }
});

test("row hrefs deep-link to the programme on the provider record", () => {
  const rows = toListingRows(providers, NOW);
  for (const r of rows) {
    assert.equal(r.href, `/aanbieder/${r.providerId}#programma-${r.programId}`);
  }
});

test("stats are derived from the data, never hard-coded", () => {
  const stats = datasetStats(providers);
  assert.equal(stats.providers, providers.length);
  assert.equal(stats.programs, providers.reduce((n, p) => n + p.programs.length, 0));
  assert.ok(stats.pphComputable <= stats.programs);
  assert.match(stats.lastVerified ?? "", /^\d{4}-\d{2}/);
});

test("presenters are pure — they never mutate the dataset", () => {
  const before = JSON.stringify(providers);
  toListingRows(providers, NOW);
  datasetStats(providers);
  assert.equal(JSON.stringify(providers), before, "a presenter mutated its input");
});

test("every row carries its raw city names, for the distance filter to place", () => {
  const rows = toListingRows(providers, NOW);
  for (const r of rows) {
    const provider = providers.find((p) => p.id === r.providerId)!;
    const expected = [...new Set(provider.locations.map((l) => l.city).filter((c): c is string => c != null))];
    assert.deepEqual(r.cities, expected, `${r.providerId} lost or invented a city`);
  }
});
