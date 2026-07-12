/**
 * The provenance check, and the corpus held against it.
 *
 * The headline test is the last one: the findings the corpus produces are EXACTLY the
 * ones we have triaged and written down (technical-todo.md). It was 4 when the check
 * was written and covered only prices (aalo ×2, de-blikopener, yoga-academie-nederland)
 * — every one of them a record that cited the page LINKING to the price instead of the
 * page stating it. v0.5 pointed the same machinery at the HOURS and the VAT treatment,
 * where the same defect was sitting unseen.
 *
 * The rest of this file pins the three things that make those numbers trustworthy: the
 * money regex, the hours regex, the VAT regex — and the rule that BOTH artifacts count.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDataset } from "./loader";
import {
  allProvenance,
  evidencesHours,
  evidencesPrice,
  evidencesVat,
  pdftotextAvailable,
  visibleText,
} from "./provenance";

const { providers } = loadDataset();
const report = allProvenance(providers);

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

/* ---------- the hours figure (spec v0.5) ---------- */

test("HOURS: the cited page must print THE FIGURE — however the school punctuates it", () => {
  // The de Blikopener case, which is why this check exists: the hours were cited to the
  // HOMEPAGE, which has never printed an hour in its life. The opleidingspagina says
  // "bestaat uit 500 u … verspreid over vier jaar" — and that is the page the record
  // must stand on.
  assert.ok(evidencesHours("De Hatha-Raja Yoga opleiding bestaat uit 500 u", 500));
  assert.ok(evidencesHours("Het is ook mogelijk om de 3-jarige opleiding te volgen van 372 u.", 372));
  // "500u", with no space — the commonest Dutch spelling, and the one `\b500\b` MISSES
  // (`0`→`u` is not a word boundary). That regex called open-yoga and samsara unsourced
  // over pages that print their hour count in as many characters.
  assert.ok(evidencesHours("De opleiding is 200u verdeeld over 8 weekenden", 200));
  assert.ok(evidencesHours("RYT300 hybride opleiding", 300));
});

test("HOURS: an hours-like number is NOT evidence for THIS hours claim", () => {
  // The rejected design, pinned so nobody restores it. "Any hours-like number on the
  // page" passes de Blikopener's homepage — it advertises class times as "19 – 22 u" —
  // and that homepage is the miscitation the whole check was built to catch. It would
  // have green-lit the one record that motivated it.
  assert.ok(!evidencesHours("maandagavond (19 – 22 u), proeflessen in mei en juni", 500));
  // The useful catch: a total that appears nowhere on the page because WE summed it.
  // wahe's 500 is their 200 + 150 + 100 — our arithmetic, stored as their claim (§6).
  assert.ok(!evidencesHours("Module 1: 200 uur · Module 2: 150 uur · Module 3: 100 uur", 500));
  // A price is not an hour count, and neither is a year.
  assert.ok(!evidencesHours("€ 1290,- per studiejaar", 500));
  assert.ok(!evidencesHours("De opleiding ontstond in 1982.", 500));
  // Digits either side must not make a match: "1500" is not "500", and "5001" is not either.
  assert.ok(!evidencesHours("1500 deelnemers sinds 1982", 500));
});

test("HOURS: the search runs over what a READER sees, not over the markup", () => {
  // An HTML file is dense with numbers that no reader ever meets — `font-weight:500`,
  // `logo-200x200.jpg`, a tracking payload. de Blikopener's homepage contains "500"
  // several times over in exactly that way while printing no hour count at all: matched
  // against the raw DOM, the check asserts that a named business publishes an hour
  // count on the evidence of a stylesheet.
  const markup = `<style>.h{font-weight:500}</style><body><p>Yoga opleidingen in Tilburg</p></body>`;
  assert.ok(evidencesHours(markup, 500), "guard: the raw markup DOES contain the figure");
  assert.ok(!evidencesHours(visibleText(markup), 500), "…and a reader sees no such figure");
  // The strip must not eat a price: 7 records' prices survive only in the HTML.
  assert.ok(evidencesPrice(visibleText(`<div class="price"><span>€</span> 2.450</div>`)));
});

