/**
 * Pure Provider → view-model. No file reads, no side effects, and no business
 * logic that belongs elsewhere: `loader.ts` owns validation, `derive.ts` owns the
 * derived values (spec §6), `rules.ts` owns the finding-vs-gap rule. This module
 * owns *display*: the strings a component renders, and nothing else.
 *
 * It is PURE — it reaches `derive.ts` and `rules.ts`, never `loader.ts` — so a
 * client component may import values from it, not merely types.
 */
import { bundleDelta, pricePerContactHour, totalPrice } from "./derive";
import {
  missingBecause,
  pphBlocker,
  pphQuad,
  priceAmountIsOurGap,
  priceBand,
  priceQuad,
  type PriceBand,
} from "./rules";
import { nl } from "./strings";
import type { Claim, Cohort, Program, Provider, Quad, Source } from "../schema";

/**
 * The next cohort — its START and its STATUS, never a pre-baked label.
 *
 * It used to carry `label: string` with the status word already cooked into it,
 * which made a label that CONTRADICTS its own status structurally constructible:
 * `{ start: "2026-09", status: "announced", label: "start sep 2026 — gestart" }`
 * type-checks perfectly. An announced cohort presented as one that ran is spec §8's
 * central trap, and only the discipline of the single constructor was stopping a
 * second one from doing it. The label is now DERIVED at render, from these two
 * fields, by nextCohortLabel() — so it cannot disagree with the status it names.
 */
export interface NextCohort {
  start: string;
  status: Cohort["status"];
}

