/**
 * THE PROVENANCE CHECK: does the page we CITE for a fact actually STATE it?
 *
 * `price.published: "yes"` is a statement about a NAMED BUSINESS — "we looked, and
 * they publish what this costs" — and `price.source` names the page we looked at.
 * Nothing in the schema, and nothing in `loader.ts`'s referential-integrity pass,
 * ever asked whether that page contains a price. It only asked whether the id
 * resolves. So four records cited a captured overview page that carries no € at
 * all, while the real price sat on a rates page / an inschrijfpagina / a linked
 * PDF that was never sourced and never archived (aalo ×2, de-blikopener,
 * yoga-academie-nederland). The citation pointed at the page that LINKS to the
 * fact, not the page that STATES it — and the archive, which is the whole
 * evidentiary basis of this project, therefore held no evidence for it.
 *
 * A human cannot catch that by reading YAML: the record looks perfect. Only the
 * ARTIFACT can answer it. So this check reads the artifacts.
 *
 * FIVE CLAIMS, ONE MACHINERY, AND EACH ASKS FOR **THE FACT WE RECORDED** (v0.7, v0.9,
 * v0.12). The first version asked a weaker question — "is there *a* price / *an*
 * hours-like number / *any* mention of tax on this page?" — and a weaker question is a
 * weaker check: it certified as sourced six statements the cited page does not make.
 * What each check asks now:
 *
 *   - PRICE — `price.amount_eur` set → the cited artifact must print THAT AMOUNT.
 *     "Is there a price on the page" passed de Yogaschool Enschede, whose page prints
 *     "€ 1530,00 per jaar" while the record said 4590 (= our 3 × 1530: OUR arithmetic
 *     sold as their published price, spec §6), and Adhouna's Yin XL, whose page prints
 *     € 1.420,00 and € 1.305,00 while the record said 2725 (our sum again). "2725" and
 *     "4590" appear in NONE of those providers' artifacts. Where `amount_eur` is null
 *     and `published: yes`, the old page-level question is still the right one — that
 *     record only claims *they publish a price* — and it survives as a FALLBACK TIER,
 *     named in the finding so a reader knows which question failed.
 *   - HOURS — `hours_claimed.total` set → the cited artifact must print THAT FIGURE,
 *     NEXT TO AN HOURS WORD. Bare digit-boundaries let a PRICE ground an hours claim:
 *     in "€ 2.500" the character before `500` is `.`, not a digit, so `(?<!\d)500`
 *     matched, and 200/300/500 are exactly the standard formats while Dutch prices use
 *     `.` as the thousands separator. `hours(200)` matched "€ 1.200" and "logo-200x200".
 *   - PREREQUISITE (v0.9) — a gate with a `cost_eur` → the cited artifact must print THAT
 *     AMOUNT. A training you are forced to buy first is an ADDEND in the price we publish
 *     (`total_path_cost`: de Yogaschool's Docentenopleiding is € 4.590 + a mandatory
 *     € 1.590 Basisopleiding = € 6.180), so its price is held to the identical question as
 *     the programme's own — by the identical regex. The record's own prose said "€1510",
 *     which is what an OLDER page of that school prints; the Basisopleiding page prints
 *     € 1.590,00. Only the artifact could tell those apart. An unpriced gate (`experience`,
 *     `other`) asserts no amount and is not checked — see claimsOf.
 *   - VAT — `price.vat` of `incl`/`excl`/`exempt_crkbo` → the cited artifact must state
 *     **THAT TREATMENT**. Asking only "does the page mention tax" is the check
 *     CERTIFYING the very inference it was built to forbid: spec §4.11 (v0.7) says
 *     `price.vat` is observed on the page that states it, or it is `unknown` — never
 *     deduced from a CRKBO registration, from the invoicing entity, or from a sibling
 *     programme's page. A bare `\bcrkbo\b` in the pattern grounded `exempt_crkbo` on a
 *     FOOTER BADGE beside a street address; `vrijstelling` (in Dutch: *any* exemption)
 *     grounded it on "er is geen vrijstelling mogelijk", which is about COURSE CREDIT;
 *     and with no direction check, a page reading "€3150,- Excl BTW" grounded
 *     `exempt_crkbo`. The three treatments have near-disjoint vocabularies. Use them.
 *   - SCHEDULE (v0.12) — `hours_claimed.schedule` set → the cited artifact must print
 *     EVERY distinct block TIME (start and end). The ceiling and the disconnect
 *     (derive.ts) are numbers we publish about a named business, computed from those
 *     times, so they are held to the same standard. It gates the TIMES, not the block
 *     COUNT — the page states the count only as a date range ("Mon to Sat"), which no
 *     regex can honestly turn into "21"; that stays a documented, manually-verified
 *     limit (see `claimsOf`).
 *
 * HOW IT READS THEM, and why both:
 *
 * `archive.ts` captures every source twice — `<id>-<date>.html` (the raw DOM) and
 * `<id>-<date>.pdf` (the browser-rendered page). NEITHER IS SUFFICIENT ALONE, and
 * the corpus proves it in both directions:
 *
 *   - 3 programmes' prices live ONLY in the PDF (balanzs, newnature ×2): the amount
 *     is injected by a JS add-to-cart widget after load, so the saved DOM string
 *     never contains it. This is the SAME trap already documented for the
 *     Salesforce-rendered Yoga Alliance registers (see WAYBACK_POINTLESS in
 *     archive.ts) — a stored page is not the page a reader saw.
 *   - 7 programmes' prices live ONLY in the HTML (arhanta, namaste-studios,
 *     pure-energy-yoga, thrive-yoga, tula, yogapoint, yogaschool-noord): print CSS
 *     and lazy sections drop them out of the PDF render. de Blikopener's own
 *     opleidingspagina is now the extreme case — its PDF renders as an empty shell,
 *     and every sentence on it survives only in the HTML. Bluebirds' hybrid page is
 *     the same story in the VAT field: "(all prices at 0% VAT as we are CRKBO
 *     registered)" is in the HTML and NOT in the render.
 *
 * Search only the HTML and 3 truthful records are called liars; only the PDF and 7
 * are. Search BOTH and pass if EITHER evidences the fact: zero false positives over
 * the whole corpus, and the real ones still flagged.
 *
 * PDF text is extracted with `pdftotext` (poppler). NOT `strings`: a browser PDF
 * stores its text in Flate-compressed streams, so `strings` reads the compressed
 * bytes, matches the money regex against binary noise, and reported 55 of 47
 * records as fine — a check that passes everything is worse than no check.
 *
 * IT RUNS WHERE THE EVIDENCE IS, AND SAYS SO WHERE IT ISN'T. The snapshot BODIES are
 * gitignored — this repo publishes only the `.sha256` beside each one, because
 * mirroring a provider's whole page is redistribution, not citaatrecht (see
 * data/archives/README.md). So in CI, or in a fresh clone, the artifacts this check
 * reads are simply not there. That is NOT a finding: "we cannot open the evidence
 * here" and "the evidence shows no price" are different sentences, and printing the
 * second when the first is true would accuse ~40 named businesses on every CI run.
 * The `.sha256` sidecar — which IS committed, and which lists every file captured
 * for that source — is what tells the two apart: it names an artifact that exists
 * but is not in this checkout, so the source is SKIPPED, and the skip is counted and
 * reported.
 *
 * WHICH MAKES IT VACUOUS IN CI UNLESS IT SAYS SO OUT LOUD — and for one release it
 * did not. On a fresh checkout 158 of 167 claims are skipped, and both runners
 * printed a green tick over the other 9: `✓ elk gedekt`, exit 0. A check that
 * reports "all covered" while holding 5% of the evidence is the `strings` disaster
 * wearing a clean shirt. Hence `coverage` and `granularity` ON THE REPORT, so a
 * consumer CANNOT summarise this check as more than it is, and the rule that no
 * runner may print `✓` while `skipped > 0`.
 *
 * THE LIMIT, stated honestly because the check cannot state it itself: it holds a
 * claim against the WHOLE cited artifact, not against the sentence next to the
 * programme's own name. A page that prices three routes and states the amount for
 * two of them still evidences the third's amount if the number happens to be there.
 * It is a floor under the citation, not a ceiling over it.
 *
 * A BUILD GATE, as of 2026-07-14. `npm run provenance` fails, and it runs inside
 * `npm run build` — so a record that cites a page which does not state its fact
 * cannot ship. It stayed a warning until it had held at zero findings across 163
 * claims, because a false positive here is an accusation against our own sourced
 * research; that condition was met, so the gate is on. `validate` still prints it as
 * a warning and `/qa` still counts it — those are the friendly signals while you
 * work. The build is where it bites.
 *
 * WHAT THE GATE CAN ENFORCE DEPENDS ON WHERE IT RUNS, and scripts/provenance.ts says
 * so out loud on every run. The STRUCTURAL tier ("cited, but in no archive":
 * no_source / no_snapshot / no_artifact) needs only the record and the committed
 * `.sha256` sidecars, so it binds everywhere, CI included. The CONTENT tier
 * ("archived, but the artifact does not state it": no_evidence) needs the snapshot
 * body, which is gitignored — so on a fresh checkout it is not weakened but ABSENT,
 * and every such claim is SKIPPED, never passed.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { Program, Provider, Source } from "../schema";

/**
 * A money amount, as an ARTIFACT prints it — not as a human writes it. THE FALLBACK
 * TIER: it answers "does this page print *a* price at all", which is the right and
 * only question for a record that says `published: yes` and holds no `amount_eur`.
 * Where we DO hold the amount, `priceFigureRe` asks the real question instead.
 *
 * The euro sign and its digits routinely land in SEPARATE TEXT RUNS: a
 * browser-rendered PDF puts the `€` in one span and `449,-` in the next, so
 * `pdftotext` emits them on two lines. `/€\s?\d/` misses that; `[\s\r\n]*` does not.
 *
 * Three shapes, because the corpus holds all three: `€ 2.450`, `2450 euro` / `2450
 * EUR`, and `EUR 2450`. The middle alternative demands at least three digits
 * (`\d[\d.,]{2,}`) so that an hour count next to the word "uur" cannot be read as a
 * price — a yoga school writes "200 uur", never "200 euro", about its hours.
 */
