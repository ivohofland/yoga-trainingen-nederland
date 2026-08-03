# Verify the whole run before writing any of it — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A refusal — Rule 1 or Rule 2 — leaves the destination untouched, so the sync's own "Er is NIETS gepusht" is true; and a clone holding uncommitted bodies is refused rather than synced on top of.

**Architecture:** `syncArchive()`'s single loop splits into a read-only classification pass and a write-only copy pass, with the refusal decision between them. One local helper replaces a second derivation of the sidecar path. A `git status` check on the archive clone runs before either pass.

**Tech Stack:** TypeScript, `node:test` via `tsx --test`, `node:fs`, `node:crypto`, real temp-dir git repos in tests (no network, no mocks).

## Global Constraints

- Design: `docs/superpowers/specs/2026-08-03-sync-verify-before-write-design.md`. Read it before Task 1.
- All `npm` commands run from `yoga-trainingen-directory/`. Baseline is **316 tests**.
- **Never move, rename, delete, re-hash or re-capture ANY file under `data/`.** Archive bodies are gitignored and exist on one machine; an agent once moved one meaning to move it back, crashed in between, and destroyed 364 lines of unrecoverable research.
- **Never run `npm run archive`** — it pushes to the real private archive repo. All tests use temp dirs under `os.tmpdir()`.
- **This script never deletes.** Not leftovers, not on refusal, not on error. A fix that introduced deletion would be a worse defect than the one it closes.
- No change to Rule 1's or Rule 2's meaning, to the `skipped` disposition, to `isBody`, or to what counts as a body.
- **`localBodies()` sorts.** Any fixture exercising a refusal must place a *verifying* body BEFORE the failing one, or it proves nothing — that is precisely why this defect survived three tests that claim to cover it.
- Tests that trigger a non-zero exit must reset `process.exitCode = 0` before returning — the existing convention in this file.
- Code comments in English, user-facing output in Dutch — match the surrounding file.
- Gates after every task: `npm test`, `npm run test:ci`, `npx tsc --noEmit`. Full `npm run build` before the final commit. `npm run provenance` must stay ✓ 165/165.

## File Structure

- **Modify:** `yoga-trainingen-directory/scripts/sync-archive.ts` — the only production file this plan touches.
- **Modify:** `yoga-trainingen-directory/src/lib/sync-archive.test.ts` — new fixtures and tests alongside the existing ones.

No new files.

---

### Task 1: One derivation of the sidecar path, not two

**Files:**
- Modify: `yoga-trainingen-directory/scripts/sync-archive.ts` (`publishedHash()`, and the receipt copy inside the loop)

**Interfaces:**
- Consumes: nothing.
- Produces: `function sidecarFor(rel: string): string` — module-local, takes an archive-relative body path (`testco/site-2026-07.pdf`), returns the archive-relative path of its receipt (`testco/site-2026-07.sha256`). Task 2's copy pass uses it.

This is a pure refactor. **No behaviour changes and no test count changes** — the existing 316 tests are the regression check.

- [ ] **Step 1: Add the helper**

Place it directly above `publishedHash()`:

```ts
/** The receipt's path for a body, relative to the archive root. A capture's `.sha256` is
 *  named after the body with its extension stripped — and that derivation is needed in two
 *  places: publishedHash() reads the hash out of it, and the copy pass ships it alongside
 *  the body. Deriving it twice is how the two quietly stop agreeing about which file is
 *  which. (Issue #12 tracks the same duplication across other files; this closes only the
 *  two sites inside this one.) */
function sidecarFor(rel: string): string {
  const base = path.basename(rel).replace(/\.[a-z0-9]+$/i, "");
  return path.join(path.dirname(rel), `${base}.sha256`);
}
```

- [ ] **Step 2: Use it in `publishedHash()`**

Replace its first two statements:

```ts
  const base = path.basename(rel).replace(/\.[a-z0-9]+$/i, "");
  const sidecar = path.join(archiveDir, path.dirname(rel), `${base}.sha256`);
```

with:

```ts
  const sidecar = path.join(archiveDir, sidecarFor(rel));
```

- [ ] **Step 3: Use it at the receipt copy**

Inside the loop, replace:

```ts
    const base = path.basename(rel).replace(/\.[a-z0-9]+$/i, "");
    const sidecar = path.join(path.dirname(rel), `${base}.sha256`);
    const sidecarSrc = path.join(o.archiveDir, sidecar);
```

with:

```ts
    const sidecar = sidecarFor(rel);
    const sidecarSrc = path.join(o.archiveDir, sidecar);
```

Leave the comment below it (the one explaining why the copy needs no existence check) exactly as it is.

