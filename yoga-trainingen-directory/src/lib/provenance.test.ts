/**
 * The provenance check, and the corpus held against it.
 *
 * The headline test is the corpus one: the findings the corpus produces are EXACTLY the
 * ones we have triaged and written down. It was 4 when the check was written and covered
 * only prices — every one of them a record that cited the page LINKING to the price
 * instead of the page stating it.
 *
 * v0.7 pointed the same machinery at THE VALUE IN THE RECORD instead of at the subject
 * matter of the page, and the widening found five more. The rest of this file pins the
 * three questions that made that possible — is THIS amount printed, is THIS hours figure
 * printed AS HOURS, does the page state THIS VAT TREATMENT — and each of them is pinned
 * from both sides: the sentence it must accept, and the sentence that used to fool it.
 *
 * Both directions matter, and not symmetrically. A missed finding certifies a false
 * statement about a named business as sourced (§4.11). A false positive accuses our own
 * correctly sourced research — and cost us Yagoy, whose page says "Training fee (VAT
 * exempted)" in as many words, on a first draft of the VAT regex that would not accept
 * the participle.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadDataset } from "./loader";
import {
  allProvenance,
  evidencesAmount,
  evidencesHours,
  evidencesPrice,
  evidencesVat,
  pdftotextAvailable,
  providerProvenance,
  visibleText,
} from "./provenance";
import type { Provider } from "../schema";

const { providers } = loadDataset();
const report = allProvenance(providers);

/* ---------- the money regex: the FALLBACK tier (published: yes, no amount) ---------- */

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

/* ---------- the amount itself: the FACT tier (spec v0.7) ---------- */

test("PRICE: 'there is a price on the page' is NOT evidence that the price is OURS", () => {
  // THE BUG, in one assertion. de Yogaschool Enschede's cited page prints "€ 1530,00 per
  // jaar"; the record said `amount_eur: 4590` — our own 3 × 1530, published under their
  // name (spec §6). "4590" appears in NONE of that provider's artifacts. The page-level
  // check saw a euro sign and waved it through.
  assert.ok(evidencesPrice("Kosten: per 1 januari 2026: €1530,00 per jaar"), "guard: the page DOES show a price");
  assert.ok(!evidencesAmount("Kosten: per 1 januari 2026: €1530,00 per jaar", 4590), "…and it is not OUR price");
  // Adhouna's Yin XL: the page prints the two parts, never the sum the record stored.
  const yinXl = "Deel I van deze Yin Yoga Opleiding kost € 1.420,00 incl. BTW … Deel II kost € 1.305,00 incl. BTW";
  assert.ok(evidencesPrice(yinXl));
  assert.ok(!evidencesAmount(yinXl, 2725));
  assert.ok(evidencesAmount(yinXl, 1420), "the figures that ARE printed still match");
});

test("PRICE: the amount matches however the school punctuates money", () => {
  // nl-NL: dot = thousands, comma = decimals, `,-` = no cents.
  assert.ok(evidencesAmount("€ 4.590", 4590));
  assert.ok(evidencesAmount("€4.590,-", 4590));
  assert.ok(evidencesAmount("4590,00", 4590));
  assert.ok(evidencesAmount("€ 4590", 4590));
  // en: comma = thousands. The corpus is bilingual — jai-yoga writes "€ 2,385", tribes
  // "€3,150", and thrive-yoga writes "KOSTEN: 3,050 E" with no euro sign at all, which
  // is why the amount is NOT required to sit next to a currency marker.
  assert.ok(evidencesAmount("Price: € 2,385 incl. VAT", 2385));
  assert.ok(evidencesAmount("KOSTEN: 3,050 E (reguliere prijs)", 3050));
  // Six amounts in the corpus have cents. Rounding one away would flag a sourced record.
  assert.ok(evidencesAmount("€ 2.838,60", 2838.6));
  assert.ok(evidencesAmount("€ 2,964.50 incl. BTW", 2964.5));
  assert.ok(evidencesAmount("€ 4.235,20 inclusief 9% btw", 4235.2));
});

