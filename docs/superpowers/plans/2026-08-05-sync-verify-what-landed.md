# Verify what landed, and refuse to commit what did not — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `scripts/sync-archive.ts` hashes each body it wrote **as it now exists in the destination**, refuses to commit or push when what landed does not match the hash the public repo published, and tells the author what to do about the untracked files that refusal leaves behind.

**Architecture:** A third pass over `added`, after the copy loop and before the `if (!added.length)` early return, checking the landed body against the source-side published hash and the landed receipt against the source receipt. Failures go into a new `mislanded` field — distinct from `refused` because a refusal guarantees the destination was untouched and this guarantees the opposite. A `copyFile` seam in `SyncOptions` makes a bad landing producible from a test. #20's dirty-clone gate gets a corrected instruction, shared with the new refusal.

**Tech Stack:** TypeScript, `node:test` via `tsx --test`, `node:fs`, `node:crypto`, real temp-dir git repos in tests (no network, no mocks).

## Global Constraints

- Design: `docs/superpowers/specs/2026-08-05-sync-verify-what-landed-design.md`. **Read it before Task 1.** Its two predecessors — `2026-08-03-sync-verify-before-write-design.md` (#20) and `2026-08-02-sync-unverifiable-bodies-design.md` (#7) — each carry **dated correction notes** recording claims of their own that execution later disproved. Read the corrections, not just the claims above them.
- All `npm` commands run from `yoga-trainingen-directory/`. Baseline is **356 tests**; this plan ends at **363**.
- **Never move, rename, delete, re-hash or re-capture ANY file under `data/`.** Archive bodies are gitignored and exist on one machine; an agent once moved one meaning to move it back, crashed in between, and destroyed 364 lines of unrecoverable research.
- **Never run `npm run archive`** — it pushes to the real private archive repo. Every fixture in this plan builds its own temp dirs under `os.tmpdir()`.
- **This script never deletes, never moves, and never repairs.** Not leftovers, not on refusal, not on error — and *especially* not the file that failed its own receipt, which is the only diagnostic evidence of how it failed.
- **Never re-hash a mismatching file into agreement.** Forbidden by CLAUDE.md, and the reason this check is worth having.
- No change to Rule 1's or Rule 2's meaning, to the `skipped` disposition, to `isBody`, or to `IGNORABLE_JUNK`.
- **`localBodies()` sorts**, and `added` inherits that order. A fixture must place the affected body where it can actually influence the outcome — that is precisely why #20's defect survived three tests claiming to cover it.
- Tests that trigger a non-zero exit must reset `process.exitCode = 0` before returning — the existing convention in this file.
- Code comments in English, user-facing output in Dutch — match the surrounding file.
- Gates after every task: `npm test`, `npm run test:ci`, `npx tsc --noEmit`. Full `npm run build` before the final commit.

## File Structure

- **Modify:** `yoga-trainingen-directory/scripts/sync-archive.ts` — the only production file this plan touches.
- **Modify:** `yoga-trainingen-directory/src/lib/sync-archive.test.ts` — new fixture helpers and tests alongside the existing ones.

No new files.

---

### Task 1: A seam that can make a landing go wrong

**Files:**
- Modify: `yoga-trainingen-directory/scripts/sync-archive.ts` (`SyncOptions`, `defaultOptions()`, the two `fs.copyFileSync` calls in pass 2)

**Interfaces:**
- Consumes: nothing.
- Produces: `SyncOptions.copyFile: (src: string, dst: string) => void`, defaulting to `fs.copyFileSync`. Used for **both** the body and the receipt. Tasks 2–5 override it in fixtures.

Pure refactor. **No behaviour changes and no test-count changes** — the existing 356 tests are the regression check.

- [ ] **Step 1: Add the field to `SyncOptions`**

In `SyncOptions`, directly below `push`:

```ts
  /** What actually writes a file into the destination. Injected for exactly one reason:
   *  fs.copyFileSync cannot be made to write short from inside a test, and a short write is
   *  the failure the verification pass below exists for. A failure nobody can produce on
   *  demand is pinned by nothing. Same move, for the same reason, as archive.ts's `Capture`
   *  dep ("Injected so a test can drive captureNode without a browser — and, in #6, make the
   *  capture fail on demand"). Production never passes this; defaultOptions() supplies the
   *  real thing, and every other test in the suite exercises that default. */
  copyFile: (src: string, dst: string) => void;
```

- [ ] **Step 2: Default it in `defaultOptions()`**

Directly below `push: true,`:

```ts
    copyFile: (src, dst) => fs.copyFileSync(src, dst),
```

Written as an arrow rather than a bare `fs.copyFileSync` reference so the two-parameter contract is stated here rather than inferred from an overload with an optional `mode`.

- [ ] **Step 3: Route pass 2's two writes through it**

In the pass-2 loop, replace both `fs.copyFileSync(...)` calls. The loop becomes:

```ts
  for (const rel of toCopy) {
    const dst = path.join(dest, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    o.copyFile(path.join(o.archiveDir, rel), dst);
    // The receipt travels with the body, so the private repo is self-contained. No existence
    // check: this body is here only because publishedHash() read a hash for it OUT OF that
    // sidecar, so it is there. A conditional would describe a state the skip above has made
    // unreachable — and a dead branch is how the next reader learns the wrong invariant.
    const sidecar = sidecarFor(rel);
    o.copyFile(path.join(o.archiveDir, sidecar), path.join(dest, sidecar));
    added.push(rel);
  }
```

`fs.mkdirSync` stays a direct call — the seam is about what *writes a file*, not about directory creation, and a fixture has no reason to fail the latter.

- [ ] **Step 4: Verify nothing changed**

```bash
npm test && npm run test:ci && npx tsc --noEmit
```
Expected: **356 pass, 0 fail** on both suites; `tsc` silent.

- [ ] **Step 5: Commit**

```bash
git add yoga-trainingen-directory/scripts/sync-archive.ts
git commit -m "Sync: inject the copy step, so a bad landing can be produced on demand (#22)"
```

---

### Task 2: Pass 3 — hash what landed, and refuse to commit it

**Files:**
- Modify: `yoga-trainingen-directory/scripts/sync-archive.ts` (`SyncResult`, the `empty` literal, all five existing `return` sites, a new pass after the copy loop)
- Test: `yoga-trainingen-directory/src/lib/sync-archive.test.ts`

**Interfaces:**
- Consumes: `SyncOptions.copyFile` (Task 1); the module-local `sidecarFor(rel)`, `publishedHash(archiveDir, rel)`, `sha256(buf)`.
- Produces: `SyncResult.mislanded: string[]` — one `"<rel> — <reden>"` string per body that failed. Task 3 adds a second reason to it; Task 4 reads the underlying rel paths; Task 5's test observes the tree it leaves.
- Produces: the test helper `shortWriteOn(needle: string)`, used again in Task 3.

**Test count: 356 → 360.**

- [ ] **Step 1: Demonstrate the defect before fixing it**

The design requires this be *shown*, not asserted. Add this **temporary probe** at the end of the test file:

```ts
test("PROBE (temporary): today a short write is committed as though it verified", () => {
  const archiveDir = archiveWith("de pagina zoals een lezer hem zag");
  const repoPath = archiveRepo();

  captureLog(() => {
    syncArchive({
      archiveDir, repoPath, repoUrl: "unused", push: false,
      copyFile: (src, dst) => fs.writeFileSync(dst, fs.readFileSync(src).subarray(0, 4)),
    });
  });

  const landed = path.join(repoPath, DEST_SUBDIR, "testco", "site-2026-07.pdf");
  assert.equal(fs.readFileSync(landed, "utf8"), "de p", "the destination holds a truncated body");
  const msg = execFileSync("git", ["log", "-1", "--format=%B"], { cwd: repoPath, encoding: "utf8" });
  assert.match(msg, /^Archief: 1 snapshot/, "and it was COMMITTED");
  assert.match(msg, /elke body is geverifieerd/, "under a message asserting every body was verified");
});
```

- [ ] **Step 2: Run the probe — it must PASS**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)|PROBE"`
Expected: **357 pass, 0 fail**, with the PROBE test passing. A passing probe is the defect, reproduced. If it fails, stop and find out why before continuing — the rest of this task assumes this exact behaviour.

