/**
 * Quad state → semantic class + NL label.
 *
 * THE rule of this project (spec §4, CLAUDE.md): `not_published` and `unknown`
 * must never render identically.
 *
 *   not_published — we looked; the provider does not state it. A FINDING.
 *   unknown       — we have not looked yet. A GAP in our own research.
 *
 * The class encodes HOW WELL WE KNOW something. It never encodes whether the
 * answer is good: `coherence_signals.modules_sold_separately: "yes"` is not
 * praise, and `accreditation.verified: "no"` is a fact, not an accusation.
 *
 * An absent optional object (undefined/null) is a gap, not a finding — an
 * un-investigated field is not an omission by the provider.
 */
import type { Quad } from "../schema";

export type QuadClass = "fact" | "finding" | "gap";

export function quadClass(v: Quad | undefined | null): QuadClass {
  switch (v) {
    case "yes":
    case "no":
      return "fact";
    case "not_published":
      return "finding";
    default:
      // "unknown", undefined, null
      return "gap";
  }
}

const LABEL: Record<Quad, string> = {
  yes: "ja",
  no: "nee",
  not_published: "niet gepubliceerd",
  unknown: "nog niet onderzocht",
};

export function quadLabel(v: Quad | undefined | null): string {
  return LABEL[v ?? "unknown"];
}

/**
 * Does this quad say "we looked; the provider does not publish it"? — i.e. is it
 * a FINDING about a named business, as opposed to a value (`yes`) or a gap in our
 * own research (`unknown`)?
 *
 * On every *_published field in the schema, `no` and `not_published` say the same
 * thing about the provider, and both are researched and sourced. `unknown` never
 * does, and must never be filtered, counted or coloured as though it did.
 *
 * This equivalence is written down ONCE, here, and every consumer calls it:
 * presenters' finding-vs-gap rule (missingBecause), the price filter's
 * "niet gepubliceerd" band. The band used to re-derive it as `priceAmount == null`
 * — "we hold no amount", a fact about OUR record — and so told readers that four
 * named businesses publish no price while our own record said they do. That
 * duplication was the bug.
 *
 * It lives in quad.ts rather than presenters.ts for a reason the type system will
 * not enforce: presenters.ts reaches dataset.ts (node:fs), so the client-side
 * filter island cannot import a *value* from it — only a type. This module
 * imports nothing but a type, so the one rule is reachable from both sides.
 */
export function saysNotPublished(v: Quad | undefined | null): boolean {
  return v === "not_published" || v === "no";
}
