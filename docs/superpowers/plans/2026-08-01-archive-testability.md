# captureNode Testability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `captureNode` in `scripts/archive.ts` importable and testable by injecting its capture function, so issue #6's fixes can be written test-first.

**Architecture:** `captureNode` takes its dependencies explicitly (`capture`, `submitWayback`, `force`, `skipWayback`, `pauseMs`) instead of reading module-scope constants and calling Playwright directly. The `browser` parameter disappears — it exists only to reach `saveLocalCopy`, so once capture is injected Playwright is closed over by the default. An entrypoint guard stops `main()` from running on import. Eight tests pin behaviour that is correct today.

**Tech Stack:** TypeScript, `node:test` via `tsx --test`, `yaml` (`parseDocument`/`YAMLMap`), Playwright (only inside the default capture).

## Global Constraints

- **No behaviour change.** This is infrastructure. Bugs in this file are #6 and #13.
- Spec: `docs/superpowers/specs/2026-08-01-archive-testability-design.md`.
- Tests live in `src/**/*.test.ts` — that is the glob `npm test` uses. A test in `scripts/` will not run.
- No network and no browser in any test. Every test injects `capture` and `submitWayback`.
- `npm test` and `npm run test:ci` must both stay green after every task.
- Dutch console strings are user-facing; copy them verbatim, do not translate.
- Commit after each task.

---

### Task 1: The seam — export `captureNode` with injected deps

**Files:**
- Modify: `yoga-trainingen-directory/scripts/archive.ts:267-336` (signature + body), `:458-465` (entrypoint guard)
- Create: `yoga-trainingen-directory/src/lib/archive.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Capture`, `CaptureDeps`, `captureNode` — all exported from `scripts/archive.ts`.

```ts
export type Capture = (dir: string, sourceId: string, url: string, query?: string) => Promise<string>;

export interface CaptureDeps {
  capture: Capture;
  submitWayback: (url: string) => Promise<string | null>;
  force: boolean;
  skipWayback: boolean;
  /** Throttle pause in ms after a Wayback submission. Injected because archive.org
   *  throttles hard and the real value is 10-30s — a test must not sleep for it. */
  pauseMs: number;
}

export async function captureNode(
  node: import("yaml").YAMLMap,
  dir: string,
  deps: CaptureDeps,
): Promise<boolean>;
```

- [ ] **Step 1: Write the failing test**

Create `yoga-trainingen-directory/src/lib/archive.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseDocument } from "yaml";
import { captureNode, type CaptureDeps, type Capture } from "../../scripts/archive";

/** A source-like node from YAML text. A provider's is an item in `sources[]`;
 *  a reference's IS the document root — both are a YAMLMap, which is the point. */
function nodeFrom(yaml: string): import("yaml").YAMLMap {
  return parseDocument(yaml).contents as import("yaml").YAMLMap;
}

/** Records every capture call and returns a path, without touching a browser. */
function fakeCapture(): Capture & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (dir: string, id: string) => {
    calls.push(`${dir}/${id}`);
    return `data/archives/${dir}/${id}-2026-08-01.pdf`;
  }) as Capture & { calls: string[] };
  fn.calls = calls;
  return fn;
}

function deps(over: Partial<CaptureDeps> = {}): CaptureDeps {
  return {
    capture: fakeCapture(),
    submitWayback: async () => null,
    force: false,
    skipWayback: true,
    pauseMs: 0,
    ...over,
  };
}

/** Capture console.log so "it announced itself" is assertable. */
function withLog<T>(fn: () => T): { logs: string[]; value: T } {
  const logs: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => void logs.push(a.map(String).join(" "));
  try {
    return { logs, value: fn() };
  } finally {
    console.log = orig;
  }
}

test("CAPTURE: a source with no url is skipped, and never silently", async () => {
  const capture = fakeCapture();
  const node = nodeFrom("id: gated-brochure\n");
  const { logs, value } = withLog(() => captureNode(node, "demo", deps({ capture })));
  const changed = await value;

  assert.equal(changed, false);
  assert.equal(capture.calls.length, 0, "must not attempt a capture without a url");
  assert.equal(node.get("local_snapshot"), undefined);
  assert.match(
    logs.join("\n"),
    /gated-brochure: overgeslagen \(geen url/,
    "a source the archiver cannot handle must say so — silence makes it look captured",
  );
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `cd yoga-trainingen-directory && npx tsx --test src/lib/archive.test.ts`

Expected: FAIL. `captureNode` is not exported, so the import is `undefined`; and importing `scripts/archive.ts` today runs `main()`, which launches Chromium. Both are what this task fixes.

- [ ] **Step 3: Add the entrypoint guard**

In `scripts/archive.ts`, replace the trailing dispatch (currently lines 458-465):

```ts
// Importing this module must not archive anything. `main()` at module scope means any
// test that imports captureNode launches Chromium and starts hitting the network —
// which is why this file had no tests. Same guard sync-archive.ts already uses.
if (process.argv[1] && path.resolve(process.argv[1]).endsWith("archive.ts")) {
  if (SYNC_ONLY) {
    syncArchive();
  } else {
    main().catch((e) => {
      console.error(e);
      process.exit(1);
    });
  }
}
```

- [ ] **Step 4: Inject the dependencies into `captureNode`**

Replace the signature and the two module reads. Add above `captureNode`:

```ts
/** What actually writes the local copy. Injected so a test can drive captureNode without
 *  a browser — and, in #6, make the capture fail on demand. Playwright stays inside the
 *  default, so it is an implementation detail of one function rather than a parameter
 *  threaded through the module. */
