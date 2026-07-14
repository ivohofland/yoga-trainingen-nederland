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
import type { Program, Provider } from "../schema";
// TYPE-ONLY, and that is what keeps this module `node:*`-free: `import type` is erased
// at compile time, so provenance.ts's `node:fs`/`pdftotext` never enter the import graph
// of the client filter island or the JSON export. The finding stays TYPED all the way to
// /qa — see ProviderQa.provenance on why flattening it to strings was the bug.
import type { ProvenanceFinding } from "./provenance";
import { nl } from "./strings";

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
export interface TotalPrice {
  value: number | null;
  /** Why the total is not comparable, or how we arrived at it. */
  caveat?: string;
  /** True → we did the arithmetic. The number is OURS and must be labelled so. */
  derived: boolean;
}

export function totalPrice(provider: Provider, program: Program): TotalPrice {
  const { amount_eur: amount, period, periods } = program.price;

  // DERIVATION 3 — the sum of unequal parts. The programme carries no amount of its own
  // BECAUSE the provider states none: they price per module, and the whole is what the
  // parts come to. Gated on `period: per_module` and NOT merely on "it has modules": a
  // `free_assembly` path (QUENO) is a menu, not a fixed sum, and adding its modules up
  // would invent a total for a training nobody buys that way.
  if (amount == null) {
    if (period !== "per_module") return { value: null, derived: false };
    const parts = composedPartPrices(provider, program.composition?.modules);
    if (parts == null) return { value: null, derived: false };
    return {
      value: Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100,
      caveat: nl.totalPriceSum(parts.map(formatEuroForCaveat)),
      derived: true,
    };
  }

  // The common case, and the schema's default: the figure they publish IS the total.
  if (period === "total") return { value: amount, derived: false };
  if (periods == null) {
    return { value: null, caveat: nl.totalPriceNoPeriodCount(nl.pricePeriod[period]), derived: true };
  }
  return {
    value: Math.round(amount * periods * 100) / 100,
    caveat: nl.totalPriceWorking(periods, formatEuroForCaveat(amount)),
    derived: true,
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
export interface TotalPathCost {
  value: number | null;
  /** The working, always — the path total is ours in every case. */
  caveat?: string;
  /** Always true. Present so the shape matches TotalPrice/TotalHours and no consumer has
   *  to remember which of the three is exempt from the labelling rule. None is. */
  derived: true;
  /** The purchasable gates, flattened, in the order the student must buy them. Empty →
   *  the path IS the programme, and no surface may render a second row (see presenters). */
  gates: { label: string; total: number | null }[];
}

export function totalPathCost(provider: Provider, program: Program): TotalPathCost {
  const gates = purchasableGates(provider, program, new Set([program.id]));
  const own = totalPrice(provider, program);

  if (gates.length === 0) {
    // No gate to buy: the path cost IS the total price. It still reports `derived: true` —
    // this function's number is always ours — but presenters render NO second row, because
    // there is no second number and printing one would relabel their total as our sum.
    return { value: own.value, derived: true, gates };
  }

  const missing = own.value == null || gates.some((g) => g.total == null);
  if (missing) {
    return {
      value: null,
      caveat: nl.totalPathCostIncomplete,
      derived: true,
      gates,
    };
  }

  const total = gates.reduce((sum, g) => sum + (g.total ?? 0), own.value ?? 0);
  return {
    value: Math.round(total * 100) / 100,
    caveat: nl.totalPathCostWorking(
      gates.map((g) => `${g.label} ${formatEuroForCaveat(g.total ?? 0)}`),
    ),
    derived: true,
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
function purchasableGates(
  provider: Provider,
  program: Program,
  seen: Set<string>,
): { label: string; total: number | null }[] {
  const out: { label: string; total: number | null }[] = [];
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
export interface TotalHours {
  value: number | null;
  /** How we arrived at the total ("onze optelling: 360 + 240"). Only when we added. */
  caveat?: string;
  /** True → we added. The number is OURS and must be labelled so. */
  derived: boolean;
}

export function totalHours(program: Program): TotalHours {
  const { total, contact, self_study: selfStudy } = program.hours_claimed;
  // The common case: they publish the total. It is theirs, and it stays theirs.
  if (total != null) return { value: total, derived: false };
  if (contact == null || selfStudy == null) return { value: null, derived: false };
  return {
    value: contact + selfStudy,
    caveat: nl.totalHoursWorking(contact, selfStudy),
    derived: true,
  };
}

export interface PricePerContactHour {
  value: number | null;
  /** Why no value, or why comparison needs a flag. */
  caveat?: string;
}

/**
 * Price ÷ contact hours — over the WHOLE-COURSE price, never a per-period one
 * (spec §6: "Price bands, price sorting and €/contactuur all consume `total_price`,
 * never a bare `amount_eur`"). Dividing a yearly fee by the hours of a four-year
 * training understates the rate by a factor of four.
 */
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
    if (program.price.amount_eur != null) return { value: null, caveat: total.caveat };
    return { value: null, caveat: "prijs niet gepubliceerd" };
  }
  if (contact == null) return { value: null, caveat: "contacturen niet gepubliceerd" };
  // Comparability guard: includes/excludes change what the price buys.
  const caveats: string[] = [];
  if (total.derived && total.caveat) caveats.push(total.caveat);
  if (program.price.includes) caveats.push(`prijs inclusief: ${program.price.includes}`);
  if (program.price.excludes) caveats.push(`prijs exclusief: ${program.price.excludes}`);
  return {
    value: Math.round((total.value / contact) * 100) / 100,
    caveat: caveats.length ? caveats.join("; ") : undefined,
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
 * NOTE the asymmetry with `pricePerContactHour` below, which is deliberate: this ratio
 * has the total as its DENOMINATOR and must therefore consume it; €/contactuur divides
 * by `contact` and never touches a total at all, so v0.6 leaves it untouched.
 */
export function contactRatio(program: Program): number | null {
  const total = totalHours(program).value;
  const contact = program.hours_claimed.contact;
  if (total == null || contact == null) return null;
  return Math.round((contact / total) * 100) / 100;
}

/** "allround/multistyle" is derived, never stored (spec §4.12): the school
 *  self-tagged multistyle, or named >=2 co-equal specific styles. */
export function isMultistyle(program: Program): boolean {
  const tags = program.styles ?? [];
  if (tags.includes("multistyle")) return true;
  const specific = tags.filter((t) => t !== "other" && t !== "own_method");
  return specific.length >= 2;
}

/**
 * Package price − Σ module prices. `null` if any part is missing (composedPartPrices),
 * and `null` where the programme holds no amount of its own: a bundle discount needs a
 * BUNDLE, and a training sold only as its parts (Adhouna's Yin XL: `amount_eur: null`,
 * `period: per_module`) has no package price to compare the sum against. Its "delta"
 * would be zero by construction — a fact about our arithmetic, not about the school.
 */
export function bundleDelta(provider: Provider, program: Program): number | null {
  const parts = composedPartPrices(provider, program.composition?.modules);
  if (parts == null || program.price.amount_eur == null) return null;
  const sum = parts.reduce((a, b) => a + b, 0);
  return Math.round((program.price.amount_eur - sum) * 100) / 100;
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