- [ ] **Step 3: Delete the probe, add the fixture helper**

Remove the PROBE test entirely. Add this helper beside the other fixture helpers, after `addVerifiedBodyBefore`:

```ts
/** A `copyFile` that lands the file whose path ends in `needle` SHORT — four bytes — and
 *  copies everything else faithfully. This is the disk-full / killed-mid-write / flushed-late
 *  failure, and there is no way to make the real fs.copyFileSync do it from inside a test.
 *  Selective on purpose: pass 3 checks the body and its receipt separately, and a fake that
 *  broke both at once could not tell the two checks apart. */
const shortWriteOn = (needle: string) => (src: string, dst: string) =>
  src.endsWith(needle)
    ? fs.writeFileSync(dst, fs.readFileSync(src).subarray(0, 4))
    : fs.copyFileSync(src, dst);
```

- [ ] **Step 4: Write the four failing tests**

Append to the test file:

```ts
test("SYNC: a body that lands WRONG is never committed — the hash is checked AFTER the write", () => {
  // Passes 1 and 2 both work from the SOURCE: pass 1 hashes the bytes it reads, pass 2
  // re-reads that same file to copy it. Neither ever looks at what arrived, so a short write
  // shipped and committed under a message attesting every body was verified — and then
  // deadlocked the next run on Rule 2, a state this script created itself.
  const archiveDir = archiveWith("de pagina zoals een lezer hem zag");
  const repoPath = archiveRepo();

  let r: ReturnType<typeof syncArchive> | undefined;
  const log = captureLog(() => {
    r = syncArchive({
      archiveDir, repoPath, repoUrl: "unused", push: false,
      copyFile: shortWriteOn("site-2026-07.pdf"),
    });
  });

  assert.equal(r!.mislanded.length, 1, "what landed fails the hash we published for it");
  assert.match(r!.mislanded[0], /site-2026-07\.pdf/, "and the body must be NAMED");
  assert.match(log, /VERKEERD aan/, "the report must say what went wrong");
  assert.equal(process.exitCode, 1, "a run that wrote something wrong must not exit 0");
  const msg = execFileSync("git", ["log", "-1", "--format=%B"], { cwd: repoPath, encoding: "utf8" });
  assert.doesNotMatch(msg, /^Archief:/, "a run whose write failed its own receipt must not commit");
  assert.equal(r!.pushed, false);
  process.exitCode = 0;
});

test("SYNC: a mislanded body is LEFT EXACTLY AS IT LANDED — this script repairs nothing", () => {
  // Deleting it would be the obvious tidy-up and it is forbidden twice over: this script
  // never removes from an evidence tree, and that file is the only evidence of HOW the write
  // failed. A body whose length is a fraction of its source says "disk full" to a human, and
  // says nothing at all once it is gone.
  const archiveDir = archiveWith("de pagina zoals een lezer hem zag");
  const repoPath = archiveRepo();

  captureLog(() => {
    syncArchive({
      archiveDir, repoPath, repoUrl: "unused", push: false,
      copyFile: shortWriteOn("site-2026-07.pdf"),
    });
  });

  assert.equal(
    fs.readFileSync(path.join(repoPath, DEST_SUBDIR, "testco", "site-2026-07.pdf"), "utf8"),
    "de p",
    "the failed copy must still be there, unrepaired and unremoved",
  );
  assert.equal(
    fs.readFileSync(path.join(archiveDir, "testco", "site-2026-07.pdf"), "utf8"),
    "de pagina zoals een lezer hem zag",
    "and the SOURCE must be untouched — nothing under data/archives/ is ever written by a sync",
  );
  process.exitCode = 0;
});

test("SYNC: pass 3 checks EVERY body it wrote, not up to the first failure", () => {
  // The mirror of the sort trap that hid #20's defect. If the loop stopped at the first
  // failure, `mislanded` would still be non-empty and every assertion above would pass while
  // the second corrupt body went unnamed.
  const archiveDir = archiveWith("de pagina");
  addVerifiedBodyBefore(archiveDir);
  const repoPath = archiveRepo();

  let r: ReturnType<typeof syncArchive> | undefined;
  captureLog(() => {
    r = syncArchive({
      archiveDir, repoPath, repoUrl: "unused", push: false,
      copyFile: shortWriteOn(".pdf"),
    });
  });

  assert.equal(r!.mislanded.length, 2, "both bodies landed short and both must be named");
  assert.match(r!.mislanded[0], /aaaco/);
  assert.match(r!.mislanded[1], /testco/);
  process.exitCode = 0;
});

test("SYNC: one body landing wrong does not un-write the good copies — `added` says what is on disk", () => {
  // localBodies() sorts, so aaaco is copied first; here it is the one that lands short and
  // testco lands fine. `added` must still hold BOTH, because both really are in the
  // destination working tree. Emptying it would rebuild the exact lie #20 removed: a return
  // value describing a tree tidier than the one on disk.
  const archiveDir = archiveWith("de pagina");
  const earlier = addVerifiedBodyBefore(archiveDir);
  const repoPath = archiveRepo();

  let r: ReturnType<typeof syncArchive> | undefined;
  captureLog(() => {
    r = syncArchive({
      archiveDir, repoPath, repoUrl: "unused", push: false,
      copyFile: shortWriteOn("eerder-2026-07.pdf"),
    });
  });

  assert.deepEqual(r!.added, [earlier, path.join("testco", "site-2026-07.pdf")], "both were WRITTEN");
  assert.equal(r!.mislanded.length, 1, "only one of them landed wrong");
  assert.match(r!.mislanded[0], /eerder-2026-07\.pdf/);
  assert.equal(r!.pushed, false, "and nothing reached the archive");
  assert.equal(
    fs.readFileSync(path.join(repoPath, DEST_SUBDIR, "testco", "site-2026-07.pdf"), "utf8"),
    "de pagina",
    "the good copy is left alone too — this script removes nothing, ever",
  );
  process.exitCode = 0;
});
```