export const MONEY_RE = /€[\s\r\n]*\d|\d[\d.,]{2,}[\s\r\n]*(euro|EUR)\b|\bEUR[\s\r\n]*\d/i;

/**
 * THE AMOUNT ITSELF — the number in the record, printed on the page it is cited to.
 *
 * `evidencesPrice` (above) asks whether the page shows A price. That question passed
 * both records that stored OUR ARITHMETIC as the school's published price: de
 * Yogaschool Enschede (`amount_eur: 4590`; the page prints "€ 1530,00 per jaar" — the
 * 4590 is our 3 × 1530, and appears in NONE of their artifacts) and Adhouna's Yin XL
 * (`amount_eur: 2725`; the page prints € 1.420,00 and € 1.305,00 — our sum again).
 * Both pages are FULL of euro signs, so the page-level check waved both through. The
 * record holds the number; the artifact either prints it or it does not.
 *
 * MATCHING IT IS THE WHOLE JOB, and the corpus punctuates money four ways:
 *   nl-NL   `€ 4.590`  `€4.590,-`  `4590,00`     (dot = thousands, comma = decimals)
 *   en      `€ 2,385`  `€3,150`    `€ 2,964.50`  (jai-yoga, tribes, de-nieuwe-yogaschool)
 *   no sign `KOSTEN: 3,050 E`                    (thrive-yoga — so a € is NOT required)
 *   cents   `€ 2.838,60`                         (aalo; six amounts in the corpus are
 *                                                 not integers, and rounding one away
 *                                                 would flag a correctly sourced record)
 * Hence: a separator between thousands groups that may be `.`, `,`, nbsp or absent;
 * decimals that must match when the record HAS cents (2838.6 → `,60`) and are optional
 * when it does not (`,-` and `,00` are the same 4590).
 *
 * AND IT MUST NOT MATCH A SUBSTRING OF A LARGER NUMBER. `(?<![\d.,])` refuses a figure
 * that sits after a digit or a separator — "€ 1.875" is not 875, "1.4590" is not 4590 —
 * and the trailing `(?![\d]|[.,]\d)` refuses one with a number continuing after it, so
 * `4` does not match "4.590" and 2450 does not match "€ 2.450,50" (which is not 2450).
 */
