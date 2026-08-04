# A citation that leads nowhere is not a citation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reference citations become a marked `[[ref:<id>]]` form that the loader resolves, the export ships, and every reader-facing surface renders as a link to `/referenties#<id>`.

**Architecture:** One pure parser in `src/lib/citations.ts` splits prose into text and ref segments; the loader recurses every string in a record to check resolution; two thin renderers consume the parser — a `<Cite>` component for the record page and a markdown substitution for the methodology. The export gains a `references` block so the payload carries its own referents.

**Tech Stack:** TypeScript, Zod, `node:test` via `tsx --test`, Next.js App Router (Server Components), `marked`.

## Global Constraints

- Design: `docs/superpowers/specs/2026-08-04-reference-store-consumed-design.md`. Read it before Task 1.
- All `npm` commands run from `yoga-trainingen-directory/`. Baseline is **335 tests**.
- **Never move, rename, delete, re-hash or re-capture ANY file under `data/archives/`.** This work changes records, prose and surfaces, never evidence. Those bodies are gitignored and exist on one machine; an agent once moved one meaning to move it back, crashed in between, and destroyed 364 lines of unrecoverable research.
- **Never run `npm run archive`** — it hits the network and pushes to the real private archive repo.
- **A marker rendered raw is the failure this design introduces.** A reader must never see a literal `[[ref:ya-standards-2026-07]]`. It is visible and embarrassing rather than untrue — but a marker *silently dropped* is worse: it strips a citation from a claim about a named business while the sentence still reads as sourced.
- `src/lib/citations.ts` **must import nothing from `node:*` and nothing from React** — the loader, the export and both surfaces all consume it, exactly as `derive.ts`/`rules.ts`/`quad.ts` already are constrained.
- References stay prose-cited, never `source:`-resolvable (spec §4.1b). The provenance gate keys on "this programme's own cited page"; a normative document is evidence about the rule, not about the school.
- Code comments in English, user-facing output in Dutch.
- Gates after every task: `npm run validate`, `npm test`, `npm run test:ci`, `npx tsc --noEmit`. Full `npm run build` before the final commit. `npm run provenance` must stay ✓ 165/165.

## File Structure

- **Create:** `src/lib/citations.ts` — the pure parser and the recursive collector. One responsibility: turning prose into segments and finding every marker in a record.
- **Create:** `src/lib/citations.test.ts`
- **Create:** `app/referenties/page.tsx` (+ `page.module.css`) — the surface the links land on.
- **Create:** `app/aanbieder/[id]/Cite.tsx` — renders one note's segments.
- **Modify:** `src/lib/loader.ts` (the resolution check), `src/schema/index.ts:146` (the evidence bar), `src/lib/api.ts` + `scripts/export-json.ts` (the references block), `app/aanbieder/[id]/page.tsx` (9 note sites), `app/methodologie/page.tsx` (markdown substitution), `content/methodologie.md` (citations + version bump), `data/providers/tribes-academy.yaml` (the 8 citations).

---

### Task 1: The marked form, the resolution check, and the evidence bar

**Files:**
- Create: `yoga-trainingen-directory/src/lib/citations.ts`, `yoga-trainingen-directory/src/lib/citations.test.ts`
- Modify: `yoga-trainingen-directory/src/lib/loader.ts`, `yoga-trainingen-directory/src/schema/index.ts:146`, `yoga-trainingen-directory/data/providers/tribes-academy.yaml`
- Test: `yoga-trainingen-directory/src/lib/loader.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces — Tasks 2-4 all depend on these exact names:
  - `CITATION_RE: RegExp` — global, `/\[\[ref:([a-z0-9-]+)\]\]/g`
  - `type CiteSegment = { kind: "text"; text: string } | { kind: "ref"; id: string }`
  - `parseCitations(s: string): CiteSegment[]`
  - `collectCitations(node: unknown, into: Set<string>): void` — recurses every string
  - `integrityErrors(p, file, today?, knownReferenceIds?: ReadonlySet<string>)` — the 4th parameter is new

- [ ] **Step 1: Write the failing parser tests**

Create `src/lib/citations.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- --test-name-pattern="CITE:"`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the parser**

Create `src/lib/citations.ts`:

```ts
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
```

- [ ] **Step 4: Run the parser tests**

Run: `npm test -- --test-name-pattern="CITE:"`
Expected: all 5 PASS.

- [ ] **Step 5: Write the failing loader tests**

Add to `src/lib/loader.test.ts`. Build cases by **spreading a real record** — that file has no constructed-provider helper and uses `providerOf(id)` against the loaded corpus:

```ts
test("REFCITE: a citation naming a document the repo does not hold is an error", () => {
  // The rename regression, and the whole reason the form is marked rather than bare.
  const base = providerOf("adhouna");
  const p = { ...base, registrations: [{ ...base.registrations[0]!, note: "zie [[ref:weg-2026-01]]" }] };
  const errs = integrityErrors(p, "x.yaml", "2026-08-04", new Set(["ya-standards-2026-07"]));
  assert.equal(errs.filter((e) => /weg-2026-01/.test(e)).length, 1);
});

