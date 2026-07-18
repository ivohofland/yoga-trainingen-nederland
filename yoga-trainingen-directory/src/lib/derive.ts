/**
 * The derived values (spec §6): pure `Provider`/`Program` → value functions.
 *
 * Computed, NEVER stored. If you find yourself adding a computed field to a YAML
 * record, it belongs here instead.
 *
 * PURITY IS THE POINT, and it is load-bearing rather than tidy. This module — and
 * `rules.ts`, which builds the finding-vs-gap rule on top of it — must import
 * NOTHING from `node:*`, so that every surface can reach the same arithmetic:
 * the server pages, the client-side filter island, and `scripts/export-json.ts`,
 * which ships these values in the public JSON API. The reading of the YAML lives
 * in `loader.ts`, alone, precisely so that this file can be imported anywhere.
 *
 * When these two halves lived in one `dataset.ts`, `node:fs` was in the import
 * graph of every derived value, so the JSON export could not compute one — it
 * shipped the raw records instead, and any consumer rendering `price.published`
 * straight from them reconstructed, from scratch, the exact bug this project
 * spent a release eliminating (see rules.ts, priceQuad).
 */
import type { PricePeriod, Program, Provider } from "../schema";
// TYPE-ONLY, and that is what keeps this module `node:*`-free: `import type` is erased
// at compile time, so provenance.ts's `node:fs`/`pdftotext` never enter the import graph
// of the client filter island or the JSON export. The finding stays TYPED all the way to
// /qa — see ProviderQa.provenance on why flattening it to strings was the bug.
import type { ProvenanceFinding } from "./provenance";
import { nl } from "./strings";

/**
 * WHOSE NUMBER IS THIS? — the question every derived figure in this module must answer,
 * and the reason they are all discriminated unions rather than `{ value, derived }`.
 *
 * A number published about a named business is either THEIR CLAIM (fact ink, cited) or
 * VISIBLY OUR ARITHMETIC (muted, uncited, working shown). Spec §6 says so in as many
 * words, and v0.5, v0.6, v0.8 and v0.9 each exist because a number crossed that line.
 *
 * `{ value: number | null; caveat?: string; derived: boolean }` — the old shape — made
 * the two indistinguishable to the TYPE SYSTEM. Three independent fields, eight
 * combinations, four of them legal, and every one of the illegal four compiled:
 *
 *   { value: 5160, derived: false }                → OUR multiplication, called de
 *                                                    Blikopener's published price.
 *   { value: 2495, derived: true, caveat: "…" }    → Wahé's OWN figure, called ours.
 *   { value: 5160, derived: true }                 → ours, with NO working — and the
 *                                                    presenter, needing a caveat to print,
 *                                                    SILENTLY DROPPED THE ROW.
 *   { value: null,  derived: true, caveat: "…" }   → a working for a number that is not there.
 *
 * And worst of all on the wire: a consumer that destructures `{ value }` and ignores
 * `derived` prints our multiplication as the school's own price. The README warned them
 * in prose. Prose is not a type, and the lazy path was the wrong path.
 *
 * The variants below have DIFFERENT KEY SETS. `working` — the shown arithmetic — exists
 * on the `computed` variant AND NOWHERE ELSE, and it is REQUIRED there. So:
 *
 *   - "ours, with no working" does not compile;
 *   - "theirs, with a working" does not compile;
 *   - a consumer that prints `working` whenever it is present is CORRECT BY ACCIDENT —
 *     the inverse of the old shape, where the accident was a falsehood.
 *
 * `value` is present on every variant (null where there is none) so that a caller asking
 * only "is there a comparable figure?" needs no switch — that question has one honest
 * answer everywhere. Asking "is it MINE to print in their ink?" requires the `kind`.
 */

/** A figure we computed, and the working that lets a reader check it. */
interface Computed {
  kind: "computed";
  value: number;
  /** THE WORKING — "onze berekening: 4 × € 1.290", "onze optelling: 360 + 240". Required:
   *  a number of ours that cannot be checked is a number that may as well be theirs. */
  working: string;
}

/** A figure the provider PUBLISHES. Fact ink, cited to the page that prints it. */
interface Published {
  kind: "published";
  value: number;
}