export type Capture = (dir: string, sourceId: string, url: string, query?: string) => Promise<string>;

export interface CaptureDeps {
  capture: Capture;
  submitWayback: (url: string) => Promise<string | null>;
  force: boolean;
  skipWayback: boolean;
  /** Throttle pause in ms after a Wayback submission. Injected because archive.org
   *  throttles hard and the real value is 10-30s — a test must not sleep for it. */
  pauseMs: number;
}
```

Change the signature (note: `browser` is gone, `node` moves first):

```ts
export async function captureNode(
  node: import("yaml").YAMLMap,
  dir: string,
  deps: CaptureDeps,
): Promise<boolean> {
```

Inside the body, make exactly these substitutions and change nothing else:

- `if (!hasLocal || FORCE)` → `if (!hasLocal || deps.force)`
- `await saveLocalCopy(browser, dir, sourceId, url, query)` → `await deps.capture(dir, sourceId, url, query)`
- `const needsWayback = archived == null || FORCE;` → `const needsWayback = archived == null || deps.force;`
- `} else if (!SKIP_WAYBACK && needsWayback) {` → `} else if (!deps.skipWayback && needsWayback) {`
- `await trySubmitWayback(url)` → `await deps.submitWayback(url)`
- the pause block:
  ```ts
  const pause = process.env.WAYBACK_ACCESS_KEY ? 10_000 : 30_000;
  await new Promise((r) => setTimeout(r, pause));
  ```
  →
  ```ts
  await new Promise((r) => setTimeout(r, deps.pauseMs));
  ```

- [ ] **Step 5: Update both call sites**

In `main()`, build the deps once after the browser is launched (after `const browser = await chromium.launch();`):

```ts
  // Playwright is closed over here and nowhere else.
  const deps: CaptureDeps = {
    capture: (dir, sourceId, url, query) => saveLocalCopy(browser, dir, sourceId, url, query),
    submitWayback: trySubmitWayback,
    force: FORCE,
    skipWayback: SKIP_WAYBACK,
    pauseMs: process.env.WAYBACK_ACCESS_KEY ? 10_000 : 30_000,
  };
```

Provider loop (currently line 428):

```ts
      if (await captureNode(item, providerId, deps)) changed = true;
```

Pass deps through `archiveReferences` (currently line 362):

```ts
async function archiveReferences(deps: CaptureDeps): Promise<void> {
```

and its call to captureNode (currently line 370):

```ts
    if (await captureNode(doc.contents as import("yaml").YAMLMap, REFERENCE_DIR_NAME, deps)) {
```

and its invocation in `main()` (currently line 437):

```ts
  await archiveReferences(deps);
```

- [ ] **Step 6: Fix the orphaned docblock**

The `archiveReferences` docblock currently sits above `const failedCaptures` (lines 338-346) because of an earlier edit. Move the `/** The shared reference store (spec §4.1b, v0.13) … */` block so it directly precedes `async function archiveReferences`, leaving `failedCaptures` with its own one-line comment.

- [ ] **Step 7: Run the test and the full suite**

Run: `cd yoga-trainingen-directory && npx tsx --test src/lib/archive.test.ts && npm test && npx tsc --noEmit`

Expected: the new test PASSES, the suite is 285+1 = 286 passing, 0 failing, and `tsc` is clean.

- [ ] **Step 8: Verify importing no longer launches a browser**

Run: `cd yoga-trainingen-directory && npx tsx -e "import('./scripts/archive').then(m => console.log('imported, captureNode is', typeof m.captureNode))"`

Expected: prints `imported, captureNode is function` and exits immediately. If it hangs or prints Wayback banners, the entrypoint guard is wrong.

- [ ] **Step 9: Commit**

```bash
git add yoga-trainingen-directory/scripts/archive.ts yoga-trainingen-directory/src/lib/archive.test.ts
git commit -m "Make captureNode importable: inject the capture function (#10)

main() ran at module scope, so importing the file launched Chromium, and
captureNode was not exported — which is why this file had no tests.

Injecting the capture function rather than faking a browser drops the browser
parameter entirely: it existed only to reach saveLocalCopy, so Playwright is now
closed over by the default and is an implementation detail of one function. The
Wayback throttle pause is injected too, because the real value is 10-30s and a
test must not sleep for it.

No behaviour change. First test pins that a url-less source announces itself:
silence made a source the archiver cannot handle indistinguishable from one it
captured fine."
```

---

### Task 2: `CaptureResult` — return the failure instead of mutating a global

**Files:**
- Modify: `yoga-trainingen-directory/scripts/archive.ts` (`captureNode` return type, `failedCaptures`, `main`)
- Modify: `yoga-trainingen-directory/src/lib/archive.test.ts`

**Interfaces:**
- Consumes: `captureNode`, `CaptureDeps`, `Capture` from Task 1.
- Produces: `CaptureResult { changed: boolean; failedCapture: string | null }`. `captureNode` now returns `Promise<CaptureResult>`; every caller reads `.changed`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/archive.test.ts`:

```ts
test("CAPTURE: a failed capture is REPORTED, not silently swallowed", async () => {
  const boom: Capture = async () => {
    throw new Error("net::ERR_NAME_NOT_RESOLVED");
  };
  const node = nodeFrom("id: unreachable\nurl: https://example.invalid/x\n");
  const result = await captureNode(node, "demo", deps({ capture: boom }));

  assert.equal(result.failedCapture, "unreachable", "the failing source id must come back");
  assert.equal(result.changed, false, "a failed capture changed nothing");
  assert.equal(
    node.get("local_snapshot"),
    undefined,
    "a record must never declare a snapshot the capture did not produce",
  );
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `cd yoga-trainingen-directory && npx tsx --test src/lib/archive.test.ts`

Expected: FAIL — `captureNode` returns a boolean, so `result.failedCapture` is `undefined`.

- [ ] **Step 3: Implement `CaptureResult`**

Add next to `CaptureDeps`:

```ts
export interface CaptureResult {
  /** The node was modified and its file needs writing. */
  changed: boolean;
  /** The source id whose LOCAL capture threw this run, or null. Returned rather than
   *  pushed into module state: a hidden global is neither assertable nor visible to a
   *  reader of this function's signature. */
  failedCapture: string | null;
}
```

In `captureNode`: declare `let failedCapture: string | null = null;` beside `let changed = false;`, replace `failedCaptures.push(sourceId);` with `failedCapture = sourceId;`, change the return type to `Promise<CaptureResult>`, and change the two `return` statements — the url-less early return becomes `return { changed: false, failedCapture: null };` and the final `return changed;` becomes `return { changed, failedCapture };`.

Delete the module-level `const failedCaptures: string[] = [];` and its comment.

In `main()`, declare it locally before the provider loop:

```ts
  /** Sources whose local capture threw this run. A run that ends green over one of these
   *  is a record shipping with no capture behind it. */
  const failedCaptures: string[] = [];
```

Provider loop:

```ts
      const { changed: nodeChanged, failedCapture } = await captureNode(item, providerId, deps);
      if (nodeChanged) changed = true;
      if (failedCapture) failedCaptures.push(failedCapture);
```

`archiveReferences` needs to report failures back. Change it to return them:

```ts
async function archiveReferences(deps: CaptureDeps): Promise<string[]> {
  const failed: string[] = [];
  …
    const { changed, failedCapture } = await captureNode(
      doc.contents as import("yaml").YAMLMap, REFERENCE_DIR_NAME, deps,
    );
    if (failedCapture) failed.push(failedCapture);
    if (changed) {
      fs.writeFileSync(filePath, doc.toString());
      console.log(`  → references/${file} bijgewerkt`);
    }
  }
  return failed;
}
```

and in `main()`: `failedCaptures.push(...(await archiveReferences(deps)));`

- [ ] **Step 4: Run the test and the full suite**

Run: `cd yoga-trainingen-directory && npx tsx --test src/lib/archive.test.ts && npm test && npx tsc --noEmit`

Expected: both tests PASS, suite green, `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git add yoga-trainingen-directory/scripts/archive.ts yoga-trainingen-directory/src/lib/archive.test.ts
git commit -m "captureNode returns its failure instead of mutating a module global (#10)

failedCaptures was module-level mutable state that captureNode pushed into: not
assertable, and invisible to anyone reading the signature. It is a returned
CaptureResult now, accumulated by main() and by archiveReferences, which had no
way to report a failure at all.

Same tally, same stderr message, same non-zero exit."
```

---

### Task 3: Pin the capture and Wayback decisions

**Files:**
- Modify: `yoga-trainingen-directory/src/lib/archive.test.ts`

**Interfaces:**
- Consumes: `captureNode`, `CaptureDeps`, `Capture`, `CaptureResult` from Tasks 1-2.
- Produces: nothing. Tests only — no source changes in this task.

- [ ] **Step 1: Write the four failing tests**

Append to `src/lib/archive.test.ts`:

```ts
/** A temp dir with a real file on disk, so "already archived" can be tested honestly:
 *  the check is that the FILE exists, not that the YAML declares a path. */
function withSnapshotOnDisk(rel: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archive-"));
  fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), "body");
  return root;
}

