/**
 * The provenance check, and the corpus held against it.
 *
 * The headline test is the last one: ZERO records claim a published price while
 * citing a page whose archived artifacts show no amount. It was 4 when the check was
 * written (aalo ×2, de-blikopener, yoga-academie-nederland) — every one of them a
 * record that cited the page LINKING to the price instead of the page stating it.
 * The rest of this file pins the two things that make that number trustworthy: the
 * money regex, and the rule that BOTH artifacts count.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDataset } from "./loader";
import { allPriceProvenance, evidencesPrice, pdftotextAvailable } from "./provenance";

const { providers } = loadDataset();
const report = allPriceProvenance(providers);

/* ---------- the money regex ---------- */

test("a euro sign split from its digits across text runs still reads as a price", () => {
  // This is not a hypothetical: `pdftotext` on a browser-rendered page emits the
  // sign and the amount on separate lines, because the browser put them in separate
  // spans. `/€\s?\d/` misses it, and NewNature's add-to-cart price is exactly this.
  assert.ok(evidencesPrice("€\n449,-"));
  assert.ok(evidencesPrice("€\r\n 2.450,00"));
  assert.ok(evidencesPrice("€ 1795"));
});

test("the spelled-out forms count too", () => {
  assert.ok(evidencesPrice("2450 euro"));
  assert.ok(evidencesPrice("2.450 EUR"));
  assert.ok(evidencesPrice("EUR 2450"));
});

test("hours, dates and plain prose are not prices", () => {
  // The failure mode that matters: a yoga school's page is FULL of numbers — 200 uur,
  // 300 uur, 2026. If any of them read as money, the check passes a record whose
  // cited page shows no price at all, which is precisely the bug it exists to catch.
  assert.ok(!evidencesPrice("200 uur contactonderwijs"));
  assert.ok(!evidencesPrice("De opleiding start op 31 augustus 2026."));
  assert.ok(!evidencesPrice("300-uur Hatha verdiepingsopleiding"));
  assert.ok(!evidencesPrice("tien modules, 8 dagen per module"));
});

/* ---------- the corpus ---------- */

test("every published price cites a page whose archived artifact actually shows a price", () => {
  assert.deepEqual(
    report.findings.map((f) => f.message),
    [],
    "a record claims the provider publishes a price while citing a page that shows none — " +
      "cite the page that STATES the fact, and archive it first (CLAUDE.md)",
  );
});

test("the corpus holds published prices for the check to be about", () => {
  // A check whose subject set is empty passes forever. The subject set is every
  // programme with `price.published: yes`, and each is either examined or skipped.
  const priced = providers.flatMap((p) => p.programs).filter((pr) => pr.price.published === "yes");
  assert.ok(priced.length > 20, `expected the corpus to hold published prices, found ${priced.length}`);
  assert.equal(
    report.examined + report.skipped + report.findings.length,
    priced.length,
    "every published price must be accounted for: examined, skipped, or flagged",
  );
});

test("where the snapshot bodies are present, the check is not vacuously green", () => {
  // The bodies are gitignored (data/archives/README.md), so in CI and in a fresh
  // clone almost every source is SKIPPED and the assertion above passes on a nearly
  // empty set — honestly, but weakly. On the researcher's machine, where the evidence
  // lives and where prices actually get extracted, NOTHING is skipped and the check
  // must really have opened it all. That is the run that counts, and this pins it —
  // including that poppler is installed, since the PDFs cannot be read without it.
  if (report.skipped > 0) return; // partial checkout: this test makes no claim
  assert.ok(pdftotextAvailable(), "install poppler: `brew install poppler` / `apt-get install -y poppler-utils`");
  assert.ok(
    report.examined > 20,
    `expected the archived artifacts to have been searched, examined only ${report.examined}`,
  );
});
