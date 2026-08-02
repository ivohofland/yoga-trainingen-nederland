# Archiver Half-Record Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `scripts/archive.ts` recording evidence that is not on disk — a `local_snapshot` naming a file it never wrote, a record claiming a public archive with no local copy, and a body left without its hash.

**Architecture:** Extract `finishCapture(base, html)` out of `saveLocalCopy` so the "which artifact did we write, and hash it" decision is testable without a browser (the same move #10 made for `captureNode`). Give the `.png` fallback its own `.catch` so a screenshot failure cannot abort before the sidecar. Return early from `captureNode` when the local capture threw, so the Wayback half can never write alone.

**Tech Stack:** TypeScript, `node:test` via `tsx --test`, `node:fs`, Playwright (only inside `saveLocalCopy`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-02-archiver-half-record-design.md`.
- **No archive file may be added, moved, or re-hashed.** `git status` clean at the end of every task is the check. This repo destroyed 364 lines of unrecoverable research once when an agent moved an archive file; never move the author's files.
- **`npm run provenance` must stay exactly 165/165** on the real corpus after every task.
- Dutch console strings are user-facing: write Dutch, match the surrounding style, never translate existing ones.
- Tests live in `src/**/*.test.ts` — that is the glob `npm test` uses. All npm commands run from `/Users/ivohofland/Projects/yoga-trainingen/yoga-trainingen-directory`.
- `npm test` and `npm run test:ci` must both stay green after every task.
- Commit after each task.

---

### Task 1: `finishCapture` — name what you actually wrote

**Files:**
- Modify: `yoga-trainingen-directory/scripts/archive.ts:176-190` (the write/hash/return tail of `saveLocalCopy`)
- Test: `yoga-trainingen-directory/src/lib/archive.test.ts`

**Interfaces:**
- Consumes: the module-level `sha256(buf: Buffer | string): string` helper at `scripts/archive.ts:79`.
- Produces: `export function finishCapture(base: string, html: string): string` — writes `${base}.sha256` for whichever of `.html`/`.pdf`/`.png` exist, and returns the repo-relative POSIX path of the artifact the record should name (`.pdf` if present, else `.png`, else `.html`).

- [ ] **Step 1: Write the failing tests**

Append to `yoga-trainingen-directory/src/lib/archive.test.ts`. The file already imports `fs`, `os`, `path`; add `finishCapture` to the existing import from `../../scripts/archive`.

```ts
/** A capture base inside a temp dir, with the given extensions present on disk. */
function captureWith(...exts: string[]): { base: string; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "capture-"));
  const base = path.join(dir, "site-2026-08-02");
  for (const ext of exts) fs.writeFileSync(`${base}${ext}`, `body${ext}`);
  return { base, dir };
}

test("FINISH: with a .pdf present, the record names the .pdf", () => {
  const { base } = captureWith(".html", ".pdf");
  const rel = finishCapture(base, "body.html");
  assert.match(rel, /site-2026-08-02\.pdf$/);
  assert.ok(fs.existsSync(path.resolve(rel)), "the returned path must exist on disk");
});

test("FINISH: with only a .png, the record names the .png — not a .pdf we never wrote", () => {
  // THE BUG. page.pdf() fails on non-headless chromium and the fallback writes a .png,
  // but saveLocalCopy returned `${base}.pdf` unconditionally — so local_snapshot named a
  // file that does not exist, in a project whose whole basis is that cited evidence does.
  const { base } = captureWith(".html", ".png");
  const rel = finishCapture(base, "body.html");
  assert.match(rel, /site-2026-08-02\.png$/);
  assert.ok(fs.existsSync(path.resolve(rel)), "the returned path must exist on disk");
});

