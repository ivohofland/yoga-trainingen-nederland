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
  return cities.length ? [...new Set(cities)].join(" · ") : "locatie niet vermeld";
}

function formatDisplay(f: Program["format_label"]): string {
  if (f === "other" || f === "none") return nl.filterOwnFormat;
  return `${f} u`;
}

function deliveryDisplay(d: Program["delivery"]): string {
  const parts: string[] = [nl.mode[d.mode], nl.structure[d.structure]];
  const { duration_months_min: lo, duration_months_max: hi } = d;
  if (lo != null && hi != null && lo !== hi) parts.push(`${lo}–${hi} mnd`);
  else if (lo != null) parts.push(`${lo} mnd`);
  else if (hi != null) parts.push(`${hi} mnd`);
  if (d.language) parts.push(d.language.toUpperCase());
  return parts.join(" · ");
}

/** null when the price is not a published number — never a zero, never a guess. */
function priceDisplay(p: Program["price"]): string | null {
  if (p.amount_eur == null) return null;
  const base = `${formatEuro(p.amount_eur)} · ${nl.vat[p.vat]}`;
  const extra = p.variants?.length ? ` · ${p.variants.length + 1} varianten` : "";
  return base + extra;
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
        pphCaveat: pph.value == null ? (pph.caveat ?? nl.filterPriceNotPublished) : (pph.caveat ?? null),
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