test("PRICE: an amount must not match a SUBSTRING of a bigger number", () => {
  // The whole point of the tier: matching "590" inside "€ 14.590" would ground the same
  // false claim by another route.
  assert.ok(!evidencesAmount("€ 14.590", 4590));
  assert.ok(!evidencesAmount("€ 1.875,-", 875));
  assert.ok(!evidencesAmount("€ 45.900", 4590));
  // 2450 is not 2450,50 — a record holding the round number cannot stand on the page
  // that prints the one with cents.
  assert.ok(!evidencesAmount("€ 2.450,50", 2450));
  // …and the round number still matches whichever way "no cents" is written.
  assert.ok(evidencesAmount("€ 2.450,00", 2450));
  assert.ok(evidencesAmount("€ 2.450,-", 2450));
});

/* ---------- the hours figure, anchored to an hours word (spec v0.7) ---------- */

test("HOURS: a PRICE is not an hours claim — the bug the digit-boundary let through", () => {
  // Dutch prices use `.` as the thousands separator, and 200/300/500 are exactly the
  // three standard yoga formats. So in "€ 2.500" the character before `500` is `.`, not a
  // digit, and `(?<!\d)500(?!\d)` MATCHED: a price page evidenced an hours claim about a
  // named business. Verified against the real regex before the fix — all three were true.
  assert.ok(!evidencesHours("De opleiding kost € 2.500,-", 500));
  assert.ok(!evidencesHours("Investering: € 1.200", 200));
  assert.ok(!evidencesHours("logo-200x200.jpg", 200));
  assert.ok(!evidencesHours("Vanaf € 1.300 per studiejaar", 300));
});

test("HOURS: the cited page must print THE FIGURE — however the school writes it", () => {
  // The de Blikopener case, which is why this check exists: the hours were cited to the
  // HOMEPAGE, which has never printed an hour in its life. The opleidingspagina says
  // "bestaat uit 500 u … verspreid over vier jaar" — and that is the page it must stand on.
  assert.ok(evidencesHours("De Hatha-Raja Yoga opleiding bestaat uit 500 u", 500));
  assert.ok(evidencesHours("Het is ook mogelijk om de 3-jarige opleiding te volgen van 372 u.", 372));
  // "500u", with no space — the commonest Dutch spelling, and the one `\b500\b` MISSES
  // (`0`→`u` is not a word boundary). That regex called open-yoga and samsara unsourced
  // over pages that print their hour count in as many characters.
  assert.ok(evidencesHours("De opleiding is 200u verdeeld over 8 weekenden", 200));
  assert.ok(evidencesHours("opgebouwd tot een volledig opleidingstraject van 500 uur", 500));
  assert.ok(evidencesHours("registratie op het 500-uurs niveau bij Yoga Alliance", 500));
  assert.ok(evidencesHours("200 hours of training", 200));
  // The hours noun as the TAIL of the next word — namaste-studios writes it this way.
  assert.ok(evidencesHours("Bij het behalen van 200 opleidingsuren ben je gerechtigd", 200));
  // The FORMAT LABEL is the figure: RYT300 is Yoga Alliance's name for the 300-hour
  // registration (sanayou, yoga-centrum-oosterwold — for whom it is the only spelling).
  assert.ok(evidencesHours("RYT300 hybride opleiding", 300));
  assert.ok(evidencesHours("Voor je RYT 200‑certificering volg je deze kernmodules", 200));
  // The hours noun BEFORE the figure, across no digits and no € (jai-yoga).
  assert.ok(evidencesHours("So number of hours amounts to 350. The PTT starts Saturday", 350));
});

test("HOURS: an hours-like number is NOT evidence for THIS hours claim", () => {
  // The rejected design, pinned so nobody restores it. "Any hours-like number on the
  // page" passes de Blikopener's homepage — it advertises class times as "19 – 22 u" —
  // and that homepage is the miscitation the whole check was built to catch. It would
  // have green-lit the one record that motivated it.
  assert.ok(!evidencesHours("maandagavond (19 – 22 u), proeflessen in mei en juni", 500));
  // The useful catch: a total that appears nowhere on the page because WE summed it.
  // de Yogaschool Enschede publishes 360 contact + 240 self-study and never the 600 (§6).
  assert.ok(!evidencesHours("360 contacturen en 240 uur zelfstudie", 600));
  assert.ok(!evidencesHours("Module 1: 200 uur · Module 2: 150 uur · Module 3: 100 uur", 500));
  // A year is not an hour count, and neither is a number with digits either side.
  assert.ok(!evidencesHours("De opleiding ontstond in 1982.", 500));
  assert.ok(!evidencesHours("1500 deelnemers sinds 1982", 500));
  // The figure printed with no hours word anywhere near it is not an hours claim.
  assert.ok(!evidencesHours("Zaal 200, tweede verdieping", 200));
});