test("CAPTURE: an existing snapshot ON DISK is skipped without --force", async () => {
  const rel = "data/archives/demo/s-2026-08-01.pdf";
  const root = withSnapshotOnDisk(rel);
  const cwd = process.cwd();
  process.chdir(root);
  try {
    const capture = fakeCapture();
    const node = nodeFrom(`id: s\nurl: https://example.com/x\nlocal_snapshot: ${rel}\n`);
    const r = await captureNode(node, "demo", deps({ capture }));
    assert.equal(capture.calls.length, 0, "the file exists — do not re-capture");
    assert.equal(r.changed, false);
  } finally {
    process.chdir(cwd);
  }
});

test("CAPTURE: --force re-captures even when the snapshot exists", async () => {
  const rel = "data/archives/demo/s-2026-08-01.pdf";
  const root = withSnapshotOnDisk(rel);
  const cwd = process.cwd();
  process.chdir(root);
  try {
    const capture = fakeCapture();
    const node = nodeFrom(`id: s\nurl: https://example.com/x\nlocal_snapshot: ${rel}\n`);
    await captureNode(node, "demo", deps({ capture, force: true }));
    assert.equal(capture.calls.length, 1, "--force must actually escape the skip");
  } finally {
    process.chdir(cwd);
  }
});

test("CAPTURE: a Wayback-pointless URL never gets an archived_url written", async () => {
  const node = nodeFrom("id: ya\nurl: https://app.yogaalliance.org/schoolpublicprofile?id=1\n");
  const r = await captureNode(
    node,
    "demo",
    deps({
      skipWayback: false,
      submitWayback: async () => {
        throw new Error("must not submit a JS shell to Wayback");
      },
    }),
  );
  assert.equal(node.get("archived_url"), undefined);
  assert.equal(r.failedCapture, null);
});