/* ---------- the VAT regex (spec v0.5) ---------- */

test("VAT: the check reads whether the page mentions VAT AT ALL — not which treatment", () => {
  assert.ok(evidencesVat("Prijs: € 2.450 incl. btw"));
  assert.ok(evidencesVat("De opleiding is vrijgesteld van omzetbelasting"));
  assert.ok(evidencesVat("Wij zijn CRKBO-geregistreerd, daarom btw-vrij"));
  assert.ok(evidencesVat("BTW-vrijstelling van toepassing"));
});

test("VAT: a rates page that never mentions BTW cannot be the source of a VAT treatment", () => {
  // Both v0.5 corrections in one assertion. de Blikopener's tarievenpagina and
  // Yogatreat's waitlist page each carried `vat: exempt_crkbo` — INFERRED from the
  // school's CRKBO registration, which spec §4.11 forbids — while stating no VAT at
  // all. A VAT treatment is directly observed (§10) or it is not known.
  assert.ok(!evidencesVat("€ 1290,- (vanaf 1 juni 2026) per studiejaar."));
  assert.ok(!evidencesVat("Yogaweekend € 335,- incl. 1 x ontbijt, 2 x lunch"));
});

/* ---------- the corpus ---------- */

test("every cited source evidences the claim it is cited for — or the finding is triaged", () => {
  // NOT an empty list. v0.5 widened the check from prices to hours and VAT, and the
  // widening FOUND things — legacy citations pointing at overview pages that state
  // neither the hours nor the VAT treatment beside them. They are listed for triage in
  // technical-todo.md rather than silently "fixed" by re-pointing a source at a page
  // nobody has read: a citation is a claim that we looked at THAT page.
  //
  // This test's job is that the number cannot grow unnoticed. Every finding here is
  // one where OUR RECORD cites a page that does not carry the fact — a defect in our
  // sourcing, never a finding about the provider, and it must never ship unnoticed.
  const messages = report.findings.map((f) => `${f.providerId}/${f.programId} [${f.check}]`);
  assert.deepEqual(
    messages,
    KNOWN_FINDINGS,
    "the provenance findings changed. Fixed one? Remove it from KNOWN_FINDINGS. Added one? " +
      "A record now cites a page that does not state the fact — cite the page that STATES it, " +
      "and archive it first (CLAUDE.md).",
  );
});

/**
 * The triage list, verbatim from technical-todo.md. Each is a record whose cited source
 * does not evidence what it is cited for; each needs a human to find the page that
 * DOES state it, archive that, and re-point the citation. Sorted as allProvenance()
 * sorts (by record, then check).
 *
 * On a partial checkout (gitignored snapshot bodies) the check can open almost nothing,
 * so it reports almost nothing — see the skip test below. The list is therefore only
 * asserted where the evidence actually is.
 */