test("HOURS: the search runs over what a READER sees, not over the markup", () => {
  // An HTML file is dense with numbers that no reader ever meets — `font-weight:500`,
  // `logo-200x200.jpg`, a tracking payload. de Blikopener's homepage contains "500"
  // several times over in exactly that way while printing no hour count at all: matched
  // against the raw DOM, the check asserts that a named business publishes an hour
  // count on the evidence of a stylesheet.
  const markup = `<style>.h{font-weight:500}</style><body><p>500 uur opleiding</p></body>`;
  assert.ok(evidencesHours(visibleText(markup), 500), "the copy a reader sees DOES state it");
  const stylesheetOnly = `<style>.h{font-weight:500}</style><body><p>Yoga opleidingen in Tilburg</p></body>`;
  assert.ok(!evidencesHours(visibleText(stylesheetOnly), 500), "…and a stylesheet is not a claim");
  // The strip must not eat a price: 7 records' prices survive only in the HTML.
  assert.ok(evidencesPrice(visibleText(`<div class="price"><span>€</span> 2.450</div>`)));
});

/* ---------- the VAT treatment, not the SUBJECT of VAT (spec §4.11 v0.7) ---------- */

test("VAT: the page must state THE TREATMENT WE RECORDED — a CRKBO badge is not one", () => {
  // §4.11 (v0.7): `price.vat` is observed on the page that states it, or it is `unknown`
  // — never deduced from a CRKBO registration. The old regex had `\bcrkbo\b` as an
  // alternative, so the check CERTIFIED the very inference it exists to forbid. Queno's
  // cited page has ZERO hits for btw/vrijgesteld/omzetbelasting and ONE for CRKBO: a
  // footer badge beside the street address.
  assert.ok(!evidencesVat("CRKBO REGISTER & YAI — Kerkstraat 12, Emmen", "exempt_crkbo"));
  // …and the sentence that alternative was protecting still passes, on the words that
  // actually state the treatment.
  assert.ok(evidencesVat("Wij zijn CRKBO-geregistreerd, daarom btw-vrij", "exempt_crkbo"));
});

test("VAT: 'vrijstelling' in Dutch is ANY exemption — course credit is not a tax treatment", () => {
  // Spark of Light's 300-hour page: "er is geen vrijstelling mogelijk" — about exemption
  // from COURSE MODULES. It grounded `exempt_crkbo`. Yoga Spot's page says the same thing
  // ("geen vrijstelling verleend voor onderdelen van de training") AND states the tax
  // treatment outright; only the second sentence may ground the record.
  assert.ok(!evidencesVat("(afhankelijk van wanneer de modules gegeven worden) en er is geen vrijstelling mogelijk.", "exempt_crkbo"));
  assert.ok(!evidencesVat("Er wordt geen vrijstelling verleend voor onderdelen van de training.", "exempt_crkbo"));
  assert.ok(evidencesVat("geregistreerd bij het CRKBO en vrij van BTW.", "exempt_crkbo"));
  assert.ok(evidencesVat("De opleiding is vrijgesteld van omzetbelasting", "exempt_crkbo"));
  assert.ok(evidencesVat("BTW-vrijstelling van toepassing", "exempt_crkbo"));
});