/**
 * THE WORKING, IF THE FIGURE IS OURS — and `null` if it is theirs, or if there is no
 * figure at all. The one question every surface must ask before choosing an ink, asked in
 * one place.
 *
 * Structurally typed, so it reads the wire shapes (api.ts) as well as the ones above: the
 * export is a rendering of these very unions, and a second, subtly different accessor for
 * it is exactly the duplication that lets two surfaces disagree about whose number a
 * number is.
 *
 * `working` exists ONLY on `kind: "computed"`, and is REQUIRED there — so this is total,
 * and a caller that simply prints whatever it returns cannot mislabel a school's own
 * published figure as our arithmetic, or ours as theirs.
 */
export function ourWorking(t: { kind: string; working?: string }): string | null {
  return t.kind === "computed" ? (t.working ?? null) : null;
}

/**
 * THE PUBLISHED PRICES OF A PROGRAMME'S COMPOSED PARTS — all of them, or NONE.
 *
 * The one place the module prices of a `composition` are read, and therefore the one
 * place the all-or-nothing rule lives. `bundleDelta` has enforced it since v0.1 (a
 * package discount computed against a partial sum is not a discount, it is a number)
 * and `totalPrice`'s third derivation (spec v0.8) needs the identical rule for the
 * identical reason: AN INCOMPLETE SUM IS A GUESS, and a guessed total is a published
 * comparison with a hole in it. Written twice, the two would drift; written once, a
 * missing part price can only ever produce `null` on both.
 *
 * Returns the PARTS, not their sum — because the working ("€ 1.420 + € 1.305") is what
 * makes the total checkable, and a caller handed only a number cannot show it.
 */
function composedPartPrices(provider: Provider, moduleIds: string[] | undefined): number[] | null {
  if (!moduleIds?.length) return null;
  const parts: number[] = [];
  for (const id of moduleIds) {
    const mod = provider.modules.find((m) => m.id === id);
    if (mod?.price?.amount_eur == null) return null; // incomplete → no derivation
    parts.push(mod.price.amount_eur);
  }
  return parts;
}

/**
 * THE WHOLE-COURSE PRICE — the figure a reader compares, and the one a provider often
 * does not publish (spec §6 `total_price`; v0.5, then v0.8).
 *
 * `derived` is not decoration, it is the licence to print the number:
 *
 *   - `derived: false` → `period` is `total`. The value IS the provider's own
 *     published figure, and a surface may show it as theirs.
 *   - `derived: true`  → OUR ARITHMETIC. The caveat spells the working out ("onze
 *     berekening: 4 × € 1.290", "onze optelling: € 1.420 + € 1.305") and every surface
 *     must render it visibly as ours — never in the ink reserved for their claim.
 *   - `value: null`    → no comparable total exists. NOT bandable, sortable or rankable,
 *     and manufacturing one would fabricate the very number this field exists to stop.
 *
 * THREE DERIVATIONS, AND THE THIRD IS NOT OPTIONAL (spec v0.8).
 *
 *   1. `period: total`            → the amount itself. THEIRS.
 *   2. amount × `periods`         → OURS. Equal, repeating parts: "€ 1.290 / studiejaar,
 *                                   4 studiejaren". de Blikopener.
 *   3. Σ of the composed modules  → OURS. UNEQUAL parts, which multiplication CANNOT
 *                                   express: Adhouna's 200-hour Yin XL is Deel I € 1.420
 *                                   + Deel II € 1.305, and 2 × 1.420 is not € 2.725.
 *
 * Derivation 3 exists because its absence had a cost, and the cost is this project's
 * cardinal sin. With no honest home for a sum of unequal parts, € 2.725 was STORED in
 * `amount_eur` — a figure Adhouna has never published, rendered in Adhouna's own ink,
 * cited to a page that prints only the two parts. The string "2725" appears in none of
 * their artifacts. The same disease as v0.5 and v0.6, in its third costume.
 *
 * `null` IF ANY PART'S PRICE IS MISSING — see composedPartPrices. An incomplete sum is a
 * guess, and this project does not publish guesses about named businesses.
 *
 * `excludes` IS NEVER ADDED IN, in any of the three. It is free text ("eenmalig € 100
 * inschrijfgeld; de verblijfskosten van het yogaweekend") — it cannot be summed, and a
 * total that silently absorbed some of it would be neither their figure nor a
 * reproducible one of ours. It renders ALONGSIDE, as it already does.
 */