test("REFCITE: a citation that resolves produces no error", () => {
  const base = providerOf("adhouna");
  const p = { ...base, registrations: [{ ...base.registrations[0]!, note: "zie [[ref:ya-standards-2026-07]]" }] };
  const errs = integrityErrors(p, "x.yaml", "2026-08-04", new Set(["ya-standards-2026-07"]));
  assert.deepEqual(errs.filter((e) => /ref:/.test(e)), []);
});

test("REFCITE: the check reaches a citation nested inside hours_claimed.schedule.note", () => {
  // Where the real corpus keeps one. A shallower scan would pass this record while it
  // cites a document that does not exist.
  const base = providerOf("tribes-academy");
  const prog = base.programs[0]!;
  const p = {
    ...base,
    programs: [{ ...prog, hours_claimed: { ...prog.hours_claimed,
      schedule: { ...prog.hours_claimed.schedule!, note: "diep [[ref:weg-2026-01]]" } } }],
  };
  const errs = integrityErrors(p, "x.yaml", "2026-08-04", new Set());
  assert.equal(errs.filter((e) => /weg-2026-01/.test(e)).length, 1);
});
```

The two bases are chosen, not arbitrary — verified against the corpus: `adhouna` has exactly one `registrations` entry but **no** `programs[0].hours_claimed.schedule`, which is why the third test uses `tribes-academy` (3 registrations, and the schedule the deep citation lives in). Do not swap them for convenience, and do not hand-write a `Provider` literal — spreading a real record is what keeps the fixture from drifting when a required field is added.

- [ ] **Step 6: Run to verify they fail**

Run: `npm test -- --test-name-pattern="REFCITE:"`
Expected: FAIL — `integrityErrors` takes three parameters and performs no citation check.

- [ ] **Step 7: Add the resolution check to the loader**

In `src/lib/loader.ts`, add the 4th parameter to `integrityErrors` (default `new Set()`, so a caller that does not supply references simply has no reference to resolve against, and every citation reports):

```ts
export function integrityErrors(
  p: Provider,
  file: string,
  today: string = new Date().toISOString().slice(0, 10),
  knownReferenceIds: ReadonlySet<string> = new Set(),
): string[] {
```

Then, alongside the existing `collectSourceRefs` block, add:

```ts
  // A CITATION MUST RESOLVE. `collectSourceRefs` has done this for `source:` refs since
  // v0.1; references had no counterpart, so renaming a reference file left validate green
  // while three notes cited a document the repo does not hold. Recurses every string,
  // because the corpus cites from registrations[].note, hours_claimed.note AND
  // hours_claimed.schedule.note — four levels down.
  const cited = new Set<string>();
  collectCitations(p, cited);
  for (const id of cited) {
    if (!knownReferenceIds.has(id))
      errors.push(
        `${file}: cites [[ref:${id}]] but no such reference exists in data/references/. ` +
          `A citation a reader can follow to nothing is worse than no citation.`,
      );
  }
```

Then make `loadDataset()` supply the real ids: load the references (it already has `loadReferences` in the same module), build `new Set(references.map((r) => r.id))`, and pass it into every `integrityErrors` call it makes.

- [ ] **Step 8: Rewrite the 8 citations**

`data/providers/tribes-academy.yaml`. Wrap each bare reference id in `[[ref:…]]`, changing nothing else about the sentences. The 8 are:

| path | ids |
|---|---|
| `registrations[0].note` | `ya-standards-2026-07`, `ya-hours-per-day-2026-07` |
| `programs[0].hours_claimed.note` | `ya-application-guide-2026-07`, `ya-hours-per-day-2026-07`, `ya-educational-categories-2026-07` |
| `programs[0].hours_claimed.schedule.note` | `ya-application-guide-2026-07`, `ya-hours-per-day-2026-07`, `ya-educational-categories-2026-07` |

Verify with `grep -c '\[\[ref:' data/providers/tribes-academy.yaml` → **8**, and that no bare id remains: `grep -E '(^|[^:])ya-(standards|hours-per-day|application-guide|electives|educational-categories)-2026-07' data/providers/tribes-academy.yaml | grep -v '\[\[ref:'` → no output.

- [ ] **Step 9: Add the evidence bar**

`src/schema/index.ts:146` — `Reference.local_snapshot` becomes required:

```ts
  /** REQUIRED, unlike Source's. public_archive is already required, and `impossible` is a
   *  legitimate public half — a JS-shell help-centre article genuinely cannot be publicly
   *  archived. The LOCAL copy is the half that can never be honestly absent: it is what the
   *  evidentiary chain rests on, and a normative document quoted in published prose with no
   *  capture behind it is what §3 forbids. All five records already comply. */
  local_snapshot: z.string(),
```

Create `src/lib/reference-schema.test.ts`, following the `*-schema.test.ts` convention this repo already uses for schema-shape tests (`src/lib/schedule-schema.test.ts`, `src/lib/public-archive-schema.test.ts`). It does not belong in `citations.test.ts`, which must stay free of schema concerns:

```ts
test("REFERENCE: a reference with no local_snapshot does not parse", () => {
  const ok = Reference.safeParse(VALID_REFERENCE_FIXTURE);
  assert.ok(ok.success);
  const { local_snapshot: _drop, ...without } = VALID_REFERENCE_FIXTURE;
  assert.ok(!Reference.safeParse(without).success, "a normative document must be held");
});
```

Build `VALID_REFERENCE_FIXTURE` by reading a real reference through `loadReferences()` and spreading it, so it cannot drift from the schema.

- [ ] **Step 10: Run everything**

Run: `npm test`, `npm run test:ci`, `npx tsc --noEmit`, `npm run validate`

Expected: green. `npm run validate` passing is the assertion that all 8 rewritten citations resolve against the 5 real references — if it fails, a citation is mistyped.

- [ ] **Step 11: Commit**

```bash
git add yoga-trainingen-directory/src/lib/citations.ts yoga-trainingen-directory/src/lib/citations.test.ts yoga-trainingen-directory/src/lib/reference-schema.test.ts yoga-trainingen-directory/src/lib/loader.ts yoga-trainingen-directory/src/lib/loader.test.ts yoga-trainingen-directory/src/schema/index.ts yoga-trainingen-directory/data/providers/tribes-academy.yaml
git commit -F - <<'MSG'
Citations are marked, resolved, and their documents must be held (#9)

Eight reference ids sat in tribes-academy's prose as bare text, shipped
in the JSON API and rendered on the record page, resolving to nothing.
Nothing checked they existed either: renaming a reference file left
validate green while three notes cited a document the repo does not
hold.

They are now [[ref:<id>]], and the loader resolves every one. Marked
rather than bare because a bare id cannot be checked — a rename would
just stop being a link, silently. The scan recurses every string: one
of the three citing paths is programs[0].hours_claimed.schedule.note,
four levels down, and a source-scoped scan would have found none of the
eight.

local_snapshot is now required on Reference. public_archive is already
required and `impossible` is a legitimate public half, so the local
copy is the one that can never be honestly absent.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 2: The export carries its own referents

**Files:**
- Modify: `yoga-trainingen-directory/src/lib/api.ts`, `yoga-trainingen-directory/scripts/export-json.ts:48,62`
- Test: `yoga-trainingen-directory/src/lib/api.test.ts`

**Interfaces:**
- Consumes: `collectCitations(node, into)` from Task 1.
- Produces: `toApiPayload(providers: Provider[], references: Reference[]): ApiPayload` — the second parameter is new and **required**; `ApiPayload.references: Reference[]`.

- [ ] **Step 1: Write the failing test**

```ts
test("API: the payload carries every reference its notes cite", () => {
  // Notes ship WITH their markers. That is only honest if the payload also carries the
  // referents — otherwise a consumer holds syntax it cannot resolve. Either half alone
  // is worse than neither: strip the markers and the citation is lost.
  const { providers } = loadDataset();
  const { references } = loadReferences();
  const payload = toApiPayload(providers, references);

  const cited = new Set<string>();
  collectCitations(payload.providers, cited);
  assert.ok(cited.size > 0, "the corpus must contain citations, or this test proves nothing");

  const shipped = new Set(payload.references.map((r) => r.id));
  for (const id of cited) assert.ok(shipped.has(id), `payload cites ${id} but does not ship it`);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- --test-name-pattern="carries every reference"`
Expected: FAIL — `toApiPayload` takes one argument and `payload.references` is undefined.

- [ ] **Step 3: Add the references block**

In `src/lib/api.ts`, add to `ApiPayload` (below `providers`):

```ts
  /** The shared reference store (spec §4.1b). Notes ship with their `[[ref:<id>]]`
   *  markers intact, so the payload has to carry the referents or a consumer holds
   *  syntax it cannot resolve. Prose-cited by design: a normative document is evidence
   *  about the RULE, never about a school, so it is deliberately not `source:`-resolvable. */
  references: Reference[];
```

and change the signature and the returned object:

```ts
export function toApiPayload(providers: Provider[], references: Reference[]): ApiPayload {
```

```ts
    references,
```

Extend `README` with one sentence in its existing register, saying that notes may contain `[[ref:<id>]]` and that `references[]` resolves them.

- [ ] **Step 4: Update the export script**

`scripts/export-json.ts` — import `loadReferences`, call it beside `loadDataset()`, and pass the references into `toApiPayload(published, references)`. If `loadReferences()` returns errors, fail the export the same way the script already fails on `loadDataset` errors — do not export a payload whose referents did not load.

- [ ] **Step 5: Run the tests and regenerate**

Run: `npm test`, `npm run test:ci`, `npx tsc --noEmit`, then `npm run export-json`

Expected: green, and `public/data/v1/providers.json` gains a `references` array of 5. Confirm with `node -e 'console.log(require("./public/data/v1/providers.json").references.length)'` → `5`.

- [ ] **Step 6: Commit**

```bash
git add yoga-trainingen-directory/src/lib/api.ts yoga-trainingen-directory/src/lib/api.test.ts yoga-trainingen-directory/scripts/export-json.ts yoga-trainingen-directory/public/data/v1/providers.json
git commit -F - <<'MSG'
API: ship the references the notes cite (#9)

Notes go out with their [[ref:<id>]] markers intact, which is only
honest if the payload carries the referents too — otherwise a consumer
holds syntax it cannot resolve. Stripping the markers instead would
lose the citation; shipping them with no block would be worse than
either.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 3: `/referenties`

**Files:**
- Create: `yoga-trainingen-directory/app/referenties/page.tsx`, `yoga-trainingen-directory/app/referenties/page.module.css`
- Test: `yoga-trainingen-directory/src/lib/references-page.test.ts` (new)

**Interfaces:**
- Consumes: `loadReferences()` from `src/lib/loader.ts`.
- Produces: the route `/referenties`, with an `id` anchor per reference — Task 4's links target `#<id>`.

Read `app/notities/page.tsx` and its `page.module.css` first and follow their shape: a Server Component with `metadata`, a `styles.head` block, and Dutch strings from `@/lib/strings` where the file already has them.

- [ ] **Step 1: Write the failing test**

```ts
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
```

This is a source-level check and therefore a change-detector, not a behavioural test — say so in a comment above it. It is here because rendering a Next Server Component in `node:test` is not something this repo does anywhere, and inventing that harness for one page is out of proportion. The behavioural guarantee that matters (no raw marker reaches a reader) is Task 4's, and that one is real.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- --test-name-pattern="REFERENTIES:"`
Expected: FAIL — the file does not exist.

- [ ] **Step 3: Write the page**

`app/referenties/page.tsx`. A Server Component that calls `loadReferences()`, throws if it returns errors (matching how `app/page.tsx` treats invalid data), and renders each reference as a section with `id={ref.id}`, showing: `title`, `publisher`, `type`, `captured`, `url` as a link, the archive state, `applies_to`, `supersedes`/`superseded_by` when present, and `note`.

For the archive state, read `ref.public_archive.kind` and render all three cases distinctly — an `impossible` must show its `reason`, not a bare "n.v.t.". Two of the five references are exactly that case, and the reason is the whole point of the union #8 introduced. Do not re-derive the judgement from the URL; the record carries it.

Add `metadata` with a Dutch title and description in the register of the other pages.

- [ ] **Step 4: Run the test and the build**

Run: `npm test -- --test-name-pattern="REFERENTIES:"`, then `npm run build`

Expected: test PASS; build exit 0 and `out/referenties/index.html` present. Confirm the page contains all five ids: `grep -c 'id="ya-' out/referenties/index.html` → at least 5.

- [ ] **Step 5: Commit**

```bash
git add yoga-trainingen-directory/app/referenties/ yoga-trainingen-directory/src/lib/references-page.test.ts
git commit -F - <<'MSG'
/referenties: the page the citations land on (#9)

Five normative documents were validated, archived and synced, and no
surface had ever rendered one — the inquiries[] failure the spec
records at v0.11, repeated. Each entry is anchored by id so a citation
resolves to the document, and an impossible public archive shows its
reason rather than a bare n.v.t.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 4: The markers become links, everywhere prose is rendered

**Files:**
- Create: `yoga-trainingen-directory/app/aanbieder/[id]/Cite.tsx`
- Modify: `yoga-trainingen-directory/app/aanbieder/[id]/page.tsx` (9 note sites), `yoga-trainingen-directory/app/methodologie/page.tsx`, `yoga-trainingen-directory/content/methodologie.md`
- Test: `yoga-trainingen-directory/src/lib/citations.test.ts`

**Interfaces:**
- Consumes: `parseCitations`, `collectCitations` (Task 1); the `/referenties#<id>` anchors (Task 3).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the failing tests**

```ts
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
  const src = fs.readFileSync(
    path.join(process.cwd(), "app", "aanbieder", "[id]", "page.tsx"), "utf8");
  const bare = [...src.matchAll(/\{[a-z]+\.note\}/g)].map((m) => m[0]);
  assert.deepEqual(bare, [], `note rendered without <Cite>: ${bare.join(", ")}`);
});

test("CITE: the methodology substitutes markers before marked.parse", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "app", "methodologie", "page.tsx"), "utf8");
  const md = fs.readFileSync(path.join(process.cwd(), "content", "methodologie.md"), "utf8");
  assert.ok(md.includes("[[ref:"), "the methodology must cite the documents it rests on");
  assert.match(src, /CITATION_RE|parseCitations/, "…and must convert them before rendering");
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- --test-name-pattern="CITE: no note|goes through <Cite>|substitutes markers"`
Expected: all three FAIL.

- [ ] **Step 3: Write `<Cite>`**

`app/aanbieder/[id]/Cite.tsx`:

```tsx
/**
 * Renders one note, turning `[[ref:<id>]]` into a link to the document it cites.
 *
 * Every note on this page goes through here. A note interpolated directly shows a
 * reader literal `[[ref:ya-standards-2026-07]]` — visible and embarrassing — and a
 * note stripped of its markers is worse: the sentence still reads as sourced while
 * the citation is gone.
 */
import Link from "next/link";
import { parseCitations } from "@/lib/citations";

export function Cite({ text }: { text: string }) {
  return (
    <>
      {parseCitations(text).map((seg, i) =>
        seg.kind === "text" ? (
          seg.text
        ) : (
          <Link key={i} href={`/referenties#${seg.id}`}>
            {seg.id}
          </Link>
        ),
      )}
    </>
  );
}
```

The link text is the **id**, not the title: the existing prose reads "Bronnen: ya-standards-2026-07", and keeping the id preserves the sentence while giving the reader the token they will see again on `/referenties`. It also keeps `citations.ts` free of any dataset dependency.

- [ ] **Step 4: Wire the 9 note sites**

`app/aanbieder/[id]/page.tsx` — replace each `{x.note}` interpolation with `<Cite text={x.note} />`. They are at roughly lines 86, 144, 156, 203, 220, 245, 263, 301 plus `claim.analysis.note`; find them with `grep -n '\.note}' app/aanbieder/\[id\]/page.tsx` and convert every one. `c.priceAtTime` at ~244 is not a note — leave it.

- [ ] **Step 5: Wire the methodology**

`app/methodologie/page.tsx` — before `marked.parse`, substitute markers with markdown links:

```ts
  const md = fs.readFileSync(path.join(process.cwd(), "content", "methodologie.md"), "utf8");
  // Substituted BEFORE marked.parse, so the marker becomes a real markdown link rather
  // than surviving into the HTML as literal text a reader would see.
  const cited = md.replace(new RegExp(CITATION_RE.source, "g"), (_m, id) => `[${id}](/referenties#${id})`);
  const html = marked.parse(cited, { async: false }) as string;