test("VAT: a page that says 'Excl BTW' cannot ground 'exempt_crkbo' — DIRECTION", () => {
  // bluebirds/200-vinyasa-2025: the cited page prices the training at "€3150,- Excl BTW",
  // and the record read `exempt_crkbo`. With no direction check, ANY tax word grounded ANY
  // treatment — so the page stating the OPPOSITE of an exemption was accepted as its source.
  assert.ok(!evidencesVat("€2950,- Excl BTW (1st of July) … €3150,- Excl BTW", "exempt_crkbo"));
  assert.ok(evidencesVat("€2950,- Excl BTW (1st of July) … €3150,- Excl BTW", "excl"), "it IS evidence for `excl`");
  // And the mirror image: an exempt page is not evidence that VAT is included.
  assert.ok(!evidencesVat("(all prices at 0% VAT as we are CRKBO registered)", "incl"));
  assert.ok(evidencesVat("(all prices at 0% VAT as we are CRKBO registered)", "exempt_crkbo"));
});

test("VAT: each treatment has its own vocabulary, in both languages the corpus uses", () => {
  // exempt — every alternative below is a sentence a provider in this corpus actually wrote.
  assert.ok(evidencesVat("De opleiding is BTW-vrijgesteld, omdat het een CRKBO-erkende opleiding is", "exempt_crkbo"));
  assert.ok(evidencesVat("De training is vrijgesteld van btw", "exempt_crkbo"));
  assert.ok(evidencesVat("Price €3,150 (no VAT charged, CRKBO-registered)", "exempt_crkbo"));
  assert.ok(evidencesVat("We are CRKBO registered, thus no VAT.", "exempt_crkbo"));
  assert.ok(evidencesVat("Training fee (VAT exempted)", "exempt_crkbo"), "Yagoy — the participle, and once a false positive");
  // TULA spells the exemption out in two clauses. The FIRST alone ("do not include VAT")
  // reads as `excl` in English; only the second makes it an exemption, so both are required.
  assert.ok(
    evidencesVat(
      "These prices do not include VAT, nor will this be added, since TULA is a registered vocational institute at CRKBO.",
      "exempt_crkbo",
    ),
  );
  // incl
  assert.ok(evidencesVat("Prijs: € 2.450 incl. btw", "incl"));
  assert.ok(evidencesVat("€ 3.885,50 exclusief btw/ € 4.235,20 inclusief 9% btw", "incl"), "the rate sits between the words");
  assert.ok(evidencesVat("After September 20, 2026: €2.950 incl. 21% VAT", "incl"));
  assert.ok(evidencesVat("The cost of this course is € 2,385 (including VAT)", "incl"));
  // excl
  assert.ok(evidencesVat("Investering excl. btw: € 2.495,-", "excl"));
  assert.ok(evidencesVat("€ 3.885,50 exclusief btw", "excl"));
  assert.ok(evidencesVat("Het bedrag is te vermeerderen met btw", "excl"));
});

test("VAT: a registration number is not a treatment, and 'including' is not 'incl. VAT'", () => {
  // SanaYou's footer prints "BTW nummer: NL001422164B38" on EVERY page — a company
  // identifier, and precisely nothing about what this training costs.
  assert.ok(!evidencesVat("SanaYou · Kvk 12345678 · BTW nummer: NL001422164B38", "incl"));
  assert.ok(!evidencesVat("SanaYou · Kvk 12345678 · BTW nummer: NL001422164B38", "exempt_crkbo"));
  assert.ok(!evidencesVat("VAT number: NL001422164B38", "excl"));
  // yoga-den's phantom quote: the only "vat"/"incl" hits in that artifact were the
  // substrings "including" and "wp-includes", and that hit was once load-bearing for two
  // separate conclusions about that school. `btw|vat` must be ADJACENT to the word.
  assert.ok(!evidencesVat("Pricing / Investment: €3597 … including the manual … /wp-includes/js/", "incl"));
  // A page that says nothing about tax grounds nothing.
  assert.ok(!evidencesVat("€ 1290,- (vanaf 1 juni 2026) per studiejaar.", "exempt_crkbo"));
  assert.ok(!evidencesVat("Yogaweekend € 335,- incl. 1 x ontbijt, 2 x lunch", "incl"));
});

/* ---------- an artifact we cannot read is not evidence of absence ---------- */