export function priceFigureRe(amount: number): RegExp {
  const inCents = Math.round(amount * 100);
  const cents = inCents % 100;
  const digits = String(Math.floor(inCents / 100));

  const groups: string[] = [];
  for (let i = digits.length; i > 0; i -= 3) groups.unshift(digits.slice(Math.max(0, i - 3), i));
  const integer = groups.join(String.raw`[.,\u00a0]?`);

  // `,-` is Dutch for "and no cents", and so are `,00` and nothing at all.
  const decimals =
    cents === 0
      ? String.raw`(?:[.,](?:00|-|–))?`
      : String.raw`[.,]${String(cents).padStart(2, "0")}`;

  return new RegExp(String.raw`(?<![\d.,])${integer}${decimals}(?![\d]|[.,]\d)`);
}

/**
 * THE HOURS FIGURE, NEXT TO AN HOURS WORD — because otherwise A PRICE GROUNDS IT.
 *
 * The figure alone (`(?<!\d)${total}(?!\d)`) was the second-worst design and shipped:
 * in "€ 2.500" the character before `500` is `.`, NOT a digit, so it matched — and
 * 200/300/500 are precisely the three standard yoga formats while Dutch prices use `.`
 * as the thousands separator. Verified: it read "€ 2.500" as evidence for 500 hours,
 * "€ 1.200" and "logo-200x200" as evidence for 200. A price thereby certified an hours
 * claim about a named business.
 *
 * The figure is now refused unless it sits in an HOURS CONTEXT, and the corpus dictates
 * all three shapes of that context — this is where the school actually puts the number:
 *
 *   1. an hours word AFTER it — "500 u", "500u", "372 u.", "500-uurs niveau", "200h",
 *      "200 hours", and the Dutch compound "200 opleidingsuren" (namaste-studios), where
 *      the hours noun is the TAIL of the following word, not a word of its own.
 *   2. a FORMAT LABEL before it — "RYT300" (sanayou), "RYT 200" (yoga-centrum-oosterwold).
 *      The label is not decoration: RYT300 *is* Yoga Alliance's name for the 300-hour
 *      registration, so the page printing it does state the figure.
 *   3. an hours noun BEFORE it, within a few words and across no digits and no € —
 *      "So number of hours amounts to 350." (jai-yoga). The `[^.\d€\n]` window is what
 *      keeps this alternative from re-admitting money: it cannot cross a euro sign, a
 *      sentence end or another number to reach the figure.
 *
 * Digit boundaries, not `\b`: "500u" has NO word boundary between `0` and `u` (both are
 * word characters), so `\b500\b` fails on the most common way a Dutch yoga school writes
 * it. That regex flagged open-yoga and samsara — two records whose cited page prints the
 * figure in as many characters — as unsourced. And `(?<![\d.,])`, not `(?<!\d)`: the `.`
 * is the whole "€ 2.500" bug.
 *
 * What it therefore still catches, and this is the useful class: a total that appears
 * NOWHERE on the cited page because WE SUMMED IT (spec §6) — de Yogaschool Enschede
 * published 360 contact + 240 self-study hours and never the 600, which is why
 * `hours_claimed.total` is null there today.
 */
const HOURS_WORD_AFTER = String.raw`(?:uur|uren|u\b|hours?\b|hrs?\b|h\b|[a-z-]{1,15}(?:uur|uren)\b)`;
const HOURS_FORMAT_LABEL = String.raw`(?:E-?RYT|RYT|RYS|RPYT|CYT|YTT)`;
const HOURS_NOUN_BEFORE = String.raw`(?:uur|uren|hours?)`;

export function hoursFigureRe(total: number): RegExp {
  const figure = String.raw`(?<![\d.,])${total}(?!\d)`;
  return new RegExp(
    [
      String.raw`${figure}[\s\u00a0]*[-\u2011]?[\s\u00a0]*${HOURS_WORD_AFTER}`,
      String.raw`${HOURS_FORMAT_LABEL}[\s\u00a0\u2011-]{0,2}${figure}`,
      String.raw`${HOURS_NOUN_BEFORE}\b[^.\d€\n]{0,25}${figure}(?![\s\r\n]*(?:euro|EUR)\b)`,
    ].join("|"),
    "i",
  );
}

/**
 * A VAT REGISTRATION NUMBER IS NOT A VAT TREATMENT. Stripped before we read anything.
 *
 * SanaYou's footer prints "BTW nummer: NL001422164B38" on every page. That is a company
 * identifier — it says the entity is registered for VAT, and precisely NOTHING about what
 * this training costs or whether tax is charged on it. Left in, the word "BTW" in that
 * footer is a VAT string on every page of the site, and the check would let a footer
 * ground a treatment. (SanaYou's own records read `vat: unknown`, which is the honest
 * value and needs no evidence — but the hole was real and load-bearing for anyone who
 * next wrote `incl` on that page.)
 */
export const VAT_REGISTRATION_RE = /\b(?:btw|vat)[-\s]?(?:nummer|nr\.?|number|no\.?|id)\b|\bNL\d{9}B\d{2}\b/gi;

/**
 * WHICH TREATMENT THE PAGE STATES — the question the old regex refused to ask.
 *
 * It asked whether the page mentioned tax AT ALL (`btw|vat|vrijgesteld|vrijstelling|
 * omzetbelasting|crkbo`) and let any hit ground any treatment. Four holes, each of them
 * live in the corpus, and each of them the check BLESSING the inference it exists to
 * forbid (spec §4.11 v0.7: observed on the page that states it, or `unknown`):
 *
 *   - `\bcrkbo\b` — a bare CRKBO badge grounded `exempt_crkbo`. Queno Sportopleidingen's
 *     cited page has ZERO hits for btw/vrijgesteld/omzetbelasting and ONE for CRKBO: a
 *     footer badge next to the street address. "They are CRKBO-registered, therefore the
 *     price is VAT-free" is a deduction, and it is the deduction §4.11 names. The
 *     alternative was defending the sentence "CRKBO-geregistreerd, dus btw-vrij" — which
 *     still matches, on `btw-vrij`, where it belongs.
 *   - `vrijstelling` — in Dutch this is ANY exemption. Spark of Light's 300-hour page
 *     says "er is geen vrijstelling mogelijk" about COURSE-CREDIT exemptions, and Yoga
 *     Spot's says "Er wordt geen vrijstelling verleend voor onderdelen van de training".
 *     Neither sentence is about tax. Only `vrijstelling VAN BTW/omzetbelasting` is.
 *   - the footer registration number — see VAT_REGISTRATION_RE.
 *   - no direction — "€3150,- Excl BTW" grounded `exempt_crkbo` (bluebirds/200-vinyasa-2025).
 *     A page whose only VAT string is `excl. btw` states the OPPOSITE of an exemption.
 *
 * The vocabularies below are disjoint by construction and every alternative is here
 * because a page in the corpus writes it that way — the directory is bilingual, so each
 * treatment gets both languages:
 */