/** The one way a next-cohort label is written. Its status is not optional. */
export function nextCohortLabel(c: NextCohort): string {
  return nl.nextCohortLabel(formatMonth(c.start), nl.cohortStatus[c.status]);
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
  /**
   * What the Prijs cell is ALLOWED to say — priceQuad(), the same function the
   * provider record's Prijs row uses. NOT the raw `price.published`: on the five
   * programmes that publish a price we do not hold, the raw field renders a bare
   * "ja" in fact ink while the record page says, correctly, "nog niet onderzocht".
   * The row carries the quad, never the raw field, so no consumer can re-derive it.
   */
  priceState: Quad;
  /**
   * The band this row belongs to, DERIVED HERE — the row does not carry the raw
   * amount for a filter to band it up again.
   *
   * `priceAmount: number | null` used to sit right here, and `r.priceAmount == null`
   * is PRECISELY the expression that told readers four named businesses publish no
   * price. It was the surviving half of the bug `priceState` was introduced to kill:
   * its only consumers were two band checks in filters.ts, but a contributor adding
   * a "prijs onbekend" chip would have found it sitting there, reading naturally and
   * type-checking, and re-created the false statement verbatim. Banding is the
   * price rule, the price rule lives in rules.ts, and the row carries only its
   * verdict — so filterRows collapses to one equality and can re-derive nothing.
   */
  priceBand: PriceBand;
  /** WHAT THE PROVIDER PUBLISHES, with the unit they attached to it — "€ 1.290 /
   *  studiejaar". Never our total: that is the field below, and the two must never
   *  be rendered as one number. */
  priceDisplay: string | null;
  /**
   * OUR ARITHMETIC over a per-period price — "± € 5.160 totaal — onze berekening: 4 ×
   * € 1.290" — or null when the price already IS a total (53 of 54 programmes) or no
   * total is derivable at all.
   *
   * A SEPARATE FIELD, and it is separate on purpose: folding it into `priceDisplay`
   * would hand the component one string to print in one ink, and the derived half
   * would arrive at the reader wearing the provider's colours — a figure de Blikopener
   * has never published, presented as theirs. The component renders this in its own,
   * visibly non-factual style (see ProgrammeTable). Spec §6: rendered as OUR
   * arithmetic, with the working shown, never as the school's claim.
   */
  priceDerivedTotal: string | null;
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

/**
 * The verification window across the whole corpus — BOTH ends, never one.
 *
 * The stat was once the max, printed as "records geverifieerd jul 2026". When that
 * was written, 46 of 48 records were 2026-06 and two were 2026-07: the header
 * claimed for the corpus what was true of two records, and re-verifying a single
 * record next year would have re-dated all 48 on the strength of one. A max cannot
 * help but overstate — it is the freshest thing we hold, presented as the state of
 * everything.
 *
 * The oldest end is the only honest floor ("every record is at least this fresh"),
 * so it is always shown; the newest is shown with it, as a range, so the span is
 * visible rather than collapsed to a single flattering date. When both ends fall in
 * the same month the range degenerates to that one month.
 *
 * ONE nullable object, not two independent nullables. As `verifiedOldest: string |
 * null` + `verifiedNewest: string | null`, "both or neither" was unexpressed — half
 * a window is representable, and app/page.tsx had to guard both ends to print one
 * line. An empty corpus has no window at all; a non-empty one always has both ends.
 */
export interface VerificationWindow {
  oldest: string;
  newest: string;
}

export interface DatasetStats {
  providers: number;
  programs: number;
  pphComputable: number;
  /** null ONLY when there are no records at all. Never half a window. */
  verified: VerificationWindow | null;
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

const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

/**
 * "2026-09" → "sep 2026". Month-precision only; never invents a day.
 *
 * It used to fall back to the raw input, so a malformed month printed ITSELF:
 * "2026-13" appeared on the page, under "Cohorten", as the start date of a
 * training someone might plan a year around. A date the reader cannot parse is not
 * a smaller failure than a crash — it is the same failure, published.
 *
 * This throw is an ASSERTION, not a data check — and that distinction only became
 * true in spec v0.3. The old YearMonth regex was /^\d{4}-\d{2}(-\d{2})?$/, which
 * accepts "2026-13": a typo'd month was schema-VALID data that sailed through
 * `npm run validate` and detonated here instead, deep inside `next build`, as a
 * stack trace rather than a named record and field. That is a validation job
 * landing in a formatter.
 *
 * The month range is now checked where it belongs (YearMonth, schema §4), so
 * `validate` names the offending record. By the time a value reaches this
 * function it has been validated, so anything that fails here is a bug in OUR
 * slicing above the call — never a fact about a provider. Fail loudly at build
 * time, the same posture as unhandledQuad in quad.ts.
 */
export function formatMonth(ym: string): string {
  const [y, m] = ym.split("-");
  const name = MONTHS[Number(m) - 1];
  if (!name || !/^\d{4}$/.test(y ?? "")) {
    throw new Error(
      `formatMonth: "${ym}" is not a YYYY-MM month. Rendering it verbatim would publish a malformed ` +
        `date to a reader. The month range is validated by YearMonth (schema §4), so this is a bug in ` +
        `the slicing above this call, not a bad record — if it IS a bad record, YearMonth has regressed.`,
    );
  }
  return `${name} ${y}`;
}

function cityDisplay(p: Provider): string {
  const cities = p.locations.map((l) => l.city).filter((c): c is string => c != null);
  return cities.length ? [...new Set(cities)].join(" · ") : nl.cityNotListed;
}

/**
 * The hour-format label a programme carries — and `none` is NOT one.
 *
 * `other` and `none` both used to render "eigen vorm" ("own form"), stamped in
 * fact ink. For `other` that is what the record says: the programme uses an hour
 * format outside 200/300/500. For `none` it is an INVENTED CLAIM — `none` means
 * the programme carries no hour-format label AT ALL, and "they use their own form"
 * is a statement about a named business that the record does not make. It is not
 * even the honest opposite: we are not told they have a form of their own.
 *
 * It also collapsed two disjoint filter sets into two identical-looking chips: a
 * reader would have met "eigen vorm" twice in one chip row, each returning
 * different programmes, with nothing on screen to tell them apart. No record uses
 * `none` today — which is precisely why both bugs were invisible.
 *
 * `none` now says what the record says: there is no label. Which is a fact about
 * the PROGRAMME, not a gap in our research (`format_label` is required by the
 * schema — a programme with no label is recorded as `none`, not left un-set).
 */
export function formatDisplay(f: Program["format_label"]): string {
  if (f === "other") return nl.formatOther;
  if (f === "none") return nl.formatNone;
  return `${f} ${nl.hourSuffix}`;
}

/**
 * The same label, shortened for a filter chip ("200", not "200 u"). Exported
 * because the chip list is DERIVED FROM THE DATA in filters.ts — see chipGroups —
 * and a chip whose label does not distinguish it from the chip beside it is a
 * filter the reader cannot use.
 */
export function formatChipLabel(f: Program["format_label"]): string {
  if (f === "other") return nl.formatOther;
  if (f === "none") return nl.formatNone;
  return f;
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
  const money = formatEuro(p.amount_eur);
  // The unit is part of the fact (spec v0.5). "€ 1.290" under a column headed "Prijs"
  // states what a four-year training costs; "€ 1.290 / studiejaar" states what they
  // actually publish. The suffix is the whole difference between the two.
  const amount = p.period === "total" ? money : nl.pricePerPeriod(money, nl.pricePeriod[p.period]);
  const base = `${amount} · ${nl.vat[p.vat]}`;
  const extra = p.variants?.length ? ` · ${nl.priceVariants(p.variants.length + 1)}` : "";
  return base + extra;
}

/**
 * The whole-course figure WE computed, or null when there is nothing of ours to show
 * — the price is already a total, or no total is derivable.
 *
 * `derived: false` returns null deliberately: on 53 of 54 programmes our "total" IS
 * their published amount, and printing it twice would be a second, redundant claim.
 * This field exists only where the numbers differ, which is exactly where the reader
 * needs to be told whose number it is.
 */
function priceDerivedTotalDisplay(program: Program): string | null {
  const total = totalPrice(program);
  if (!total.derived || total.value == null || total.caveat == null) return null;
  return nl.priceDerivedTotal(formatEuro(total.value), total.caveat);
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
  const blocker = pphBlocker(program).field;
  // The v0.5 blocker: they publish a price, and it is not a total. Neither of the two
  // sentences below would be true of them — "geen prijs" is false, "geen contacturen"
  // names the wrong field — so it has a sentence of its own, naming the period count.
  if (blocker === "price_total") return nl.pphNoTotalPrice(nl.pricePeriod[program.price.period]);
  const priceIsBlocker = blocker === "price";
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
  return { start: c.start.slice(0, 7), status: c.status };
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
        priceState: priceQuad(program),
        priceBand: priceBand(program),
        priceDisplay: priceDisplay(program.price),
        priceDerivedTotal: priceDerivedTotalDisplay(program),
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
  const dates = providers.map((p) => p.last_verified).sort();
  const oldest = dates[0];
  const newest = dates.at(-1);
  return {
    providers: providers.length,
    programs: programs.length,
    pphComputable: programs.filter((p) => pricePerContactHour(p).value != null).length,
    // Both ends, or neither — see VerificationWindow. A sorted non-empty array has
    // both, so the window is null exactly when the corpus is empty.
    verified: oldest != null && newest != null ? { oldest, newest } : null,
  };
}

/* ---------- The provider record ---------- */

/**
 * THE citation. A `source` id, or null where the schema holds none for that field.
 *
 * The dataset carries 361 source references and NOT ONE of them used to reach the
 * page, while /methodologie told the reader "Bij elk gegeven staat een bron en een
 * datum … je kunt elke bron zelf naslaan" and every page's <meta description> said
 * "Bronnen bij elk gegeven". The site asserted a standard the page it linked to
 * did not meet. Two of these refs — `claim.source` and `cohort.source` — are
 * REQUIRED by the schema, whose comment reads "the source makes the difference
 * between claim and fact"; a claim published without its source is exactly the
 * fact/claim collapse the whole model exists to prevent.
 *
 * The page renders it as a link to `#bron-<id>` in the Sources section.
 * dataset.ts's referential-integrity check already guarantees that every `source:`
 * ref resolves to an entry in that provider's `sources[]` — the dataset does not
 * load otherwise, and the build gate refuses invalid data — so the anchor can
 * never dangle. Nothing here re-checks it.
 */
type SourceRef = string | null;

export interface QuadRow {
  key: string;
  label: string;
  state: Quad;
  /**
   * The established value, when the quad governs one and the record holds it —
   * `contract.min_participants` is a quad (`clause`) PLUS a number. null → <Quad>
   * renders the state word instead. Same contract as KeyValueRow.value.
   */
  value: string | null;
  note: string | null;
  source: SourceRef;
}

/**
 * A labelled row: a state, and — when the state is a fact we hold — the value it
 * asserts. The two are ONE thing, so the type ties them together.
 *
 * It used to be `{ value: string | null; state: Quad }` — two independent fields,
 * and both illegal pairings were representable:
 *
 *   { state: "yes", value: null }  → <Quad> renders children only for a fact WITH
 *     children, so this falls through to a bare “ja” in FACT INK: an established
 *     fact asserted about a named business with nothing whatsoever behind it. That
 *     is the bug that shipped on five providers' Prijs cells.
 *
 *   { state: "not_published", value: "…" } → a non-fact drops its children on the
 *     floor. That is the bug that ate six providers' verbatim assessment quotes —
 *     the very evidence for the finding beside them.
 *
 * Both were still reachable at the assessment row, the one row whose value and
 * state come from DIFFERENT record fields (`quote` vs `exists`): the schema makes
 * `exists` required and `quote` optional, so `{ exists: "yes" }` with no quote is
 * schema-legal and printed “Toetsing — ja”, in fact ink, backed by nothing. No
 * record has that shape today; nothing but luck was holding it back.
 *
 * Now: a fact ALWAYS carries what it asserts, and a non-fact NEVER carries a value
 * the page would silently drop (it goes in the `note`, which always renders).
 * Neither illegal shape compiles.
 */
export type KeyValueRow = { label: string; note: string | null; source: SourceRef } & (
  | { state: "yes"; value: string }
  /** No value to show → <Quad> renders the state word. `no` belongs here: on the
   *  fields these rows read, “nee” IS the whole statement. */
  | { state: "no" | "not_published" | "unknown"; value?: never }
);

/**
 * A cohort on the record page. Like NextCohort, it carries `start` + `status` and
 * NO pre-baked label: a stored label is structurally free to contradict the status
 * beside it, and "an announced cohort presented as one that ran" is spec §8's
 * central trap. cohortLabel() derives it, so it cannot.
 */
export interface CohortView {
  id: string;
  start: string;
  status: Cohort["status"];
  note: string | null;
  /** REQUIRED by the schema (spec §8): an announced cohort is not one that ran,
   *  and only the source can tell a reader which this is. Never null. */
  source: string;
}

/** The one way a cohort label is written. Its status is not optional. */
export function cohortLabel(c: Pick<CohortView, "start" | "status">): string {
  return nl.cohortLabel(formatMonth(c.start.slice(0, 7)), nl.cohortStatus[c.status]);
}

export interface AccreditationView {
  /**
   * The schema key, carried ALONGSIDE the Dutch label — exactly as RegisterChip
   * carries it, and for the identical reason. `body` is `nl.body[a.body]`, a
   * DISPLAY STRING: any future selection on this view ("does this record show a
   * Yoga Alliance accreditation?") would have had to compare `body === "Yoga
   * Alliance"`, making a translatable label load-bearing. That is the shape of the
   * YA-filter bug, which asserted one thing in a chip and the opposite in the cell
   * beside it. Select on `bodyKey`; render `body`.
   */
  bodyKey: AccreditationBody;
  body: string;
  /** The register label the provider CLAIMS ("RYS 200"), verbatim — not our words. */
  label: string;
  verified: Quad;
  note: string | null;
  source: SourceRef;
}

/** The schema's registration body key — the raw value, not its Dutch label. */
type RegistrationBody = Provider["registrations"][number]["body"];

/** A register the SCHOOL is on (as opposed to a programme's accreditation above).
 *  Carries `bodyKey` for the same reason AccreditationView does. */
export interface RegistrationView {
  bodyKey: RegistrationBody;
  body: string;
  identifier: string | null;
  holder: string | null;
  firstRegistered: string | null;
  verified: Quad;
  note: string | null;
  source: SourceRef;
}

/** CRKBO is a register of INSTITUTIONS and teachers — a fact about the school,
 *  never about a programme. It is deliberately not shown in a programme's
 *  Registerstatus column, so there is nothing there for it to contradict. */
export interface CrkboView {
  registered: Quad;
  register: string | null;
  holder: string | null;
  checked: string | null;
  note: string | null;
  source: SourceRef;
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
  accreditation: AccreditationView[];
  cohorts: CohortView[];
  /**
   * The claims whose `scope` is `program:<this id>` — rendered HERE, under the
   * programme they were made about, never in one flat provider-level list.
   *
   * yoga-moves has three programmes and six claims, two of them provider-level
   * and four spread across the three programmes. Flattened, a reader comparing
   * the 200-hour training met a claim made on the 300-hour page and attributed it
   * to the 200. dataset.ts validates that `scope` resolves to a real programme
   * precisely so the claim stays anchored to it; the view used to populate
   * ClaimView.scope and then never read it, discarding the anchor.
   */
  claims: ClaimView[];
}

export interface ClaimView {
  id: string;
  quote: string;
  category: string;
  /** The raw scope, verbatim from the record: "provider" | "program:<id>" | "module:<id>". */
  scope: string;
  /** That scope in Dutch — the programme's own name where it names one. */
  scopeLabel: string;
  /** REQUIRED by the schema: a claim without its source is not a claim, it is gossip. */
  source: string;
  analysis: { note: string; status: string; reviewed: string; methodologyVersion: string } | null;
}

export interface SourceView {
  id: string;
  type: string;
  url: string | null;
  captured: string;
  note: string | null;
  /**
   * BOTH slots, always — "publiek ✓ · lokaal —". The publication bar is *both* a
   * public archive AND a dated local copy, so showing only the halves we have
   * lets a source that meets half the bar read as if it met all of it (when this
   * was written, 104 of 220 sources actually met it, and 108 more carried a quiet
   * single ✓). Null when NEITHER exists: the page prints the below-the-bar stamp
   * instead.
   *
   * This is the ONLY archive state on the view. It used to sit beside two
   * booleans (`archivePublic` / `archiveLocal`) that no surface read — the page
   * branches on this string — and two spellings of one fact can only ever drift
   * apart. Whoever needs the halves separately reads the record's `archived_url`
   * and `local_snapshot`, which are the fact itself.
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
  crkbo: CrkboView;
  registrations: RegistrationView[];
  programs: ProgramView[];
  /**
   * ONLY the claims that are not about one of the programmes above — `scope:
   * provider`, and any module-scoped claim. A programme's claims live on the
   * programme (ProgramView.claims). Between the two, every claim in the record is
   * rendered exactly once, under the thing it was actually said about.
   */
  claims: ClaimView[];
  sources: SourceView[];
  /** Counted separately, and both are printed: neither number alone is the bar. */
  sourcesArchivedPublic: number;
  sourcesArchivedLocal: number;
}

/** An absent optional object is a gap, never a finding (spec §2.2). */
function q(v: Quad | undefined): Quad {
  return v ?? "unknown";
}

/**
 * The quad a row with NO value may carry — and "yes" is not among them.
 *
 * A fact with nothing behind it asserts something our record does not hold; if we
 * ever reach that state, the missing value is OURS, so it is a gap (the identical
 * correction priceQuad makes, rule 1 — never the amber accusation). The type
 * already forbids the pairing; this is the one place that decides what to render
 * instead of it, rather than each caller inventing an answer.
 */
function noValue(state: Quad): Exclude<Quad, "yes"> {
  return state === "yes" ? "unknown" : state;
}

/**
 * A row whose label promises a VALUE, not a yes/no ("Groepsgrootte", "Track
 * record", …). With no value there is nothing established, so it is a gap —
 * never a bare "ja", which would assert a fact we do not hold, and never
 * "niet gepubliceerd": no *_published field governs these rows, so nothing in
 * the record licenses an accusation about them.
 */
function fact(
  label: string,
  value: string | null | undefined,
  note?: string | null,
  source?: SourceRef | undefined,
): KeyValueRow {
  const common = { label, note: note ?? null, source: source ?? null };
  return value == null
    ? { ...common, state: "unknown" }
    : { ...common, state: "yes", value };
}

const joinDot = (parts: (string | false | null | undefined)[]): string | null =>
  parts.filter(Boolean).join(" · ") || null;

function coherenceRows(program: Program): QuadRow[] {
  const cs = program.coherence_signals;
  return (Object.keys(nl.coherence) as (keyof typeof nl.coherence)[]).map((key) => ({
    key,
    label: nl.coherence[key],
    state: q(cs?.[key]),
    value: null,
    note: cs?.[`${key}_note`] ?? null,
    source: cs?.source ?? null,
  }));
}

function transparencyRows(program: Program): QuadRow[] {
  const t = program.transparency;
  return (Object.keys(nl.transparency) as (keyof typeof nl.transparency)[]).map((key) => ({
    key,
    label: nl.transparency[key],
    state: q(t?.[key]),
    value: null,
    note: null,
    source: t?.source ?? null,
  }));
}

/**
 * The quad-bearing keys of the schema's `contract` object — DERIVED FROM THE
 * SCHEMA, not from the label map.
 *
 * A key is quad-bearing when its value is a Quad, or an object that wraps one
 * (`min_participants: { clause: Quad, value?: number }`). `invoicing_entity`,
 * `source` and `note` are strings and are excluded by the type itself.
 *
 * This is the fix for the drift, not just for its symptom. contractRows() used to
 * iterate the keys of `nl.contract`, which had three of the schema's four:
 * `min_participants` — the clause under which a training someone has already paid
 * for gets CANCELLED — was researched on six records and sourced on all six, and
 * rendered nowhere. One of them (centre-body-mind) carries `clause: not_published`:
 * a sourced finding about a named business, silently dropped. TypeScript could not
 * see it, because a schema key with no label is invisible to a map keyed by labels.
 * Keyed the other way round, as below, a schema key with no label is a COMPILE
 * ERROR — and the test derives its key list from the schema shape at runtime too,
 * so neither half can drift again.
 */
type ContractObject = NonNullable<Program["contract"]>;
type ContractQuadKey = {
  [K in keyof ContractObject]-?: NonNullable<ContractObject[K]> extends Quad | { clause: Quad }
    ? K
    : never;
}[keyof ContractObject];

/** Add a quad key to `contract` in the schema without a label here → this line fails to compile. */
const CONTRACT_LABELS: Record<ContractQuadKey, string> = nl.contract;

/**
 * The contract quads, each one its own row — because each one is its own quad.
 *
 * These used to be flattened into a single "Voorwaarden" row: quad LABELS joined
 * into a sentence and handed to the page as one `state: "yes"`. That rendered two
 * genuine `not_published` findings in fact ink, and would have rendered a future
 * `unknown` — a gap — as an established fact. A quad becomes pixels in exactly one
 * place (<Quad>); the only way to keep that true is to hand the page the quads
 * themselves.
 *
 * Rendered on EVERY programme, like coherence and transparency: when this was
 * written, 12 of 77 records carried a `contract` object at all, and the emptiness
 * is itself worth seeing.
 *
 * `min_participants` is the odd one: its quad is `clause` ("is there such a
 * clause?") and it may carry a number with it. The number rides as the row's
 * `value`, so <Quad> shows "minimaal 6 deelnemers" where the record holds one and
 * the plain state word where it does not — the clause still governs the colour.
 * Note that `clause: "no"` here is a genuine FACT ("there is no such clause"), not
 * a *_published field, so it is never normalised to a finding — see priceQuad.
 */
function contractRows(program: Program): QuadRow[] {
  const c = program.contract;
  // One source for the whole `contract` object — the schema puts it there, so
  // every row it produces carries it.
  const source = c?.source ?? null;
  return (Object.keys(CONTRACT_LABELS) as ContractQuadKey[]).map((key) => {
    if (key === "min_participants") {
      const mp = c?.min_participants;
      return {
        key,
        label: CONTRACT_LABELS[key],
        state: q(mp?.clause),
        value: mp?.value != null ? nl.minParticipants(mp.value) : null,
        note: null,
        source,
      };
    }
    return { key, label: CONTRACT_LABELS[key], state: q(c?.[key]), value: null, note: null, source };
  });
}

function programRows(provider: Provider, program: Program): KeyValueRow[] {
  const h = program.hours_claimed;
  const pphState = pphQuad(program);
  const pph = pricePerContactHour(program);
  const delta = bundleDelta(provider, program);
  const rows: KeyValueRow[] = [];

  // These three are read off the programme's own identity (its format label, the
  // style it claims, how it is delivered) and the schema holds no `source` for
  // any of them — so they carry none. A citation is invented for nothing here.
  rows.push(fact(nl.colFormat, formatDisplay(program.format_label)));
  rows.push(fact(nl.rowStyle, program.style_claimed));
  rows.push(fact(nl.colDelivery, deliveryDisplay(program.delivery)));

  // The listing's Prijs cell renders priceQuad() too — the same function, not a
  // second reading of the same field. "Prijs: ja" with no amount is a promise the
  // row cannot keep, and it asserts as an established fact something our record
  // does not hold; the note says whose gap that is, rather than leaving the reader
  // to infer an omission by the provider. The type now makes that promise
  // unbreakable: a "yes" that has no amount to show cannot be constructed at all.
  const priceState = priceQuad(program);
  const priceValue = priceDisplay(program.price);
  const priceNote = joinDot([
    priceAmountIsOurGap(program) && nl.priceAmountNotInRecord,
    program.price.includes && `${nl.priceIncludes}: ${program.price.includes}`,
    program.price.excludes && `${nl.priceExcludes}: ${program.price.excludes}`,
    program.price.note,
  ]);
  const priceSource = program.price.source ?? null;
  rows.push(
    priceState === "yes" && priceValue != null
      ? { label: nl.colPrice, state: "yes", value: priceValue, note: priceNote, source: priceSource }
      : { label: nl.colPrice, state: noValue(priceState), note: priceNote, source: priceSource },
  );

  // THE WHOLE-COURSE FIGURE, on the programmes that publish no such figure (spec v0.5).
  //
  // Only where `period` is not `total` — elsewhere the derived total IS the amount in
  // the row above, and a second row printing the same number would be a second claim.
  //
  // NO CITATION, exactly like €/contactuur below: this is OUR arithmetic (spec §6).
  // Pinning de Blikopener's tarievenpagina to "± € 5.160" would credit them with a
  // figure they have never published — the precise fabrication the field exists to
  // prevent. The label says whose sum it is; the note shows the working, so a reader
  // can check it. With no period count there is no total, and the row states that as
  // the finding it is: they publish a price per studiejaar and no count of them.
  if (program.price.period !== "total") {
    const total = totalPrice(program);
    const periodLabel = nl.pricePeriod[program.price.period];
    rows.push(
      total.value != null
        ? {
            label: nl.rowTotalPrice,
            state: "yes",
            value: `± ${formatEuro(total.value)}`,
            note: total.caveat ?? null,
            source: null,
          }
        : {
            label: nl.rowTotalPrice,
            state: "not_published",
            note: nl.totalPriceNoPeriodCount(periodLabel),
            source: null,
          },
    );
  }

  // The same epistemic rule as the listing's €/contactuur column, from the same
  // pair of helpers — the record must never say something the listing does not.
  //
  // No citation: this is a DERIVED value (spec §6), computed by us from the price
  // and the hours, each of which carries its own source in the row above and the
  // row below. Pinning one of those two sources to our own arithmetic would credit
  // the provider with a number they never published.
  const pphValue = pph.value != null ? formatEuro2(pph.value) : null;
  const pphNote = pphCaveatFor(program, pphState);
  rows.push(
    pphState === "yes" && pphValue != null
      ? { label: nl.colPph, state: "yes", value: pphValue, note: pphNote, source: null }
      : { label: nl.colPph, state: noValue(pphState), note: pphNote, source: null },
  );

  const hoursValue = joinDot([
    h.total != null && `${h.total} ${nl.hoursTotal}`,
    h.contact != null && `${h.contact} ${nl.hoursContact}`,
    h.self_study != null && `${h.self_study} ${nl.hoursSelfStudy}`,
  ]);
  rows.push(
    hoursValue != null
      ? { label: nl.rowHours, state: "yes", value: hoursValue, note: h.note ?? null, source: h.source ?? null }
      : {
          label: nl.rowHours,
          // THE rule, not a literal: 71 programmes publish no supervised-practice
          // figure and 4 publish no hours at all, and what the page may SAY about
          // each absence is what the record says about the breakdown that would
          // have carried it. (See missingBecause. The row below is where hard-coding
          // "not_published" here would have accused six named businesses.)
          state: missingBecause(h.breakdown_published),
          note: h.note ?? null,
          source: h.source ?? null,
        },
  );

  // The §5 field. Its emptiness across the market is the finding — so it gets
  // its own row on every programme, always. With no number, the row says what
  // the record says about the breakdown that would have carried it: a finding
  // when they publish none, a gap in OUR record when they do and we lack it.
  // SIX programmes are the second kind (breakdown_published: yes, no supervised
  // figure). A literal "not_published" here reads as a finding about each of them.
  const supervised = h.supervised_teaching_practice;
  // Same field as the row above: the schema puts one source on hours_claimed.
  const hoursSource = h.source ?? null;
  rows.push(
    supervised != null
      ? {
          label: nl.rowSupervised,
          state: "yes",
          value: `${supervised} ${nl.hoursSuffixLong}`,
          note: null,
          source: hoursSource,
        }
      : { label: nl.rowSupervised, state: missingBecause(h.breakdown_published), note: null, source: hoursSource },
  );

  // The quote is the provider's own words, and where `exists` is a FINDING it is
  // the *evidence for* that finding ("Na afronding ontvang je een RYT-200
  // certificaat" — a certificate promised, no assessment described). <Quad>
  // renders children only for a fact, so on the six such programmes that quote
  // was being dropped on the floor. It goes in the note, which always renders.
  //
  // This is the one row whose value and state come from two DIFFERENT record
  // fields (`quote` vs `exists`), which is why both illegal shapes lived here
  // longest. The row now has to say what it means: the quote is the value only
  // when it IS the fact ("ja" — and here is what they describe); otherwise the
  // state stands alone and the quote is the evidence beneath it. An `exists: yes`
  // with no quote is a fact we do not hold — our gap, never their omission.
  const assessment = program.assessment_described;
  const assessmentState = q(assessment?.exists);
  const quote = assessment?.quote ?? null;
  // The schema's `assessment_described` has no `source` field — so this row
  // shows none. It does not borrow one it was never given.
  rows.push(
    assessmentState === "yes" && quote != null
      ? { label: nl.rowAssessment, state: "yes", value: quote, note: null, source: null }
      : {
          label: nl.rowAssessment,
          state: noValue(assessmentState),
          note: quote != null ? `“${quote}”` : null,
          source: null,
        },
  );

  rows.push(fact(
    nl.rowGroupSize,
    joinDot([
      program.group_size_claimed?.min != null && nl.groupSizeMin(program.group_size_claimed.min),
      program.group_size_claimed?.max != null && nl.groupSizeMax(program.group_size_claimed.max),
    ]),
    program.group_size_claimed?.note,
    program.group_size_claimed?.source,
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
      program.track_record.source,
    ));
  }

  return rows;
}

/**
 * A claim's scope, in Dutch. `program:<id>` resolves to the programme's NAME —
 * dataset.ts's integrity check guarantees the id resolves, so the fallback below
 * is unreachable in a dataset that loads at all; it exists only so this function
 * is total.
 */
function scopeLabel(provider: Provider, scope: string): string {
  if (scope === "provider") return nl.claimScopeProvider;
  const programId = scope.startsWith("program:") ? scope.slice("program:".length) : null;
  if (programId) return provider.programs.find((p) => p.id === programId)?.name ?? scope;
  const moduleId = scope.startsWith("module:") ? scope.slice("module:".length) : null;
  if (moduleId) return nl.claimScopeModule(provider.modules.find((m) => m.id === moduleId)?.name ?? moduleId);
  return scope;
}

function toClaimView(provider: Provider, c: Claim): ClaimView {
  return {
    id: c.id,
    quote: c.quote, // VERBATIM. Never touch this.
    category: nl.claimCategory[c.category],
    scope: c.scope,
    scopeLabel: scopeLabel(provider, c.scope),
    source: c.source, // required by the schema — a claim without one is not a claim
    analysis: c.analysis
      ? {
          note: c.analysis.note,
          status: nl.analysisStatus[c.analysis.status],
          reviewed: c.analysis.reviewed,
          methodologyVersion: c.analysis.methodology_version,
        }
      : null,
  };
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
      source: p.crkbo.source ?? null,
    },
    registrations: p.registrations.map((r) => ({
      bodyKey: r.body,
      body: nl.body[r.body],
      identifier: r.identifier ?? null,
      holder: r.holder ?? null,
      firstRegistered: r.first_registered ?? null,
      verified: r.verified_in_register,
      note: r.note ?? null,
      source: r.source ?? null,
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
        bodyKey: a.body, // the key, so no future selection has to match a Dutch label
        body: nl.body[a.body],
        label: a.label_claimed,
        verified: a.verified,
        note: a.note ?? null,
        source: a.source ?? null,
      })),
      // No `label`: the page calls cohortLabel(). A stored label can contradict its
      // own status; a derived one cannot (spec §8).
      cohorts: (program.cohorts ?? []).map((c) => ({
        id: c.id,
        start: c.start,
        status: c.status,
        note: c.note ?? null,
        source: c.source, // required by the schema (spec §8)
      })),
      // The claims made about THIS programme, anchored by the scope the record
      // gives them and dataset.ts validates. See ProgramView.claims.
      claims: p.claims.filter((c) => c.scope === `program:${program.id}`).map((c) => toClaimView(p, c)),
    })),
    // Everything the programmes above did not take: provider-level claims, and
    // module-scoped ones. Together the two lists are a partition of p.claims —
    // every claim is rendered exactly once, and none is dropped.
    claims: p.claims
      .filter((c) => !p.programs.some((program) => c.scope === `program:${program.id}`))
      .map((c) => toClaimView(p, c)),
    sources: p.sources.map((s: Source) => ({
      id: s.id,
      type: nl.sourceType[s.type],
      url: s.url ?? null,
      captured: s.captured,
      note: s.note ?? null,
      archiveSlots: archiveSlots(s),
    })),
    sourcesArchivedPublic: p.sources.filter((s) => s.archived_url != null).length,
    sourcesArchivedLocal: p.sources.filter((s) => s.local_snapshot != null).length,
  };
}
