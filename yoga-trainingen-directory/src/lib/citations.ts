/**
 * Reference citations in prose: `[[ref:<id>]]`.
 *
 * MARKED, not bare, because a bare id cannot be checked. A renamed reference would
 * leave the old id sitting in a note as plain text — it would simply stop being a
 * link, silently, which is the regression the resolution check exists to catch.
 * Intent has to be stated to be verifiable. See the design doc for the alternatives.
 *
 * Pure: no `node:*`, no React. The loader, the export and both rendering surfaces all
 * consume this, the same constraint derive.ts/rules.ts/quad.ts already carry.
 */
export const CITATION_RE = /\[\[ref:([a-z0-9-]+)\]\]/g;

export type CiteSegment = { kind: "text"; text: string } | { kind: "ref"; id: string };

/** The ONE place a `[[ref:<id>]]` marker becomes a URL. Both rendering surfaces
 *  (`Cite.tsx` and the methodology's pre-`marked.parse` substitution) call this
 *  rather than building `/referenties#${id}` themselves, so the two can never
 *  drift into linking a different path. */
export function refHref(id: string): string {
  return `/referenties#${id}`;
}

/** Split prose into literal text and citations. Every marker is consumed: a `text`
 *  segment can never contain one, which is what stops a reader seeing raw markup. */
export function parseCitations(s: string): CiteSegment[] {
  const out: CiteSegment[] = [];
  let last = 0;
  // A fresh regex per call: CITATION_RE is global, so sharing one instance would carry
  // lastIndex between calls and make the second call on the same string find nothing.
  const re = new RegExp(CITATION_RE.source, "g");
  for (let m = re.exec(s); m !== null; m = re.exec(s)) {
    if (m.index > last) out.push({ kind: "text", text: s.slice(last, m.index) });
    out.push({ kind: "ref", id: m[1]! });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ kind: "text", text: s.slice(last) });
  return out.length ? out : [{ kind: "text", text: s }];
}

/** Every citation anywhere in a record. Recurses ALL strings, not `note` fields:
 *  the corpus already cites from registrations[].note, hours_claimed.note AND
 *  hours_claimed.schedule.note, and a scan scoped to sources would find none of them. */
export function collectCitations(node: unknown, into: Set<string>): void {
  if (typeof node === "string") {
    const re = new RegExp(CITATION_RE.source, "g");
    for (let m = re.exec(node); m !== null; m = re.exec(node)) into.add(m[1]!);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectCitations(item, into);
    return;
  }
  if (node && typeof node === "object") {
    for (const value of Object.values(node)) collectCitations(value, into);
  }
}