test("CAPTURE: --skip-wayback suppresses submission", async () => {
  const node = nodeFrom("id: s\nurl: https://example.com/x\n");
  await captureNode(
    node,
    "demo",
    deps({
      skipWayback: true,
      submitWayback: async () => {
        throw new Error("must not submit when --skip-wayback is set");
      },
    }),
  );
  assert.equal(node.get("archived_url"), undefined);
});
```

- [ ] **Step 2: Run them and check which fail**

Run: `cd yoga-trainingen-directory && npx tsx --test src/lib/archive.test.ts`

Expected: **all four PASS immediately.** This task pins behaviour that is already correct; there is no implementation step. If any fails, stop — Task 1 changed behaviour it was not supposed to, and the substitution list in Task 1 Step 4 is where to look.

- [ ] **Step 3: Verify the tests are load-bearing, not vacuous**

Temporarily change `if (!hasLocal || deps.force)` to `if (true)` in `scripts/archive.ts`, re-run the test file, and confirm the "existing snapshot is skipped" test FAILS. Then revert the change.

Expected: FAIL while mutated, PASS after revert. A test that passes either way pins nothing.

- [ ] **Step 4: Commit**

```bash
git add yoga-trainingen-directory/src/lib/archive.test.ts
git commit -m "Pin the capture and Wayback decisions in captureNode (#10)

