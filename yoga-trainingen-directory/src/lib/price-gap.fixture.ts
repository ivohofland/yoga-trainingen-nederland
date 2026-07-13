/**
 * THE SYNTHETIC CASE: a programme whose record says the school PUBLISHES a price, and
 * whose amount our record does not hold — `price.published: "yes"`, `amount_eur: null`.
 *
 * WHY THIS IS A FIXTURE, AND NOT A RECORD IN data/
 *
 * Five programmes were once exactly this shape, and the listing rendered them as a bare
 * "ja" in FACT ink: an established fact, asserted, about five named businesses, with no
 * number behind it. The rules that now prevent that — priceQuad() → `unknown` (OUR gap,
 * never the amber accusation), priceBand() → `amount_not_in_record` (no comparable band),
 * pphCaveatFor() → nl.pphPriceNotInRecord, and `derived.price_state` in the JSON API —
 * were each pinned by a test that FOUND its case by sweeping the live corpus.
 *
 * All five have since been researched, sourced, archived and extracted. No record is in
 * this state any more. That is the outcome the project wants — and it left six tests with
 * nothing to exercise, so their anti-vacuity guards fired and the build went red for
 * having FIXED the data.
 *
 * A test that pins a RULE must not depend on the corpus containing a DEFECT. The rule is
 * not retired by the defect being paid off: the moment a new record lands in this state —
 * and one will, because researching a school's price page is not the same day's work as
 * finding it — the site must render it as OUR gap and never as a finding about the school.
 * So the case is CONSTRUCTED here, once, and the six tests pin the rule against it.
 * (filters.test.ts manufactures the unplaceable "Nergenshuizen" row the same way, and for
 * the same reason: today's data happens not to contain one, and a rule that holds only
 * because its trigger is absent is not a rule.)
 *
 * It is built by SPREADING A REAL RECORD, so it cannot drift from the schema: a real,
 * schema-valid programme with exactly ONE field removed — the amount. The base must
 * publish its contact hours (`contact_published: "yes"`) AND its price as a whole-course
 * total, so that with the amount gone the PRICE is unambiguously the only thing blocking
 * €/contactuur — which is what makes `nl.pphPriceNotInRecord` the correct copy for it,
 * rather than the hours sentence, the v0.5 period-count sentence, or v0.8's sum.
 *
 * IT WAS de Yogaschool Enschede's Docentenopleiding Raja, and v0.8 moved it out from
 * under this fixture: that record now prices € 1.530 PER STUDIEJAAR over three years (the
 * € 4.590 it used to carry was our own multiplication, stored). The guards below caught
 * that in as many words rather than silently constructing some other case — which is what
 * they are for. Re-based on Dru Yoga's 200-uurs, which publishes € 2.961 as a whole-course
 * total and 220 contacturen.
 *
 * The ids are nobody's: no assertion made against this fixture is a statement about a
 * named business, and none of it may ever be mistaken for one.
 */
import type { Program, Provider } from "../schema";

export const PRICE_GAP_PROVIDER_ID = "synthetisch-prijs-zonder-bedrag";
export const PRICE_GAP_PROGRAM_ID = "prijs-zonder-bedrag";
export const PRICE_GAP_HREF = `/aanbieder/${PRICE_GAP_PROVIDER_ID}#programma-${PRICE_GAP_PROGRAM_ID}`;

const BASE_PROVIDER_ID = "dru-yoga";
const BASE_PROGRAM_ID = "200-dru";

/**
 * The synthetic provider, carrying exactly one programme: the price gap.
 *
 * Loud, never quiet, if the base record moves out from under it. A fixture that
 * silently degraded into some *other* shape would leave all six tests passing while
 * pinning nothing — the precise failure mode this fixture exists to end.
 */
export function priceGapProvider(providers: Provider[]): { provider: Provider; program: Program } {
  const base = providers.find((p) => p.id === BASE_PROVIDER_ID);
  if (!base) {
    throw new Error(
      `price-gap fixture: the base record '${BASE_PROVIDER_ID}' is no longer in the corpus. ` +
        `Re-base the fixture on another programme that publishes BOTH a whole-course price and ` +
        `its contact hours — do not delete it: it is the only case pinning the price-gap rules.`,
    );
  }
  const baseProgram = base.programs.find((p) => p.id === BASE_PROGRAM_ID);
  if (!baseProgram) {
    throw new Error(`price-gap fixture: the base programme '${BASE_PROGRAM_ID}' is gone from '${BASE_PROVIDER_ID}'`);
  }
  // The base must be the shape the fixture claims to mutate; otherwise removing the
  // amount would produce some different case than the one the tests believe they hold.
  if (baseProgram.price.published !== "yes" || baseProgram.price.amount_eur == null) {
    throw new Error(
      `price-gap fixture: the base programme no longer publishes a price we hold ` +
        `(published: "${baseProgram.price.published}", amount: ${baseProgram.price.amount_eur}) — ` +
        `removing the amount would no longer construct "publishes a price we do not hold"`,
    );
  }
  if (baseProgram.price.period !== "total") {
    throw new Error(
      "price-gap fixture: the base price is no longer a whole-course total — a per-period or per-module " +
        "price would put the v0.5/v0.8 total blocker in front of the price blocker this fixture pins",
    );
  }
  if (baseProgram.hours_claimed.contact == null || baseProgram.hours_claimed.contact_published !== "yes") {
    throw new Error(
      "price-gap fixture: the base no longer publishes its contact hours — with the amount removed, the " +
        "hours would ALSO block €/contactuur, and nl.pphPriceNotInRecord would no longer be the copy under test",
    );
  }

  const program: Program = {
    ...baseProgram,
    id: PRICE_GAP_PROGRAM_ID,
    // THE ONE MUTATION. They publish a price (`published: "yes"`, untouched, and still
    // carrying its source); we simply do not hold the number.
    price: { ...baseProgram.price, amount_eur: null },
  };
  const provider: Provider = {
    ...base,
    id: PRICE_GAP_PROVIDER_ID,
    name: "Synthetisch — publiceert een prijs die wij niet hebben",
    programs: [program],
  };
  return { provider, program };
}
