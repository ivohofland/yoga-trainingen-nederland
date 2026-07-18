/**
 * The public JSON API payload (spec §1) — `public/data/v1/providers.json`.
 *
 * CLAUDE.md calls that file "the API… designed so a future frontend under a
 * different brand can consume it without touching this repo". It used to be a
 * dump of the raw `Provider[]` and NOTHING else — no derived state whatsoever.
 *
 * That was not merely thin, it was dangerous. Five programmes carried
 * `price: { published: "yes" }` with no `amount_eur` (the provider publishes a
 * price; we have not captured it). NONE does today — all five have been researched,
 * sourced, archived and their amounts extracted — and any record can land back in that
 * state tomorrow, because finding a school's price page is not the same day's work as
 * reading it. The rule is therefore pinned against a CONSTRUCTED case
 * (price-gap.fixture.ts) rather than against a defect in the corpus: a test that finds
 * its case by sweeping the data dies the day the data is fixed, and takes the rule with
 * it. A consumer rendering that raw field through its own quad component prints a bare
 * "ja" in fact ink for NAMED BUSINESSES — reconstructing, from scratch, the exact bug
 * this project spent a release eliminating. And it could not have done better: the rule
 * that corrects it (`priceQuad`) lived in a server-only module it had no way to import.
 *
 * So the export now ships the rule's OUTPUT alongside the record: each programme
 * carries a `derived` block computed by the same functions the site renders from
 * (rules.ts, derive.ts). A consumer reads `derived.price_state` and is correct by
 * construction; it never has to touch `price.published`.
 *
 * This does not break spec §6 ("derived values are never stored"). Nothing derived
 * is written to `data/`; the export is a RENDERING of the records, regenerated
 * from them on every build. The YAML remains the source of truth.
 *
 * This module is pure — it is imported by the export script AND by the test that
 * pins `derived.price_state` to what both site surfaces render.
 */
import {
  bundleDelta,
  contactRatio,
  hoursDisconnect,
  isMultistyle,
  pricePerContactHour,
  scheduledHoursCeiling,
  totalHours,
  totalPathCost,
  totalPrice,
  type ContactRatio,
  type HoursDisconnect,
  type PricePerContactHour,
  type ScheduledHoursCeiling,
  type TotalHours,
  type TotalPathCost,
  type TotalPrice,
} from "./derive";
import { priceBand, priceQuad, pphQuad, type PriceBand } from "./rules";
import type { Program, Provider, Quad } from "../schema";

/** The current API version — the directory the export is written to. */
export const API_VERSION = "v1";

/**
 * THE WIRE MIRRORS THE UNIONS, AND THE VARIANTS HAVE DIFFERENT KEY SETS.
 *
 * `{ value, derived: boolean, caveat }` is what shipped, and on the wire it was worse than
 * it was in the code, because the consumer is a stranger. The lazy read —
 *
 *     const { value } = programme.derived.total_price;   // …and print it
 *
 * — prints OUR MULTIPLICATION as de Blikopener's own price: € 5.160, a figure that appears
 * on no page they publish, rendered as theirs, about a named business, by a consumer doing
 * the obvious thing. The README warned them, in prose, in Dutch. **Prose is not a type,
 * and the lazy path was the wrong path.**
 *
 * Now `working` — the shown arithmetic — exists ONLY on `kind: "computed"`, and is
 * REQUIRED there. A consumer that prints `working` whenever it finds one is correct BY
 * ACCIDENT; a consumer that switches on `kind` is correct on purpose; and a consumer that
 * reads `value` and nothing else still cannot be told a computed figure is a published
 * one, because the object it is holding says which it is in the only field it has to look
 * at. The safe path is now the lazy path.
 *
 * These are structurally the derive.ts unions (same `kind`s, same keys). They are declared
 * as aliases rather than re-modelled, so the wire cannot drift from what the site renders.
 */
export type TotalPriceWire = TotalPrice;
export type TotalHoursWire = TotalHours;
export type PphWire = PricePerContactHour;
export type ContactRatioWire = ContactRatio;
export type ScheduledHoursCeilingWire = ScheduledHoursCeiling;
export type HoursDisconnectWire = HoursDisconnect;
/** The path cost, minus the internal `gates` array (an implementation detail of the
 *  recursion — its labels and part-totals are already spelled out in `working`). */
export type TotalPathCostWire =
  | { kind: "no_gates"; value: number | null }
  | { kind: "computed"; value: number; working: string }
  | { kind: "incomplete"; value: null; reason: string };

function pathCostWire(path: TotalPathCost): TotalPathCostWire {
  switch (path.kind) {
    case "no_gates":
      return { kind: "no_gates", value: path.value };
    case "computed":
      return { kind: "computed", value: path.value, working: path.working };
    case "incomplete":
      return { kind: "incomplete", value: null, reason: path.reason };
  }
}

