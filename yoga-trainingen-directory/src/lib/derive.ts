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

export interface PricePerContactHour {
  value: number | null;
  /** Why no value, or why comparison needs a flag. */
  caveat?: string;
}

export function pricePerContactHour(program: Program): PricePerContactHour {
  const amount = program.price.amount_eur;
  const contact = program.hours_claimed.contact;
  if (amount == null) return { value: null, caveat: "prijs niet gepubliceerd" };
  if (contact == null) return { value: null, caveat: "contacturen niet gepubliceerd" };
  // Comparability guard: includes/excludes change what the price buys.
  const caveats: string[] = [];
  if (program.price.includes) caveats.push(`prijs inclusief: ${program.price.includes}`);
  if (program.price.excludes) caveats.push(`prijs exclusief: ${program.price.excludes}`);
  return {
    value: Math.round((amount / contact) * 100) / 100,
    caveat: caveats.length ? caveats.join("; ") : undefined,
  };
}

export function contactRatio(program: Program): number | null {
  const { total, contact } = program.hours_claimed;
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
  /** Programmes claiming a published price whose CITED page shows no amount —
   *  see provenance.ts. A citation defect, not a gap in a quad: the record looks
   *  complete and the archive backs none of it. */
  priceProvenance: string[];
}

/**
 * Surfaces what a record still needs. Pure read — never mutates the dataset.
 *
 * `priceProvenance` is INJECTED rather than computed: answering it means opening
 * the archived artifacts (node:fs + pdftotext), and this module must import nothing
 * from `node:*` or the JSON export and the client filter island lose their access to
 * the derived values (see the header). The finding lives in `src/lib/provenance.ts`,
 * where the impurity belongs; callers that can reach the disk (`scripts/validate.ts`,
 * the dev-only `/qa` page) pass it in. A caller that cannot simply reports no
 * citation defects — and none of the surfaces that ship to readers is such a caller.
 */
export function providerQa(p: Provider, now = new Date(), priceProvenance: string[] = []): ProviderQa {
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
    priceProvenance,
  };
}
