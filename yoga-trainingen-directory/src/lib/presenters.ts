/**
 * Pure Provider → view-model. No file reads, no side effects, no business
 * logic that belongs in dataset.ts (which owns validation and the derived
 * values, spec §6). This module owns *display*: the strings a component
 * renders, and nothing else.
 */
import { bundleDelta, pricePerContactHour } from "./dataset";
import { quadLabel } from "./quad";
import { nl } from "./strings";
import type { Cohort, Program, Provider, Quad, Source } from "../schema";

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
 * Which field stops `pricePerContactHour` from computing, and what the record
 * says about that field. There are exactly two blockers, and they are findings
 * about two different fields:
 *   - no price amount  → the blocker is the price → `price.published`;
 *   - no contact hours → the blocker is the hours → `hours_claimed.breakdown_published`.
 */
function pphBlocker(program: Program): { field: "price" | "hours"; published: Quad } {
  return program.price.amount_eur == null
    ? { field: "price", published: program.price.published }
    : { field: "hours", published: program.hours_claimed.breakdown_published };
}

/**
 * The quad the €/contactuur cell may render when there is no computable value.
 *
 * THE rule this exists to enforce (CLAUDE.md, spec §4): `not_published` is a
 * FINDING ABOUT A NAMED BUSINESS — "we looked; they do not state it". `unknown`
 * is a GAP IN OUR OWN RESEARCH. Publishing a gap as a finding is an accusation
 * we did not earn; publishing a finding as a gap disowns research we did do and
 * sourced. Both are wrong. So the cell says exactly what the record says about
 * the BLOCKING field — no more, and no less.
 *
 * The blocking fields are both called *published*, and on such a field `no` and
 * `not_published` mean the same thing about the provider: they do not publish
 * it. `no` is not contradictory — it is a researched, sourced finding (five
 * programmes carry it, each with a note like "Geen prijs gepubliceerd op de
 * 300u-pagina"). Both therefore license the amber finding.
 *
 * `yes` is the genuinely contradictory case: the record says the provider DOES
 * publish it, yet the value is missing from our record anyway — three
 * programmes are exactly this shape (yogaeasy/200-hatha-vinyasa,
 * yogic-life/ryt200-multistyle, yogic-life/ryt300-multistyle: an amount, a
 * published breakdown, and no `hours_claimed.contact`). The missing value is
 * OURS. That is a gap, and so is `unknown` — nobody looked yet.
 */
export function pphQuad(program: Program): Quad {
  if (pricePerContactHour(program).value != null) return "yes";
  const { published } = pphBlocker(program);
  return published === "not_published" || published === "no" ? "not_published" : "unknown";
}

/**
 * The human-readable "why" behind the cell. It must never contradict the quad
 * above: a finding names the provider's omission, a gap is phrased as a gap in
 * our record — never as an accusation that the provider withheld something.
 *
 * The wording is OURS, not dataset.ts's. `pricePerContactHour` returns a terse
 * diagnostic ("prijs niet gepubliceerd") whenever it cannot compute, worded
 * identically for a finding and for a gap — surfacing it verbatim is exactly
 * how a gap would get published as an accusation. Only its comparability
 * caveats (what the price includes/excludes, which exist only when there IS a
 * value) are display copy; those we pass through.
 */