- [ ] **Step 5: Run them — expect failure**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: **FAIL** — `r.mislanded` is `undefined`, so `.length` throws. That is the shape of red here; the *meaningful* red was Step 2's passing probe.

- [ ] **Step 6: Add `mislanded` to `SyncResult`**

After the `skipped` field:

```ts
  /** Bodies this run WROTE into the destination whose landed bytes do not match the hash the
   *  public repo published for them. NOT folded into `refused`, for the reason #7 refused to
   *  fold `skipped` into it: a Rule 1 or Rule 2 refusal carries the guarantee that the
   *  destination was never touched, and this carries the opposite. Nothing is committed and
   *  nothing is pushed — and nothing is deleted either.
   *  See docs/superpowers/specs/2026-08-05-sync-verify-what-landed-design.md */
  mislanded: string[];
```

- [ ] **Step 7: Add it to every return site**

There are six, and `tsc` will name any that is missed:

1. the `empty` literal near the top of `syncArchive()` — add `mislanded: []`
2. the `refused` early return — add `mislanded: []`
3. the `!added.length` early return — add `mislanded`
4. the "git stagede niets" return — add `mislanded`
5. the `!o.push` return — add `mislanded`
6. the final return — add `mislanded`

Sites 3–6 sit after the new `const mislanded` declared in Step 8, so they pass the variable rather than a literal.