export type TotalPrice =
  /** THEIRS — `period: total`. The figure they publish IS the total (53 of 54 priced
   *  programmes). Fact ink, cited to the page that prints it. */
  | Published
  /** OURS — derivation 2 (× periods) or 3 (Σ parts). Muted, uncited, working shown. */
  | Computed
  /**
   * They publish an AMOUNT, and nothing that makes it a whole course. A FINDING about
   * them, never a gap in us: `periods: null` means "we looked; they do not say".
   *
   * NOT BANDABLE, NOT SORTABLE, NOT RANKABLE. Manufacturing a count to produce a
   * comparable figure is the exact fabrication v0.5 exists to prevent — and ranking the
   * yearly fee AS a total is the bug it exists to correct.
   */
  | { kind: "no_comparable_total"; value: null; period: PricePeriod; reason: string }
  /** No amount at all, and none derivable from parts. */
  | { kind: "no_price"; value: null };

export function totalPrice(provider: Provider, program: Program): TotalPrice {
  const { amount_eur: amount, period, periods } = program.price;

  // DERIVATION 3 — the sum of unequal parts. The programme carries no amount of its own
  // BECAUSE the provider states none: they price per module, and the whole is what the
  // parts come to. Gated on `period: per_module` and NOT merely on "it has modules": a
  // `free_assembly` path (QUENO) is a menu, not a fixed sum, and adding its modules up
  // would invent a total for a training nobody buys that way.
  if (amount == null) {
    if (period !== "per_module") return { kind: "no_price", value: null };
    const parts = composedPartPrices(provider, program.composition?.modules);
    // An unpriced part → an incomplete sum → a GUESS. Not "no price": they price per
    // module and print some of the modules' prices, so calling them a non-publisher of
    // prices would be false. What is missing is the comparable TOTAL.
    if (parts == null) {
      return {
        kind: "no_comparable_total",
        value: null,
        period,
        reason: nl.totalPriceIncompleteSum,
      };
    }
    return {
      kind: "computed",
      value: Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100,
      working: nl.totalPriceSum(parts.map(formatEuroForCaveat)),
    };
  }

  // The common case, and the schema's default: the figure they publish IS the total.
  if (period === "total") return { kind: "published", value: amount };
  if (periods == null) {
    return {
      kind: "no_comparable_total",
      value: null,
      period,
      reason: nl.totalPriceNoPeriodCount(nl.pricePeriod[period]),
    };
  }
  return {
    kind: "computed",
    value: Math.round(amount * periods * 100) / 100,
    working: nl.totalPriceWorking(periods, formatEuroForCaveat(amount)),
  };
}

/**
 * WHAT IT COSTS TO QUALIFY HERE — `total_price` plus every training you must BUY first
 * (spec §6 `total_path_cost`, v0.9).
 *
 * `total_price` answers "what does this course cost". A course you cannot enrol in
 * without first completing another course of theirs does not answer that question, and
 * for one release this directory published the wrong answer to it: de Yogaschool's
 * Docentenopleiding showed € 4.590 (our 3 × € 1.530) while the school's own Basisopleiding
 * page — mandatory, € 1.590 per lesjaar — sat outside the arithmetic entirely. The gate was
 * IN THE RECORD, as prose, in `prerequisites_claimed`, where no comparison could reach it.
 * Qualifying there costs € 6.180. The Meesteropleiding is gated behind the Docentenopleiding,
 * which is gated behind the Basisopleiding: € 10.770, also shown as € 4.590.
 *
 * `derived: true` ALWAYS — even where the programme's own total is the school's published
 * figure. The PATH is never their number: no page of de Yogaschool's prints € 6.180. The
 * sum is ours, it is rendered as ours, and the caveat shows the working.
 *
 * RECURSIVE, because the chain is (Meester → Docenten → Basis). Only `kind: program`
 * links are summed: they are the ones you must BUY. `kind: experience` ("min. 2 jaar
 * praktijk") is a real barrier with no euros, and `kind: other` is a qualification the
 * market sells and THIS SCHOOL DOES NOT — pricing either would invent a number.
 *
 * `null` IF ANY LINK'S COST IS UNKNOWN — the same rule as bundleDelta and totalPrice's
 * sum. An incomplete path cost is a guess, and a guessed comparison is worse than none:
 * it would be published beside real totals, in a band, in a sort order, indistinguishable.
 *
 * A CYCLE IS A VALIDATION ERROR, not a silent stop (loader.ts). Two programmes that each
 * gate the other describe no path a student can walk, and quietly returning *some* number
 * for it would publish a total for a route that does not exist. `seen` here only guarantees
 * termination — the record never loads.
 */
/** A training you must BUY before you may start this one. `total` is its whole cost. */
export interface Gate {
  label: string;
  total: number | null;
}

