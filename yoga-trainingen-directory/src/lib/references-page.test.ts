import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadReferences } from "./loader";

// SOURCE-LEVEL CHECK, NOT A BEHAVIOURAL TEST. This greps the page's source text
// rather than rendering it: `app/referenties/page.tsx` is a Next Server Component,
// and this repo has no harness anywhere for rendering one under `node:test` — building
// one for a single page would be out of proportion. So this is a change-detector: it
// catches an entry silently dropped from the JSX, not a browser-verified guarantee
// that a citation resolves to a visible id. That guarantee belongs to Task 4 (the
// citation renderer), which is the real, behavioural test.
test("REFERENTIES: every loaded reference has an anchor on the page", () => {
  // The links Task 4 renders point at /referenties#<id>. If an id has no anchor, the
  // link lands on the page but not on the document, which reads as a broken citation.
  const src = fs.readFileSync(path.join(process.cwd(), "app", "referenties", "page.tsx"), "utf8");
  const { references } = loadReferences();
  assert.ok(references.length >= 5);
  assert.match(src, /id=\{ref\.id\}/, "each entry must carry its id as an anchor");
  for (const field of ["title", "publisher", "captured", "note"]) {
    assert.match(src, new RegExp(`ref\\.${field}`), `the page must render ${field}`);
  }
});
