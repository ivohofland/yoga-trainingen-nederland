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
import { bundleDelta, contactRatio, isMultistyle, pricePerContactHour, totalPrice } from "./derive";
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
  /** Price ÷ CONTACT hours (never total hours), or null when either is missing. */
  pph: number | null;
  /** What may be said when `pph` is null — the same finding-vs-gap rule as price_state. */
  pph_state: Quad;
  /** contact ÷ total hours. */
  contact_ratio: number | null;
  /** Package price minus the sum of its modules. NEGATIVE = the package is CHEAPER. */
  bundle_delta: number | null;
  /** Self-tagged multistyle, or ≥2 co-equal specific styles (spec §4.12). */
  multistyle: boolean;
}

export function programDerived(provider: Provider, program: Program): ProgramDerived {
  const total = totalPrice(program);
  return {
    price_state: priceQuad(program),
    price_band: priceBand(program),
    total_price: { value: total.value, derived: total.derived, caveat: total.caveat ?? null },
    pph: pricePerContactHour(program).value,
    pph_state: pphQuad(program),
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
  "totaalprijs — niet rangschikken.";

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
