/**
 * THE rule of this project — finding vs gap — and the only place it may live.
 *
 * `not_published` is a FINDING ABOUT A NAMED BUSINESS: we looked; they do not
 * state it. `unknown` is a GAP IN OUR OWN RESEARCH. Collapsing either into the
 * other is the cardinal sin (CLAUDE.md, spec §2.2), and a false statement about a
 * named business is the worst failure this project can commit.
 *
 * WHY THIS MODULE IS PURE, and why that is not housekeeping:
 *
 * This family used to live in presenters.ts, which imported dataset.ts, which
 * imported `node:fs`. So the rule was server-only and literally unimportable by
 * anything else — including `scripts/export-json.ts`, which writes the public JSON
 * API. The API therefore shipped the RAW records: `price: { published: "yes" }`
 * with no `amount_eur`, on five programmes. A consumer rendering that field
 * through its own quad component prints a bare "ja" in fact ink for four named
 * businesses — rebuilding, from scratch, the precise bug this project spent a
 * release eliminating. It could not do better; the rule was not reachable.
 *
 * It is now. This module imports only `derive.ts` (pure) and `quad.ts` (a type),
 * so the server pages, the client filter island and the JSON export all call the
 * SAME functions. One rule, three surfaces, no re-derivation possible.
 */
import { pricePerContactHour, totalPathCost, totalPrice } from "./derive";
import { saysNotPublished } from "./quad";
import type { Program, Provider, Quad } from "../schema";

/**
 * A value is missing from our record. Some *_published quad governs whether it
 * could have been there at all. What may a surface SAY about the absence?
 *
 * Publishing a gap as a finding is an accusation we did not earn; publishing a
 * finding as a gap disowns research we did do and sourced. Both are wrong. So the
 * cell says exactly what the record says about the GOVERNING field — no more, and
 * no less.
 *
 * Those fields are all called *published*, and on such a field `no` and
 * `not_published` mean the same thing about the provider: they do not publish it.
 * `no` is not contradictory — it is a researched, sourced finding (when this was
 * written, five programmes carried it, each with a note like "Geen prijs
 * gepubliceerd op de 300u-pagina"). Both therefore license the amber finding.
 *
 * `yes` is the genuinely contradictory case: the record says the provider DOES
 * publish it, yet the value is missing from our record anyway — five programmes are
 * exactly this shape on the price (`price.published: yes`, no `amount_eur`; see
 * priceAmountIsOurGap) and six on the supervised-practice figure
 * (`breakdown_published: yes`, no `supervised_teaching_practice`). The missing value
 * is OURS. That is a gap, and so is `unknown` — nobody looked yet.
 *
 * Note what this rule does NOT license: reading a governing field that does not
 * govern the value in question. Until v0.4, €/contactuur read `breakdown_published`
 * — a field about the breakdown, not about the contact hours — and so three
 * providers who publish a breakdown WITHOUT a contact-hour figure landed on this
 * `yes` branch and were rendered as our gap. The rule was right; the field was the
 * wrong one. Hence `hours_claimed.contact_published` (spec v0.4) and pphBlocker.
 *
 * Every caller — €/contactuur, the hours breakdown, supervised practice, the price
 * amount — routes through here. The rule is stated ONCE.
 */
export function missingBecause(published: Quad): "not_published" | "unknown" {
  // The return type is the rule, too: a value we do NOT hold can only ever be
  // their omission or our gap. It is never "yes" — there is nothing to say yes to
  // — so a row built from it cannot claim a fact it has nothing to back with.
  return saysNotPublished(published) ? "not_published" : "unknown";
}

/**
 * The quad a *_published field may render AS ITSELF (not as the value it governs
 * — that is missingBecause). `no` and `not_published` are one finding on such a
 * field; `yes` and `unknown` pass through untouched. Every sibling cell that
 * renders a *_published field directly must route through here, so that no two
 * surfaces can render the same finding in two different colours.
 */