Four tests, no source change: an existing snapshot ON DISK is skipped without
--force (the check is that the file exists, not that the YAML declares a path);
--force escapes that skip; a Wayback-pointless URL is never submitted; and
--skip-wayback suppresses submission.

The two Wayback tests inject a submitWayback that throws, so 'never submitted'
is enforced rather than merely observed after the fact.

Mutation-checked: flipping the skip condition to always-capture turns the first
test red."
```

---

### Task 4: Pin that both paths are one path

**Files:**
- Modify: `yoga-trainingen-directory/src/lib/archive.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: nothing. Tests only.

- [ ] **Step 1: Write the two failing tests**

Append to `src/lib/archive.test.ts`:

> **Correction, post-review (2026-08-01).** The block below is what shipped, not what this
> plan originally proposed. The original draft's first test asserted
> `assert.deepEqual({changed: p.changed, failed: p.failedCapture}, {changed: r.changed, failed:
> r.failedCapture})` and was titled "a provider source and a reference document take the
> identical path." Review found that assertion tautological — `dir` drives none of
> `captureNode`'s branching (`hasLocal`, `WAYBACK_POINTLESS`, `excluded`, `skipWayback`, `force`
> are all `dir`-independent), so with identical node content and deps the two invocations were
> guaranteed equal for any two `dir` values, and the assertion could not go red. It was dropped
> in commit 2b939f0; the test was renamed and re-commented to say what it actually pins (`dir`
> reaches `deps.capture()` and the written `local_snapshot` — not end-to-end agreement between
> `main()`'s provider loop and `archiveReferences()`, which stays untested by design, checked
> only at the grep level by the wiring test). A later fix round also added an assertion to the
> wiring test pinning the entrypoint guard itself (finding I1) — included below.

```ts
test("CAPTURE: `dir` is threaded through, not hardcoded — a provider source and a reference document write to their own directory", async () => {
  // A provider's node is an item in sources[]; a reference's IS the document root — both are
  // handed to captureNode as a plain YAMLMap, and `dir` is the only thing that tells it which
  // one it has. Every decision inside captureNode (hasLocal, WAYBACK_POINTLESS, excluded,
  // skipWayback, force) is independent of `dir`, so this cannot pin "the two paths behave the
  // same" — with identical input they behave the same by construction, for any `dir`. What it
  // CAN pin, and does: `dir` actually reaches `deps.capture()` and the written `local_snapshot`,
  // rather than one of the two being hardcoded. Whether the two real call sites — main()'s
  // provider loop and archiveReferences() — agree with each other end to end (write timing,
  // how archiveReferences reads doc.contents) is untested here; that is the wiring test below,
  // and only at the grep level.
  const yaml = "id: doc\nurl: https://example.com/x\n";

  const provider = nodeFrom(yaml);
  const pCapture = fakeCapture();
  await captureNode(provider, "tribes-academy", deps({ capture: pCapture }));

  const reference = nodeFrom(yaml);
  const rCapture = fakeCapture();
  await captureNode(reference, "_references", deps({ capture: rCapture }));

  assert.equal(pCapture.calls[0], "tribes-academy/doc");
  assert.equal(rCapture.calls[0], "_references/doc");
  assert.equal(provider.get("local_snapshot"), "data/archives/tribes-academy/doc-2026-08-01.pdf");
  assert.equal(reference.get("local_snapshot"), "data/archives/_references/doc-2026-08-01.pdf");
});

test("CAPTURE: it is WIRED IN — both loops go through captureNode", () => {
  // Mirrors sync-archive.test.ts's wiring test. One shared routine is the whole point;
  // a second, parallel capture path would drift on the .sha256 sidecar, which is what
  // the evidentiary chain reads.
  const src = fs.readFileSync(
    path.join(process.cwd(), "scripts", "archive.ts"),
    "utf8",
  );
  assert.match(src, /captureNode\(item, providerId, deps\)/, "provider loop must use captureNode");
  assert.match(
    src,
    /captureNode\(\s*doc\.contents as import\("yaml"\)\.YAMLMap,\s*REFERENCE_DIR_NAME,\s*deps,?\s*\)/,
    "reference loop must use captureNode",
  );
  // The entrypoint guard is the single point of failure for the two assertions above: it is
  // what makes main() — and therefore both loops — run at all when `npm run archive` executes.
  // Nothing else pins it. If the filename check stops matching this file (a rename, a typo),
  // `npm run archive` becomes a SILENT NO-OP that exits 0 while the suite stays green, because
  // every other test drives captureNode directly and never goes through the guard. In this repo
  // that means a researcher believing evidence was captured when none was.
  assert.match(
    src,
    /endsWith\(path\.sep \+ "archive\.ts"\)/,
    "the entrypoint guard must name this file, or npm run archive silently does nothing",
  );
});
```