- [ ] **Step 4: Verify nothing changed**

Run: `npm test`, then `npm run test:ci`, then `npx tsc --noEmit`

Expected: **316/316** on both tiers — the same count and the same tests as before. `tsc` exit 0.

- [ ] **Step 5: Prove the helper is actually used by both sites**

Run: `grep -n 'replace(/\\.\[a-z0-9\]+\$/i, "")' yoga-trainingen-directory/scripts/sync-archive.ts`

Expected: exactly **one** match, inside `sidecarFor`. More than one means a derivation site was missed.

- [ ] **Step 6: Commit**

```bash
git add yoga-trainingen-directory/scripts/sync-archive.ts
git commit -F - <<'MSG'
Sync: derive the receipt path once, not twice (#20)

publishedHash() and the receipt copy each rebuilt the .sha256 path from
the body path. The next task needs it in the copy pass too, which would
have made three — and issue #12 already tracks this same duplication
spreading across files.

Pure refactor: 316/316 unchanged.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 2: Decide the whole run, then write it

**Files:**
- Modify: `yoga-trainingen-directory/scripts/sync-archive.ts` (the body loop, and the copy step's new position after the `refused` early return)
- Test: `yoga-trainingen-directory/src/lib/sync-archive.test.ts`

**Interfaces:**
- Consumes: `sidecarFor(rel: string): string` from Task 1.
- Produces: fixture `addVerifiedBodyBefore(dir: string): string` — adds a body that verifies, under a provider sorting before `testco`, and returns its archive-relative path. Task 3 does not need it.

- [ ] **Step 1: Write the failing tests**

Add this fixture below the existing `addUnlistedArtifact` helper:

```ts
/** Adds a body that VERIFIES, under a provider sorting BEFORE `testco`. localBodies() sorts,
 *  so this body is classified — and, before this fix, COPIED — before testco's problem is
 *  reached. Every fixture in this file lacked that shape, which is exactly why a leak three
 *  tests claim to cover survived for as long as the file has existed. */
function addVerifiedBodyBefore(dir: string): string {
  const rel = path.join("aaaco", "eerder-2026-07.pdf");
  const body = "een body die WEL klopt";
  fs.mkdirSync(path.join(dir, "aaaco"), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), body);
  fs.writeFileSync(
    path.join(dir, "aaaco", "eerder-2026-07.sha256"),
    `${sha256(body)}  eerder-2026-07.pdf\n`,
  );
  return rel;
}
```

Add these three tests at the end of the file:

```ts
test("SYNC: a hash refusal leaves NOTHING behind — not even a body that already verified", () => {
  // The leak this fixture exists to catch: bodies were copied as they verified, and the
  // refusal was decided only after the whole loop. "aaaco" sorts before "testco", so it was
  // already sitting in the destination when testco's mismatch stopped the run.
  const archiveDir = archiveWith("de pagina", sha256("een ANDERE pagina"));
  const earlier = addVerifiedBodyBefore(archiveDir);
  const repoPath = archiveRepo();

  const r = syncArchive({ archiveDir, repoPath, repoUrl: "unused", push: false });

  assert.equal(r.refused.length, 1, "testco still fails its published hash");
  assert.deepEqual(r.added, [], "and a refusal still reports that nothing was pushed");
  assert.ok(
    !fs.existsSync(path.join(repoPath, DEST_SUBDIR, earlier)),
    "a body that verified BEFORE the mismatch was written anyway — the refusal came too late",
  );
  assert.ok(
    !fs.existsSync(path.join(repoPath, DEST_SUBDIR, "aaaco", "eerder-2026-07.sha256")),
    "and its receipt was written with it",
  );
  process.exitCode = 0;
});

test("SYNC: an APPEND-ONLY refusal leaves nothing behind either — Rule 2 leaked exactly as Rule 1 did", () => {
  // Rule 2 is also decided inside the loop, after earlier bodies may already have been
  // copied. A fix that moved only the hash check would pass the test above and leave this
  // half of the defect standing.
  const repoPath = archiveRepo();
  const archived = path.join(repoPath, DEST_SUBDIR, "testco");
  fs.mkdirSync(archived, { recursive: true });
  fs.writeFileSync(path.join(archived, "site-2026-07.pdf"), "de ORIGINELE capture");

  const archiveDir = archiveWith("een ANDERE capture, zelfde naam");
  const earlier = addVerifiedBodyBefore(archiveDir);

  const r = syncArchive({ archiveDir, repoPath, repoUrl: "unused", push: false });

  assert.equal(r.refused.length, 1);
  assert.match(r.refused[0], /ANDERE inhoud/);
  assert.deepEqual(r.added, []);
  assert.ok(
    !fs.existsSync(path.join(repoPath, DEST_SUBDIR, earlier)),
    "the append-only refusal came after the earlier body had already been written",
  );
  assert.equal(
    fs.readFileSync(path.join(archived, "site-2026-07.pdf"), "utf8"),
    "de ORIGINELE capture",
    "and the archived body must still be untouched",
  );
  process.exitCode = 0;
});