export function publishedQuad(published: Quad): Quad {
  return saysNotPublished(published) ? "not_published" : published;
}

/**
 * Which field stops `pricePerContactHour` from computing, and what the record says
 * about that field. There are exactly three blockers, and they are findings about
 * three different fields:
 *   - no price amount   → the blocker is the price → `price.published`;
 *   - no comparable TOTAL → the blocker is `price.periods` (spec v0.5). We hold an
 *     amount, but it buys a year/a module/a day, and the provider publishes no count
 *     of them. There is no whole-course figure to divide, and inventing a period
 *     count to manufacture one is the exact fabrication v0.5 exists to prevent. It is
 *     a FINDING (`periods: null` means "we looked; they do not publish it"), and the
 *     cell must name the field that actually blocks it — not the price, which they
 *     DO publish, and not the hours, which are not what is missing;
 *   - no contact hours  → the blocker is the hours → `hours_claimed.contact_published`.
 *
 * THE HOURS BLOCKER IS `contact_published`, NOT `breakdown_published` (spec v0.4).
 * The derivation needs ONE number — the contact hours — so the field that must be
 * cited when we say why we cannot compute it is the field about THAT number.
 * `breakdown_published` answers a different question ("do they break the total down
 * at all?"), and the two come apart in both directions:
 *
 *   - yogaeasy/200-hatha-vinyasa, yogic-life/ryt200-multistyle, ryt300-multistyle
 *     publish a breakdown (`breakdown_published: yes`) that is by delivery mode, by
 *     subject, or in ranges — no contact-hour figure anywhere in it. Blocking on
 *     `breakdown_published` sent them down the `yes` branch of missingBecause and
 *     printed "nog niet onderzocht": the three most transparent hour-publishers in
 *     the corpus, told to readers as research we never did. We did do it.
 *   - de-yogaschool-enschede/meesteropleiding-raja and pure-yoga/200-pureteacher run
 *     the other way (`breakdown_published: not_published`, contact hours published):
 *     they compute, so no blocker is read — but they are why the field is its own
 *     quad rather than a refinement of the other.
 */
export function pphBlocker(
  provider: Provider,
  program: Program,
): { field: "price" | "price_total" | "hours"; published: Quad } {
  // THE TOTAL IS ASKED FIRST, not `amount_eur` (spec v0.8) — a programme priced per module
  // holds no amount of its own and still has a comparable total (Adhouna: € 1.420 + € 1.305).
  // Reading the bare field first would name the PRICE as the blocker on a page that prints
  // two of them, when what is actually missing is the contact hours.
  if (totalPrice(provider, program).value == null) {
    if (program.price.amount_eur == null)
      return { field: "price", published: program.price.published };
    // An amount we cannot make comparable is not an amount we can divide. `periods:
    // null` on a per-period price is the provider's omission, so the quad is the
    // finding — never `unknown`, which would blame our own research for a gap on
    // their page.
    return { field: "price_total", published: "not_published" };
  }
  return { field: "hours", published: program.hours_claimed.contact_published };
}

/** The quad the €/contactuur cell may render when there is no computable value. */
export function pphQuad(provider: Provider, program: Program): Quad {
  if (pricePerContactHour(provider, program).value != null) return "yes";
  return missingBecause(pphBlocker(provider, program).published);
}

/**
 * The record says the provider publishes a price, and we do not hold the amount.
 *
 * Five programmes were this shape; four have been paid off (their price source was
 * the page that LINKED to the price rather than the one that stated it — see
 * provenance.ts, which now catches exactly that). One remains: sanayou/200-online.
 * Do not re-hardcode a roster here or in a test: `provenance.ts` finds them, and the
 * tests derive the set from THIS predicate, so paying one off cannot break a build.
 */