- [ ] **Step 8: Add pass 3**

Immediately after the pass-2 `for (const rel of toCopy) { … }` loop closes, and **before** `if (!added.length)`:

```ts
  // PASS 3 — VERIFY WHAT LANDED. Passes 1 and 2 both work from the SOURCE, so nothing here
  // had ever looked at the destination: a short write — disk full, a process killed
  // mid-write, a filesystem reporting success before it flushed — shipped and committed under
  // a message attesting that every body was verified, and then deadlocked the NEXT run on
  // Rule 2, against a state this script created itself.
  //
  // The authority is the SOURCE-side sidecar — the one the public repo committed — never the
  // destination's own copy of it. A receipt that landed corrupt could agree with a body that
  // landed corrupt, and comparing a file to the receipt that travelled with it proves only
  // that the two arrived together.
  //
  // This also closes the time-of-check/time-of-use window #20 accepted between passes 1 and
  // 2: a source that drifted in it produces a destination that fails this check, in the same
  // run rather than on the next one.
  //
  // It iterates `added` and nothing else, deliberately. An `unchanged` body was already
  // verified from the destination side in THIS run — pass 1 read the destination and compared
  // it against a source buffer it had just matched to the published hash — and `skipped` and
  // `refused` bodies were never written at all. So this reads exactly the bytes this run
  // wrote: nothing on a no-op run, which is almost every run.
  const failures: { rel: string; why: string }[] = [];
  for (const rel of added) {
    // publishedHash() is non-null for everything in `added` — pass 1 read a hash for each of
    // them out of that same sidecar. A null HERE is therefore not #7's gap ("no receipt was
    // ever published"); it means the sidecar stopped listing this body while we ran, which is
    // a landing that cannot be vouched for either way.
    const want = publishedHash(o.archiveDir, rel);
    if (want === null || sha256(fs.readFileSync(path.join(dest, rel))) !== want) {
      failures.push({ rel, why: "wat er landde komt niet overeen met de gepubliceerde hash" });
    }
  }
  const mislanded = failures.map((f) => `${f.rel} — ${f.why}`);

  if (mislanded.length) {
    console.error(`\n✗ archief: ${mislanded.length} body/bodies kwamen VERKEERD aan in de kloon:`);
    for (const m of mislanded) console.error(`    ${m}`);
    console.error("  Er is NIETS vastgelegd en NIETS gepusht. Er is ook niets verwijderd:");
    console.error("  dit script haalt nooit iets uit een bewijsboom — en juist dit bestand is");
    console.error("  het enige bewijs van HOE het misging.");
    process.exitCode = 1;
    // No guard is needed against the "up-to-date" claim below: `added` is non-empty whenever
    // `mislanded` is, so that early return is unreachable from here. #7 had to ADD such a
    // guard for `skipped`, so the next reader will look for one — this is why there isn't.
    //
    // `added` is deliberately NOT emptied. Those files really are in the destination working
    // tree; `added` means WRITTEN and `pushed` means IN THE ARCHIVE, and the two were only
    // ever equal by luck. Returning `added: []` here would rebuild, in the code that fixes
    // it, the same lie #20 closed: a result describing a tree tidier than the one on disk.
    return { added, unchanged, refused, skipped, mislanded, pushed: false };
  }
```

- [ ] **Step 9: Extend the existing clean-run test**