export interface ProgramDerived {
  /**
   * WHAT A CONSUMER MAY SAY ABOUT THIS PROGRAMME'S PRICE. Not `price.published`,
   * which still says "yes" on a programme whose amount our record does not hold —
   * render that and you assert a price we do not have about a business we name.
   *
   * `yes` → `price.amount_eur` is present and is the price.
   * `not_published` → a sourced FINDING: we looked, they publish no price.
   * `unknown` → a GAP IN OUR RESEARCH. Never render it as a finding about them.
   * (`no` never appears here: on a *_published field it is the same finding as
   * `not_published`, and priceQuad normalises the two into one.)
   */
  price_state: Quad;
  /** The filterable band. `none_published` is the finding; `amount_not_in_record` is our gap. */
  price_band: PriceBand;
  /**
   * THE COMPARABLE WHOLE-COURSE FIGURE (spec §6, v0.5/v0.8) — and the `kind` that says
   * whose number it is. A consumer must read THIS, never `price.amount_eur`, to compare or
   * rank: on de Blikopener that field is € 1.290 **per studiejaar** of a four-year
   * training, and sorting on it puts a € 5.160 opleiding among the cheapest in the corpus.
   *
   * `{kind: "published", value}`             → THEIRS. Render it as the school's own price.
   * `{kind: "computed", value, working}`     → OURS. We multiplied (4 × € 1.290) or summed
   *      (€ 1.420 + € 1.305). Render it VISIBLY as arithmetic, with `working` beside it —
   *      never in the ink of a provider claim. Neither figure appears on any page they
   *      publish.
   * `{kind: "no_comparable_total", period, reason}` → they price per period/module and
   *      publish no count / one part's price is missing. `value` is null. DO NOT BAND, DO
   *      NOT RANK: inventing a count to manufacture a comparable figure is the exact
   *      fabrication v0.5 exists to prevent.
   * `{kind: "no_price"}`                     → no amount at all. `value` is null.
   */
  total_price: TotalPriceWire;
  /**
   * THE WHOLE-COURSE HOURS FIGURE (spec §6, v0.6) — the same contract as `total_price`, in
   * the other unit, and shipped here for the same reason: without it a consumer's only
   * hours total is `hours_claimed.total`, which is null on every school that publishes its
   * hours as PARTS. Left to re-derive the sum themselves, a consumer either shows no total
   * for de Yogaschool Enschede (who publish 360 contact + 240 zelfstudie) or adds the parts
   * up and prints the result as the school's claimed total — which is precisely the bug
   * v0.6 removed from this repo.
   *
   * `{kind: "published", value}`         → the school's own figure (Wahé's 500). Theirs.
   * `{kind: "computed", value, working}` → WE ADDED contact + self_study. Ours.
   * `{kind: "no_total"}`                 → `value` null. Do not invent one.
   */
  total_hours: TotalHoursWire;
  /**
   * WHAT IT COSTS TO QUALIFY HERE (spec §6, v0.9) — `total_price` plus the price of every
   * training the school makes you complete FIRST, recursively.
   *
   * A CONSUMER THAT BANDS OR RANKS PRICES MUST READ THIS, not `total_price`: on de
   * Yogaschool's Docentenopleiding `total_price` is € 4.590 and you may not enrol without
   * first completing their Basisopleiding (€ 1.590 per lesjaar) — so the figure a reader
   * needs is € 6.180. The Meesteropleiding sits behind it: € 10.770. Both showed € 4.590.
   *
   * `{kind: "no_gates", value}`          → nothing must be bought first, so this EQUALS
   *      `total_price` — reading it costs a consumer nothing and protects them on the gated
   *      ones. It carries NO `working`, because there is no second figure to show.
   * `{kind: "computed", value, working}` → OURS, always: € 6.180 is on no page of theirs,
   *      even though € 1.530 and € 1.590 both are.
   * `{kind: "incomplete", reason}`       → a required training's price is not in our
   *      record. `value` null. Do not band, do not rank, and DO NOT FALL BACK to
   *      `total_price`: that is precisely the number that is too low.
   */
  total_path_cost: TotalPathCostWire;
  /**
   * €/CONTACTUUR — price ÷ CONTACT hours, and THERE IS NO `published` VARIANT.
   *
   * No school in the corpus publishes this figure, so it is OURS on every programme that
   * has one; it shipped here as a bare `number | null` with nothing to say so, and a
   * consumer rendering it beside the school's own price had no way to tell the two apart.
   * On a per-year provider it is our arithmetic over our arithmetic.
   *
   * Never over the PATH cost: that buys another course's hours too, and the ratio would
   * divide a numerator including the Basisopleiding by a denominator that excludes it.
   */
  pph: PphWire;
  /** What may be said when there is no €/contactuur — the same finding-vs-gap rule as
   *  `price_state`. `not_published` = a finding about them; `unknown` = a gap in us. */
  pph_state: Quad;
  /**
   * contact ÷ total hours — over the DERIVED total (v0.6), so a school that publishes its
   * hours only as parts still has a ratio. OURS, for the same reason and with the same
   * shape as `pph`: nobody publishes a contact ratio, and where the denominator is itself
   * our sum (de Yogaschool: 360 + 240) this is our arithmetic over our arithmetic. It
   * shipped as a bare `0.6`.
   */
  contact_ratio: ContactRatioWire;
  /** Package price (the whole-course TOTAL, never a bare `amount_eur`) minus the sum of
   *  its modules. NEGATIVE = the package is CHEAPER. Ours. */
  bundle_delta: number | null;
  /** Self-tagged multistyle, or ≥2 co-equal specific styles (spec §4.12). Never a residual
   *  default: a programme that names ONE style, or none, is not multistyle. */
  multistyle: boolean;
  /**
   * A CEILING ON CONTACT HOURS FROM THE PUBLISHED SCHEDULE (spec §6, v0.12) — OURS, no
   * `published` variant. `{kind:"computed", value, working}` is a strict UPPER BOUND
   * (clock time ≥ contact time); `{kind:"no_schedule"}` where we hold no session times.
   * Do not read it as the school's contact-hour figure — they published none; we bounded it.
   */
  scheduled_hours_ceiling: ScheduledHoursCeilingWire;
  /**
   * total_hours − scheduled_hours_ceiling (spec §6, v0.12) — a LOWER BOUND on the claimed
   * hours the timetable can't account for. OURS. `{kind:"no_comparison"}` where there is no
   * schedule or no claimed total.
   */
  hours_disconnect: HoursDisconnectWire;
}

