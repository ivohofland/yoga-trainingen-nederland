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

/**
 * A quad value nobody in this module thought about. It must never be *guessed*.
 *
 * Every function below decides, for one quad value, whether we are making a
 * statement about a NAMED BUSINESS or about our own research. A `default:` that
 * quietly answers "gap" for anything it does not recognise is the cardinal sin
 * with a friendly face: add a fifth member to `Quad` (say `"disputed"` — a
 * finding) and the finding renders grey and italic as a hole in our own
 * homework, in every surface at once, with a green build behind it.
 *
 * So the switches are exhaustive over `Quad` and end here. `v: never` means a
 * new quad member is a COMPILE ERROR in every place that must think about it —
 * not just in `LABEL` (a `Record<Quad, string>`, which was the ONLY thing that
 * failed before, and one compile error is worse than none: the contributor fixes
 * it, the suite goes green, and the silent misrendering ships anyway).
 *
 * The throw is the runtime half of the same rule, for a value that reaches us
 * from outside the type system (a hand-edited YAML, a stale JSON export): fail
 * loudly rather than publish a sentence about a named business that no one chose.
 */
function unhandledQuad(v: never): never {
  throw new Error(
    `unhandled quad state ${JSON.stringify(v)} — every quad must be classified as a fact, ` +
      `a finding about the provider, or a gap in our research. Guessing publishes one as another.`,
  );
}

export function quadClass(v: Quad | undefined | null): QuadClass {
  // An absent optional object is a gap, never a finding (spec §4) — decided here,
  // separately, so that the switch below stays exhaustive over Quad itself.
  if (v == null) return "gap";
  switch (v) {
    case "yes":
    case "no":
      return "fact";
    case "not_published":
      return "finding";
    case "unknown":
      return "gap";
    default:
      return unhandledQuad(v);
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
  // Not investigated is not an omission by the provider.
  if (v == null) return false;
  switch (v) {
    case "not_published":
    case "no":
      return true;
    case "yes":
    case "unknown":
      return false;
    // Exhaustive on purpose (see unhandledQuad): a `return false` fallthrough
    // would drop a future finding out of the price band and out of the
    // finding-vs-gap rule — silently, and in the direction that disowns
    // research we did do.
    default:
      return unhandledQuad(v);
  }
}
