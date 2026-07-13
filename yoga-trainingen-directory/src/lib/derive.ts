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
 * THE WHOLE-COURSE PRICE — the figure a reader compares, and on one provider the
 * figure nobody publishes (spec v0.5, §6 `total_price`).
 *
 * `derived` is not decoration, it is the licence to print the number:
 *
 *   - `derived: false` → `period` is `total`. The value IS the provider's own
 *     published figure, and a surface may show it as theirs.
 *   - `derived: true`  → OUR ARITHMETIC over their per-period price. The caveat
 *     spells the sum out ("onze berekening: 4 × € 1.290") and every surface must
 *     render it visibly as ours — never in the ink reserved for their claim.
 *   - `value: null`    → a per-period price with no published period count. NOT
 *     comparable, and it must not be banded, sorted or ranked as though it were.
 *     Guessing the count would fabricate the very number this field exists to stop.
 *
 * `excludes` IS NEVER ADDED IN. It is free text ("eenmalig € 100 inschrijfgeld; de
 * verblijfskosten van het yogaweekend") — it cannot be summed, and a total that
 * silently absorbed some of it would be neither their figure nor a reproducible one
 * of ours. It renders ALONGSIDE, as it already does.
 */
export interface TotalPrice {
  value: number | null;
  /** Why the total is not comparable, or how we arrived at it. */
  caveat?: string;
  /** True → we multiplied. The number is OURS and must be labelled so. */
  derived: boolean;
}

export function totalPrice(program: Program): TotalPrice {
  const { amount_eur: amount, period, periods } = program.price;
  if (amount == null) return { value: null, derived: false };
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
export function pricePerContactHour(program: Program): PricePerContactHour {
  const total = totalPrice(program);
  const contact = program.hours_claimed.contact;
  if (program.price.amount_eur == null) return { value: null, caveat: "prijs niet gepubliceerd" };
  // A per-period price with no period count: we hold an amount, but not a comparable
  // one. Saying "prijs niet gepubliceerd" here would be a false finding about a
  // provider who publishes a price — it is their TOTAL that does not exist.
  if (total.value == null) return { value: null, caveat: total.caveat };
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

export function bundleDelta(provider: Provider, program: Program): number | null {
  const moduleIds = program.composition?.modules;
  if (!moduleIds?.length || program.price.amount_eur == null) return null;
  let sum = 0;
  for (const id of moduleIds) {
    const mod = provider.modules.find((m) => m.id === id);
    if (mod?.price?.amount_eur == null) return null; // incomplete → no derivation
    sum += mod.price.amount_eur;
  }
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
