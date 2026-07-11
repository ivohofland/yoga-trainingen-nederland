/**
 * Pure Provider → view-model. No file reads, no side effects, no business
 * logic that belongs in dataset.ts (which owns validation and the derived
 * values, spec §6). This module owns *display*: the strings a component
 * renders, and nothing else.
 */
import { bundleDelta, pricePerContactHour } from "./dataset";
import { quadClass, saysNotPublished } from "./quad";
import { nl } from "./strings";
import type { Cohort, Program, Provider, Quad, Source } from "../schema";

export interface NextCohort {
  start: string;
  status: Cohort["status"];
  label: string;
}

/** The schema's accreditation body key — the raw value, not its Dutch label. */
type AccreditationBody = Program["accreditation"][number]["body"];

export interface RegisterChip {
  /**
   * The schema key, alongside the Dutch label the chip renders. A filter that
   * wants "this row shows a Yoga Alliance register status" must select on THIS —
   * matching on the rendered label would make a display string load-bearing, and
   * reaching past the chip to a provider-level field is what let the register
   * filter and the register column state opposite things (see yaVerified).
   */
  bodyKey: AccreditationBody;
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
  /**
   * What the Prijs cell is ALLOWED to say — priceQuad(), the same function the
   * provider record's Prijs row uses. NOT the raw `price.published`: on the five
   * programmes that publish a price we do not hold, the raw field renders a bare
   * "ja" in fact ink while the record page says, correctly, "nog niet onderzocht".
   * The row carries the quad, never the raw field, so no consumer can re-derive it.
   */
  priceState: Quad;
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
  /** The Registerstatus column, exactly as rendered: the PROGRAMME's accreditation. */
  registers: RegisterChip[];
  /**
   * CRKBO is a register of institutions and teachers — it is a fact about the
   * SCHOOL, not about this programme, and the chip that filters on it says so
   * ("CRKBO-geregistreerd"). It is deliberately not shown in the Registerstatus
   * column, so there is nothing for it to contradict.
   */
  crkboRegistered: Quad;
  /**
   * Yoga Alliance is per-programme (per RYS), so this is derived from `registers`
   * above — from what the row SHOWS, never from `provider.registrations`. The
   * filter and the column cannot disagree because they read the same value.
   */
  yaVerified: Quad;
  nextCohort: NextCohort | null;
  lastVerified: string;
  hasDisclosure: boolean;
}

