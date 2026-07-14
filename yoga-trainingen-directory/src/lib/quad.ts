/**
 * Quad state → semantic class + NL label.
 *
 * THE rule of this project (spec §2.2, CLAUDE.md): `not_published` and `unknown`
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
  // An absent optional object is a gap, never a finding (spec §2.2) — decided here,
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

/**
 * THE decision <Quad> makes, and the whole of it: does this cell show the value we
 * hold, or the state word instead?
 *
 * It lived inside the component as `quadClass(state) === "fact" && children != null`
 * — one line, and both halves of it load-bearing:
 *
 *   - drop `=== "fact"` and a `not_published` cell renders its children: a FINDING
 *     rendered as the value it is a finding about (the bug that ate six providers'
 *     verbatim assessment quotes, in reverse);
 *   - drop `children != null` and a fact with nothing to show renders an empty
 *     span — a cell that says nothing at all where "ja" or a price belongs.
 *
 * Untestable in there without a React renderer, and this project adds none. Out
 * here it is four lines of truth table, and the component is left with nothing to
 * get wrong.
 */
export function showsValue(v: Quad | undefined | null, hasValue: boolean): boolean {
  return quadClass(v) === "fact" && hasValue;
}

/**
 * THE FOURTH INK — and the whole rule of this project, applied to OUR OWN numbers.
 *
 * A number published about a named business is either THEIR CLAIM — fact ink, cited — or
 * VISIBLY OUR ARITHMETIC — muted, uncited, working shown. There is no third option and
 * there is no neutral rendering: ink IS the assertion. A quad has three inks
 * (`quadClass`); a figure we computed needs a fourth, because it is not a finding about
 * them, not a gap in us, and above all NOT A FACT THEY STATED.
 *
 * WHY THIS IS A FUNCTION AND NOT A TERNARY IN A COMPONENT.
 *
 * It WAS a ternary in a component — `row.derived && row.state === "yes"` — sitting in
 * app/aanbieder/[id]/page.tsx, and it was the single most consequential expression on the
 * site. Neutralise it and the entire 181-test suite stayed green while `± € 6.180`
 * (de Yogaschool's cost to qualify), `± € 5.160` (de Blikopener's four-year total) and
 * `± 600 uur` (de Yogaschool's hours) rendered through <Quad>, in FACT INK, one row below
 * those schools' own published figures — our arithmetic wearing their colours, on a page
 * that names them. Not one of those three numbers appears in any source either school
 * published.
 *
 * This is precisely the reason `showsValue()` was lifted out of <Quad> and truth-tabled:
 * a decision inside a component, in a project that adds no React renderer, is a decision
 * nothing can test. So it is lifted out again, and both surfaces call it. What remains in
 * the components is a wire.
 *
 * BOTH HALVES OF THE CONDITION ARE LOAD-BEARING, and they fail in opposite directions:
 *
 *   - drop `derived` → our sum is painted as the school's own claim (the bug above);
 *   - drop `state === "yes"` → a row with NO value (de Blikopener with no period count:
 *     a FINDING about them) is painted muted-and-uncited, so a finding we researched and
 *     sourced reads as an aside of ours. `derived` only ever governs the ink of a VALUE;
 *     it never decides whether one exists.
 */
export type Ink = QuadClass | "derived";

export function inkFor(cell: { state: Quad; derived?: boolean }): Ink {
  // OURS — but only where there is actually a figure to print. A derived row with no
  // value still states a finding, and a finding is exactly what <Quad> is for.
  if (cell.derived === true && cell.state === "yes") return "derived";
  return quadClass(cell.state);
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