export const VAT_PATTERNS: Record<"exempt_crkbo" | "incl" | "excl", RegExp> = {
  /** No VAT is charged. `btw-vrij(gesteld)` (spark-of-light), `vrij van BTW` (yoga-spot),
   *  `vrijgesteld van btw` (thrive-yoga), `0% VAT` (bluebirds hybrid), `no VAT charged`
   *  (tribes-academy), `thus no VAT` (yoga-moves) — and TULA, which spells the exemption
   *  out in two clauses: "These prices do not include VAT, NOR WILL THIS BE ADDED, since
   *  TULA is a registered vocational institute at CRKBO". The first clause alone reads as
   *  `excl` in English; only the second makes it an exemption, so the alternative demands
   *  both. `vrijstelling` is admitted ONLY as `vrijstelling van btw/omzetbelasting` — bare
   *  `vrijstelling` is course credit, not tax (see above).
   *
   *  `exempt(ed|ion)`, not `exempt\b`: Yagoy heads its price table "Training fee (VAT
   *  exempted)" — an exemption stated in as many words — and a trailing `\b` after
   *  `exempt` refuses the participle. That regex made a FALSE POSITIVE of the two records
   *  in this corpus whose VAT treatment is quoted most explicitly of all, which is the
   *  failure mode that matters here: a false positive is an accusation against our own
   *  sourced research. */
  exempt_crkbo:
    /\bbtw[-\s]?vrij|\bvrij(?:gesteld)?\s+van\s+(?:de\s+)?(?:btw|omzetbelasting)|\bvrijstelling\s+van\s+(?:de\s+)?(?:btw|omzetbelasting)|\bgeen\s+btw\b|\bno\s+vat\b|\b0\s?%\s?(?:btw|vat)\b|\b(?:btw|vat)[-\s]?(?:vrijstelling|exempt(?:ed|ion)?)\b|\bexempt(?:ed)?\s+from\s+(?:btw|vat)\b|\bnot\s+include\b[^.]{0,20}\bvat\b[^.]{0,30}\bnor\b[^.]{0,40}\bbe\s+added\b/i,

  /** VAT is in the price. `incl. BTW` (adhouna), `inclusief 9% btw` (pure-yoga — note the
   *  rate between the words), `incl. 21% VAT` (yoga-nature-studio), `including VAT`
   *  (jai-yoga). The `(?:btw|vat)` is MANDATORY and adjacent: bare `incl` matched
   *  "including" and "wp-includes" in yoga-den's artifact, and that phantom hit was once
   *  load-bearing for two separate conclusions about that school. */
  incl: /\bincl(?:\.|usief|uding|udes)?\s*(?:\d{1,2}\s?%\s?)?(?:btw|vat|omzetbelasting)\b/i,

  /** VAT comes on top. `Excl BTW` (bluebirds 2025), `excl. btw` (wahe), `exclusief btw`
   *  (pure-yoga, adhouna — both pages print the net figure beside the gross), and the
   *  contractual `te vermeerderen met btw`. */
  excl: /\bexcl(?:\.|usief|uding|udes)?\s*(?:\d{1,2}\s?%\s?)?(?:btw|vat|omzetbelasting)\b|\bte\s+vermeerderen\s+met\s+(?:btw|omzetbelasting)\b/i,
};

/** The VAT treatments that ASSERT something. `unknown` asserts nothing and is exempt from
 *  the check by design — demanding evidence for "wij weten het niet" would invert the rule. */
export type VatTreatment = keyof typeof VAT_PATTERNS;

export function isVatTreatment(vat: string): vat is VatTreatment {
  return vat === "incl" || vat === "excl" || vat === "exempt_crkbo";
}

/** Does this artifact's text show a money amount anywhere? The FALLBACK tier — only for a
 *  `published: yes` that holds no amount. See MONEY_RE. */
export function evidencesPrice(text: string): boolean {
  return MONEY_RE.test(text);
}

/** Does this artifact's text print THE AMOUNT the record claims? See priceFigureRe. */
export function evidencesAmount(text: string, amount: number): boolean {
  return priceFigureRe(amount).test(text);
}

/** Does this artifact's text print the hours figure the record claims, as hours? See hoursFigureRe. */
export function evidencesHours(text: string, total: number): boolean {
  return hoursFigureRe(total).test(text);
}

/** Does this artifact's text state THE VAT TREATMENT the record records? Not "does it
 *  mention tax" — see VAT_PATTERNS, and spec §4.11. */
export function evidencesVat(text: string, treatment: VatTreatment): boolean {
  return VAT_PATTERNS[treatment].test(text.replace(VAT_REGISTRATION_RE, " "));
}

/**
 * A SESSION TIME, AS A PAGE PRINTS IT — the times the ceiling/disconnect are computed from.
 *
 * Colon is the unambiguous form (the DNYS capture: "Daily schedule 10:00 – 17:00"); `.`, `u`
 * and `h` are the Dutch/informal spellings ("10.00 uur", "10u00"). The dot could in theory
 * collide with an English price "€ 17.00" — but a training's prices are in the thousands, never
 * €17, so in THIS domain that collision is not real, and INCLUDING the dot avoids a FALSE
 * NEGATIVE on a Dutch "10.00 uur" page, which is the worse failure (it accuses our own sourced
 * research). Separator required (a bare "1000" is not a time). A single-digit hour may drop its
 * leading zero on the page ("9:00" for "09:00"). Minutes exact; digit boundaries so "17:00" is
 * not matched inside "217:00" or "17:000".
 */