test("SYNC: a clean multi-body run still copies every body AND every receipt", () => {
  // The opposite failure to the one above, and the worse one: a fix that wrote too little
  // would stop backing evidence up, which is how 32 captures came to exist on one laptop.
  const archiveDir = archiveWith("de pagina");
  const earlier = addVerifiedBodyBefore(archiveDir);
  const repoPath = archiveRepo();

  const r = syncArchive({ archiveDir, repoPath, repoUrl: "unused", push: false });

  assert.deepEqual(r.refused, []);
  assert.deepEqual(
    r.added,
    [earlier, path.join("testco", "site-2026-07.pdf")],
    "localBodies() sorts, so aaaco is added before testco",
  );
  for (const rel of [earlier, path.join("testco", "site-2026-07.pdf")]) {
    assert.ok(fs.existsSync(path.join(repoPath, DEST_SUBDIR, rel)), `body missing: ${rel}`);
  }
  for (const rel of ["aaaco/eerder-2026-07.sha256", "testco/site-2026-07.sha256"]) {
    assert.ok(fs.existsSync(path.join(repoPath, DEST_SUBDIR, rel)), `receipt missing: ${rel}`);
  }
});
```

- [ ] **Step 2: Run the tests to verify the first two FAIL**

Run: `npm test -- --test-name-pattern="leaves NOTHING behind|leaves nothing behind either"`

Expected: BOTH fail, on the "was written anyway" / "had already been written" assertions. These two tests are the deliverable — a version of them that passes before the fix would be worthless. Record the exact failure output; you must report it.

The third test ("clean multi-body run") should already PASS — it is a regression guard, not a defect demonstration. If it fails now, stop and report: something else is wrong.

- [ ] **Step 3: Split the loop into two passes**

In `syncArchive()`, declare the queue beside the other accumulators (`added`, `refused`, `skipped`, `unchanged`):

```ts
  const toCopy: string[] = [];
```

Then replace the whole body loop with a classification-only pass. Everything from `const dst = …` onward that *wrote* is gone; the decisions stay:

```ts
  // PASS 1 — DECIDE. This pass writes NOTHING. Bodies used to be copied as they verified
  // while the refusal was decided only after the loop, so a body that passed ahead of a
  // failing one sat in the destination while the run reported "Er is NIETS gepusht" — and
  // being byte-identical, it counted as `unchanged` on the next run, which then reported
  // up-to-date and exited 0. See docs/superpowers/specs/2026-08-03-sync-verify-before-write-design.md
  for (const rel of localBodies(o.archiveDir)) {
    const buf = fs.readFileSync(path.join(o.archiveDir, rel));

    // RULE 1 — THE BODY MUST MATCH THE HASH WE PUBLISHED FOR IT. The public repo commits a
    // .sha256 asserting that these exact bytes existed on this date. A body that fails its
    // own receipt must never be pushed as though it satisfied it.
    // NO PUBLISHED HASH ⇒ NOTHING TO VERIFY AGAINST ⇒ NOT OURS TO ATTEST TO. publishedHash()
    // returns null down two paths — no sidecar at all, and a sidecar holding no line for THIS
    // file — and both mean the same thing here, which is why this keys on its return value
    // rather than on the sidecar's existence. Never generate the missing hash: hashing
    // whatever is on disk now attests to nothing, and a receipt counts only once the PUBLIC
    // repo commits it. See docs/superpowers/specs/2026-08-02-sync-unverifiable-bodies-design.md
    // for why this skips rather than refusing.
    const want = publishedHash(o.archiveDir, rel);
    if (want === null) {
      skipped.push(rel);
      continue;
    }
    if (sha256(buf) !== want) {
      refused.push(`${rel} — komt niet overeen met de gepubliceerde hash`);
      continue;
    }

    const dst = path.join(dest, rel);
    if (fs.existsSync(dst)) {
      if (Buffer.compare(fs.readFileSync(dst), buf) === 0) {
        unchanged++;
        continue;
      }
      // RULE 2 — APPEND-ONLY. A capture is named by its date, so a body already in the
      // archive with DIFFERENT content should be impossible. Never silently overwrite
      // dated evidence; make a human look. This is decided HERE, in pass 1, for the same
      // reason Rule 1 is: it is a refusal, and a refusal must be known before anything
      // is written.
      refused.push(`${rel} — staat al in het archief met ANDERE inhoud (niet overschreven)`);
      continue;
    }

    toCopy.push(rel);
  }
