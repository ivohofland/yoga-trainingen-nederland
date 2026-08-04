import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CITATION_RE, collectCitations, parseCitations } from "./citations";
import { loadDataset } from "./loader";

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

test("CITE: parseCitations/collectCitations ignore lastIndex state left on the shared CITATION_RE", () => {
  // Calling parseCitations twice in a row on the same string does NOT pin the guard: JS
  // resets a global regex's lastIndex to 0 the moment exec() runs out of matches, so two
  // sequential calls self-heal regardless of whether the implementation clones the regex.
  //
  // The realistic threat is a DIFFERENT consumer of the exported CITATION_RE — e.g. a
  // caller doing `CITATION_RE.test(x)` — leaving lastIndex pointing PAST a real marker
  // before parseCitations/collectCitations ever run. Since both are pure functions over
  // `s`, they must not be sensitive to state a stranger left on the shared instance.
  const s = "[[ref:a-2026-01]] tekst erna";
  // Poison lastIndex past the marker (which spans indices 0-16): exec() resumes searching
  // FROM lastIndex, so a shared, un-cloned regex would skip straight past the only marker
  // in the string and find nothing.
  CITATION_RE.lastIndex = 20;
  try {
    const segs = parseCitations(s);
    assert.equal(
      segs.filter((x) => x.kind === "ref").length,
      1,
      "a marker before a poisoned lastIndex must still be found",
    );

    CITATION_RE.lastIndex = 20;
    const found = new Set<string>();
    collectCitations({ note: s }, found);
    assert.deepEqual([...found], ["a-2026-01"]);
  } finally {
    CITATION_RE.lastIndex = 0; // must not leak into a later test
  }
});

test("CITE: no note in the corpus renders a raw marker", () => {
  // THE failure this design introduces. A marker that survives to the page shows a
  // reader literal `[[ref:…]]`. Runs over the REAL corpus, not a fixture, so a citation
  // added to any note anywhere is covered the day it lands.
  const { providers } = loadDataset();
  let markers = 0;
  const walk = (node: unknown): void => {
    if (typeof node === "string") {
      for (const seg of parseCitations(node)) {
        if (seg.kind === "ref") markers++;
        else assert.ok(!seg.text.includes("[[ref:"), `raw marker survives parsing: ${seg.text}`);
      }
      return;
    }
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") return Object.values(node).forEach(walk);
  };
  walk(providers);
  assert.equal(markers, 8, "the corpus should hold exactly the 8 known citations");
});

test("CITE: every note interpolation on the record page goes through <Cite>", () => {
  // Structural, and therefore a change-detector — but the alternative is rendering a
  // Next Server Component in node:test, which this repo does nowhere. It catches the
  // realistic mistake: a tenth note site added later without the component.
  //
  // The negative lookbehind on `=` is not slack in the check: it is what keeps the check
  // truthful once <Cite> exists at all. `<Cite text={row.note} />` and
  // `className={styles.note}` both contain the literal substring `{row.note}` /
  // `{styles.note}` — a PROP VALUE, not text handed straight to the reader — so a bare
  // regex with no lookbehind flags the very call sites that route a note through <Cite>,
  // which would make this test unsatisfiable by any correct implementation. A note
  // rendered directly as JSX CHILD content (the actual bug: `{x.note}` with nothing
  // consuming it) is never preceded by `=` and is still caught.
  const src = fs.readFileSync(
    path.join(process.cwd(), "app", "aanbieder", "[id]", "page.tsx"), "utf8");
  const bare = [...src.matchAll(/(?<!=)\{[a-z]+\.note\}/g)].map((m) => m[0]);
  assert.deepEqual(bare, [], `note rendered without <Cite>: ${bare.join(", ")}`);
});

test("CITE: the methodology substitutes markers before marked.parse", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "app", "methodologie", "page.tsx"), "utf8");
  const md = fs.readFileSync(path.join(process.cwd(), "content", "methodologie.md"), "utf8");
  assert.ok(md.includes("[[ref:"), "the methodology must cite the documents it rests on");
  assert.match(src, /CITATION_RE|parseCitations/, "…and must convert them before rendering");
});