- [ ] **Step 2: Run them**

Run: `cd yoga-trainingen-directory && npx tsx --test src/lib/archive.test.ts`

Expected: both PASS. If the wiring test fails, the call sites in Task 1 Step 5 were written differently — update the regexes to match the real source rather than editing the source to match the regexes.

- [ ] **Step 3: Run every gate**

Run: `cd yoga-trainingen-directory && npm run build`

Expected: exit 0. `validate` 48 providers + 5 references, `provenance` 165/165, `npm test` and `npm run test:ci` both 293 passing / 0 failing (285 before + 8 new), `next build` ✓, `verify-export` ✓.

- [ ] **Step 4: Smoke-test the real archiver — it must capture nothing**

Run: `cd yoga-trainingen-directory && npm run archive -- _references --no-sync`

Expected: exit 0, prints the `_references` header and **no** `lokale kopie` lines — every reference already has a snapshot on disk, so the correct outcome is that nothing is captured and nothing is written. If it re-captures, the "already archived" check broke and Task 3's first test is wrong.

- [ ] **Step 5: Confirm the tree is clean**

Run: `git status --porcelain`

Expected: empty. The smoke run must not have modified any YAML. If it did, `captureNode` wrote something it should not have.

- [ ] **Step 6: Commit**

```bash
git add yoga-trainingen-directory/src/lib/archive.test.ts
git commit -m "Pin that providers and references are one capture path (#10)

The extraction's whole claim is that a provider's sources[] entry and a reference
document run the same routine — same decisions, same sidecar, differing only in
directory. Nothing asserted it. Now two do: an equivalence test on the outcome
and the written paths, and a wiring test that greps the source, mirroring
sync-archive.test.ts's 'a backup nobody runs is not a backup'.

Smoke-tested against the real archiver: a --no-sync run over the reference store
captures nothing and leaves the tree clean."
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: the seam and the vanished `browser` parameter → Task 1; `CaptureResult` replacing the global → Task 2; tests 2-5 → Task 3; tests 1, 6, 7 → Tasks 1 and 4; the entrypoint guard → Task 1 Step 3; the no-op smoke run → Task 4 Step 4.

**One addition the spec did not have.** `pauseMs` is injected. `captureNode` sleeps 10-30s after a Wayback submission (archive.org throttles hard), so without this any test reaching that branch blocks for half a minute. Discovered while planning; it is a dependency of the same kind as `capture` and `submitWayback`, so it belongs in `CaptureDeps` rather than in a separate seam.

**Not in this plan, by design.** #6's bug tests (they must go red first, and this ships green), `selectedReferenceFiles` coverage (#14), `main()` under test, and any change to `saveLocalCopy` (#6) or artifact classification (#13).

**Type consistency.** `Capture` is `(dir, sourceId, url, query?) => Promise<string>` in Tasks 1-4 and matches `saveLocalCopy(browser, providerId, sourceId, url, query?)` with the browser closed over. `captureNode(node, dir, deps)` keeps that argument order in every task and both call sites. `CaptureResult.failedCapture` is `string | null` — never `undefined` — and is read as such in Tasks 2-4.

**One assertion removed after review, post-merge (2026-08-01).** Task 4's first test shipped
with an `assert.deepEqual` across the provider and reference invocations' `{changed,
failedCapture}`, framed by this plan (and the design spec) as pinning "the identical path." A
final review round found it tautological: `dir` drives none of `captureNode`'s branching, so the
two invocations were guaranteed equal for any two `dir` values and the assertion could not fail.
Dropped in commit 2b939f0, with the test renamed and re-commented to state what it actually pins
— `dir` reaches `deps.capture()` and the written `local_snapshot`, not end-to-end caller
equivalence — and eight tests shipped, not seven, once "a failed capture is REPORTED" (Task 2)
is counted alongside the seven originally enumerated in the design spec's table. `npm test` and
`npm run test:ci` are 293 passing, not 292 (285 before + 8 new). Task 4's Step 1 code block above
reflects what shipped.
