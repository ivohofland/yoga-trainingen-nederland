/**
 * The public JSON API payload (spec §1) — `public/data/v1/providers.json`.
 *
 * CLAUDE.md calls that file "the API… designed so a future frontend under a
 * different brand can consume it without touching this repo". It used to be a
 * dump of the raw `Provider[]` and NOTHING else — no derived state whatsoever.
 *
 * That was not merely thin, it was dangerous. Five programmes carried
 * `price: { published: "yes" }` with no `amount_eur` (the provider publishes a
 * price; we have not captured it) — one still does, and any record can land back in
 * that state tomorrow. A consumer rendering that raw field through its own quad
 * component prints a bare "ja" in fact ink for NAMED BUSINESSES —
 * reconstructing, from scratch, the exact bug this project spent a release
 * eliminating. And it could not have done better: the rule that corrects it
 * (`priceQuad`) lived in a server-only module it had no way to import.
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
  isMultistyle,
  pricePerContactHour,
  totalHours,
  totalPathCost,
  totalPrice,
} from "./derive";
import { priceBand, priceQuad, pphQuad, type PriceBand } from "./rules";
import type { Program, Provider, Quad } from "../schema";

/** The current API version — the directory the export is written to. */
export const API_VERSION = "v1";

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
   * THE COMPARABLE WHOLE-COURSE FIGURE (spec §6, v0.5) — and the flag that says whose
   * number it is. A consumer must read THIS, never `price.amount_eur`, to compare or
   * rank: on de Blikopener that field is € 1.290 **per studiejaar** of a four-year
   * training, and sorting on it puts a ≈ € 5.260 opleiding among the cheapest in the
   * corpus.
   *
   * `derived: false` → it is the provider's own published total; render it as theirs.
   * `derived: true`  → WE MULTIPLIED. Render it visibly as the consumer's-side
   *                    arithmetic, with `caveat` (the working: "onze berekening: 4 ×
   *                    € 1.290") beside it — never in the ink of a provider claim.
   * `value: null`    → no comparable total exists (they price per period and publish
   *                    no count). Do not band it, do not rank it.
   */
  total_price: { value: number | null; derived: boolean; caveat: string | null };
  /**
   * THE WHOLE-COURSE HOURS FIGURE (spec §6, v0.6) — the same contract as `total_price`,
   * in the other unit, and shipped here for the same reason: without it a consumer's only
   * hours total is `hours_claimed.total`, which is null on every school that publishes
   * its hours as PARTS. Left to re-derive the sum themselves, a consumer either shows no
   * total for de Yogaschool Enschede (who publish 360 contact + 240 zelfstudie) or adds
   * the parts up and prints the result as the school's claimed total — which is precisely
   * the bug v0.6 removed from this repo.
   *
   * `derived: false` → `hours_claimed.total` is set: the school's own published figure
   *                    (Wahé's 500). Render it as theirs.
   * `derived: true`  → WE ADDED contact + self_study. Render it visibly as the
   *                    consumer's-side arithmetic, with `caveat` (the working) beside it
   *                    — never in the ink of a provider claim.
   * `value: null`    → no total is derivable. Do not invent one.
   */
  total_hours: { value: number | null; derived: boolean; caveat: string | null };
  /**
   * WHAT IT COSTS TO QUALIFY HERE (spec §6, v0.9) — `total_price` plus the price of every
   * training the school makes you complete FIRST, recursively.
   *
   * A CONSUMER THAT BANDS OR RANKS PRICES MUST READ THIS, not `total_price`: on de
   * Yogaschool's Docentenopleiding `total_price` is € 4.590 and you may not enrol without
   * first completing their Basisopleiding (€ 1.590 per lesjaar) — so the figure a reader
   * needs is € 6.180. The Meesteropleiding sits behind the Docentenopleiding: € 10.770.
   * Both showed € 4.590. Where nothing must be bought first this EQUALS `total_price`, so
   * reading it costs a consumer nothing and protects them from the gated cases.
   *
   * `derived` is ALWAYS true — the path is never the school's own figure, even when the
   * course price is. Render it as the consumer's-side arithmetic, with `caveat` (the
   * working: "incl. verplichte Basisopleiding € 1.590") beside it.
   * `value: null` → a required training's price is not in our record. Do not band it, do
   *                 not rank it, and do not fall back to `total_price`: that is the number
   *                 that is wrong.
   */
  total_path_cost: { value: number | null; derived: boolean; caveat: string | null };
  /** Price ÷ CONTACT hours (never total hours), or null when either is missing. NOT over
   *  the path cost: that buys another course's hours too, and the ratio would divide a
   *  numerator including the Basisopleiding by a denominator that excludes it. */
  pph: number | null;
  /** What may be said when `pph` is null — the same finding-vs-gap rule as price_state. */
  pph_state: Quad;
  /** contact ÷ total hours — over the DERIVED total (v0.6), so a school that publishes
   *  its hours only as parts still has a ratio. */
  contact_ratio: number | null;
  /** Package price minus the sum of its modules. NEGATIVE = the package is CHEAPER. */
  bundle_delta: number | null;
  /** Self-tagged multistyle, or ≥2 co-equal specific styles (spec §4.12). */
  multistyle: boolean;
}