```

- [ ] **Step 4: Add the write pass after the refusal gate**

The skip report and the `if (refused.length)` block stay exactly where they are, immediately after pass 1. Insert pass 2 **after** the `refused` early return and **before** the `if (!added.length)` check:

```ts
  // PASS 2 — WRITE. This pass decides NOTHING; every body here was classified in pass 1 and
  // the run is already known to be refusal-free. copyFileSync rather than writeFileSync(buf):
  // the kernel copies the file, so no body is ever held in memory here — the corpus is 386 MB
  // across 466 bodies, one of them 60 MB. The cost is that these bytes are re-read rather
  // than being the ones pass 1 hashed; the design doc records why that window is accepted.
  for (const rel of toCopy) {
    const dst = path.join(dest, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(o.archiveDir, rel), dst);
    // The receipt travels with the body, so the private repo is self-contained. No existence
    // check: this body is here only because publishedHash() read a hash for it OUT OF that
    // sidecar, so it is there.
    const sidecar = sidecarFor(rel);
    fs.copyFileSync(path.join(o.archiveDir, sidecar), path.join(dest, sidecar));
    added.push(rel);
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test` then `npm run test:ci` then `npx tsc --noEmit`

Expected: **319/319** on both tiers (316 + 3), `tsc` exit 0.

- [ ] **Step 6: Retire the two disclaimers that are no longer true**

Two tests carry a `WHAT THIS DOES NOT PROVE:` paragraph added when the leak was known but unfixed — one in the Rule 1 refusal test, one in the mixed skip+refusal test. Each ends by saying the leak is "tracked as its own issue — not fixed, and not asserted here."

Delete both paragraphs. **Do not** restore the old sweeping assertion messages in their place: those two fixtures still hold no body that verifies ahead of the failure, so a message claiming "not even the bodies that passed" would be exactly as vacuous as it was before. Leave each assertion message describing what its own fixture proves, and add one line to each test pointing at the new test that covers the rest, e.g.:

```ts
  // The "a body that verified earlier in the same run" case is covered by
  // "SYNC: a hash refusal leaves NOTHING behind — not even a body that already verified".
```

- [ ] **Step 7: Re-run and commit**

Run: `npm test` then `npm run test:ci`

Expected: 319/319 both tiers, unchanged by Step 6 (it edits only comments).

```bash
git add yoga-trainingen-directory/scripts/sync-archive.ts yoga-trainingen-directory/src/lib/sync-archive.test.ts
git commit -F - <<'MSG'
Sync: decide the whole run before writing any of it (#20)

Bodies were copied as they verified while the refusal was decided after
the loop, so a body passing ahead of a failing one sat in the
destination while the run reported "Er is NIETS gepusht". Byte-identical,
it then counted as `unchanged` on the next run — which reported
up-to-date and exited 0, the state #7 set out to eliminate.

Pass 1 classifies and writes nothing; pass 2 copies only once the run is
known refusal-free. Rule 2 moves into pass 1 too: it is a refusal, it
leaked identically, and a hash-only fix would have left half the defect
standing while passing every test.

The fixtures are the point. All three existing ones are shaped so the
leak cannot fire — one body, or two ordered so neither is ever a copy
candidate ahead of the failure. The new ones put a VERIFYING body before
the failing one, and were confirmed red before this change.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 3: Refuse to sync into a clone nobody can account for

**Files:**
- Modify: `yoga-trainingen-directory/scripts/sync-archive.ts` (a new gate immediately after the `ensureClone` try/catch)
- Test: `yoga-trainingen-directory/src/lib/sync-archive.test.ts`

**Interfaces:**
- Consumes: `captureLog(fn: () => void): string` (existing), `archiveWith(body, hashOverride?)`, `archiveRepo()`.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Add at the end of the file:

```ts
test("SYNC: a clone with uncommitted bodies is refused — `unchanged` means committed, not merely present", () => {
  // The loop decides `unchanged` by whether a file EXISTS in the destination working tree,
  // never by whether it was committed. So an uncommitted body there reads as "already
  // archived" and the run reports up-to-date over something backed up nowhere. After the
  // two-pass split this code cannot create such a file — but one written by the old code on
  // another machine, or an interrupted run, still can.
  const archiveDir = archiveWith("de pagina");
  const repoPath = archiveRepo();
  const stray = path.join(repoPath, DEST_SUBDIR, "aaaco");
  fs.mkdirSync(stray, { recursive: true });
  fs.writeFileSync(path.join(stray, "leftover-2026-07.pdf"), "iets wat nooit is vastgelegd");

  let r: ReturnType<typeof syncArchive> | undefined;
  const log = captureLog(() => {
    r = syncArchive({ archiveDir, repoPath, repoUrl: "unused", push: false });
  });

  assert.match(log, /niet-vastgelegde/, "the refusal must say what is wrong");
  assert.match(log, /leftover-2026-07\.pdf/, "and NAME the uncommitted path, or it is unactionable");
  assert.deepEqual(r!.added, [], "nothing may be synced on top of a tree nobody can account for");
  assert.ok(
    !fs.existsSync(path.join(repoPath, DEST_SUBDIR, "testco", "site-2026-07.pdf")),
    "not even the bodies that would have verified fine",
  );
  assert.equal(process.exitCode, 1);
  process.exitCode = 0;
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- --test-name-pattern="uncommitted bodies is refused"`

Expected: FAIL — the sync ignores the stray file and copies `testco` normally.

- [ ] **Step 3: Add the gate**

In `syncArchive()`, immediately after the `try { ensureClone(o); } catch { … }` block and before `const dest = …`:

```ts
  // `unchanged` is decided by presence in the destination WORKING TREE, never by presence in
  // the history — so a body sitting there uncommitted reads as "already archived", and the
  // run reports up-to-date over something that is backed up nowhere. The sync commits
  // everything it copies, so a dirty tree here is a state nobody can account for: refuse it
  // rather than sync on top of it. Scoped to the archive subdirectory on purpose — an edited
  // README is not a threat to the evidence chain, an unaccounted-for body is.
  // --ignored is deliberate: this repo carries no .gitignore today, but `git add --force`
  // below exists precisely because it COULD inherit the public repo's one, and without
  // --ignored this check would silently pass exactly when it was needed most.
  const dirty = git(o.repoPath, ["status", "--porcelain", "--ignored", "--", DEST_SUBDIR]).trim();
  if (dirty) {
    console.error("\n✗ archief: de archiefrepo heeft niet-vastgelegde bestanden:");
    for (const line of dirty.split("\n")) console.error(`    ${line.trim()}`);
    console.error("  Er is NIETS gesynchroniseerd. Een body die daar ongecommit staat telt");
    console.error("  hier als 'al vastgelegd', terwijl hij nergens geback-upt is.");
    console.error("  Leg ze vast of zoek uit waar ze vandaan komen, en draai daarna opnieuw.");
    process.exitCode = 1;
    return empty;
  }
```

- [ ] **Step 4: Verify the gate does not fire on a clean clone**

This is the step that matters most: a gate that throws or fires on every run would stop all backups.

Run: `npm test` then `npm run test:ci`

Expected: **320/320** on both tiers (319 + 1). In particular the existing clean-run tests must still pass — if `git status` with a pathspec that matches nothing (a fresh clone has no archive subdirectory yet) threw or returned non-empty, they would fail here. If any clean-run test breaks, that is the finding; report it rather than working around it.

- [ ] **Step 5: Run the full build**

Run: `npx tsc --noEmit`, then `npm run build`

Expected: `tsc` exit 0; build exit 0 with `npm run provenance` reporting **✓ 165/165** inside it. Then confirm `git status` shows nothing under `data/`.

- [ ] **Step 6: Commit**

```bash
git add yoga-trainingen-directory/scripts/sync-archive.ts yoga-trainingen-directory/src/lib/sync-archive.test.ts
git commit -F - <<'MSG'
Sync: refuse a clone that holds uncommitted bodies (#20)

`unchanged` is decided by presence in the destination working tree, not
by presence in the history — so an uncommitted body there reads as
"already archived" and the run reports up-to-date over something backed
up nowhere. After the two-pass split that is the last route by which a
body can be present but unarchived while the run reports completion.

Scoped to the archive subdirectory: an edited README is not a threat to
the evidence chain. --ignored is deliberate — this repo carries no
.gitignore today, but `git add --force` exists because it could inherit
the public one, and without --ignored the check would pass silently in
exactly that case.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Verification checklist

After Task 3, all of the following must hold:

- `npm test` and `npm run test:ci` green at **320** — 4 more than the 316 baseline (0 + 3 + 1)
- `npx tsc --noEmit` exit 0
- `npm run provenance` ✓ 165/165
- `npm run build` exit 0
- `git status` clean of everything under `data/`
- `npm run archive` was never run
- Task 2's first two tests were **observed red** before the fix, and the failure output reported