export interface DatasetStats {
  providers: number;
  programs: number;
  pphComputable: number;
  /**
   * The verification window across the whole corpus — BOTH ends, never one.
   *
   * This was the max, printed as "records geverifieerd jul 2026". 46 of 48
   * records are 2026-06 and two are 2026-07: the header claimed for the corpus
   * what was true of two records, and re-verifying a single record next year
   * would have re-dated all 48 on the strength of one. A max cannot help but
   * overstate — it is the freshest thing we hold, presented as the state of
   * everything.
   *
   * The oldest end is the only honest floor ("every record is at least this
   * fresh"), so it is always shown; the newest is shown with it, as a range, so
   * the span is visible rather than collapsed to a single flattering date. When
   * both ends fall in the same month the range degenerates to that one month.
   */
  verifiedOldest: string | null;
  verifiedNewest: string | null;
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
 * THE rule of this project, in one function — the only place it may live.
 *
 * A value is missing from our record. Some *_published quad governs whether it
 * could have been there at all. What may the page SAY about the absence?
 *
 * (CLAUDE.md, spec §4): `not_published` is a FINDING ABOUT A NAMED BUSINESS —
 * "we looked; they do not state it". `unknown` is a GAP IN OUR OWN RESEARCH.
 * Publishing a gap as a finding is an accusation we did not earn; publishing a
 * finding as a gap disowns research we did do and sourced. Both are wrong. So
 * the cell says exactly what the record says about the GOVERNING field — no
 * more, and no less.
 *
 * Those fields are all called *published*, and on such a field `no` and
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
 *
 * Every caller — €/contactuur, the hours breakdown, supervised practice, the
 * price amount — routes through here. The rule is stated ONCE.
 */
function missingBecause(published: Quad): Quad {
  return saysNotPublished(published) ? "not_published" : "unknown";
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
function priceAmountIsOurGap(program: Program): boolean {
  return program.price.published === "yes" && program.price.amount_eur == null;
}

/**
 * THE price quad — what any surface, anywhere, may say about a programme's price.
 * The listing cell, the record row and the price filter all call THIS. There is
 * no second derivation, and no consumer is given the raw `price.published` to
 * re-derive one from: that duplication WAS the bug.
 *
 * It says what the record says — `yes`/`no`/`not_published`/`unknown`, verbatim —
 * with exactly one correction, and it runs in the direction that protects the
 * provider: when the record says they DO publish a price but our record holds no
 * amount, the missing value is OURS. A "ja" with no number promises a fact we do
 * not hold; and the finding-vs-gap rule (see missingBecause) says a value missing
 * from a field the provider does publish is a gap in our research, never an
 * omission by them. So it is downgraded to `unknown`.
 *
 * `no` is deliberately NOT rewritten to `not_published` here (as missingBecause
 * does for a *derived* value): on the Prijs cell itself, `no` is the record's own
 * researched, sourced word about that very field — "nee, zij publiceren geen
 * prijs" — and it stays. Both `no` and `not_published` are findings, so anything
 * selecting the finding must accept both: that is saysNotPublished() in quad.ts,
 * which the price filter calls. Neither is a gap.
 *
 * The two failures this prevented, both live before this function existed:
 *   - the listing printed a bare "ja" in fact ink on all five gap programmes,
 *     while their own record pages printed "nog niet onderzocht" — the same site
 *     stating opposite things about the same programme;
 *   - the "niet gepubliceerd" price band selected on `amount == null`, sweeping
 *     those five in and telling the reader that AALO Yoga Academie, de Blikopener,
 *     SanaYou and Yoga Academie Nederland publish no price. Our own record says
 *     they do. That is a false statement about a named business.
 */
export function priceQuad(program: Program): Quad {
  return priceAmountIsOurGap(program) ? "unknown" : program.price.published;
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

function registers(program: Program): RegisterChip[] {
  return program.accreditation.map((a) => ({
    bodyKey: a.body,
    body: nl.body[a.body],
    label: a.label_claimed,
    verified: a.verified,
  }));
}

/**
 * The Yoga Alliance state THIS ROW DISPLAYS, read from the very chips the
 * Registerstatus column renders — never from `provider.registrations`.
 *
 * Yoga Alliance registers a school per RYS, per programme: a provider-level
 * registration says nothing about whether THIS programme is on the register.
 * Filtering on the provider fact while the column showed the programme fact let
 * the "YA register-geverifieerd" chip return six rows whose own cell read "nog
 * niet onderzocht" — the filter and the cell next to it asserting opposite
 * things about a named business, on the same screen.
 *
 * `unknown` when the row shows no YA chip at all: we have not established that
 * this programme is registered. That is a gap, and it is not filterable as a
 * verification.
 */
function yaVerified(chips: RegisterChip[]): Quad {
  const ya = chips.filter((c) => c.bodyKey === "yoga_alliance");
  if (!ya.length) return "unknown";
  if (ya.some((c) => c.verified === "yes")) return "yes";
  if (ya.some((c) => c.verified === "no")) return "no";
  if (ya.some((c) => c.verified === "not_published")) return "not_published";
  return "unknown";
}

export function toListingRows(providers: Provider[], now: Date = new Date()): ListingRow[] {
  const rows: ListingRow[] = [];
  for (const provider of providers) {
    const cities = [...new Set(provider.locations.map((l) => l.city).filter((c): c is string => c != null))];
    for (const program of provider.programs) {
      const pph = pricePerContactHour(program);
      const pphState = pphQuad(program);
      const chips = registers(program);
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
        priceState: priceQuad(program),
        priceDisplay: priceDisplay(program.price),
        pph: pph.value,
        pphDisplay: pph.value != null ? formatEuro2(pph.value) : null,
        pphState,
        pphCaveat: pphCaveatFor(program, pphState),
        registers: chips,
        crkboRegistered: provider.crkbo.registered,
        yaVerified: yaVerified(chips),
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
  const verified = providers.map((p) => p.last_verified).sort();
  return {
    providers: providers.length,
    programs: programs.length,
    pphComputable: programs.filter((p) => pricePerContactHour(p).value != null).length,
    // Both ends. Never just the newest — see DatasetStats.
    verifiedOldest: verified[0] ?? null,
    verifiedNewest: verified.at(-1) ?? null,
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
  contract: QuadRow[];
  /** invoicing_entity + note — provenance for the contract quads, never a quad itself. */
  contractNote: string | null;
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
  /**
   * BOTH slots, always — "publiek ✓ · lokaal —". The publication bar is *both* a
   * public archive AND a dated local copy, so showing only the halves we have
   * lets a source that meets half the bar read as if it met all of it (104 of
   * 220 sources actually meet it; 108 more carried a quiet single ✓). Null when
   * NEITHER exists: the page prints the below-the-bar stamp instead.
   *
   * Not a quad, and deliberately not phrased as one: this is a fact about OUR
   * record, not a finding about the provider. Many local-only sources are
   * legitimate — Yoga Alliance and CRKBO registers are JS-rendered or excluded
   * from Wayback, so a browser-rendered local capture is the only evidence
   * possible. Showing the missing half is reporting, not criticism.
   */
  archiveSlots: string | null;
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
  /** Counted separately, and both are printed: neither number alone is the bar. */
  sourcesArchivedPublic: number;
  sourcesArchivedLocal: number;
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

/**
 * The contract quads, each one its own row — because each one is its own quad.
 *
 * These used to be flattened into a single "Voorwaarden" row: three quad LABELS
 * joined into a sentence and handed to the page as one `state: "yes"`. That
 * rendered two genuine `not_published` findings in fact ink, and would have
 * rendered a future `unknown` — a gap — as an established fact. A quad becomes
 * pixels in exactly one place (<Quad>); the only way to keep that true is to
 * hand the page the quads themselves.
 *
 * Rendered on EVERY programme, like coherence and transparency: 12 of 77 records
 * carry a `contract` object at all, and the emptiness is itself worth seeing.
 */
function contractRows(program: Program): QuadRow[] {
  const c = program.contract;
  return (Object.keys(nl.contract) as (keyof typeof nl.contract)[]).map((key) => ({
    key,
    label: nl.contract[key],
    state: q(c?.[key]),
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

  // The listing's Prijs cell renders priceQuad() too — the same function, not a
  // second reading of the same field. "Prijs: ja" with no amount is a promise the
  // row cannot keep, and it asserts as an established fact something our record
  // does not hold; the note says whose gap that is, rather than leaving the reader
  // to infer an omission by the provider.
  rows.push({
    label: nl.colPrice,
    value: priceDisplay(program.price),
    state: priceQuad(program),
    note: joinDot([
      priceAmountIsOurGap(program) && nl.priceAmountNotInRecord,
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

  // The quote is the provider's own words, and where `exists` is a FINDING it is
  // the *evidence for* that finding ("Na afronding ontvang je een RYT-200
  // certificaat" — a certificate promised, no assessment described). <Quad>
  // renders children only for a fact, so on the six such programmes that quote
  // was being dropped on the floor. It goes in the note, which always renders.
  const assessment = program.assessment_described;
  const assessmentState = q(assessment?.exists);
  const quoteRendersAsValue = quadClass(assessmentState) === "fact";
  rows.push({
    label: nl.rowAssessment,
    value: assessment?.quote ?? null,
    state: assessmentState,
    note: assessment?.quote && !quoteRendersAsValue ? `“${assessment.quote}”` : null,
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

/**
 * The two halves of the publication bar, spelled out — a present half and an
 * absent half are equally visible. Null when there is neither: the page then
 * prints the below-the-bar stamp instead of two empty slots.
 */
function archiveSlots(s: Source): string | null {
  if (s.archived_url == null && s.local_snapshot == null) return null;
  const mark = (present: boolean) => (present ? nl.archivePresent : nl.archiveAbsent);
  return [
    `${nl.archivePublic} ${mark(s.archived_url != null)}`,
    `${nl.archiveLocal} ${mark(s.local_snapshot != null)}`,
  ].join(" · ");
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
      contract: contractRows(program),
      contractNote: joinDot([
        program.contract?.invoicing_entity && `${nl.contractInvoices}: ${program.contract.invoicing_entity}`,
        program.contract?.note,
      ]),
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
      archiveSlots: archiveSlots(s),
    })),
    sourcesArchivedPublic: p.sources.filter((s) => s.archived_url != null).length,
    sourcesArchivedLocal: p.sources.filter((s) => s.local_snapshot != null).length,
  };
}