export function programDerived(provider: Provider, program: Program): ProgramDerived {
  return {
    price_state: priceQuad(provider, program),
    price_band: priceBand(provider, program),
    total_price: totalPrice(provider, program),
    total_hours: totalHours(program),
    total_path_cost: pathCostWire(totalPathCost(provider, program)),
    pph: pricePerContactHour(provider, program),
    pph_state: pphQuad(provider, program),
    contact_ratio: contactRatio(program),
    bundle_delta: bundleDelta(provider, program),
    multistyle: isMultistyle(program),
    scheduled_hours_ceiling: scheduledHoursCeiling(program),
    hours_disconnect: hoursDisconnect(program),
  };
}

/** A provider record as exported: verbatim, plus a `derived` block per programme. */
export type ExportedProvider = Omit<Provider, "programs"> & {
  programs: (Program & { derived: ProgramDerived })[];
};

export interface ApiPayload {
  /** How fresh the DATA is (the newest `last_verified`), not when the build ran. */
  data_current_as_of: string | null;
  count: number;
  /** Read this before rendering anything from a record. It is not decoration. */
  readme: string;
  providers: ExportedProvider[];
}

const README =
  "Elk programma draagt een `derived`-blok. Dat wordt bij het exporteren berekend uit het " +
  "record — nooit opgeslagen in data/ (spec §6): deze export is een weergave van de records, " +
  "niet de bron. " +
  "DE KERNREGEL: een getal dat wij over een met naam genoemd bedrijf publiceren is óf HÚN " +
  "claim (geef het weer als hun feit, met hun bron) óf ZICHTBAAR ONZE REKENSOM (gedempt, " +
  "zonder bronvermelding, mét de uitgeschreven som ernaast). Er is geen derde optie, en " +
  "geen neutrale weergave. " +
  "ELK AFGELEID GETAL IS DAAROM EEN UNIE MET EEN `kind`, en de varianten hebben " +
  "VERSCHILLENDE VELDEN: `{kind: \"published\", value}` = hún gepubliceerde cijfer; " +
  "`{kind: \"computed\", value, working}` = ONZE rekensom, en `working` is de uitgeschreven " +
  "som (\"onze berekening: 4 × € 1.290\"). `working` bestaat ALLEEN op `computed`. Wie " +
  "`working` toont zodra het er staat, doet het dus vanzelf goed. De overige `kind`s " +
  "(`no_price`, `no_comparable_total`, `no_total`, `incomplete`, `no_gates`, `no_ratio`) " +
  "hebben `value: null` — niet rangschikken, niet in een prijsklasse zetten, en niets " +
  "verzinnen. " +
  "LEES `derived.price_state` (en `pph_state`), NOOIT het ruwe `price.published`: een " +
  "programma kan `published: \"yes\"` dragen zonder `amount_eur` — de aanbieder publiceert " +
  "wél een prijs, wij hebben die nog niet vastgelegd (vijf programma's waren zo; op dit " +
  "moment geen enkel, maar dat kan morgen weer). Wie het ruwe veld rendert, zet daar een " +
  "harde \"ja\" zonder bedrag neer over een met naam genoemd bedrijf. `not_published` = wij " +
  "keken, zij publiceren het niet (een BEVINDING over hen). `unknown` = wij hebben het nog niet " +
  "onderzocht (een HIAAT bij ons). Die twee mogen nooit hetzelfde worden weergegeven. " +
  "VERGELIJKEN EN SORTEREN: lees `derived.total_price`, NOOIT `price.amount_eur` — dat bedrag " +
  "koopt wat `price.period` zegt, en dat is niet altijd de hele opleiding (de Blikopener: " +
  "€ 1.290 per STUDIEJAAR van een vierjarige opleiding; Adhouna prijst per deel, € 1.420 + " +
  "€ 1.305). " +
  "DEZELFDE REGEL VOOR DE UREN (spec v0.6): lees `derived.total_hours`, NOOIT het ruwe " +
  "`hours_claimed.total` — dat veld is null bij elke school die haar uren alleen in DELEN " +
  "publiceert (de Yogaschool Enschede: 360 contacturen + 240 zelfstudie-uren, en nergens hun " +
  "som). `computed` is ONZE optelling; `published` is hún claim (Wahé: 500 uur) en mag als " +
  "zodanig worden weergegeven. Die twee mogen nooit hetzelfde worden weergegeven. " +
  "EN VOOR HET RANGSCHIKKEN VAN PRIJZEN (spec v0.9): lees `derived.total_path_cost`, niet " +
  "`total_price` — sommige opleidingen mag je pas volgen ná een ándere opleiding van " +
  "dezelfde school, die je eerst moet kopen (de Yogaschool: de Docentenopleiding kost " +
  "€ 4.590, maar je mag niet beginnen zonder de Basisopleiding van € 1.590 — docent worden " +
  "kost daar € 6.180; de Meesteropleiding € 10.770). Zonder verplichte voorafgaande " +
  "opleiding is `kind: \"no_gates\"` en is dit veld gelijk aan `total_price`. Is het " +
  "`incomplete`, dan ontbreekt de prijs van een verplichte schakel — niet rangschikken, en " +
  "niet terugvallen op `total_price`: dát is juist het getal dat te laag is. " +
  "`derived.pph` (€/contactuur) en `derived.contact_ratio` HEBBEN GEEN `published`-variant: " +
  "geen enkele school publiceert die getallen. Ze zijn altijd van ons. " +
  "`derived.scheduled_hours_ceiling` is ONZE bovengrens op de contacturen, afgeleid uit het " +
  "gepubliceerde rooster: contacturen zijn nooit méér dan de tijd in de zaal, dus dit is `ten " +
  "hoogste` zoveel — géén door de school gepubliceerd contactuur-getal. `derived.hours_disconnect` " +
  "= `total_hours` − dit plafond, een ONDERgrens op de geclaimde uren die niet in het rooster " +
  "terug te vinden zijn. Beide zijn van ons; `no_schedule`/`no_comparison` = geen rooster of geen " +
  "geclaimd totaal.";