test("an artifact that extracts to NOTHING is `unreadable`, never `no_evidence`", () => {
  // "The archived page contains no amount" is an accusation about a named business.
  // "We could not extract a single character from our own capture" is a bug in our
  // toolbox. An image-only capture or a shell PDF used to produce the first sentence.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prov-"));
  fs.mkdirSync(path.join(dir, "data/archives/testco"), { recursive: true });
  fs.writeFileSync(path.join(dir, "data/archives/testco/site-2026-01.md"), "   \n  \n");

  const p = {
    id: "testco",
    name: "Test Co",
    programs: [
      {
        id: "200-test",
        price: { amount_eur: 1234, period: "total", vat: "unknown", published: "yes", source: "site" },
        hours_claimed: { total: null, breakdown_published: "unknown", contact_published: "unknown" },
      },
    ],
    sources: [{ id: "site", local_snapshot: "data/archives/testco/site-2026-01.html" }],
  } as unknown as Provider;

  const { findings } = providerProvenance(p, dir);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].reason, "unreadable", "an empty extraction is a hole in OUR tooling");
  assert.match(findings[0].message, /gereedschap/);
});

/* ---------- the corpus ---------- */

test("every cited source evidences the claim it is cited for — or the finding is triaged", () => {
  // NOT an empty list. v0.7 sharpened all three checks from "is the page ABOUT this?" to
  // "does the page STATE this?", and the sharpening FOUND things. They are listed for
  // triage rather than silently "fixed" by re-pointing a source at a page nobody has read:
  // a citation is a claim that we looked at THAT page.
  //
  // This test's job is that the number cannot grow unnoticed. Every finding here is one
  // where OUR RECORD cites a page that does not carry the fact — a defect in our sourcing,
  // never a finding about the provider, and it must never ship unnoticed.
  const messages = report.findings.map((f) => `${f.providerId}/${f.programId} [${f.check}]`);
  assert.deepEqual(
    messages,
    expectedFindings(),
    "the provenance findings changed. Fixed one? Remove it from KNOWN_FINDINGS. Added one? " +
      "A record now cites a page that does not state the fact — cite the page that STATES it, " +
      "and archive it first (CLAUDE.md).",
  );
});

/**
 * The triage list. Each entry is a record whose cited source does not evidence what it is
 * cited for, and each is classified — because the two classes need OPPOSITE fixes and a
 * page-level check can never tell them apart:
 *
 *   (a) SOURCING ERROR — the provider DOES state it, we cited the wrong page. The fix is
 *       to find the page that states it, archive that, and re-point the citation. Nothing
 *       about the record's content is wrong. (wahe/500-pathway was one: the school really
 *       does publish "een totaal van 500 uur opleiding" — on /yoga-alliance/, a page we
 *       had never captured. Archived, cited, gone from this list.)
 *   (b) FABRICATED / INFERRED — the provider states NOTHING of the kind anywhere, and the
 *       value in the record came out of our own head: a sum WE computed (§6), or a VAT
 *       treatment deduced from a CRKBO registration (§4.11). The fix is to STOP ASSERTING
 *       — `null`, or `vat: unknown` — never to go hunting for a page that agrees with us.
 *
 * Guessing wrong invents a programme in one direction and accuses a school in the other.
 * Sorted as allProvenance() sorts (by record, then check).
 */