test("FINISH: with neither rendering, the record names the .html and it is hashed", () => {
  // An html-only capture is a DEGRADED SUCCESS, not a failure: page.content() is what we
  // actually fetched, and 7 providers' prices exist only in the HTML. It must be hashed —
  // an unhashed body is pushed unverified and later deadlocks the whole sync (issue #7).
  const { base } = captureWith(".html");
  const rel = finishCapture(base, "body.html");
  assert.match(rel, /site-2026-08-02\.html$/);
  assert.ok(fs.existsSync(path.resolve(rel)));

  const sidecar = fs.readFileSync(`${base}.sha256`, "utf8").trim().split("\n");
  assert.equal(sidecar.length, 1, "exactly one artifact was captured, so one line");
  assert.match(sidecar[0], /site-2026-08-02\.html$/);
});

test("FINISH: the sidecar lists every artifact present, and only those", () => {
  const { base } = captureWith(".html", ".pdf", ".png");
  finishCapture(base, "body.html");
  const listed = fs
    .readFileSync(`${base}.sha256`, "utf8")
    .trim()
    .split("\n")
    .map((l) => l.trim().split(/\s+/)[1])
    .sort();
  assert.deepEqual(listed, [
    "site-2026-08-02.html",
    "site-2026-08-02.pdf",
    "site-2026-08-02.png",
  ]);
});
```

- [ ] **Step 2: Run them and verify they fail**

Run: `cd yoga-trainingen-directory && npx tsx --test src/lib/archive.test.ts`

Expected: FAIL — `finishCapture` is not exported, so the import is `undefined`.

- [ ] **Step 3: Extract `finishCapture`**

In `scripts/archive.ts`, add this function immediately above `saveLocalCopy`:

```ts
/**
 * Hash whatever this capture actually produced, and return the artifact the record should
 * name. Split out of `saveLocalCopy` so it is testable without a browser — the same move
 * #10 made for `captureNode`: the decision comes out, the Playwright IO stays in the caller.
 *
 * IT RETURNS WHAT EXISTS, NOT WHAT WE HOPED FOR. `saveLocalCopy` used to return
 * `${base}.pdf` unconditionally, so when `page.pdf()` failed and the fallback wrote a
 * `.png`, `local_snapshot` named a file that had never been written — a pointer to nothing,
 * in a project whose entire basis is that cited evidence exists.
 */
