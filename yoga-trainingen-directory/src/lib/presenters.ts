/**
 * Pure Provider → view-model. No file reads, no side effects, no business
 * logic that belongs in dataset.ts (which owns validation and the derived
 * values, spec §6). This module owns *display*: the strings a component
 * renders, and nothing else.
 */
import { pricePerContactHour } from "./dataset";
import { nl } from "./strings";
import type { Cohort, Program, Provider, Quad } from "../schema";

export interface NextCohort {
  start: string;
  status: Cohort["status"];
  label: string;
}

export interface RegisterChip {
  body: string;
  label: string;
  verified: Quad;
}

export interface ListingRow {
  providerId: string;
  providerName: string;
  providerCityDisplay: string;
  cities: string[];
  programId: string;
  programName: string;
  href: string;
  styleClaimed: string | null;
  formatLabel: Program["format_label"];
  formatDisplay: string;
  mode: Program["delivery"]["mode"];
  language: "nl" | "en" | "mixed" | null;
  deliveryDisplay: string;
  priceAmount: number | null;
  pricePublished: Quad;
  priceDisplay: string | null;
  pph: number | null;
  /**
   * The formatted €/contactuur, or null when there is none. Formatted HERE, like
   * priceDisplay: locale formatting is display, this module owns display, and a
   * client component must not hand-roll a second nl-NL money format. (It also
   * cannot: this module reaches dataset.ts, which is server-only.)
   */
  pphDisplay: string | null;
  /** What the €/contactuur cell is ALLOWED to say when `pph` is null. See pphQuad. */
  pphState: Quad;
  pphCaveat: string | null;
  registers: RegisterChip[];
  crkboRegistered: Quad;
  yaVerified: Quad;
  nextCohort: NextCohort | null;
  lastVerified: string;
  hasDisclosure: boolean;
}

export interface DatasetStats {
  providers: number;
  programs: number;
  pphComputable: number;
  lastVerified: string | null;
}

const EUR = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const EUR2 = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

export function formatEuro(n: number): string {
  return EUR.format(n);
}

export function formatEuro2(n: number): string {
  return EUR2.format(n);
}

/** "2026-09" → "sep 2026". Month-precision only; never invents a day. */
export function formatMonth(ym: string): string {
  const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  const [y, m] = ym.split("-");
  const idx = Number(m) - 1;
  return MONTHS[idx] ? `${MONTHS[idx]} ${y}` : ym;
}

function cityDisplay(p: Provider): string {
  const cities = p.locations.map((l) => l.city).filter((c): c is string => c != null);
  return cities.length ? [...new Set(cities)].join(" · ") : nl.cityNotListed;
}

function formatDisplay(f: Program["format_label"]): string {
  if (f === "other" || f === "none") return nl.filterOwnFormat;
  return `${f} ${nl.hourSuffix}`;
}

function deliveryDisplay(d: Program["delivery"]): string {
  const parts: string[] = [nl.mode[d.mode], nl.structure[d.structure]];
  const { duration_months_min: lo, duration_months_max: hi } = d;
  if (lo != null && hi != null && lo !== hi) parts.push(`${lo}–${hi} ${nl.monthsSuffix}`);
  else if (lo != null) parts.push(`${lo} ${nl.monthsSuffix}`);
  else if (hi != null) parts.push(`${hi} ${nl.monthsSuffix}`);
  if (d.language) parts.push(d.language.toUpperCase());
  return parts.join(" · ");
}

/**
 * null when the price is not a published number — never a zero, never a guess.
 *
 * This passes `amount_eur` through as-is; it does not null the value here
 * even when `published !== "yes"`. The invariant "an amount implies the
 * provider publishes a price" is enforced by the build-gate test in
 * presenters.test.ts, not by silently nulling in this presenter — a data
 * error that violates the invariant must fail the build loudly, because
 * hiding it here would be worse than the build failing.
 */
function priceDisplay(p: Program["price"]): string | null {
  if (p.amount_eur == null) return null;
  const base = `${formatEuro(p.amount_eur)} · ${nl.vat[p.vat]}`;
  const extra = p.variants?.length ? ` · ${p.variants.length + 1} varianten` : "";
  return base + extra;
}

/**
 * The quad the €/contactuur cell may render when there is no computable value.
 *
 * THE rule this exists to enforce (CLAUDE.md, spec §4): `not_published` is a
 * FINDING ABOUT A NAMED BUSINESS — "we looked; they do not state it". `unknown`
 * is a GAP IN OUR OWN RESEARCH. Rendering every missing €/contactuur as
 * `not_published` publishes our gaps as accusations. So the cell may only ever
 * say what the record itself says.
 *
 * `pricePerContactHour` can fail for two different reasons, and they are
 * findings about two different fields:
 *   - no price amount  → the blocker is the price → ask `price.published`;
 *   - no contact hours → the blocker is the hours → ask `hours_claimed.breakdown_published`.
 *
 * And then the guard that matters: if that field says `yes` (the provider DOES
 * publish it) or `no` while the value is still missing from our record — three
 * programmes are exactly this shape (yogaeasy/200-hatha-vinyasa,
 * yogic-life/ryt200-multistyle, yogic-life/ryt300-multistyle: an amount, a
 * published breakdown, and no `hours_claimed.contact`) — then the record
 * supports NO published-ness finding at all. The value is missing from OUR
 * record. That is a gap. Only a literal `not_published` on the blocking field
 * licenses the amber finding; everything else is `unknown`.
 */