const KNOWN_FINDINGS = report.skipped > 0 ? report.findings.map((f) => `${f.providerId}/${f.programId} [${f.check}]`) : [
  // BOTH HOURS FINDINGS ARE GONE, and they were gone for OPPOSITE reasons — which is the
  // distinction this check exists to force, and the reason the list below is only BTW:
  //
  //   - wahe/500-pathway [hours] was a SOURCING ERROR. The school really does publish the
  //     500 ("Samen vormen de 200-uurs basisopleiding en de 300 uur aan verdiepingsmodules
  //     een totaal van 500 uur opleiding") — on /yoga-alliance/, a page we had never
  //     captured. Archived, cited, quoted verbatim; the 500 is now THEIR claim.
  //   - de-yogaschool-enschede [hours] was a STORED SUM. "600" appears in NONE of that
  //     provider's artifacts: the page publishes 360 contact + 240 self-study and never
  //     their sum. `total` is now null — we do not store our own arithmetic (§6).
  //
  // A page-level check cannot tell those two apart. Only opening the archive can, and
  // guessing wrong invents a programme in one direction or accuses a school in the other.
  //
  // TWO OF THE THREE BTW FINDINGS ARE GONE, and both were type (b): a treatment that was
  // never observed, only INFERRED — the VAT twin of a stored sum. Neither needed a live
  // page; the fix was to stop asserting (§4.11: observed, or not known).
  //
  //   - adhouna/200-multistyle carried `incl` read off a DIFFERENT programme's page (Yin
  //     XL: "€ 1.420,00 incl. BTW"). The cited Multi Style page contains no btw/vrijgesteld/
  //     omzetbelasting/CRKBO string in EITHER artifact — HTML or browser-render.
  //   - yoga-den/500-pathway carried `incl` inferred from the invoicing entity ("zelfde
  //     btw-belaste entiteit, Yoga Den B.V., niet-CRKBO"). §4.11 forbids exactly that
  //     inference, and NO Yoga Den page artifact mentions btw at all.
  //   Both are now `vat: unknown`, which is the honest value and is exempt from the check.
  //
  // WHAT IS LEFT IS THE ONE THE ARCHIVE CANNOT SETTLE. Our note says the page read
  // "Pricing incl. VAT"; no artifact contains the string, and the capture is NOT partial
  // (the pricing block is fully there — "Pricing", "Investment: €3597" — with no VAT
  // wording beside it). Our own note and our own archive contradict each other, and only
  // the live page can say which is right. Guessing either way is the thing this project
  // exists not to do, so it stays a finding until someone re-checks it (technical-todo.md).
  "yoga-den/200-vinyasa [vat]",
];

test("the corpus holds claims for the check to be about", () => {
  // A check whose subject set is empty passes forever. The subject set is every
  // published price, every stored hours total and every asserted VAT treatment, and
  // each is either examined or skipped.
  const programs = providers.flatMap((p) => p.programs);
  const claims =
    programs.filter((pr) => pr.price.published === "yes").length +
    programs.filter((pr) => pr.hours_claimed.total != null).length +
    programs.filter((pr) => ["incl", "excl", "exempt_crkbo"].includes(pr.price.vat)).length;
  assert.ok(claims > 60, `expected the corpus to hold sourced claims, found ${claims}`);
  // Every claim reaches exactly one outcome: EXAMINED (we opened the artifacts and
  // searched them — whether or not the search then produced a `no_evidence` finding),
  // SKIPPED (the body is not in this checkout), or unreadable before we got that far (no
  // source, no snapshot, nothing ever captured — each already a finding). A claim that
  // fell out of the loop altogether would be one nobody checked and nobody missed.
  const unreadable = report.findings.filter((f) => f.reason !== "no_evidence").length;
  assert.equal(
    report.examined + report.skipped + unreadable,
    claims,
    "every claim must be accounted for: examined, skipped, or unreadable",
  );
});

test("where the snapshot bodies are present, the check is not vacuously green", () => {
  // The bodies are gitignored (data/archives/README.md), so in CI and in a fresh
  // clone almost every source is SKIPPED and the assertion above passes on a nearly
  // empty set — honestly, but weakly. On the researcher's machine, where the evidence
  // lives and where facts actually get extracted, NOTHING is skipped and the check
  // must really have opened it all. That is the run that counts, and this pins it —
  // including that poppler is installed, since the PDFs cannot be read without it.
  if (report.skipped > 0) return; // partial checkout: this test makes no claim
  assert.ok(pdftotextAvailable(), "install poppler: `brew install poppler` / `apt-get install -y poppler-utils`");
  assert.ok(
    report.examined > 60,
    `expected the archived artifacts to have been searched, examined only ${report.examined}`,
  );
});