export function finishCapture(base: string, html: string): string {
  const name = path.basename(base);
  const hashes = [
    `${sha256(html)}  ${name}.html`,
    fs.existsSync(`${base}.pdf`) ? `${sha256(fs.readFileSync(`${base}.pdf`))}  ${name}.pdf` : null,
    fs.existsSync(`${base}.png`) ? `${sha256(fs.readFileSync(`${base}.png`))}  ${name}.png` : null,
  ].filter(Boolean);
  fs.writeFileSync(`${base}.sha256`, hashes.join("\n") + "\n");

  const ext = fs.existsSync(`${base}.pdf`) ? ".pdf" : fs.existsSync(`${base}.png`) ? ".png" : ".html";
  return path.relative(process.cwd(), `${base}${ext}`).replaceAll("\\", "/");
}
```

Then replace the tail of `saveLocalCopy` (currently lines 183-190, from `const hashes = [` through the `return`) with a single call:

```ts
    return finishCapture(base, html);
```

Leave everything above it — the `page.content()`, the `.html` write, and the `page.pdf`/`page.screenshot` block — exactly as it is. Task 2 changes that part.

- [ ] **Step 4: Run the tests**

Run: `cd yoga-trainingen-directory && npx tsx --test src/lib/archive.test.ts && npm test && npx tsc --noEmit`

Expected: the four new tests PASS, the whole suite green (301 + 4 = 305), `tsc` clean.

- [ ] **Step 5: Verify the corpus is untouched**

Run: `cd yoga-trainingen-directory && npm run provenance && git status --porcelain`

Expected: `✓ 165/165`, and `git status` shows only `scripts/archive.ts` and `src/lib/archive.test.ts`. No file under `data/` may appear. If one does, stop — the extraction wrote to the real archive.

- [ ] **Step 6: Commit**

```bash
git add yoga-trainingen-directory/scripts/archive.ts yoga-trainingen-directory/src/lib/archive.test.ts
git commit -m "finishCapture: name the artifact we actually wrote (#6)

saveLocalCopy returned \`\${base}.pdf\` unconditionally. page.pdf() only works on
headless chromium; when it fails the fallback writes a .png — and the record then
named a file that had never been written, in a project whose entire basis is that
cited evidence exists.

Extracted rather than patched in place: the hash-and-name decision is now
testable with plain files, no browser. Same move #10 made for captureNode."
```

---

### Task 2: A failed rendering must not orphan the body

**Files:**
- Modify: `yoga-trainingen-directory/scripts/archive.ts:178-181` (the `page.pdf` / `page.screenshot` block)
- Test: `yoga-trainingen-directory/src/lib/archive.test.ts`

**Interfaces:**
- Consumes: `finishCapture(base, html)` from Task 1.
- Produces: nothing new. `saveLocalCopy` keeps its signature.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/archive.test.ts`:

```ts
test("ORPHAN: the .png fallback failing must not abort before the sidecar", () => {
  // If page.pdf() fails AND page.screenshot() then throws, the error used to propagate
  // out of saveLocalCopy before finishCapture ran — leaving the .html on disk with no
  // .sha256. That orphan is one of issue #7's two deadlock triggers: sync pushes it
  // unverified (no sidecar => no hash to check), then the next successful capture writes
  // different bytes WITH a sidecar, tripping the append-only rule and refusing the entire
  // push for every provider.
  //
  // This test pins the SOURCE-level guarantee: the screenshot call is defended by its own
  // .catch, so nothing between the .html write and finishCapture can throw past it.
  const src = fs.readFileSync(path.join(process.cwd(), "scripts", "archive.ts"), "utf8");
  const block = src.slice(src.indexOf("await page.pdf("), src.indexOf("return finishCapture("));
  assert.match(
    block,
    /page\.screenshot\([\s\S]*?\)\s*\.catch\(/,
    "page.screenshot must have its own .catch, or a failed rendering orphans the body",
  );
  assert.match(block, /alleen HTML/, "and it must say so — a silent degraded capture reads as a full one");
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `cd yoga-trainingen-directory && npx tsx --test src/lib/archive.test.ts`

Expected: FAIL — `page.screenshot` currently has no `.catch`.

- [ ] **Step 3: Defend the fallback**

In `scripts/archive.ts`, replace the `page.pdf` block (currently lines 178-181):

```ts
    // BOTH RENDERINGS MAY FAIL, AND THE .html IS STILL A REAL CAPTURE. page.content() is
    // what we actually fetched; the .pdf is a rendering of it, and 7 providers' prices
    // exist only in the HTML. So a failed rendering is a DEGRADED capture, never a reason
    // to discard the fetch — and never a reason to skip the hash: an unhashed body is
    // pushed unverified and then deadlocks the whole sync (issue #7).
    await page.pdf({ path: `${base}.pdf`, fullPage: true } as never).catch(async () => {
      // page.pdf werkt alleen headless-chromium; fallback: full-page screenshot
      await page.screenshot({ path: `${base}.png`, fullPage: true }).catch((e) => {
        console.warn(
          `\n    let op: alleen HTML vastgelegd — pdf én png mislukt (${(e as Error).message})`,
        );
      });
    });
```

- [ ] **Step 4: Run the tests**

Run: `cd yoga-trainingen-directory && npx tsx --test src/lib/archive.test.ts && npm test && npx tsc --noEmit`

Expected: the new test PASSES, suite green (305 + 1 = 306), `tsc` clean.

- [ ] **Step 5: Verify the corpus is untouched**

Run: `cd yoga-trainingen-directory && npm run provenance && git status --porcelain`

Expected: `✓ 165/165`, and only the two intended files modified.

- [ ] **Step 6: Commit**

```bash
git add yoga-trainingen-directory/scripts/archive.ts yoga-trainingen-directory/src/lib/archive.test.ts
git commit -m "A failed rendering degrades a capture; it must not orphan the body (#6)

If page.pdf() failed and page.screenshot() then threw, the error propagated out
of saveLocalCopy before the sidecar was written, leaving a body on disk with no
hash. That orphan is one of #7's two deadlock triggers: it is pushed unverified,
and the next capture writes different bytes WITH a sidecar, tripping the
append-only rule and refusing the entire push for every provider.

The screenshot now has its own .catch and warns. An html-only capture is a
degraded success, not a failure — page.content() is what we actually fetched,
and 7 providers' prices exist only in the HTML."
```

---

### Task 3: No half-record, and the parked citation fix

**Files:**
- Modify: `yoga-trainingen-directory/scripts/archive.ts` — `captureNode`, immediately after the capture `catch` block
- Modify: `docs/superpowers/specs/2026-08-02-held-unreadable-artifacts-design.md:65`
- Modify: `docs/superpowers/plans/2026-08-02-held-unreadable-artifacts.md:136`
- Test: `yoga-trainingen-directory/src/lib/archive.test.ts`

**Interfaces:**
- Consumes: `captureNode(node, dir, deps)` and `CaptureResult { changed, failedCapture }` from #10; the test helpers `nodeFrom()`, `fakeCapture()`, `deps()` already in `archive.test.ts`.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/archive.test.ts`:

```ts
test("HALF-RECORD: a failed capture must not let Wayback write alone", () => {
  // CLAUDE.md: "ALWAYS both" — a public archive AND a dated local copy. If the local
  // capture threw and the Wayback submission then succeeded, the node got an archived_url
  // with no local_snapshot: a record claiming a public archive it holds no local copy for,
  // which is the exact inverse of what methodologie.md publishes.
  //
  // submitWayback THROWS here, so "never submitted" is enforced rather than merely
  // observed after the fact.
  const boom: Capture = async () => {
    throw new Error("net::ERR_NAME_NOT_RESOLVED");
  };
  const node = nodeFrom("id: unreachable\nurl: https://example.invalid/x\n");
  return captureNode(
    node,
    "demo",
    deps({
      capture: boom,
      skipWayback: false,
      submitWayback: async () => {
        throw new Error("must not submit when the local capture failed");
      },
    }),
  ).then((r) => {
    assert.equal(r.failedCapture, "unreachable");
    assert.equal(node.get("archived_url"), undefined, "no public archive without a local copy");
    assert.equal(node.get("local_snapshot"), undefined);
    assert.equal(r.changed, false, "nothing was written, so nothing needs saving");
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `cd yoga-trainingen-directory && npx tsx --test src/lib/archive.test.ts`

Expected: FAIL — the injected `submitWayback` throws, and that rejection propagates out of `captureNode`, because the Wayback section currently runs even after a failed capture.

- [ ] **Step 3: Return early on a failed capture**

In `scripts/archive.ts`, in `captureNode`, immediately after the `catch` block that sets `failedCapture` and before the `// 2. publiek archief` comment, insert:

```ts
  // NO HALF-RECORD. CLAUDE.md: "ALWAYS both" — a public archive AND a dated local copy.
  // Writing `archived_url` here, with the local capture just failed, produces a record
  // claiming a public archive it holds no local copy for: the exact inverse of what
  // methodologie.md publishes. Returning also skips a pointless submission and its 10-30s
  // throttle pause on a run that has already failed. The run still exits non-zero and
  // names this source; the next run retries both halves together.
  if (failedCapture) return { changed, failedCapture };
```

- [ ] **Step 4: Run the tests**

Run: `cd yoga-trainingen-directory && npx tsx --test src/lib/archive.test.ts && npm test && npm run test:ci && npx tsc --noEmit`

Expected: the new test PASSES, both suites green (306 + 1 = 307), `tsc` clean.

- [ ] **Step 5: Fix the parked citation error**

Two documents cite `provenance.ts:606-610` for issue #7's crash-between-writes reference. That span is the unrelated *"never move the author's files"* paragraph; the correct span is `provenance.ts:635-640`.

In `docs/superpowers/specs/2026-08-02-held-unreadable-artifacts-design.md:65`, change:

```
(the crash-between-writes case named at `provenance.ts:606-610`, issue #7)
```

to:

```
(the crash-between-writes case named at `provenance.ts:635-640`, issue #7)
```

In `docs/superpowers/plans/2026-08-02-held-unreadable-artifacts.md:136`, change:

```
> #7 names, and `provenance.ts:606-610` documents — would filter to nothing and report
```

to:

```
> #7 names, and `provenance.ts:635-640` documents — would filter to nothing and report
```

Verify with `grep -rn "606-610" docs/` — expected: no matches.

- [ ] **Step 6: Full gates and the smoke run**

Run: `cd yoga-trainingen-directory && npm run build`

Expected: exit 0. `validate` 48 providers + 5 references, `provenance` 165/165, both suites green, `next build` ✓, `verify-export` ✓.

Then the no-op smoke run against the real archiver:

Run: `cd yoga-trainingen-directory && npm run archive -- _references --no-sync`

Expected: exit 0, the `_references` header, and **no** `lokale kopie` lines — every reference already has a snapshot on disk, so nothing should be captured. If it re-captures, the skip logic broke.

- [ ] **Step 7: Confirm nothing in the archive moved**

Run: `git status --porcelain`

Expected: only `scripts/archive.ts`, `src/lib/archive.test.ts`, and the two docs. **No file under `data/` may appear** — not a body, not a `.sha256`. If one does, stop and report: the smoke run wrote to the real archive.

- [ ] **Step 8: Commit**

```bash
git add yoga-trainingen-directory/scripts/archive.ts yoga-trainingen-directory/src/lib/archive.test.ts docs/superpowers/specs/2026-08-02-held-unreadable-artifacts-design.md docs/superpowers/plans/2026-08-02-held-unreadable-artifacts.md
git commit -m "No half-record: a failed capture stops before Wayback (#6)

If the local capture threw and the Wayback submission then succeeded, the node
got an archived_url with no local_snapshot — a record claiming a public archive
it holds no local copy for, the exact inverse of what methodologie.md publishes
and of CLAUDE.md's \"ALWAYS both\".

captureNode now returns as soon as the capture fails: no submission, no
archived_url, no throttle pause on a run that already failed. The run still
exits non-zero and names the source; the next run retries both halves.

Also folds in the parked citation fix from #13's final review: both correction
notes cited provenance.ts:606-610 for #7's crash-between-writes reference, which
is the unrelated \"never move the author's files\" paragraph. Correct span is
635-640."
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: the `finishCapture` seam and fix 1 → Task 1; fix 3 and the degraded-success decision → Task 2; fix 2 and the folded-in citation correction → Task 3. The spec's five tests map as: 1-4 → Task 1, the orphan guarantee → Task 2, fix 2's enforcement → Task 3.

**Placeholder scan.** None. Every step carries the code or the exact command.

**Type consistency.** `finishCapture(base: string, html: string): string` is identical in Tasks 1-2. `captureNode(node, dir, deps)` and `CaptureResult { changed, failedCapture }` match #10's shipped signatures, verified against `scripts/archive.ts`. The test helpers `nodeFrom`, `fakeCapture`, `deps`, and the `Capture` type already exist in `archive.test.ts` from #10 and are reused, not redefined.

**One deliberate deviation from strict TDD.** Task 2's test is a source-grep, not a behavioural test. `page.screenshot` throwing cannot be triggered without a browser, and faking one was rejected in #10 and again in this spec. The grep pins the two properties that matter — the `.catch` exists, and the degraded capture announces itself — and its weakness is the same one #10's wiring test carries and discloses: it cannot distinguish live code from a dead branch. Recorded here rather than left for a reviewer to discover.

**A risk this plan does not remove.** Task 2 changes behaviour that no test can execute: if `page.screenshot` throws in reality, we rely on the `.catch` being correct by inspection. The mitigation is that `finishCapture` (Task 1) is separately and behaviourally tested for the html-only case, so the *consequence* of that path — a hashed, correctly-named html-only capture — is pinned even though the path into it is not.