```

- [ ] **Step 6: Cite the methodology's YA claims**

`content/methodologie.md`. Two passages state Yoga Alliance's rules as published fact from documents this repo holds, and cite nothing:

- the paragraph asserting the 200-hour standard requires all hours to be "classroom hours" and excludes attending public classes — cite `[[ref:ya-application-guide-2026-07]]` and `[[ref:ya-hours-per-day-2026-07]]`
- the paragraph on observing and assisting, which names "het helpdeskartikel" and "de standaard voor de 300- en 500-uursopleidingen" — cite `[[ref:ya-educational-categories-2026-07]]` and `[[ref:ya-standards-2026-07]]`

Place each marker where the claim is made, in the existing sentence, changing no wording. Bump the document's version line per its own convention.

- [ ] **Step 7: Run everything**

Run: `npm test`, `npm run test:ci`, `npx tsc --noEmit`, `npm run validate`, `npm run provenance`, `npm run build`

Expected: all green, provenance ✓ 165/165, build exit 0.

Then confirm no reader-facing HTML carries a raw marker:

```bash
grep -rl '\[\[ref:' out/ || echo "OK: no raw marker in any built page"
```

Expected: `OK: …`. A hit here means a surface renders prose without the helper — report which, do not patch around it.

- [ ] **Step 8: Commit**

```bash
git add yoga-trainingen-directory/app/ yoga-trainingen-directory/content/methodologie.md yoga-trainingen-directory/src/lib/citations.test.ts
git commit -F - <<'MSG'
Citations render as links, on the record page and in the methodology (#9)

Every note now goes through <Cite>, and the methodology substitutes
markers before marked.parse. The methodology also gains the citations
it never had: it asserted Yoga Alliance's classroom-hours rule and the
observing/assisting reading as published fact, from documents in
data/references/, and pointed the reader at none of them.

A grep over the built output confirms no page emits a raw marker —
the failure this form introduces, and the one worth a gate.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Verification checklist

After Task 4:

- `npm run validate` clean · `npm test` / `npm run test:ci` green · `npx tsc --noEmit` 0
- `npm run provenance` ✓ 165/165 · `npm run build` exit 0
- `grep -rl '\[\[ref:' out/` finds nothing
- `public/data/v1/providers.json` has `references.length === 5`
- `grep -c '\[\[ref:' data/providers/tribes-academy.yaml` → 8; no bare reference id remains in that file
- `out/referenties/index.html` exists and anchors all five ids
- Nothing under `data/archives/` moved, re-hashed or re-captured; `npm run archive` never run