export function scheduleTimeRe(hhmm: string): RegExp {
  const [hh, mm] = hhmm.split(":");
  const hour = Number(hh);
  const hourPat = hour < 10 ? String.raw`0?${hour}` : String(hour);
  return new RegExp(String.raw`(?<![\d.,:])${hourPat}[.:uh]${mm}(?!\d)`, "i");
}

/** Does the artifact print EVERY distinct session time the record holds? See scheduleTimeRe. */
export function evidencesScheduleTimes(text: string, times: string[]): boolean {
  return times.every((t) => scheduleTimeRe(t).test(text));
}

/** Which claim a finding is about. The message names the field; this makes it filterable. */
export type ProvenanceCheck = "price" | "hours" | "vat" | "prerequisite" | "schedule";

/**
 * WHICH QUESTION WAS ASKED of the artifact — and therefore what a pass is worth.
 *
 * `fact` = "the artifact prints the value in the record" (the amount, the hours figure,
 * the recorded VAT treatment). `page` = "the artifact prints *a* value of that kind" —
 * true only of a `published: yes` price with no `amount_eur`, where that IS the whole
 * claim. It rides on the finding so a human knows which question failed, and on the
 * report so no consumer can summarise this check as more than it is.
 */
export type Granularity = "page" | "fact";

/** Why a cited source carries no evidence. Each is a different failure, and the message
 *  must say which: `no_snapshot` is a hole in OUR archive (a gap, our debt);
 *  `no_evidence` is a hole in OUR citation about a NAMED BUSINESS (a defect); and
 *  `unreadable` is neither — it is an artifact we could not extract a single character
 *  from (an image-only capture, a shell PDF). Calling that last one `no_evidence` —
 *  "the page contains no amount" — is an ACCUSATION built on our own broken extractor,
 *  and the two sentences must never be collapsed. */
export type ProvenanceReason = "no_source" | "no_snapshot" | "no_artifact" | "unreadable" | "no_evidence";

/**
 * WHICH EVIDENCE A FINDING NEEDS — and therefore WHERE the gate can enforce it.
 *
 * The snapshot bodies are gitignored, so a fresh checkout (CI) can prove some of these
 * and not others. The gate has to know the difference, or it either blocks every CI
 * build or passes vacuously over evidence it never opened. Both have happened.
 *
 *   `structural` — provable from the record plus the committed `.sha256` sidecars
 *     ALONE, so it binds EVERYWHERE. "You cited a page that is in no archive."
 *   `content` — needs the snapshot body. "We opened the artifact; the fact is not in
 *     it." Where the body is absent the claim is SKIPPED, never passed (see
 *     `bodyWithheld` in allProvenance) — which is what keeps CI honest instead of green.
 *   `tooling` — needs the body too, but it is NOT a claim about the provider: we hold a
 *     capture and could not extract a character from it. Reporting that as `content`
 *     would print "the page states no price" about a named business on the strength of
 *     our own broken extractor. That is the `strings` disaster, and it stays its own tier.
 *
 * Exhaustive over ProvenanceReason ON PURPOSE: add a reason and this stops compiling
 * until someone decides what evidence it needs. That decision is not one to make by
 * accident.
 */
export const FINDING_TIER: Record<ProvenanceReason, "structural" | "content" | "tooling"> = {
  no_source: "structural",
  no_snapshot: "structural",
  no_artifact: "structural",
  unreadable: "tooling",
  no_evidence: "content",
};

export interface ProvenanceFinding {
  providerId: string;
  programId: string;
  check: ProvenanceCheck;
  sourceId: string | null;
  reason: ProvenanceReason;
  /** Which question the artifact failed — see Granularity. */
  granularity: Granularity;
  /** Dutch, record-first — it is read in `npm run validate` output and on /qa. */
  message: string;
}

/**
 * Artifact extensions we can read — A CAPTURE OF THEIR PAGE, AND NOTHING WE WROTE.
 *
 * `.md` and `.txt` were in this list, and they must never be again. Five sources
 * (arhanta-yoga, namaste-studios ×2, yogapoint, yoga-academie-nederland) carried a
 * hand-made `.md` "Evidence snapshot — tekstextractie" as their `local_snapshot`: a
 * file WE composed from a web fetch, holding the quotes WE selected. The check opened
 * it, searched it for the price we had recorded, found the price we had put there, and
 * passed. Seven claims were "verified" against our own summary — the check reading its
 * own homework back to itself, and reporting `✓ elk gedekt` over it.
 *
 * It is the exact prohibition this project states in every other place — "extract the
 * value FROM THE CAPTURED FILE. Never from a search summary, never from memory" —
 * silently violated by the one function whose whole job is to enforce it. And it was
 * the WORST possible seven, because they were the only bodies committed to the public
 * repo: in CI, the nine claims the check could open were precisely the self-certifying
 * ones. The gate's only reachable evidence was evidence it had authored.
 *
 * All five sources now carry a real browser capture, and every recorded figure survived
 * being held to it (yogapoint's "1.452 euro per module", namaste's € 3.000, arhanta's
 * € 3250 — the records were right, they were simply unarchived). An artifact is a
 * capture of a page a reader saw. If we wrote it, it is a note, and notes evidence
 * nothing.
 */
const READABLE = [".pdf", ".html"] as const;

let pdftotextChecked = false;
let pdftotextPresent = false;

/** poppler's `pdftotext`, and no fallback. A missing extractor must be LOUD (see
 *  the `strings` disaster in the header): a check that quietly stops reading PDFs
 *  would pass every JS-rendered price page in the corpus. */
export function pdftotextAvailable(): boolean {
  if (!pdftotextChecked) {
    pdftotextChecked = true;
    try {
      execFileSync("pdftotext", ["-v"], { stdio: "ignore" });
      pdftotextPresent = true;
    } catch {
      pdftotextPresent = false;
    }
  }
  return pdftotextPresent;
}

export class PdftotextMissing extends Error {
  constructor() {
    super(
      "pdftotext (poppler) niet gevonden — de provenance-check kan PDF-artefacten niet lezen. " +
        "Installeer: `brew install poppler` (macOS) of `apt-get install -y poppler-utils` (Debian/Ubuntu).",
    );
    this.name = "PdftotextMissing";
  }
}

