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
 * schema-valid programme with exactly ONE field removed — the amount. The base is de
 * Yogaschool Enschede's Docentenopleiding Raja, chosen deliberately because it publishes
 * its contact hours (360, `contact_published: "yes"`) and its price as a whole-course
 * total. With the amount gone, the PRICE is then unambiguously the only thing blocking
 * €/contactuur — which is what makes `nl.pphPriceNotInRecord` the correct copy for it,
 * rather than the hours sentence or the v0.5 period-count sentence.
 *
 * The ids are nobody's: no assertion made against this fixture is a statement about a
 * named business, and none of it may ever be mistaken for one.
 */
import type { Program, Provider } from "../schema";

export const PRICE_GAP_PROVIDER_ID = "synthetisch-prijs-zonder-bedrag";
export const PRICE_GAP_PROGRAM_ID = "prijs-zonder-bedrag";
export const PRICE_GAP_HREF = `/aanbieder/${PRICE_GAP_PROVIDER_ID}#programma-${PRICE_GAP_PROGRAM_ID}`;

const BASE_PROVIDER_ID = "de-yogaschool-enschede";
const BASE_PROGRAM_ID = "docentenopleiding-raja";

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
    throw new Error("price-gap fixture: the base price is no longer a whole-course total — the v0.5 blocker would mask the price blocker");
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