export function priceAmountIsOurGap(provider: Provider, program: Program): boolean {
  return (
    program.price.published === "yes" &&
    program.price.amount_eur == null &&
    // AND we cannot derive one. A programme priced PER MODULE (spec v0.8) legitimately
    // holds no `amount_eur` — the provider states no whole-course figure, they state the
    // parts, and we add them up. That is not a hole in our research; it is the record
    // saying precisely what the page says. Without this clause, Adhouna's Yin XL — whose
    // two part-prices we hold, cited and archived — would be published to readers as a
    // price we simply failed to capture.
    totalPrice(provider, program).value == null
  );
}

/**
 * THE price quad — what any surface, anywhere, may say about a programme's price.
 * The listing cell, the record row, the price filter and the JSON export's
 * `derived.price_state` all call THIS. There is no second derivation, and no
 * consumer — inside this repo or out of it — is given the raw `price.published` to
 * re-derive one from: that duplication WAS the bug.
 *
 * It says what the record says, with exactly TWO corrections. Both run in the
 * direction that protects the reader from a claim the page cannot keep:
 *
 * 1. `yes` with no amount → `unknown`. The record says they DO publish a price
 *    but our record holds no number. A "ja" with no number promises a fact we do
 *    not hold; and the finding-vs-gap rule (see missingBecause) says a value
 *    missing from a field the provider does publish is a gap in OUR research,
 *    never an omission by them. Five programmes were this shape; one still is
 *    (see priceAmountIsOurGap).
 *
 * 2. `no` → `not_published`. `price.published` is a *_published field, and on such
 *    a field `no` and `not_published` say the identical thing about the provider —
 *    "wij keken; zij publiceren geen prijs". saysNotPublished() in quad.ts already
 *    declares them one finding, and the "niet gepubliceerd" price band selects on
 *    it. But `quadClass("no")` is `fact` (correctly — see below), so `no` + no
 *    amount fell through <Quad> to a bare "nee" in FACT ink: clicking the band
 *    returned 14 rows in amber "niet gepubliceerd" and 5 in ink "nee". One filter,
 *    one asserted meaning, two renderings. Normalising here is what makes the cell
 *    and the filter incapable of disagreeing — this is the identical fix already
 *    made above for `yes`, and it is made in the same one place.
 *
 * NOT normalised anywhere else, and `quadClass` is deliberately NOT changed: `no`
 * is a genuine, ink-worthy FACT on a field that is not a *_published field.
 * `accreditation.verified: "no"` means "claimed, and not found in the register" —
 * an established finding of fact about a check we ran, and it must stay ink.
 * `contract.min_participants.clause: "no"` likewise means "there is no such
 * clause". Only the *_published family collapses `no` into the finding.
 */
export function priceQuad(provider: Provider, program: Program): Quad {
  if (priceAmountIsOurGap(provider, program)) return "unknown";
  return publishedQuad(program.price.published);
}