/**
 * WHAT A READER SEES, not what the server sent. Scripts, styles, comments and tags out.
 *
 * The price check survived on the raw DOM string because `€` is vanishingly rare in
 * markup. Numbers are not: an HTML file is dense with them — `font-weight:500`,
 * `width:300px`, `logo-200x200.jpg`, tracking payloads — and de Blikopener's homepage
 * (which prints no hours at all) contains "500" several times over in exactly that way.
 * Matching an hours figure against the markup makes the check assert, of a named
 * business, that they publish an hour count, on the evidence of a stylesheet.
 *
 * A citation is a claim that a READER can go and see the fact on that page. So the text
 * we hold the claim against is the text a reader sees. (Prices survive the strip: the 7
 * HTML-only prices in the corpus are all in visible copy — verified over the whole
 * corpus, zero new price findings.)
 */
export function visibleText(html: string): string {
  return html
    .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&euro;/gi, "€")
    .replace(/&amp;/gi, "&");
}

/** One extraction per FILE, not per check. Three checks now read the same artifacts, and
 *  `pdftotext` on a full-page capture is the expensive part of `npm run validate` —
 *  without this, adding hours and VAT tripled the cost of every build. */
const textCache = new Map<string, string>();

/** An artifact we hold but could not turn into text: a corrupt or image-only PDF, a
 *  capture that extracted to nothing. NOT evidence of absence — see ProvenanceReason. */
export class ArtifactUnreadable extends Error {
  constructor(readonly file: string, readonly cause: string) {
    super(`${path.basename(file)}: ${cause}`);
    this.name = "ArtifactUnreadable";
  }
}