const KNOWN_FINDINGS = [
  // (b) FABRICATED. `amount_eur: 2725` is OUR sum of the two parts the page prices
  //     separately (€ 1.420,00 + € 1.305,00, "incl. BTW" each). "2725" appears in neither
  //     artifact. Adhouna never published a total for Yin XL — and the two parts are sold
  //     as separate enrolments, so the total is not even obviously the price of anything.
  "adhouna/200-yin-xl [price]",

  // (b) INFERRED — and the exact inference §4.11 (v0.7) names. The cited page prices the
  //     training "€2950,- Excl BTW … €3150,- Excl BTW"; the record says `exempt_crkbo`.
  //     The page states the OPPOSITE of an exemption. (Bluebirds' OTHER training is the
  //     control: its hybrid page really does say "all prices at 0% VAT as we are CRKBO
  //     registered", and it passes — in the HTML only, which is why both artifacts are read.)
  "bluebirds/200-vinyasa-2025 [vat]",

  // (b) FABRICATED, twice. `amount_eur: 4590` is OUR 3 × € 1530: the page prints
  //     "€ 1530,00 per jaar" and the school never publishes a course total. Same disease
  //     as their hours (spec v0.6: `total: 600` for a school that publishes 360 + 240 and
  //     never the sum). The fix is `price.period: year` + the derived total (§6), which is
  //     shown as OUR arithmetic — not a number laid at their door.
  "de-yogaschool-enschede/docentenopleiding-raja [price]",
  "de-yogaschool-enschede/meesteropleiding-raja [price]",

  // (b) INFERRED ×4 — the CRKBO deduction in its purest form, and the one the old check
  //     BLESSED: the cited page has zero hits for btw/vrijgesteld/omzetbelasting and one
  //     for CRKBO — a footer badge next to the street address. `\bcrkbo\b` was in the VAT
  //     pattern, so a badge grounded a tax treatment on four programmes at once.
  //     NB: this record is UNCOMMITTED WIP; on a checkout without it these four simply do
  //     not appear (see expectedFindings), which is correct — there is nothing to check.
  "queno-sportopleidingen/cyt200-hatha [vat]",
  "queno-sportopleidingen/cyt200-power [vat]",
  "queno-sportopleidingen/cyt200-yin [vat]",
  "queno-sportopleidingen/cyt500-yoga [vat]",

  // (b) INFERRED. The record's own note admits it: "BTW-behandeling als de 200u (CRKBO)
  //     AANGENOMEN". A treatment read off a SIBLING PROGRAMME's page is precisely what
  //     §4.11 forbids. The 300-hour page's only "vrijstelling" is about COURSE CREDIT
  //     ("er is geen vrijstelling mogelijk") — and the old regex matched on that word.
  "spark-of-light/300-verdieping [vat]",
];

/**
 * KNOWN_FINDINGS, restricted to the records this checkout actually holds.
 *
 * On a partial checkout (the snapshot bodies are gitignored) the check can open almost
 * nothing, so it reports almost nothing — the list is only asserted where the evidence is.
 * And a record that is not in the dataset at all cannot produce a finding: queno is
 * untracked work-in-progress, so it is expected exactly where it exists.
 */
function expectedFindings(): string[] {
  if (report.skipped > 0) return report.findings.map((f) => `${f.providerId}/${f.programId} [${f.check}]`);
  const present = new Set(providers.map((p) => p.id));
  return KNOWN_FINDINGS.filter((k) => present.has(k.split("/")[0]));
}

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
  assert.equal(report.claims, claims, "the report must count every claim it had a subject for");
  // Every claim reaches exactly one outcome: EXAMINED (we opened the artifacts and
  // searched them — whether or not the search then produced a `no_evidence` finding),
  // SKIPPED (the body is not in this checkout), or never searched at all (no source, no
  // snapshot, nothing captured, nothing readable — each already a finding). A claim that
  // fell out of the loop altogether would be one nobody checked and nobody missed.
  const unsearched = report.findings.filter((f) => f.reason !== "no_evidence").length;
  assert.equal(
    report.examined + report.skipped + unsearched,
    claims,
    "every claim must be accounted for: examined, skipped, or never searched",
  );
});

test("the report states its own coverage, so no consumer can overstate the check", () => {
  // The check is honest about where it ran or it is worse than useless: in CI it opens
  // ~5% of the evidence, and BOTH runners used to print a green `✓ elk gedekt` over that.
  // `coverage` is what makes that impossible to summarise away.
  assert.equal(report.coverage, report.claims === 0 ? 1 : report.examined / report.claims);
  assert.ok(report.coverage <= 1);
  assert.equal(report.skipped > 0, report.coverage < 1, "coverage < 1 exactly when something was skipped");
  // Everything in the corpus today is held against the VALUE IN THE RECORD, not merely
  // against the subject matter of the page. `page` would mean some claim fell back to the
  // weaker question (a `published: yes` with no `amount_eur`).
  assert.equal(report.granularity, "fact");
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
  assert.equal(report.coverage, 1, "full checkout: every claim's evidence was actually opened");
});