In `"SYNC: a clean multi-body run still copies every body AND every receipt"`, directly after `assert.deepEqual(r.refused, []);`, add:

```ts
  assert.deepEqual(r.mislanded, [], "a clean run must not become a new way to stop backing evidence up");
```

- [ ] **Step 10: Run the suite**

```bash
npm test && npm run test:ci && npx tsc --noEmit
```
Expected: **360 pass, 0 fail** on both suites; `tsc` silent.

- [ ] **Step 11: Commit**

```bash
git add yoga-trainingen-directory/scripts/sync-archive.ts yoga-trainingen-directory/src/lib/sync-archive.test.ts
git commit -m "Sync: verify what landed, and refuse to commit what did not (#22)"
```

---

### Task 3: The receipt has to land intact too

**Files:**
- Modify: `yoga-trainingen-directory/scripts/sync-archive.ts` (pass 3's loop body)
- Test: `yoga-trainingen-directory/src/lib/sync-archive.test.ts`

**Interfaces:**
- Consumes: `failures` and the pass-3 loop from Task 2; `sidecarFor(rel)`; the `shortWriteOn(needle)` helper from Task 2.
- Produces: a second `why` string — `"de .sha256 ernaast is niet heel aangekomen"` — in the same `mislanded` array.

**Test count: 360 → 361.**

- [ ] **Step 1: Write the failing test**

Append to the test file:

```ts
test("SYNC: a PERFECT body whose RECEIPT landed corrupt is mislanded too", () => {
  // The receipt is what makes the private repo self-contained — pass 2's own comment says so.
  // A body arriving beside a garbled .sha256 is a body nobody downstream can verify, which is
  // exactly as broken as a garbled body. A fix that hashes only bodies is green on every test
  // above and blind to this.
  const archiveDir = archiveWith("de pagina");
  const repoPath = archiveRepo();

  let r: ReturnType<typeof syncArchive> | undefined;
  captureLog(() => {
    r = syncArchive({
      archiveDir, repoPath, repoUrl: "unused", push: false,
      copyFile: shortWriteOn("site-2026-07.sha256"),
    });
  });

  assert.equal(r!.mislanded.length, 1);
  assert.match(r!.mislanded[0], /\.sha256/, "the report must say it is the RECEIPT that failed");
  assert.equal(
    fs.readFileSync(path.join(repoPath, DEST_SUBDIR, "testco", "site-2026-07.pdf"), "utf8"),
    "de pagina",
    "the body itself landed perfectly — that is the whole point of this fixture",
  );
  const msg = execFileSync("git", ["log", "-1", "--format=%B"], { cwd: repoPath, encoding: "utf8" });
  assert.doesNotMatch(msg, /^Archief:/, "and it must not be committed");
  process.exitCode = 0;
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: **FAIL** — `mislanded.length` is `0`, *and* the `doesNotMatch(/^Archief:/)` assertion fails too. That second failure is the demonstrated red the design asks for: today the body-only check is green and the garbled receipt is committed anyway. The body hashes correctly, so nothing looks at the receipt yet.

- [ ] **Step 3: Add the receipt comparison**

Replace pass 3's loop body with:

```ts
  for (const rel of added) {
    // publishedHash() is non-null for everything in `added` — pass 1 read a hash for each of
    // them out of that same sidecar. A null HERE is therefore not #7's gap ("no receipt was
    // ever published"); it means the sidecar stopped listing this body while we ran, which is
    // a landing that cannot be vouched for either way.
    const want = publishedHash(o.archiveDir, rel);
    if (want === null || sha256(fs.readFileSync(path.join(dest, rel))) !== want) {
      failures.push({ rel, why: "wat er landde komt niet overeen met de gepubliceerde hash" });
      continue; // one finding per body: a corrupt landing is a corrupt landing, said once.
    }
    // The receipt must arrive whole as well. Byte equality rather than a hash check, because
    // nothing publishes a hash OF a sidecar. Pass 2 claims the receipt travels with the body
    // "so the private repo is self-contained"; this is what makes that a verified statement
    // rather than an assumption.
    // One sidecar can serve SEVERAL bodies — `site.html` and `site.pdf` share `site.sha256`,
    // the JS-rendered-price pair this whole archive is built around — so it is compared once
    // per body. `mislanded` is keyed by body, and a receipt that landed corrupt has broken the
    // evidence for both of them: two entries there is the correct report, not a duplicate.
    const sidecar = sidecarFor(rel);
    const landedReceipt = fs.readFileSync(path.join(dest, sidecar));
    const sourceReceipt = fs.readFileSync(path.join(o.archiveDir, sidecar));
    if (Buffer.compare(landedReceipt, sourceReceipt) !== 0) {
      failures.push({ rel, why: "de .sha256 ernaast is niet heel aangekomen" });
    }
  }
```

- [ ] **Step 4: Run the suite**

```bash
npm test && npm run test:ci && npx tsc --noEmit
```
Expected: **361 pass, 0 fail** on both suites; `tsc` silent.

- [ ] **Step 5: Commit**

```bash
git add yoga-trainingen-directory/scripts/sync-archive.ts yoga-trainingen-directory/src/lib/sync-archive.test.ts
git commit -m "Sync: the receipt has to land intact too, or the private repo stands on nothing (#22)"
```

---

### Task 4: Say WHICH of the two causes it was

**Files:**
- Modify: `yoga-trainingen-directory/scripts/sync-archive.ts` (new `sourceVerdict()` above `syncArchive`, called from the mislanded block)
- Test: `yoga-trainingen-directory/src/lib/sync-archive.test.ts`

**Interfaces:**
- Consumes: `failures` (Task 2), `publishedHash`, `sha256`.
- Produces: `function sourceVerdict(archiveDir: string, rels: string[]): string[]` — module-local, returns the console lines describing what the source looks like *now*. Task 5 prints nothing from it; it is called only from the mislanded block.
- Produces: the test helper `driftingCopy`.

**Test count: 361 → 362.**

A mislanded body has two possible causes and they need opposite responses. Either the **write** was short or corrupt (source fine), or the **source drifted** between pass 1's hash and pass 2's read — the window #20 accepted, which pass 3 now closes. "The write was short" is a confidently wrong sentence when it was the second, and it sends the author round a loop: clear the debris, re-run, get refused by Rule 1, and read a real evidence change as a flaky disk.

- [ ] **Step 1: Write the failing test**

Add the helper beside `shortWriteOn`:

```ts
/** A `copyFile` that rewrites the SOURCE and then copies it faithfully — the
 *  time-of-check/time-of-use drift #20 accepted between its two passes, and which pass 3
 *  closes. The destination ends up a perfect copy of a file that is no longer the one pass 1
 *  verified. That is a different event from a short write and needs the opposite response
 *  from the author, so the report must not confuse the two. */
const driftingCopy = (src: string, dst: string) => {
  if (src.endsWith(".pdf")) fs.writeFileSync(src, "de bron veranderde onder ons");
  fs.copyFileSync(src, dst);
};
```

And append the test:

```ts
test("SYNC: when the SOURCE drifted, the report says so — not that the copy broke", () => {
  const archiveDir = archiveWith("de pagina");
  const repoPath = archiveRepo();

  const log = captureLog(() => {
    syncArchive({ archiveDir, repoPath, repoUrl: "unused", push: false, copyFile: driftingCopy });
  });

  assert.match(log, /VERKEERD aan/, "it is still a mislanded body");
  assert.match(log, /de BRON is veranderd/, "and the cause is an evidence event, not a bad disk");
  assert.doesNotMatch(log, /het kopiëren ging mis/, "which is the opposite of what a short write means");
  process.exitCode = 0;
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: **FAIL** on `/de BRON is veranderd/` — the message names no cause at all yet.

- [ ] **Step 3: Add `sourceVerdict()`**

Place it directly above `export function syncArchive`:

```ts
/** WHICH of the two causes a mislanded body had. A landed body can fail its published hash
 *  because the WRITE was short or corrupt (the source is fine), or because the SOURCE drifted
 *  between pass 1's hash and pass 2's read. They are not the same event and the author must do
 *  opposite things about them, so this reports what it can see NOW rather than guessing.
 *
 *  A source we cannot READ is a third answer, kept separate on purpose: an artifact we hold but
 *  cannot open is a hole in our own tooling, not a finding about the file. Collapsing that into
 *  "the source is wrong" is the `strings` mistake that put a false sentence about a named
 *  business into the dataset. */
function sourceVerdict(archiveDir: string, rels: string[]): string[] {
  const drifted: string[] = [];
  const unreadable: string[] = [];
  for (const rel of rels) {
    try {
      const want = publishedHash(archiveDir, rel);
      if (want === null || sha256(fs.readFileSync(path.join(archiveDir, rel))) !== want) {
        drifted.push(rel);
      }
    } catch {
      unreadable.push(rel);
    }
  }
  if (unreadable.length) {
    return [
      "  Het bronbestand in data/archives/ is NIET te lezen. Dat is een gat in ons eigen",
      "  gereedschap, geen bevinding over dat bestand — zoek dát eerst uit.",
    ];
  }
  if (drifted.length) {
    return [
      "  Het bronbestand in data/archives/ klopt ZELF niet meer met zijn gepubliceerde hash.",
      "  Het kopiëren ging goed; de BRON is veranderd. Zoek uit waaróm — hash hem niet",
      "  opnieuw. Opruimen in de kloon is veilig, maar de volgende run weigert terecht",
      "  onder regel 1 tot dit is uitgezocht.",
    ];
  }
  return [
    "  Het bronbestand in data/archives/ klopt zelf nog wél met zijn gepubliceerde hash —",
    "  het kopiëren ging mis, niet de capture.",
  ];
}
```

- [ ] **Step 4: Call it from the mislanded block**

Directly after the `"het enige bewijs van HOE het misging."` line, and before `process.exitCode = 1;`:

```ts
    for (const line of sourceVerdict(o.archiveDir, failures.map((f) => f.rel))) console.error(line);
```

- [ ] **Step 5: Pin the other branch too**

In `"SYNC: a body that lands WRONG is never committed — the hash is checked AFTER the write"` (Task 2), directly after the `assert.match(log, /VERKEERD aan/, …)` line, add:

```ts
  assert.match(log, /het kopiëren ging mis/, "the source is intact here, so this is a bad WRITE");
```

Without this the drift test could pass against an implementation that reports drift unconditionally.

- [ ] **Step 6: Run the suite**

```bash
npm test && npm run test:ci && npx tsc --noEmit
```
Expected: **362 pass, 0 fail** on both suites; `tsc` silent.

- [ ] **Step 7: Commit**

```bash
git add yoga-trainingen-directory/scripts/sync-archive.ts yoga-trainingen-directory/src/lib/sync-archive.test.ts
git commit -m "Sync: a bad write and a drifted source are different events — say which (#22)"
```

---

### Task 5: What the author does about the tree it leaves

**Files:**
- Modify: `yoga-trainingen-directory/scripts/sync-archive.ts` (new `cleanupAdvice()`; the dirty-clone gate's message; the mislanded message)
- Test: `yoga-trainingen-directory/src/lib/sync-archive.test.ts`

**Interfaces:**
- Consumes: `DEST_SUBDIR`; the mislanded block (Task 2); the dirty-clone gate (pre-existing, from #20).
- Produces: `function cleanupAdvice(repoPath: string): string[]` — module-local, returns the console lines telling the author what to do with untracked files under the archive subdirectory. Printed by **both** refusals.

**Test count: 362 → 363.**

Pass 3 leaves untracked files in the clone — the bad one plus any good copies from the same run — which is exactly the state #20's gate refuses to sync on top of. That deadlock is correct. What is *not* correct is the gate's current advice:

> `Verwijder wat hier niet hoort, leg vast wat er wél hoort, en draai daarna opnieuw.`

**Commit what belongs** is how the corrupt body enters the archive's history, and it is wrong for every case the gate fires, not only this one: committing an untracked body there asserts the sync verified it, and the sync did not.

- [ ] **Step 1: Write the failing test**

Append to the test file:

```ts
test("SYNC: the run AFTER a mislanded one is refused — and told NOT to commit the debris", () => {
  // Pass 3 commits nothing and deletes nothing, so the clone is left holding untracked files:
  // precisely the state #20's dirty-clone gate refuses to sync on top of. The deadlock is
  // correct and deliberate. What the author is TOLD about it is the design work — and the
  // gate's old advice, "commit what belongs", is how the corrupt body would enter history.
  const archiveDir = archiveWith("de pagina");
  const repoPath = archiveRepo();
  captureLog(() => {
    syncArchive({
      archiveDir, repoPath, repoUrl: "unused", push: false,
      copyFile: shortWriteOn("site-2026-07.pdf"),
    });
  });
  process.exitCode = 0;

  let r: ReturnType<typeof syncArchive> | undefined;
  const log = captureLog(() => {
    r = syncArchive({ archiveDir, repoPath, repoUrl: "unused", push: false });
  });

  assert.match(log, /niet-vastgelegde/, "the gate must fire on the debris the failed run left");
  assert.match(log, /site-2026-07\.pdf/, "and name it, or the refusal is unactionable");
  assert.doesNotMatch(log, /leg vast wat er wél hoort/, "committing it is how the bad body enters history");
  // Assert the whole COMMAND, not just the repo path: ensureClone() already prints that path
  // ("archief: <repoPath> — bijwerken… "), so a bare path assertion would pass against a
  // message that left `<repo>` in the command for the author to fill in by hand.
  const escaped = repoPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(log, new RegExp(`git -C ${escaped} clean -fdx`),
    "the command must arrive complete — one completed by hand is one completed wrongly");
  assert.match(log, /raakt nooit iets aan dat is vastgelegd/,
    "and it must say WHY that command is safe, or it reads as `rm` in an evidence tree");
  assert.deepEqual(r!.added, [], "and nothing is synced on top of a tree nobody can account for");
  assert.equal(process.exitCode, 1);
  process.exitCode = 0;
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: **FAIL** on `/leg vast wat er wél hoort/` — the gate still prints it.

- [ ] **Step 3: Add `cleanupAdvice()`**

Place it directly above `sourceVerdict()`:

```ts
/** What to do with untracked files under the archive subdirectory of the clone. Printed by
 *  BOTH refusals that can leave them — the dirty-clone gate and the mislanded block — because
 *  both leave the author facing the same tree, and because the specific message prints once, in
 *  a run whose output may have scrolled away days ago. The gate's has to be correct WITHOUT
 *  knowing what put the files there.
 *
 *  `git clean` rather than `rm`: its safety is structural rather than a matter of care — it
 *  cannot remove a tracked file, and everything ever archived IS tracked. An instruction that
 *  depends on the author being careful inside an evidence tree is the instruction that once
 *  destroyed 364 lines of unrecoverable research.
 *
 *  `-x` is deliberate, and pairs with the gate's own `--ignored`. The private repo can inherit
 *  the PUBLIC repo's .gitignore — which is exactly why `git add --force` exists further down —
 *  and without `-x` a body the gate has just listed could be one `clean` silently declines to
 *  remove. An instruction that appears to do nothing is worse than no instruction. It stays
 *  safe for the reason above: tracked files are untouchable either way.
 *
 *  The "always a copy" claim is held to a CHECK rather than asserted. It is true of everything
 *  this code can produce — the source is still in data/archives/, so the copy is never the only
 *  exemplar of anything — but the gate also fires on files no version of this script wrote, and
 *  a universal claim that is merely usually true is not one this project ships. */
function cleanupAdvice(repoPath: string): string[] {
  return [
    "  Leg hier NIETS met de hand vast: deze sync heeft deze bestanden nooit geverifieerd,",
    "  en vastleggen is precies de bewering dat hij dat wél deed.",
    "  Elke body die hier hoort staat óók in data/archives/. Controleer dat per pad hierboven —",
    "  klopt het, dan is dit een kopie en nooit het enige exemplaar, en kopieert en controleert",
    "  de volgende run hem alsnog:",
    `    git -C ${repoPath} clean -ndx -- ${DEST_SUBDIR}   (kijken)`,
    `    git -C ${repoPath} clean -fdx -- ${DEST_SUBDIR}   (opruimen)`,
    "  `git clean` raakt nooit iets aan dat is vastgelegd.",
  ];
}
```

- [ ] **Step 4: Replace the gate's advice**

In the dirty-clone block, delete these two lines:

```ts
    console.error("  Verwijder wat hier niet hoort, leg vast wat er wél hoort, en draai daarna");
    console.error("  opnieuw.");
```

and put in their place:

```ts
    for (const line of cleanupAdvice(o.repoPath)) console.error(line);
```

- [ ] **Step 5: Print it on the mislanded refusal too**

In the mislanded block, after the `sourceVerdict(...)` loop added in Task 4 and before `process.exitCode = 1;`:

```ts
    for (const line of cleanupAdvice(o.repoPath)) console.error(line);
```

- [ ] **Step 6: Run the suite**

```bash
npm test && npm run test:ci && npx tsc --noEmit
```
Expected: **363 pass, 0 fail** on both suites; `tsc` silent.

If the pre-existing dirty-clone tests fail, read what they assert before changing anything — they pin `/niet-vastgelegde/` and the named path, neither of which this task touches.

- [ ] **Step 7: Commit**

```bash
git add yoga-trainingen-directory/scripts/sync-archive.ts yoga-trainingen-directory/src/lib/sync-archive.test.ts
git commit -m "Sync: no untracked body in that clone should ever be committed by hand (#22)"
```

---

### Task 6: The full gate

**Files:** none modified unless a gate fails.

- [ ] **Step 1: Run the whole build**

```bash
cd yoga-trainingen-directory && npm run build
```
Expected: `gen-schema` → `validate` → `provenance` → `test` → `test:ci` → `export-json` → `next build`, all green. **363 tests** in both suites.

- [ ] **Step 2: Confirm the corpus is untouched**

```bash
git status --porcelain -- yoga-trainingen-directory/data/
```
Expected: **empty**. This plan writes nothing under `data/`; anything here means a fixture escaped its temp dir, and that is a stop-everything result.

- [ ] **Step 3: Confirm the export did not drift**

```bash
git status --porcelain -- yoga-trainingen-directory/public/data/v1/providers.json
```
Expected: **empty**. `npm run build` regenerates it, and nothing in this plan touches the data pipeline, so a diff here means something unrelated moved and needs explaining before the branch merges.

- [ ] **Step 4: Commit if the build produced anything**

Only if steps 2–3 came back non-empty **and** the change is explained:

```bash
git add -A && git commit -m "Sync: regenerate after the build gate (#22)"
```

Otherwise there is nothing to commit and the branch is ready for review.