export function pphQuad(program: Program): Quad {
  if (pricePerContactHour(program).value != null) return "yes";
  const blocker: Quad =
    program.price.amount_eur == null
      ? program.price.published
      : program.hours_claimed.breakdown_published;
  return blocker === "not_published" ? "not_published" : "unknown";
}

/**
 * The human-readable "why" behind the cell. It must never contradict the quad
 * above: when the state is a gap, the caveat is phrased as a gap in our record,
 * never as an accusation that the provider withheld something.
 */
function pphCaveatFor(program: Program, state: Quad): string | null {
  const { value, caveat } = pricePerContactHour(program);
  // A computable value: the only caveats left are the comparability ones
  // (what the price includes/excludes).
  if (value != null) return caveat ?? null;
  const priceIsBlocker = program.price.amount_eur == null;
  if (state === "not_published") {
    // dataset.ts's own wording: "prijs niet gepubliceerd" / "contacturen niet gepubliceerd".
    return caveat ?? (priceIsBlocker ? nl.pphPriceNotPublished : nl.pphHoursNotPublished);
  }
  return priceIsBlocker ? nl.pphPriceNotInRecord : nl.pphHoursNotInRecord;
}

/**
 * The earliest cohort starting at or after `now`. An announced cohort is
 * labelled as announced (spec §8) — announced is not ran, and the label must
 * never let a reader believe otherwise.
 */
function nextCohort(program: Program, now: Date): NextCohort | null {
  const currentYm = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const upcoming = (program.cohorts ?? [])
    .filter((c) => c.status !== "cancelled" && c.start.slice(0, 7) >= currentYm)
    .sort((a, b) => a.start.localeCompare(b.start));
  const c = upcoming[0];
  if (!c) return null;
  return {
    start: c.start.slice(0, 7),
    status: c.status,
    label: `start ${formatMonth(c.start.slice(0, 7))} — ${nl.cohortStatus[c.status]}`,
  };
}

function registers(provider: Provider, program: Program): RegisterChip[] {
  return program.accreditation.map((a) => ({
    body: nl.body[a.body],
    label: a.label_claimed,
    verified: a.verified,
  }));
}

function yaVerified(provider: Provider): Quad {
  const ya = provider.registrations.filter((r) => r.body === "yoga_alliance");
  if (!ya.length) return "unknown";
  if (ya.some((r) => r.verified_in_register === "yes")) return "yes";
  if (ya.some((r) => r.verified_in_register === "no")) return "no";
  if (ya.some((r) => r.verified_in_register === "not_published")) return "not_published";
  return "unknown";
}

export function toListingRows(providers: Provider[], now: Date = new Date()): ListingRow[] {
  const rows: ListingRow[] = [];
  for (const provider of providers) {
    const cities = [...new Set(provider.locations.map((l) => l.city).filter((c): c is string => c != null))];
    for (const program of provider.programs) {
      const pph = pricePerContactHour(program);
      const pphState = pphQuad(program);
      rows.push({
        providerId: provider.id,
        providerName: provider.name,
        providerCityDisplay: cityDisplay(provider),
        cities,
        programId: program.id,
        programName: program.name,
        href: `/aanbieder/${provider.id}#programma-${program.id}`,
        styleClaimed: program.style_claimed ?? null,
        formatLabel: program.format_label,
        formatDisplay: formatDisplay(program.format_label),
        mode: program.delivery.mode,
        language: program.delivery.language ?? null,
        deliveryDisplay: deliveryDisplay(program.delivery),
        priceAmount: program.price.amount_eur ?? null,
        pricePublished: program.price.published,
        priceDisplay: priceDisplay(program.price),
        pph: pph.value,
        pphDisplay: pph.value != null ? formatEuro2(pph.value) : null,
        pphState,
        pphCaveat: pphCaveatFor(program, pphState),
        registers: registers(provider, program),
        crkboRegistered: provider.crkbo.registered,
        yaVerified: yaVerified(provider),
        nextCohort: nextCohort(program, now),
        lastVerified: provider.last_verified,
        hasDisclosure: provider.disclosure != null,
      });
    }
  }
  return rows;
}

export function datasetStats(providers: Provider[]): DatasetStats {
  const programs = providers.flatMap((p) => p.programs);
  return {
    providers: providers.length,
    programs: programs.length,
    pphComputable: programs.filter((p) => pricePerContactHour(p).value != null).length,
    lastVerified: providers.map((p) => p.last_verified).sort().at(-1) ?? null,
  };
}