export type TotalPathCost =
  /**
   * NOTHING MUST BE BOUGHT FIRST — 76 of 78 programmes. The path cost IS the programme's
   * own total, whatever that total's provenance, and this variant carries NO `working`
   * precisely because there is nothing to show: printing "onze optelling: € 2.495" over a
   * school's own published price would manufacture a second figure out of one number.
   * Presenters render NO second row here, and the empty `gates` is what they key that off.
   */
  | { kind: "no_gates"; value: number | null; gates: [] }
  /** OURS — always, even where the programme's own price is the school's published figure.
   *  No page of de Yogaschool's prints € 6.180. Muted, uncited, working shown. */
  | (Computed & { gates: Gate[] })
  /** A required link's price is not in our record. An incomplete path is a GUESS, and a
   *  guessed comparison would be published in a band and a sort order beside real ones. */
  | { kind: "incomplete"; value: null; reason: string; gates: Gate[] };

export function totalPathCost(provider: Provider, program: Program): TotalPathCost {
  const gates = purchasableGates(provider, program, new Set([program.id]));
  const own = totalPrice(provider, program);

  // No gate to buy: the path cost IS the total price, and it is not a second figure.
  if (gates.length === 0) return { kind: "no_gates", value: own.value, gates: [] };

  if (own.value == null || gates.some((g) => g.total == null)) {
    return { kind: "incomplete", value: null, reason: nl.totalPathCostIncomplete, gates };
  }

  const total = gates.reduce((sum, g) => sum + (g.total ?? 0), own.value);
  return {
    kind: "computed",
    value: Math.round(total * 100) / 100,
    working: nl.totalPathCostWorking(
      gates.map((g) => `${g.label} ${formatEuroForCaveat(g.total ?? 0)}`),
    ),
    gates,
  };
}

/**
 * Every training in the chain that must be BOUGHT, depth-first, gates-of-gates first —
 * so the caveat reads in the order a student walks it (Basis, then Docenten).
 *
 * `seen` carries the programme ids already on the path. A repeat means a CYCLE, and this
 * returns rather than recursing: termination only. The record is refused by loader.ts's
 * integrity check long before any surface calls this, so the truncated result is never
 * rendered — but a stack overflow inside a presenter would be a worse way to find out.
 */
function purchasableGates(provider: Provider, program: Program, seen: Set<string>): Gate[] {
  const out: Gate[] = [];
  for (const pre of program.prerequisite ?? []) {
    if (pre.kind !== "program") continue; // experience / other: real gates, no euros
    const target = pre.program ? provider.programs.find((p) => p.id === pre.program) : undefined;
    if (target) {
      if (seen.has(target.id)) continue; // cycle — loader.ts refuses the record
      out.push(...purchasableGates(provider, target, new Set([...seen, target.id])));
      out.push({ label: pre.label, total: totalPrice(provider, target).value });
      continue;
    }
    // A gate that is NOT a Program on this record (de Yogaschool's Basisopleiding is not a
    // teacher training and so is not one): its price is read off the page that prints it.
    out.push({ label: pre.label, total: prerequisiteCost(pre) });
  }
  return out;
}

/** The gate's own whole-cost, by the same three rules as a programme's price — a gate
 *  priced "per lesjaar" with no count of lesjaren has no comparable cost, and `null`
 *  here nulls the path rather than guessing at one. */
function prerequisiteCost(pre: NonNullable<Program["prerequisite"]>[number]): number | null {
  const { cost_eur: cost, period, periods } = pre;
  if (cost == null) return null;
  if (period == null || period === "total") return cost;
  if (periods == null) return null;
  return Math.round(cost * periods * 100) / 100;
}

/** Money inside a caveat string. Kept here (not in presenters) because the caveat IS
 *  the arithmetic — the working has to travel with the number it explains. */