function artifactText(file: string): string {
  const hit = textCache.get(file);
  if (hit != null) return hit;
  const lower = file.toLowerCase();
  let text: string;
  if (lower.endsWith(".pdf")) {
    if (!pdftotextAvailable()) throw new PdftotextMissing();
    try {
      // `-` = write to stdout. 64MB ceiling: a full-page capture of a long page can
      // run to a few hundred KB of text; the default 1MB would truncate silently.
      text = execFileSync("pdftotext", ["-q", file, "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    } catch (e) {
      // A corrupt PDF used to throw a raw execFileSync error straight through
      // scripts/validate.ts: the BUILD DIED on a stack trace that named neither the
      // provider nor the source. One bad artifact is a fact about that artifact.
      throw new ArtifactUnreadable(file, e instanceof Error ? e.message.split("\n")[0] : String(e));
    }
  } else if (lower.endsWith(".html")) {
    text = visibleText(fs.readFileSync(file, "utf8"));
  } else {
    text = fs.readFileSync(file, "utf8");
  }
  textCache.set(file, text);
  return text;
}

interface Artifacts {
  /** Artifact files we can actually open here. */
  readable: string[];
  /** True when the archiver captured a file for this source that is NOT in this
   *  checkout — i.e. a gitignored body. Its `.sha256` is the receipt. */
  bodyWithheld: boolean;
  /** True when nothing was ever captured: no body, no hash, no text extraction. */
  nothingCaptured: boolean;
}

/**
 * Every artifact captured for one source, and what we can read of it here.
 *
 * Keyed off the record's own `local_snapshot` (its base name, extension swapped),
 * NOT off a directory scan for files starting with the source id: source ids nest,
 * and a scan that picked up a SIBLING source's capture would let one page's price
 * vouch for another page's citation. The record says which file it stands on; we
 * read that file and the twin the archiver wrote beside it.
 *
 * The `.sha256` sidecar is the receipt for a body we may not hold: the archiver
 * writes one line per captured file, so its very existence proves a snapshot was
 * taken even when the body is gitignored out of this checkout.
 */

/**
 * REPRODUCE CI'S STATE WITHOUT TOUCHING THE ARCHIVES. `npm run test:ci` sets this, and
 * the check then behaves as it does in a fresh clone: the `.sha256` receipts are there,
 * the bodies are not, so every content claim is SKIPPED and only the structural tier can
 * fire.
 *
 * It exists because the researcher's machine is the ONE machine where this check sees
 * everything — and that is exactly why a test can pass here and fail in CI. One did, for
 * weeks: `granularity` was asserted against what the corpus HOLDS rather than what the
 * run EXAMINED, green locally, red on a clone, and unnoticed because CI did not run the
 * tests at all. There has to be a way to ask "would this pass where the evidence isn't?"
 *
 * AND IT IS AN ENV FLAG RATHER THAN A SHUFFLE OF FILES ON PURPOSE. The obvious way to
 * simulate a missing archive is to move the archive. An agent doing exactly that — move
 * the file, do the work, move it back — crashed in between and destroyed 364 lines of the
 * author's unrecoverable research. Nothing in this repo simulates absence by making
 * something absent. Never move the author's files.
 *
 * IT WITHHOLDS THE CHECKOUT'S BODIES, NOT EVERY FILE ON DISK. A caller that passes an
 * explicit `cwd` is not reading the checkout — it is a test standing up a synthetic
 * archive in a temp dir to prove what the check does WITH an artifact in hand (an
 * unreadable capture, a priced gate). Blanking those too made the flag assert the
 * opposite of what those tests exist to pin, and two of them went red saying so.
 */
const withheldBodies = (cwd: string) =>
  process.env.PROVENANCE_WITHHOLD_BODIES === "1" && cwd === process.cwd();
export function artifactsFor(source: Source, cwd = process.cwd()): Artifacts {
  if (!source.local_snapshot) return { readable: [], bodyWithheld: false, nothingCaptured: true };
  const base = source.local_snapshot.replace(/\.[a-z0-9]+$/i, "");
  const readable = withheldBodies(cwd)
    ? [] // the bodies are gitignored away, as in a fresh clone — see withheldBodies()
    : READABLE.map((ext) => path.join(cwd, base + ext)).filter((f) => fs.existsSync(f));
  const hashFile = path.join(cwd, `${base}.sha256`);
  const hashed = fs.existsSync(hashFile)
    ? fs
        .readFileSync(hashFile, "utf8")
        .split("\n")
        .map((line) => line.trim().split(/\s+/)[1])
        .filter((name): name is string => !!name)
    : [];
  const present = new Set(readable.map((f) => path.basename(f)));
  return {
    readable,
    bodyWithheld: hashed.some((name) => !present.has(name)),
    nothingCaptured: readable.length === 0 && hashed.length === 0,
  };
}

export interface ProvenanceReport {
  findings: ProvenanceFinding[];
  /** Cited sources whose artifacts we could open and search — counted per CLAIM, so a
   *  price and an hours figure citing one page count twice: two claims were checked. */
  examined: number;
  /** Claims whose cited source's body is not in this checkout (gitignored). Not a
   *  finding — an honest limit of where the check is running. */
  skipped: number;
  /** Every claim the check had a subject for: examined + skipped + the ones that never
   *  reached a search (no source, no snapshot, nothing captured, nothing readable). */
  claims: number;
  /** examined / claims. It is 1 ONLY where the whole archive is on disk. In CI it is
   *  ~0.05, and a consumer that prints a green tick over 0.05 is lying for us. */
  coverage: number;
  /** The WEAKEST question any examined claim was held to (see Granularity): `fact` only
   *  when every single one was held to the value in the record. */
  granularity: Granularity;
}

/**
 * One claim, held against the page it is cited to. The three checks differ ONLY in
 * what they look for and what they say when they do not find it — everything else
 * (resolve the source, open the artifacts, honour a withheld body) is identical, and
 * writing it three times is how the three would drift apart.
 */
interface Claimed {
  check: ProvenanceCheck;
  granularity: Granularity;
  programId: string;
  sourceId: string | null;
  /** The claim the record makes, in Dutch — used to open every message about it. */
  claim: string;
  evidences: (text: string) => boolean;
  /** What we searched for and did not find, in Dutch. Completes the `no_evidence` message. */
  missing: string;
}

/** Every claim in a programme that a cited artifact must be able to back. */
function claimsOf(program: Program): Claimed[] {
  const claims: Claimed[] = [];
  const price = program.price;

  // PRICE. Two tiers, and the finding says which one failed. With an `amount_eur` the
  // claim is "they publish THIS number" and only that number will do — the alternative
  // is publishing our own arithmetic under their name (spec §6). Without one, the record
  // claims no more than "they publish a price", and the page-level question is the whole
  // question: a `published: yes` still owes the reader *a* price on the cited page.
  if (price.published === "yes") {
    const amount = price.amount_eur;
    claims.push(
      amount != null
        ? {
            check: "price",
            granularity: "fact",
            programId: program.id,
            sourceId: price.source ?? null,
            claim: `prijs €${amount} volgens het record`,
            evidences: (text) => evidencesAmount(text, amount),
            missing: `drukt dat bedrag nergens af (staat er een ANDER bedrag, dan is €${amount} ONZE rekensom — spec §6)`,
          }
        : {
            check: "price",
            granularity: "page",
            programId: program.id,
            sourceId: price.source ?? null,
            claim: "prijs gepubliceerd volgens het record (geen bedrag vastgelegd)",
            evidences: evidencesPrice,
            missing: "bevat nergens een bedrag",
          },
    );
  }

  // HOURS. The figure is a fact about a named business ("this training is 500 hours"),
  // and it must stand on the page that says so — beside an hours word, not beside a €.
  const total = program.hours_claimed.total;
  if (total != null) {
    claims.push({
      check: "hours",
      granularity: "fact",
      programId: program.id,
      sourceId: program.hours_claimed.source ?? null,
      claim: `${total} uur volgens het record`,
      evidences: (text) => evidencesHours(text, total),
      missing: `noemt ${total} nergens als urental (staat het er als som van deelgetallen, dan is het totaal ONZE optelling — spec §6)`,
    });
  }

  // PREREQUISITE (v0.9). A GATE WITH A PRICE IS A PRICE CLAIM ABOUT A NAMED BUSINESS, and
  // it is an ADDEND in a figure we publish: `total_path_cost` puts de Yogaschool's
  // Docentenopleiding at € 6.180 by adding € 1.590 to it. That € 1.590 must be printed on
  // the page we cite for it — held to the SAME question as `price.amount_eur`, by the same
  // regex, because it is the same kind of statement. Recording a gate's cost from memory,
  // from a summary, or from the sibling page that merely mentions it is exactly how € 1.510
  // (the figure on an older page) ended up in this record's prose while the school's own
  // Basisopleiding page says € 1.590.
  //
  // AN UNPRICED GATE ASSERTS NO AMOUNT and is therefore not checked here — `kind:
  // experience` ("min. 2 jaar praktijk") and `kind: other` ("afgeronde RYT200") carry no
  // euros, and demanding a number from a page that states a barrier without one would
  // invert the rule. Their `source` is still REQUIRED by the schema and rendered beside the
  // gate; what this check cannot do is read a sentence. That limit is the same one stated
  // in the header: a floor under the citation, not a ceiling over it.
  for (const pre of program.prerequisite ?? []) {
    const cost = pre.cost_eur;
    if (cost == null) continue;
    claims.push({
      check: "prerequisite",
      granularity: "fact",
      programId: program.id,
      sourceId: pre.source,
      claim: `verplichte vooropleiding '${pre.label}' kost €${cost} volgens het record`,
      evidences: (text) => evidencesAmount(text, cost),
      missing:
        `drukt dat bedrag nergens af (staat er een ANDER bedrag, dan citeren we de verkeerde ` +
        `pagina — of is €${cost} ONZE rekensom, spec §6)`,
    });
  }

  // VAT. `unknown` is exempt from the check BY DESIGN — it is the honest value for a
  // page that says nothing, and demanding evidence for "wij weten het niet" would
  // invert the whole rule. The three others each assert a treatment, and a treatment is
  // OBSERVED ON THE PAGE THAT STATES IT or it is not known (§4.11 v0.7) — never deduced
  // from a CRKBO registration, an invoicing entity, or a sibling programme's page.
  if (isVatTreatment(price.vat)) {
    const vat = price.vat;
    claims.push({
      check: "vat",
      granularity: "fact",
      programId: program.id,
      sourceId: price.source ?? null,
      claim: `btw-behandeling '${vat}' volgens het record`,
      evidences: (text) => evidencesVat(text, vat),
      missing:
        vat === "exempt_crkbo"
          ? "stelt nergens dat er géén btw wordt gerekend (een CRKBO-vermelding, een 'vrijstelling' van iets anders, of een 'excl. btw' is dat niet — §4.11)"
          : `stelt nergens dat de prijs '${vat}. btw' is`,
    });
  }

  // SCHEDULE (v0.12). The ceiling and the disconnect are numbers we publish about a named
  // business, and they rest on the block TIMES. So the cited page must PRINT those times —
  // held to the same standard as price and hours. THE LIMIT, in this file's own tradition:
  // it gates the TIMES, not the COUNT. The page states the count only as date ranges ("Mon to
  // Sat"), which no regex can honestly turn into "21", so the count stays manually verified —
  // a floor under the citation, not a ceiling over it. (A stated `pause_min` — none in the
  // corpus today — would be a further claim; add it when a record first needs it.)
  const schedule = program.hours_claimed.schedule;
  if (schedule) {
    const times = [...new Set(schedule.blocks.flatMap((b) => [b.start, b.end]))];
    claims.push({
      check: "schedule",
      granularity: "fact",
      programId: program.id,
      sourceId: schedule.source,
      claim: `roostertijden ${times.join(", ")} volgens het record`,
      evidences: (text) => evidencesScheduleTimes(text, times),
      missing: "drukt die tijd(en) nergens af — citeer de pagina die het rooster STELT, en archiveer die",
    });
  }

  return claims;
}

/**
 * Every claim in one provider's record, held against the artifacts of the page it
 * cites for it.
 */
export function providerProvenance(p: Provider, cwd = process.cwd()): ProvenanceReport {
  const findings: ProvenanceFinding[] = [];
  let examined = 0;
  let skipped = 0;
  let claims = 0;
  let pageTierExamined = 0;

  for (const program of p.programs) {
    for (const c of claimsOf(program)) {
      claims++;
      const at = `${p.id}/${c.programId}`;
      const base = { providerId: p.id, programId: c.programId, check: c.check, granularity: c.granularity };
      const source = c.sourceId ? p.sources.find((s) => s.id === c.sourceId) : undefined;

      if (!source) {
        findings.push({
          ...base, sourceId: c.sourceId, reason: "no_source",
          message: `${at}: ${c.claim}, maar er is geen bron opgegeven die dat stelt`,
        });
        continue;
      }
      if (!source.local_snapshot) {
        findings.push({
          ...base, sourceId: source.id, reason: "no_snapshot",
          message: `${at}: bron '${source.id}' heeft geen lokale kopie — ${c.claim}, op geen enkel bewaard bewijsstuk`,
        });
        continue;
      }

      const { readable, bodyWithheld, nothingCaptured } = artifactsFor(source, cwd);

      if (nothingCaptured) {
        findings.push({
          ...base, sourceId: source.id, reason: "no_artifact",
          message: `${at}: bron '${source.id}' verwijst naar '${source.local_snapshot}', maar er is geen kopie én geen hash — nooit vastgelegd`,
        });
        continue;
      }

      // Read every artifact we hold. An artifact that yields NO TEXT (image-only capture,
      // shell PDF, corrupt file) is not evidence of absence: it is a hole in our tooling,
      // and reporting it as "de pagina bevat geen bedrag" would accuse a named business
      // of not publishing something we simply failed to read.
      const texts: string[] = [];
      const unreadable: string[] = [];
      for (const f of readable) {
        try {
          const t = artifactText(f);
          if (t.trim().length === 0) unreadable.push(`${path.basename(f)}: geen tekst geëxtraheerd`);
          else texts.push(t);
        } catch (e) {
          if (e instanceof PdftotextMissing) throw e; // a hole in the TOOLBOX, not in a record
          if (e instanceof ArtifactUnreadable) unreadable.push(e.message);
          else throw e;
        }
      }

      if (texts.some((t) => c.evidences(t))) {
        examined++;
        if (c.granularity === "page") pageTierExamined++;
        continue;
      }

      // Nothing we could open shows it — but if a captured body is missing from this
      // checkout, the evidence may well be in it (that is the normal state in CI).
      // Silence is not evidence of absence when the evidence is elsewhere by design.
      if (bodyWithheld) {
        skipped++;
        continue;
      }

      if (texts.length === 0) {
        findings.push({
          ...base, sourceId: source.id, reason: "unreadable",
          message:
            `${at}: ${c.claim}, maar geen enkel artefact van bron '${source.id}' liet zich uitlezen ` +
            `(${unreadable.join("; ") || "geen leesbaar artefact"}). Dit is een gat in ONS gereedschap, ` +
            `geen bevinding over de aanbieder — leg de bron opnieuw vast.`,
        });
        continue;
      }

      examined++;
      if (c.granularity === "page") pageTierExamined++;
      findings.push({
        ...base, sourceId: source.id, reason: "no_evidence",
        message:
          `${at}: ${c.claim}, maar het gearchiveerde artefact van bron '${source.id}' ${c.missing} ` +
          `(${texts.length} artefact(en) doorzocht${unreadable.length ? `, ${unreadable.length} onleesbaar` : ""}). ` +
          `Citeer de pagina die het STÉLT, niet de pagina die ernaar linkt — en archiveer die eerst.`,
      });
    }
  }

  return {
    findings,
    examined,
    skipped,
    claims,
    coverage: claims === 0 ? 1 : examined / claims,
    granularity: pageTierExamined > 0 ? "page" : "fact",
  };
}

/** The whole corpus. Findings sorted by record, so the warning reads like a work list. */
export function allProvenance(providers: Provider[], cwd = process.cwd()): ProvenanceReport {
  const reports = providers.map((p) => providerProvenance(p, cwd));
  const sum = (pick: (r: ProvenanceReport) => number) => reports.reduce((n, r) => n + pick(r), 0);
  const claims = sum((r) => r.claims);
  const examined = sum((r) => r.examined);
  return {
    findings: reports
      .flatMap((r) => r.findings)
      .sort(
        (a, b) =>
          `${a.providerId}/${a.programId}`.localeCompare(`${b.providerId}/${b.programId}`) ||
          a.check.localeCompare(b.check),
      ),
    examined,
    skipped: sum((r) => r.skipped),
    claims,
    coverage: claims === 0 ? 1 : examined / claims,
    // The weakest question asked anywhere in the corpus is the strongest thing the
    // corpus-wide report may claim.
    granularity: reports.some((r) => r.granularity === "page") ? "page" : "fact",
  };
}