function pphCaveatFor(program: Program, state: Quad): string | null {
  const { value, caveat } = pricePerContactHour(program);
  if (value != null) return caveat ?? null;
  const priceIsBlocker = pphBlocker(program).field === "price";
  if (state === "not_published") {
    return priceIsBlocker ? nl.pphPriceNotPublished : nl.pphHoursNotPublished;
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

/* ---------- The provider record ---------- */

export interface QuadRow {
  key: string;
  label: string;
  state: Quad;
  note: string | null;
}

export interface KeyValueRow {
  label: string;
  /** null → the Quad renders its state word instead of a value. */
  value: string | null;
  state: Quad;
  note: string | null;
}

export interface ProgramView {
  id: string;
  name: string;
  url: string | null;
  styleClaimed: string | null;
  rows: KeyValueRow[];
  coherence: QuadRow[];
  transparency: QuadRow[];
  accreditation: { body: string; label: string; verified: Quad; note: string | null }[];
  cohorts: { id: string; start: string; status: Cohort["status"]; label: string; note: string | null }[];
}

export interface ClaimView {
  id: string;
  quote: string;
  category: string;
  scope: string;
  analysis: { note: string; status: string; reviewed: string; methodologyVersion: string } | null;
}

export interface SourceView {
  id: string;
  type: string;
  url: string | null;
  captured: string;
  note: string | null;
  archivePublic: boolean;
  archiveLocal: boolean;
}

export interface ProviderView {
  id: string;
  name: string;
  aka: string[];
  website: string;
  domain: string;
  cityDisplay: string;
  depth: string;
  lastVerified: string;
  disclosure: string | null;
  crkbo: { registered: Quad; register: string | null; holder: string | null; checked: string | null; note: string | null };
  registrations: { body: string; identifier: string | null; holder: string | null; firstRegistered: string | null; verified: Quad; note: string | null }[];
  programs: ProgramView[];
  claims: ClaimView[];
  sources: SourceView[];
  sourcesArchived: number;
}

/** An absent optional object is a gap, never a finding (spec §4). */
function q(v: Quad | undefined): Quad {
  return v ?? "unknown";
}

/**
 * A row whose label promises a VALUE, not a yes/no ("Groepsgrootte", "Track
 * record", …). With no value there is nothing established, so it is a gap —
 * never a bare "ja", which would assert a fact we do not hold.
 */
function fact(label: string, value: string | null | undefined, note?: string | null): KeyValueRow {
  return {
    label,
    value: value ?? null,
    state: value == null ? "unknown" : "yes",
    note: note ?? null,
  };
}

const joinDot = (parts: (string | false | null | undefined)[]): string | null =>
  parts.filter(Boolean).join(" · ") || null;

/**
 * A published-ness quad read for a value that is missing from our record.
 *
 * Same rule as pphQuad, applied to any field whose availability is gated by a
 * *_published quad: on such a field `no` and `not_published` both mean "wij
 * keken; zij publiceren het niet" — a sourced FINDING. `yes` (they do publish
 * it, yet the value is absent from our record anyway) and `unknown` (nobody
 * looked) are GAPS in our own research, and must never be published as an
 * accusation against a named business.
 */
function missingBecause(published: Quad): Quad {
  return published === "not_published" || published === "no" ? "not_published" : "unknown";
}

function coherenceRows(program: Program): QuadRow[] {
  const cs = program.coherence_signals;
  return (Object.keys(nl.coherence) as (keyof typeof nl.coherence)[]).map((key) => ({
    key,
    label: nl.coherence[key],
    state: q(cs?.[key]),
    note: cs?.[`${key}_note`] ?? null,
  }));
}

function transparencyRows(program: Program): QuadRow[] {
  const t = program.transparency;
  return (Object.keys(nl.transparency) as (keyof typeof nl.transparency)[]).map((key) => ({
    key,
    label: nl.transparency[key],
    state: q(t?.[key]),
    note: null,
  }));
}

function programRows(provider: Provider, program: Program): KeyValueRow[] {
  const h = program.hours_claimed;
  const pphState = pphQuad(program);
  const pph = pricePerContactHour(program);
  const delta = bundleDelta(provider, program);
  const rows: KeyValueRow[] = [];

  rows.push(fact(nl.colFormat, formatDisplay(program.format_label)));
  rows.push(fact(nl.rowStyle, program.style_claimed));
  rows.push(fact(nl.colDelivery, deliveryDisplay(program.delivery)));

  rows.push({
    label: nl.colPrice,
    value: priceDisplay(program.price),
    state: program.price.published,
    note: joinDot([
      program.price.includes && `${nl.priceIncludes}: ${program.price.includes}`,
      program.price.excludes && `${nl.priceExcludes}: ${program.price.excludes}`,
      program.price.note,
    ]),
  });

  // The same epistemic rule as the listing's €/contactuur column, from the same
  // pair of helpers — the record must never say something the listing does not.
  rows.push({
    label: nl.colPph,
    value: pph.value != null ? formatEuro2(pph.value) : null,
    state: pphState,
    note: pphCaveatFor(program, pphState),
  });

  rows.push({
    label: nl.rowHours,
    value: joinDot([
      h.total != null && `${h.total} ${nl.hoursTotal}`,
      h.contact != null && `${h.contact} ${nl.hoursContact}`,
      h.self_study != null && `${h.self_study} ${nl.hoursSelfStudy}`,
    ]),
    state: h.total == null && h.contact == null && h.self_study == null
      ? missingBecause(h.breakdown_published)
      : "yes",
    note: h.note ?? null,
  });

  // The §5 field. Its emptiness across the market is the finding — so it gets
  // its own row on every programme, always. With no number, the row says what
  // the record says about the breakdown that would have carried it: a finding
  // when they publish none, a gap in OUR record when they do and we lack it.
  rows.push({
    label: nl.rowSupervised,
    value: h.supervised_teaching_practice != null
      ? `${h.supervised_teaching_practice} ${nl.hoursSuffixLong}`
      : null,
    state: h.supervised_teaching_practice != null ? "yes" : missingBecause(h.breakdown_published),
    note: null,
  });

  rows.push({
    label: nl.rowAssessment,
    value: program.assessment_described?.quote ?? null,
    state: q(program.assessment_described?.exists),
    note: null,
  });

  rows.push(fact(
    nl.rowGroupSize,
    joinDot([
      program.group_size_claimed?.min != null && `min ${program.group_size_claimed.min}`,
      program.group_size_claimed?.max != null && `max ${program.group_size_claimed.max}`,
    ]),
    program.group_size_claimed?.note,
  ));

  rows.push(fact(nl.rowPrerequisites, program.prerequisites_claimed));

  if (program.composition) {
    const moduleCount = program.composition.modules?.length ?? 0;
    rows.push(fact(
      nl.rowComposition,
      `${nl.composition[program.composition.type]}${moduleCount ? ` · ${moduleCount} ${nl.modulesSuffix}` : ""}`,
      delta != null ? nl.bundleDelta(formatEuro(Math.abs(delta)), delta < 0) : null,
    ));
  }

  if (program.contract) {
    rows.push(fact(
      nl.rowContract,
      joinDot([
        program.contract.cancellation_published &&
          `${nl.contractCancellation}: ${quadLabel(program.contract.cancellation_published)}`,
        program.contract.refund_published &&
          `${nl.contractRefund}: ${quadLabel(program.contract.refund_published)}`,
        program.contract.installments_published &&
          `${nl.contractInstallments}: ${quadLabel(program.contract.installments_published)}`,
      ]),
      joinDot([
        program.contract.invoicing_entity && `${nl.contractInvoices}: ${program.contract.invoicing_entity}`,
        program.contract.note,
      ]),
    ));
  }

  if (program.track_record) {
    rows.push(fact(
      nl.rowTrackRecord,
      joinDot([
        program.track_record.first_seen_year != null && `${nl.since} ${program.track_record.first_seen_year}`,
        program.track_record.last_confirmed_cohort &&
          `${nl.lastConfirmed} ${formatMonth(program.track_record.last_confirmed_cohort.slice(0, 7))}`,
      ]),
      joinDot([program.track_record.cadence_note, program.track_record.note]),
    ));
  }

  return rows;
}

function domainOf(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

export function toProviderView(p: Provider): ProviderView {
  return {
    id: p.id,
    name: p.name,
    aka: p.aka ?? [],
    website: p.website,
    domain: domainOf(p.website),
    cityDisplay: cityDisplay(p),
    depth: nl.depth[p.depth],
    lastVerified: p.last_verified,
    disclosure: p.disclosure ?? null,
    crkbo: {
      registered: p.crkbo.registered,
      register: p.crkbo.register ? nl.crkboRegister[p.crkbo.register] : null,
      holder: p.crkbo.holder ?? null,
      checked: p.crkbo.checked ?? null,
      note: p.crkbo.note ?? null,
    },
    registrations: p.registrations.map((r) => ({
      body: nl.body[r.body],
      identifier: r.identifier ?? null,
      holder: r.holder ?? null,
      firstRegistered: r.first_registered ?? null,
      verified: r.verified_in_register,
      note: r.note ?? null,
    })),
    programs: p.programs.map((program) => ({
      id: program.id,
      name: program.name,
      url: program.url ?? null,
      styleClaimed: program.style_claimed ?? null,
      rows: programRows(p, program),
      coherence: coherenceRows(program),
      transparency: transparencyRows(program),
      accreditation: program.accreditation.map((a) => ({
        body: nl.body[a.body],
        label: a.label_claimed,
        verified: a.verified,
        note: a.note ?? null,
      })),
      cohorts: (program.cohorts ?? []).map((c) => ({
        id: c.id,
        start: c.start,
        status: c.status,
        label: `${formatMonth(c.start.slice(0, 7))} — ${nl.cohortStatus[c.status]}`,
        note: c.note ?? null,
      })),
    })),
    claims: p.claims.map((c) => ({
      id: c.id,
      quote: c.quote, // VERBATIM. Never touch this.
      category: nl.claimCategory[c.category],
      scope: c.scope,
      analysis: c.analysis
        ? {
            note: c.analysis.note,
            status: nl.analysisStatus[c.analysis.status],
            reviewed: c.analysis.reviewed,
            methodologyVersion: c.analysis.methodology_version,
          }
        : null,
    })),
    sources: p.sources.map((s: Source) => ({
      id: s.id,
      type: nl.sourceType[s.type],
      url: s.url ?? null,
      captured: s.captured,
      note: s.note ?? null,
      archivePublic: s.archived_url != null,
      archiveLocal: s.local_snapshot != null,
    })),
    sourcesArchived: p.sources.filter((s) => s.archived_url != null).length,
  };
}