function formatEuroForCaveat(n: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * THE WHOLE-COURSE HOURS FIGURE — the same rule as `totalPrice`, in the other unit
 * (spec v0.6, §6 `total_hours`).
 *
 * `derived` carries the identical licence, and it is worth spelling out why the two
 * cases below are NOT interchangeable, because getting it wrong once already shipped:
 *
 *   - `derived: false` → `hours_claimed.total` is set. The value IS the school's own
 *     published figure and a surface may print it as theirs. Wahé publishes its 500
 *     in as many words ("Samen vormen de 200-uurs basisopleiding en de 300 uur aan
 *     verdiepingsmodules een totaal van 500 uur opleiding") — relabelling that as our
 *     arithmetic would be its own falsehood, in the opposite direction.
 *   - `derived: true`  → OUR ADDITION over the parts they publish separately. de
 *     Yogaschool Enschede states "360 uren" and "minimale zelfstudie van 240 uur" and
 *     NEVER their sum: the string "600" appears in none of their archived sources. We
 *     stored 600 in a field that renders as their claimed total; v0.6 computes it here
 *     instead, and every surface must render it visibly as ours.
 *   - `value: null`    → they publish no total and not both parts. There is nothing to
 *     add, and inventing a figure is the fabrication this field exists to stop.
 *
 * NO OTHER ADDENDS. Only `contact` + `self_study`, the two parts the schema holds as
 * published numbers. `supervised_teaching_practice` is a SUBSET of contact hours, not a
 * third term — adding it in would double-count the very hours it describes.
 */
export type TotalHours =
  /** THEIRS — `hours_claimed.total` is set. Wahé publishes its 500 in as many words. */
  | Published
  /** OURS — contact + zelfstudie, which de Yogaschool publishes separately and never sums. */
  | Computed
  /** No total, and not both parts. There is nothing to add, and inventing a figure is the
   *  fabrication this field exists to stop. */
  | { kind: "no_total"; value: null };

export function totalHours(program: Program): TotalHours {
  const { total, contact, self_study: selfStudy } = program.hours_claimed;
  // The common case: they publish the total. It is theirs, and it stays theirs.
  if (total != null) return { kind: "published", value: total };
  if (contact == null || selfStudy == null) return { kind: "no_total", value: null };
  return {
    kind: "computed",
    value: contact + selfStudy,
    working: nl.totalHoursWorking(contact, selfStudy),
  };
}

/**
 * A CEILING ON CONTACT HOURS, FROM THE PUBLISHED SCHEDULE — OURS ON EVERY PROGRAMME
 * (spec §6, v0.12). Like €/contactuur and the contact ratio, there is no `published`
 * variant: no school publishes this bound.
 *
 * Contact time can only ever be ≤ time in the room, so the raw clock sum is a strict UPPER
 * BOUND: "at most 147 u". We never guess the break — a STATED `pause_min` only lowers the
 * bound (a stronger, still-true statement), and an unstated one leaves it where it is,
 * conservative against our own critique. The block times are theirs (cited via
 * `schedule.source`); this SUM is ours, and the working shows it.
 */
export type ScheduledHoursCeiling =
  | Computed
  | { kind: "no_schedule"; value: null };

/** Minutes since midnight. The time is schema-validated HH:MM (Time), so this cannot NaN
 *  on a real record; a bad one would have failed `validate` by record and field. */
function minutesOfDay(t: string): number {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
}

export function scheduledHoursCeiling(program: Program): ScheduledHoursCeiling {
  const schedule = program.hours_claimed.schedule;
  if (!schedule) return { kind: "no_schedule", value: null };
  const parts: string[] = [];
  let minutes = 0;
  for (const b of schedule.blocks) {
    minutes += b.count * (minutesOfDay(b.end) - minutesOfDay(b.start) - (b.pause_min ?? 0));
    parts.push(`${b.count}× ${b.start}–${b.end}${b.pause_min ? ` (−${b.pause_min} min pauze)` : ""}`);
  }
  return {
    kind: "computed",
    value: Math.round((minutes / 60) * 100) / 100,
    working: nl.scheduleCeilingWorking(parts),
  };
}

/**
 * THE CLAIM MINUS THE CEILING — how much of the claimed total the timetable cannot account
 * for (spec §6, v0.12). Consumes the DERIVED total (`totalHours`), never the raw field.
 *
 * Because the ceiling is an UPPER bound, this gap is a LOWER bound: "at least 53 u are not
 * scheduled contact time" (self-study, and whatever else is not on the timetable). OURS.
 *
 * ONLY AGAINST A PUBLISHED TOTAL — `totalHours()` returns `published` (the school's own
 * figure) or `computed` (OUR sum of contact + self_study, which the school never stated).
 * The working says "de school claimt X uur"; over our own sum that sentence is the exact
 * misattribution the published/computed split exists to prevent, and against an
 * already-decomposed total the gap would also double-count the self-study. So:
 * `no_comparison` where there is no schedule, or where the total is anything but the
 * school's own published figure.
 */
export type HoursDisconnect =
  | Computed
  | { kind: "no_comparison"; value: null };

export function hoursDisconnect(program: Program): HoursDisconnect {
  const total = totalHours(program);
  const ceiling = scheduledHoursCeiling(program);
  // Only a PUBLISHED total is a CLAIM to disconnect from. A `computed` total is OUR sum of
  // contact + self_study (the school stated no total) — and the working says "de school claimt
  // {total} uur", which over our own sum is the exact misattribution the published/computed
  // split exists to prevent. Against an already-decomposed total the gap would also
  // double-count the self-study. So: a published total only.
  if (total.kind !== "published" || ceiling.kind !== "computed") {
    return { kind: "no_comparison", value: null };
  }
  return {
    kind: "computed",
    value: Math.round((total.value - ceiling.value) * 100) / 100,
    working: nl.hoursDisconnectWorking(total.value, ceiling.value),
  };
}

/**
 * €/CONTACTUUR — PRICE ÷ CONTACT HOURS, AND IT IS OURS ON EVERY SINGLE PROGRAMME.
 *
 * There is no `published` variant here, and that absence is the correction (spec §6, and
 * KeyValueRow's own docblock: *"a fact read off a provider's page is theirs, not ours"*).
 * €/contactuur is read off NOBODY's page. Not one school in the corpus publishes it; it
 * is the one figure on this site that no provider's source can contradict, because no
 * provider's source contains it — and for a year it rendered on ~40 record pages through
 * <Quad>, in the ink reserved for the schools' own claims, one row below their real
 * prices. On a `period: per_year` provider it is our arithmetic OVER our arithmetic:
 * (€ 1.530 × 3) ÷ 360.
 *
 * So the only variants are "we computed it" and "we could not". Whichever it is, it is
 * never theirs, and the type no longer lets a surface believe otherwise.
 *
 * THE NUMERATOR IS `totalPrice`, never a bare `amount_eur` (spec §6: "price bands, price
 * sorting and €/contactuur all consume `total_price`"). Dividing a yearly fee by the hours
 * of a four-year training understates the rate by a factor of four.
 *
 * NOT the PATH cost, deliberately: that buys another course's hours too, and € 6.180 ÷ 360
 * would put a numerator including the Basisopleiding over a denominator that excludes it.
 * The only honest ratio is price ÷ hours of the same course.
 */
export type PricePerContactHour =
  /** OURS. `caveat` is the COMPARABILITY guard (what the price includes/excludes) — a
   *  different thing from `working`, which is the arithmetic itself. */
  | (Computed & { caveat: string | null })
  /** No comparable price, or no contact-hour figure. `caveat` names which. */
  | { kind: "not_computable"; value: null; caveat: string | null };

export function pricePerContactHour(provider: Provider, program: Program): PricePerContactHour {
  const total = totalPrice(provider, program);
  const contact = program.hours_claimed.contact;
  // THE TOTAL IS ASKED FIRST, not `amount_eur` — spec v0.8. A programme priced per module
  // holds NO amount of its own and still has a perfectly comparable total (Adhouna: € 1.420
  // + € 1.305). Reading the bare field first would call that provider a non-publisher of
  // prices, on a page that prints two of them.
  if (total.value == null) {
    // A per-period price with no period count: we hold an amount, but not a comparable
    // one. Saying "prijs niet gepubliceerd" here would be a false finding about a
    // provider who publishes a price — it is their TOTAL that does not exist.
    if (program.price.amount_eur != null) {
      return {
        kind: "not_computable",
        value: null,
        caveat: total.kind === "no_comparable_total" ? total.reason : null,
      };
    }
    return { kind: "not_computable", value: null, caveat: "prijs niet gepubliceerd" };
  }
  if (contact == null) {
    return { kind: "not_computable", value: null, caveat: "contacturen niet gepubliceerd" };
  }

  // THE WORKING. It shows the division — and, where the numerator is ITSELF ours, it
  // carries that arithmetic too: on de Yogaschool the reader is looking at (3 × € 1.530)
  // ÷ 360, and neither half of that appears on any page they publish.
  const working = [
    nl.pphWorking(formatEuroForCaveat(total.value), contact),
    ourWorking(total),
  ]
    .filter((s): s is string => s != null)
    .join(" ");

  // Comparability guard: includes/excludes change what the price buys, and a residential
  // price including room and board is not comparable to a studio price excluding
  // mandatory literature. Kept SEPARATE from the working — the working says how we got
  // the number, the caveat says what the number is not safe to compare against.
  const caveats: string[] = [];
  if (program.price.includes) caveats.push(`prijs inclusief: ${program.price.includes}`);
  if (program.price.excludes) caveats.push(`prijs exclusief: ${program.price.excludes}`);

  return {
    kind: "computed",
    value: Math.round((total.value / contact) * 100) / 100,
    working,
    caveat: caveats.length ? caveats.join("; ") : null,
  };
}

/**
 * contact ÷ TOTAL hours — over `totalHours`, never the raw `hours_claimed.total`
 * (spec v0.6, §6: what consumes an hours total consumes the derived one).
 *
 * The raw field made this silently unanswerable for every school that publishes its
 * hours as parts: de Yogaschool Enschede publishes 360 contact + 240 zelfstudie and no
 * sum, so `total` is null and the ratio came out null — a school whose breakdown is
 * among the most complete in the corpus, recorded as having no computable contact
 * ratio. The parts ARE the total; only the addition was missing.
 *
 * AND IT IS OURS, LIKE €/CONTACTUUR — which is precisely what consuming `totalHours()`
 * made unavoidable. On de Yogaschool the denominator is a sum WE performed over two
 * numbers they publish apart; the ratio is therefore our arithmetic over our arithmetic,
 * and it shipped in the API as a bare `0.6` with no flag and no working. No school
 * publishes a contact ratio. There is no `published` variant.
 *
 * NOTE the asymmetry with `pricePerContactHour`, which is deliberate: this ratio has the
 * total as its DENOMINATOR and must therefore consume it; €/contactuur divides by
 * `contact` and never touches an hours total at all.
 */
export type ContactRatio =
  | Computed
  | { kind: "no_ratio"; value: null };

export function contactRatio(program: Program): ContactRatio {
  const hours = totalHours(program);
  const contact = program.hours_claimed.contact;
  if (hours.value == null || contact == null) return { kind: "no_ratio", value: null };
  return {
    kind: "computed",
    value: Math.round((contact / hours.value) * 100) / 100,
    // The working carries the DENOMINATOR's provenance too: where the hours total is
    // itself our addition, a reader deserves to see both steps.
    working: [nl.contactRatioWorking(contact, hours.value), ourWorking(hours)]
      .filter((s): s is string => s != null)
      .join(" "),
  };
}

/**
 * "ALLROUND/MULTISTYLE" — DERIVED, NEVER STORED (spec §4.12), and it ships to every API
 * consumer as a bare boolean about a named business.
 *
 * TWO ways to be true, and they are not the same statement:
 *
 *   1. THE SCHOOL SELF-TAGS IT. The `multistyle` tag records THEIR label ("multistyle",
 *      "allround") — their word, not our conclusion.
 *   2. THEY NAME ≥2 CO-EQUAL SPECIFIC STYLES. Then "allround" is OUR reading of what they
 *      list, and `>= 2` is the whole of it: **a school that names ONE style is not
 *      multistyle.** `>= 1` compiles, passes every test in the suite, and publishes every
 *      single-style programme in the corpus — every Iyengar-only, every Ashtanga-only
 *      school — to every consumer as "allround". That is a claim about what a named
 *      business teaches, and they never made it.
 *
 * `other` and `own_method` are NOT specific styles and are filtered out: they name no
 * tradition, so two of them are not two styles. And a programme that states no style gets
 * `styles: []` → false. Absence of a statement is not a finding, and never a residual
 * "allround" (spec §4.12, in as many words).
 */
export function isMultistyle(program: Program): boolean {
  const tags = program.styles ?? [];
  if (tags.includes("multistyle")) return true;
  const specific = tags.filter((t) => t !== "other" && t !== "own_method");
  return specific.length >= 2;
}

/**
 * THE PACKAGE PRICE − Σ MODULE PRICES, and the package price is the WHOLE-COURSE TOTAL
 * (spec §6, v0.5) — never the bare `amount_eur`.
 *
 * It read the raw field and never consulted `period`, which is the v0.5 bug surviving in
 * a corner nobody looked at: a modular training priced per studiejaar would have had ONE
 * YEAR's fee compared against the sum of ALL its modules, and the record page would have
 * published the package as thousands of euros CHEAPER than its own parts — a comparison,
 * about a named business, in the school's own ink. Nothing in the corpus is that shape
 * today, which is exactly why it was invisible; `totalPrice()` is where "what does this
 * course cost" is answered, and every consumer of that answer must ask it there.
 *
 * `null` if any part is missing (composedPartPrices): an incomplete sum is a guess.
 *
 * `null` where the programme holds NO AMOUNT OF ITS OWN: a bundle discount needs a
 * BUNDLE, and a training sold only as its parts (Adhouna's Yin XL: `amount_eur: null`,
 * `period: per_module`) has no package price to compare the sum against. Its "delta" would
 * be zero by construction — a fact about our arithmetic, not about the school.
 */
export function bundleDelta(provider: Provider, program: Program): number | null {
  const parts = composedPartPrices(provider, program.composition?.modules);
  if (parts == null) return null;
  // No package price of their own → no bundle → no delta. Asked BEFORE the total, because
  // a per-module total IS the sum of these very parts (derivation 3).
  if (program.price.amount_eur == null) return null;
  const bundle = totalPrice(provider, program).value;
  // A price we cannot make comparable cannot be compared. A yearly fee is not a package price.
  if (bundle == null) return null;
  const sum = parts.reduce((a, b) => a + b, 0);
  return Math.round((bundle - sum) * 100) / 100;
}

/** % of layer-1 fields filled → powers the depth badge honestly. */
export function completeness(p: Provider): number {
  let filled = 0;
  let total = 0;
  const count = (cond: boolean) => {
    total += 1;
    if (cond) filled += 1;
  };
  count(p.locations.some((l) => l.city != null));
  count(p.crkbo.registered !== "unknown");
  for (const program of p.programs) {
    count(program.price.amount_eur != null || program.price.published !== "unknown");
    count(program.hours_claimed.breakdown_published !== "unknown");
    count(program.accreditation.length > 0 || program.format_label === "none");
    count(!!program.delivery.language);
  }
  return total === 0 ? 0 : Math.round((filled / total) * 100);
}

/* ---------- QA / review report (read-only authoring aid) ---------- */

export interface ProviderQa {
  completeness: number;
  /** Sources still missing a public archive — below the publication bar. */
  unarchivedSources: number;
  totalSources: number;
  /** Months since last_verified, for a staleness flag (null if unparseable). */
  ageMonths: number | null;
  /** Open work: only `unknown` quad-states (genuine gaps), never `not_published`
   *  (which is a finding, not a gap — see spec §2). */
  gaps: string[];
  /** Claims — a price, an hours figure, a VAT treatment — whose CITED page evidences
   *  none of it (see provenance.ts). A citation defect, not a gap in a quad: the
   *  record looks complete and the archive backs none of it.
   *
   *  TYPED, NOT `string[]`. Flattening these to messages threw away the one field that
   *  matters most — `reason` — and with it the distinction this whole project turns on,
   *  applied to our own work: `no_snapshot` ("we never archived this page") is OUR DEBT,
   *  a GAP; `no_evidence` ("the archived page says nothing of the kind") is a DEFECT in
   *  a citation about a NAMED BUSINESS. Same red list, two different sentences, and /qa
   *  could not tell them apart. It is exactly the `unknown` vs `not_published` rule
   *  (spec §2) turned on the researcher. */
  provenance: ProvenanceFinding[];
}

/**
 * Surfaces what a record still needs. Pure read — never mutates the dataset.
 *
 * `provenance` is INJECTED rather than computed: answering it means opening the
 * archived artifacts (node:fs + pdftotext), and this module must import nothing
 * from `node:*` or the JSON export and the client filter island lose their access to
 * the derived values (see the header). The finding lives in `src/lib/provenance.ts`,
 * where the impurity belongs; callers that can reach the disk (`scripts/validate.ts`,
 * the dev-only `/qa` page) pass it in. A caller that cannot simply reports no
 * citation defects — and none of the surfaces that ship to readers is such a caller.
 */
export function providerQa(p: Provider, now = new Date(), provenance: ProvenanceFinding[] = []): ProviderQa {
  const gaps: string[] = [];
  if (p.crkbo.registered === "unknown") gaps.push("CRKBO: nog niet onderzocht");

  for (const program of p.programs) {
    const tag = program.id;
    if (program.price.amount_eur == null && program.price.published === "unknown")
      gaps.push(`${tag}: prijs nog niet onderzocht`);
    if (program.hours_claimed.breakdown_published === "unknown")
      gaps.push(`${tag}: urenuitsplitsing nog niet onderzocht`);
    if (program.hours_claimed.supervised_teaching_practice == null)
      gaps.push(`${tag}: begeleide lespraktijk niet vermeld`);
    if (!program.delivery.language) gaps.push(`${tag}: voertaal ontbreekt`);
  }

  const unarchivedSources = p.sources.filter((s) => s.archived_url == null).length;

  const m = /^(\d{4})-(\d{2})/.exec(p.last_verified);
  const ageMonths = m
    ? (now.getFullYear() - Number(m[1])) * 12 + (now.getMonth() + 1 - Number(m[2]))
    : null;

  return {
    completeness: completeness(p),
    unarchivedSources,
    totalSources: p.sources.length,
    ageMonths,
    gaps,
    provenance,
  };
}