/**
 * The price band a programme falls in — the filter's unit, and a derived value the
 * JSON API ships.
 *
 * DELIBERATELY NOT NAMED AFTER A QUAD. The band that selects the finding is
 * `none_published`, not `not_published`, because it is NOT equal to that quad
 * value: it is `saysNotPublished()` — `not_published` OR `no`. When the band was
 * called "not_published", "simplifying" `!saysNotPublished(r.priceState)` to
 * `r.priceState !== f.price` type-checked, read naturally, and silently dropped
 * five sourced `no` findings out of the band: under-reporting findings about named
 * businesses. A band name that looks like a quad invites exactly that equality.
 *
 * `amount_not_in_record` is the fourth band, and it exists to say out loud that
 * "we hold no amount" is its OWN category — not a cheap synonym for "they publish
 * no price". Those are the programmes whose record says they DO publish a price we
 * simply have not captured (five when the band was written, one today). Sweeping
 * them into the finding band told readers that four named businesses publish no
 * price while our own record said they do. They belong to no chip: a price band is a
 * statement ("it costs this much", "they publish no price") and about these we can
 * honestly make neither.
 *
 * `no_comparable_total` is the FIFTH band, and it is spec v0.5's (§4 `price`, §6
 * `total_price`). A per-period price with no published period count — "€ 1.290 per
 * studiejaar", and nowhere how many studiejaren — CANNOT BE BANDED. Banding it on the
 * bare `amount_eur` is precisely the inversion v0.5 was written to kill: de Blikopener
 * would sit under "onder €3.000" beside whole-course totals, third-cheapest of 54
 * trainings, while the training actually costs ≈ € 5.260. A yearly fee is not a price;
 * it is a price per year, and the reader's band is a statement about the whole course.
 * So such a programme belongs to NO band, exactly as our own gaps do — and, like them,
 * it is offered by no chip: we can honestly say neither "it costs this much" nor "they
 * publish no price". (Empty in the corpus today: both de Blikopener programmes publish
 * their year count on the opleidingspagina, so both derive a total.)
 *
 * The bands are exhaustive and disjoint over every programme:
 *   under3000 / from3000  ⟺ a comparable TOTAL exists (derived or published)
 *   none_published        ⟺ price_state "not_published"
 *   amount_not_in_record  ⟺ price_state "unknown"
 *   no_comparable_total   ⟺ an amount, per period, with no period count
 */
export type PriceBand =
  | "under3000"
  | "from3000"
  | "none_published"
  | "amount_not_in_record"
  | "no_comparable_total";

const AFFORDABLE_BELOW_EUR = 3000;

/**
 * THE BAND CONSUMES `totalPathCost`, NEVER `amount_eur` AND NEVER A BARE `totalPrice`
 * (spec §6, v0.9).
 *
 * The three figures coincide on almost every programme — which is exactly why each
 * omission looked right until it didn't. `amount_eur` put de Blikopener's € 1.290 *per
 * studiejaar* third-cheapest of 54 trainings (v0.5). `totalPrice` puts de Yogaschool's
 * Docentenopleiding at € 4.590 beside trainings you can simply enrol in — while you may
 * not start it without first buying their Basisopleiding at € 1.590. A band is the
 * reader's answer to "what will this cost me", and for a gated training the answer is
 * € 6.180. Ranking it as € 4.590 against an ungated course is not a smaller error than
 * ranking a yearly fee as a whole-course price; it is the same error, one level up.
 *
 * `totalPathCost` IS `totalPrice` wherever there is no purchasable gate (see derive.ts),
 * so this is a strictly better read, never a different one.
 *
 * NOT €/CONTACTUUR, deliberately. That ratio divides by THIS programme's contact hours,
 * and the path cost buys another course's hours too — € 6.180 ÷ 360 would put a numerator
 * that includes the Basisopleiding over a denominator that does not. That is a fabricated
 * ratio, and the only honest one there is price ÷ hours of the same course.
 */
export function priceBand(provider: Provider, program: Program): PriceBand {
  const path = totalPathCost(provider, program).value;
  // A comparable figure exists only where the provider publishes amounts we can compare —
  // their own whole-course figure, a per-period one with a count, the parts of a per-module
  // one (v0.8), plus the price of every training they force you to buy first (v0.9). Those
  // are exactly the bandable rows.
  if (path != null) return path < AFFORDABLE_BELOW_EUR ? "under3000" : "from3000";
  // No comparable PATH figure. A programme can reach here holding a perfectly good price
  // (a gate whose cost the school does not publish nulls the path, not the price), so the
  // test for "do they publish a price at all" must ask BOTH — `amount_eur` alone would call
  // a provider who prices per module, in two published parts, a non-publisher of prices.
  if (totalPrice(provider, program).value != null || program.price.amount_eur != null)
    return "no_comparable_total";
  return saysNotPublished(program.price.published) ? "none_published" : "amount_not_in_record";
}
