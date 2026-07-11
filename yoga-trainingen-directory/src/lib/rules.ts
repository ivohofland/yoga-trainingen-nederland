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
import { pricePerContactHour } from "./derive";
import { saysNotPublished } from "./quad";
import type { Program, Quad } from "../schema";

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
 * publish it, yet the value is missing from our record anyway — three programmes
 * are exactly this shape (yogaeasy/200-hatha-vinyasa, yogic-life/ryt200-multistyle,
 * yogic-life/ryt300-multistyle: an amount, a published breakdown, and no
 * `hours_claimed.contact`). The missing value is OURS. That is a gap, and so is
 * `unknown` — nobody looked yet.
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
 * about that field. There are exactly two blockers, and they are findings about
 * two different fields:
 *   - no price amount  → the blocker is the price → `price.published`;
 *   - no contact hours → the blocker is the hours → `hours_claimed.breakdown_published`.
 */
export function pphBlocker(program: Program): { field: "price" | "hours"; published: Quad } {
  return program.price.amount_eur == null
    ? { field: "price", published: program.price.published }
    : { field: "hours", published: program.hours_claimed.breakdown_published };
}

/** The quad the €/contactuur cell may render when there is no computable value. */
export function pphQuad(program: Program): Quad {
  if (pricePerContactHour(program).value != null) return "yes";
  return missingBecause(pphBlocker(program).published);
}

/**
 * The record says the provider publishes a price, and we do not hold the amount.
 * Five programmes are exactly this shape (aalo-yoga-academie/yin-yang-ryt200,
 * aalo-yoga-academie/yin-ryt200, de-blikopener/hatha-raja-opleiding,
 * sanayou/200-online, yoga-academie-nederland/300-hatha-verdieping).
 */
export function priceAmountIsOurGap(program: Program): boolean {
  return program.price.published === "yes" && program.price.amount_eur == null;
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
 *    never an omission by them. Five programmes are this shape.
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
export function priceQuad(program: Program): Quad {
  if (priceAmountIsOurGap(program)) return "unknown";
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
 * no price". Those are the five programmes whose record says they DO publish a
 * price we simply have not captured. Sweeping them into the finding band told
 * readers that four named businesses publish no price while our own record said
 * they do. They belong to no chip: a price band is a statement ("it costs this
 * much", "they publish no price") and about these five we can honestly make
 * neither.
 *
 * The bands are exhaustive and disjoint over every programme, and they agree with
 * priceQuad() by construction:
 *   under3000 / from3000  ⟺ price_state "yes"
 *   none_published        ⟺ price_state "not_published"
 *   amount_not_in_record  ⟺ price_state "unknown"
 */
export type PriceBand = "under3000" | "from3000" | "none_published" | "amount_not_in_record";

const AFFORDABLE_BELOW_EUR = 3000;

export function priceBand(program: Program): PriceBand {
  const amount = program.price.amount_eur;
  // An amount only exists on a programme that publishes one (pinned by a test on
  // the RECORD), so the two amount bands are exactly the `yes` rows.
  if (amount != null) return amount < AFFORDABLE_BELOW_EUR ? "under3000" : "from3000";
  return saysNotPublished(program.price.published) ? "none_published" : "amount_not_in_record";
}
