import { test } from "node:test";
import assert from "node:assert/strict";
import { CITATION_RE, collectCitations, parseCitations } from "./citations";

test("CITE: a marker becomes a ref segment, the rest stays text", () => {
  const segs = parseCitations('gelden ([[ref:ya-application-guide-2026-07]]). Daarbij');
  assert.deepEqual(segs, [
    { kind: "text", text: "gelden (" },
    { kind: "ref", id: "ya-application-guide-2026-07" },
    { kind: "text", text: "). Daarbij" },
  ]);
});

test("CITE: the parser consumes every marker — no text segment may contain one", () => {
  // This is the guarantee the renderers rest on. If a marker survives into a text
  // segment, a reader sees literal `[[ref:…]]` on the page.
  const s = "a [[ref:one-2026-01]] b [[ref:two-2026-02]] c";
  const segs = parseCitations(s);
  assert.equal(segs.filter((x) => x.kind === "ref").length, 2);
  for (const seg of segs) {
    if (seg.kind === "text") assert.ok(!seg.text.includes("[[ref:"), `raw marker survived: ${seg.text}`);
  }
});

test("CITE: prose with no marker is one text segment, unchanged", () => {
  assert.deepEqual(parseCitations("gewone tekst"), [{ kind: "text", text: "gewone tekst" }]);
});

test("CITE: collectCitations recurses arbitrarily deep, not just top-level notes", () => {
  // The real corpus puts one citation at programs[0].hours_claimed.schedule.note —
  // four levels down. A collector that only walked top-level notes would miss it.
  const rec = { programs: [{ hours_claimed: { schedule: { note: "x [[ref:deep-2026-01]] y" } } }] };
  const found = new Set<string>();
  collectCitations(rec, found);
  assert.deepEqual([...found], ["deep-2026-01"]);
});

test("CITE: CITATION_RE is global and stateless across calls", () => {
  // A global regex carries lastIndex. If the module shares one instance across calls
  // without resetting, the second call silently finds nothing.
  const s = "[[ref:a-2026-01]]";
  assert.equal(parseCitations(s).filter((x) => x.kind === "ref").length, 1);
  assert.equal(parseCitations(s).filter((x) => x.kind === "ref").length, 1);
  assert.ok(CITATION_RE.global);
});