export function programDerived(provider: Provider, program: Program): ProgramDerived {
  const total = totalPrice(provider, program);
  const hours = totalHours(program);
  const path = totalPathCost(provider, program);
  return {
    price_state: priceQuad(provider, program),
    price_band: priceBand(provider, program),
    total_price: { value: total.value, derived: total.derived, caveat: total.caveat ?? null },
    total_hours: { value: hours.value, derived: hours.derived, caveat: hours.caveat ?? null },
    total_path_cost: { value: path.value, derived: path.derived, caveat: path.caveat ?? null },
    pph: pricePerContactHour(provider, program).value,
    pph_state: pphQuad(provider, program),
    contact_ratio: contactRatio(program),
    bundle_delta: bundleDelta(provider, program),
    multistyle: isMultistyle(program),
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
  "niet de bron. LEES `derived.price_state` (en `pph_state`), NOOIT het ruwe `price.published`: " +
  "vijf programma's hebben `published: \"yes\"` zonder `amount_eur` — de aanbieder publiceert " +
  "wél een prijs, wij hebben die nog niet vastgelegd. Wie het ruwe veld rendert, zet daar een " +
  "harde \"ja\" zonder bedrag neer over een met naam genoemd bedrijf. `not_published` = wij " +
  "keken, zij publiceren het niet (een BEVINDING over hen). `unknown` = wij hebben het nog niet " +
  "onderzocht (een HIAAT bij ons). Die twee mogen nooit hetzelfde worden weergegeven. " +
  "VERGELIJKEN EN SORTEREN: lees `derived.total_price`, NOOIT `price.amount_eur` — dat bedrag " +
  "koopt wat `price.period` zegt, en dat is niet altijd de hele opleiding (de Blikopener: " +
  "€ 1.290 per STUDIEJAAR van een vierjarige opleiding). Is `total_price.derived` waar, dan is " +
  "het getal ONZE rekensom (`caveat` toont de som) en geen bedrag dat de aanbieder publiceert: " +
  "geef het als zodanig weer. Is `total_price.value` null, dan is er geen vergelijkbare " +
  "totaalprijs — niet rangschikken. " +
  "DEZELFDE REGEL VOOR DE UREN (spec v0.6): lees `derived.total_hours`, NOOIT het ruwe " +
  "`hours_claimed.total` — dat veld is null bij elke school die haar uren alleen in DELEN " +
  "publiceert (de Yogaschool Enschede: 360 contacturen + 240 zelfstudie-uren, en nergens hun " +
  "som). Is `total_hours.derived` waar, dan is het getal ONZE optelling (`caveat` toont de som) " +
  "en geen totaal dat de aanbieder publiceert; is het onwaar, dan is het hún gepubliceerde " +
  "claim (Wahé: 500 uur) en mag het als zodanig worden weergegeven. Die twee mogen nooit " +
  "hetzelfde worden weergegeven. " +
  "EN VOOR HET RANGSCHIKKEN VAN PRIJZEN (spec v0.9): lees `derived.total_path_cost`, niet " +
  "`total_price` — sommige opleidingen mag je pas volgen ná een ándere opleiding van " +
  "dezelfde school, die je eerst moet kopen (de Yogaschool: de Docentenopleiding kost " +
  "€ 4.590, maar je mag niet beginnen zonder de Basisopleiding van € 1.590 — docent worden " +
  "kost daar € 6.180; de Meesteropleiding € 10.770). Zonder verplichte voorafgaande " +
  "opleiding is dit veld gelijk aan `total_price`. Het is ALTIJD onze optelling (`derived` " +
  "is altijd waar): geef het weer als zodanig. Is de waarde null, dan ontbreekt de prijs " +
  "van een verplichte schakel — niet rangschikken, en niet terugvallen op `total_price`: " +
  "dát is juist het getal dat te laag is.";

export function toApiPayload(providers: Provider[]): ApiPayload {
  return {
    // Currency is a pure function of the data: the most recent last_verified across
    // all records. Build time would change on every run (churning the committed
    // file); this only changes when the data does, so unchanged data rebuilds
    // byte-identically — and it answers the question a consumer actually has
    // ("how fresh is this?") rather than "when was the build run?".
    data_current_as_of: providers.map((p) => p.last_verified).sort().at(-1) ?? null,
    count: providers.length,
    readme: README,
    providers: providers.map((p) => ({
      ...p,
      programs: p.programs.map((program) => ({ ...program, derived: programDerived(p, program) })),
    })),
  };
}