export function toApiPayload(providers: Provider[]): ApiPayload {
  return {
    // Currency is a pure function of the data: the most recent last_verified across
    // all records. Build time would change on every run (churning the committed
    // file); this only changes when the data does, so unchanged data rebuilds
    // byte-identically — and it answers the question a consumer actually has
    // ("how fresh is this?") rather than "when was the build run?".
    //
    // `.at(-1)`, THE NEWEST — and it is a MAXIMUM, deliberately, unlike the site's own
    // freshness line (datasetStats, which shows BOTH ends precisely because a max
    // overstates). The two are different claims: the header says "these records are all
    // at least this fresh", which only the oldest can honestly answer; this field says
    // "the data includes changes up to here", which only the newest can. Swap `.at(-1)`
    // for `.at(0)` and the API reports the whole corpus as no fresher than its STALEST
    // record — understating our own work to every consumer, and pinning a cache key to a
    // date that stops moving when we update a record. The site has a test for the
    // overstatement; its API twin (see api.test.ts) now guards the understatement.
    data_current_as_of: providers.map((p) => p.last_verified).sort().at(-1) ?? null,
    count: providers.length,
    readme: README,
    providers: providers.map((p) => ({
      ...p,
      programs: p.programs.map((program) => ({ ...program, derived: programDerived(p, program) })),
    })),
  };
}
