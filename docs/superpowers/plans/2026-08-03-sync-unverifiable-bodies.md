# Sync: never attest to a body we could not verify — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A body with no published hash is skipped rather than pushed, and no output the sync produces — report, exit code, commit message, or "up-to-date" line — ever claims a completeness the run did not have.

**Architecture:** One file, `scripts/sync-archive.ts`. A third disposition (`skipped`) joins `added` and `refused` in `SyncResult`, keyed on `publishedHash(...) === null` rather than on a missing sidecar file. The skip is reported and sets a non-zero exit code *after* the push rather than instead of it, and the two sentences that assert completeness are gated on `skipped.length === 0`.

**Tech Stack:** TypeScript, `node:test` via `tsx --test`, `node:fs`, `node:crypto`, real temp-dir git repos in tests (no network, no mocks).

## Global Constraints

- Design: `docs/superpowers/specs/2026-08-02-sync-unverifiable-bodies-design.md`. Read it before Task 1.
- All `npm` commands run from `yoga-trainingen-directory/`.
- **Never move, rename, delete, re-hash or re-capture ANY file under `data/`.** Archive bodies are gitignored and exist on one machine; an agent once moved one meaning to move it back, crashed in between, and destroyed 364 lines of unrecoverable research.
- **Never run `npm run archive`** — it pushes to the real private archive repo. All tests use temp dirs.
- **Never generate a missing sidecar.** Hashing whatever is on disk at push time attests to nothing, and is the move CLAUDE.md forbids for mismatches. A receipt counts only once the **public** repo commits it.
- `refused` semantics are untouched: a refusal still means **nothing is pushed, for anyone**.
- A skip is a **gap**, a refusal is a **finding**. They must never be collapsed or rendered identically — the same rule `src/lib/quad.test.ts` locks for the data model.
- Every skip is **named** in the report. There is no code path where a body is silently left behind.
- Tests that trigger a non-zero exit must reset `process.exitCode = 0` before returning, following the existing convention at `src/lib/sync-archive.test.ts:99`.
- Comments explain **why**, in the voice of the surrounding file. Dutch for user-facing output, English for code comments — match what is already there.
- Gates after every task: `npm test`, `npm run test:ci`, `npx tsc --noEmit`. Full `npm run build` before the final commit. `npm run provenance` must stay ✓ 165/165.

## File Structure

- **Modify:** `yoga-trainingen-directory/scripts/sync-archive.ts` — the only production file this plan touches.
- **Modify:** `yoga-trainingen-directory/src/lib/sync-archive.test.ts` — new fixtures and tests alongside the existing five.

No new files. The sync is one cohesive module and this change belongs inside it.

---

### Task 1: A body with no published hash is skipped, not pushed

**Files:**
- Modify: `yoga-trainingen-directory/scripts/sync-archive.ts` (the `SyncResult` interface ~line 65; `syncArchive`'s locals ~line 139; the verification guard ~line 150; the receipt copy ~line 174; every `return` that builds a `SyncResult`)
- Test: `yoga-trainingen-directory/src/lib/sync-archive.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `SyncResult.skipped: string[]` — repo-relative body paths (e.g. `testco/site-2026-07.pdf`), sorted as `localBodies()` returns them. Tasks 2 and 3 read this field. Also produces the test fixtures `archiveWithoutReceipt()`, `addUnhashedBody(dir)` and `addUnlistedArtifact(dir)`, which Tasks 2 and 3 reuse.

- [ ] **Step 1: Write the failing tests**

Add these two fixtures directly below the existing `archiveWith` helper (which ends at line 46):

```ts
/** An archive dir holding a body and NO receipt for it. This is the hand-placed case — a
 *  source with no `url` is never touched by the archiver, so its body is placed by hand —
 *  and it is also what a Ctrl-C between the body write and the sidecar write leaves behind. */
function archiveWithoutReceipt(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-src-"));
  const provider = path.join(dir, "testco");
  fs.mkdirSync(provider, { recursive: true });
  fs.writeFileSync(path.join(provider, "site-2026-07.pdf"), "een body die niemand hashte");
  return dir;
}

/** Adds a second, unhashed body under its own provider, beside an already-hashed capture. */
function addUnhashedBody(dir: string): string {
  const rel = path.join("otherco", "brochure-2026-08.pdf");
  fs.mkdirSync(path.join(dir, "otherco"), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), "een body die niemand hashte");
  return rel;
}

/** Adds an artifact BESIDE a hashed capture, sharing its base name, listed nowhere in that
 *  capture's sidecar. publishedHash() strips the extension to find the sidecar, so the file
 *  IS found — and then no line inside it names this artifact. That is the second null route,
 *  and the one a fix keyed on `fs.existsSync(sidecar)` sails straight past. */
function addUnlistedArtifact(dir: string): string {
  const rel = path.join("testco", "site-2026-07.png");
  fs.writeFileSync(path.join(dir, rel), "een screenshot die in geen enkele .sha256 staat");
  return rel;
}
```

Add these two tests at the end of the file:

```ts
test("SYNC: a body with NO published hash is SKIPPED — not pushed, and not a refusal", () => {
  // No hash means nothing to verify against, which means it is not ours to attest to. But it
  // is a GAP, not a contradiction: unlike a failed hash, nothing here says the evidence
  // changed, so it must not stop every other provider's backup.
  const archiveDir = archiveWith("de pagina zoals een lezer hem zag");
  const orphan = addUnhashedBody(archiveDir);
  const repoPath = archiveRepo();

  const r = syncArchive({ archiveDir, repoPath, repoUrl: "unused", push: false });

  assert.deepEqual(r.skipped, [orphan], "a body with no receipt must be NAMED, not silently dropped");
  assert.deepEqual(r.refused, [], "no receipt is a gap, not a contradiction — it must not stop the push");
  assert.deepEqual(
    r.added,
    [path.join("testco", "site-2026-07.pdf")],
    "the verified body still goes — one forgotten sidecar may not block everyone else",
  );
  assert.ok(
    !fs.existsSync(path.join(repoPath, DEST_SUBDIR, orphan)),
    "an unverifiable body must not reach the archive at all",
  );
  process.exitCode = 0;
});

test("SYNC: a sidecar that exists but does not LIST this file is also no published hash", () => {
  // publishedHash() returns null down two paths, and only one of them is "no sidecar".
  // A fix written as `!fs.existsSync(sidecar)` passes the test above and still pushes this.
  const archiveDir = archiveWith("de pagina");
  const unlisted = addUnlistedArtifact(archiveDir);
  const repoPath = archiveRepo();

  const r = syncArchive({ archiveDir, repoPath, repoUrl: "unused", push: false });

  assert.deepEqual(r.skipped, [unlisted], "the sidecar exists, but names no line for this file");
  assert.ok(
    !fs.existsSync(path.join(repoPath, DEST_SUBDIR, unlisted)),
    "unverifiable is unverifiable, whether or not a sidecar happens to sit beside it",
  );
  process.exitCode = 0;
});
```

And strengthen the existing happy-path test at line 65 by adding one assertion after `assert.deepEqual(r.refused, []);`:

```ts
  assert.deepEqual(r.skipped, [], "a fully-hashed corpus must skip NOTHING — this is the backup");
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --test-name-pattern="NO published hash|does not LIST"`

Expected: FAIL. TypeScript will report that `skipped` does not exist on `SyncResult`, or the assertions will fail because the unhashed bodies were pushed.

- [ ] **Step 3: Add `skipped` to `SyncResult`**

In `scripts/sync-archive.ts`, add to the `SyncResult` interface (below the `refused` field, ~line 70):

```ts
  /** Bodies with NO published hash: nothing to verify against, so not pushed and not
   *  attested to. Distinct from `refused` on purpose — a refusal says a body CONTRADICTS
   *  its receipt and stops the whole push; this says a body HAS no receipt, so only it is
   *  left behind. Collapsing the two would either let one forgotten sidecar block every
   *  provider's backup, or stop a genuine mismatch being an emergency. */
  skipped: string[];
```

- [ ] **Step 4: Thread `skipped` through every return**

Add `skipped: []` to the `empty` literal (~line 125), declare the local beside `refused` (~line 140):

```ts
  const skipped: string[] = [];
```

and add `skipped` to every object literal returned from `syncArchive` — there are five besides `empty`: the `refused` early return, the `!added.length` return, the staged-nothing return, the `!o.push` return, and the final return. `tsc` will name any you miss.

- [ ] **Step 5: Skip a body with no published hash**

Replace the guard at ~line 150:

```ts
    const want = publishedHash(o.archiveDir, rel);
    if (want && sha256(buf) !== want) {
      refused.push(`${rel} — komt niet overeen met de gepubliceerde hash`);
      continue;
    }
```

with:

```ts
    // NO PUBLISHED HASH ⇒ NOTHING TO VERIFY AGAINST ⇒ NOT OURS TO ATTEST TO. publishedHash()
    // returns null down two paths — no sidecar at all, and a sidecar holding no line for THIS
    // file — and both mean the same thing here, which is why this keys on its return value
    // rather than on the sidecar's existence. Never generate the missing hash: hashing
    // whatever is on disk now attests to nothing, and a receipt counts only once the PUBLIC
    // repo commits it. See the design doc for why this skips rather than refusing.
    const want = publishedHash(o.archiveDir, rel);
    if (want === null) {
      skipped.push(rel);
      continue;
    }
    if (sha256(buf) !== want) {
      refused.push(`${rel} — komt niet overeen met de gepubliceerde hash`);
      continue;
    }
```

- [ ] **Step 6: Make the receipt copy unconditional**

Replace the line at ~line 174:

```ts
    if (fs.existsSync(sidecarSrc)) fs.copyFileSync(sidecarSrc, path.join(dest, sidecar));
```

with:

```ts
    // No existence check: we reach this line only because publishedHash() just read a hash
    // for this body OUT OF that sidecar, so it is there. A conditional would describe a
    // state the skip above has made unreachable — and a dead branch is how the next reader
    // learns the wrong invariant.
    fs.copyFileSync(sidecarSrc, path.join(dest, sidecar));
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test` then `npm run test:ci` then `npx tsc --noEmit`

Expected: all green, 3 more tests than before (2 new + the existing suite), `tsc` exit 0.

- [ ] **Step 8: Verify the guard actually enforces**

Temporarily change `if (want === null)` to `if (!fs.existsSync(path.join(o.archiveDir, path.dirname(rel), path.basename(rel).replace(/\.[a-z0-9]+$/i, "") + ".sha256")))` — the plausible wrong fix. Run `npm test`. Expected: the *"does not LIST this file"* test goes RED while the other stays green. Revert, confirm with `git diff`, and re-run to green. Report the observed failure message.

- [ ] **Step 9: Commit**

```bash
git add yoga-trainingen-directory/scripts/sync-archive.ts yoga-trainingen-directory/src/lib/sync-archive.test.ts
git commit -F - <<'MSG'
Sync: a body with no published hash is skipped, not pushed (#7)

publishedHash() returns null when there is no hash for this body, and the
old guard `if (want && ...)` read that as "nothing to check" rather than
"nothing to verify against" — so the body was pushed, and (because the
receipt copy was conditional) arrived with no receipt at all.

Keyed on publishedHash() === null rather than on a missing sidecar: the
function returns null down two paths, and the second — a sidecar that
exists but lists no line for this file — is reachable today.

A skip is a gap, a refusal is a finding: refused still means nothing is
pushed for anyone; skipped means only that body stays behind.

The receipt copy is now unconditional, because a pushed body necessarily
has the sidecar its hash was just read from.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 2: The skip is named, and the run exits non-zero — after the push, not instead of it

**Files:**
- Modify: `yoga-trainingen-directory/scripts/sync-archive.ts` (insert a report block immediately before `if (refused.length)`, ~line 178)
- Test: `yoga-trainingen-directory/src/lib/sync-archive.test.ts`

**Interfaces:**
- Consumes: `SyncResult.skipped: string[]` and the fixtures `archiveWith`, `addUnhashedBody(dir)` from Task 1.
- Produces: a `captureLog(fn)` test helper returning everything written to `console.log`/`console.error` during `fn`. Task 3 reuses it.

- [ ] **Step 1: Write the failing tests**

Add this helper directly below `archiveRepo()`:

```ts
/** Runs `fn` with console.log/console.error captured, and returns everything they printed.
 *  The sync reports through the console, so what it SAYS is part of its behaviour: a skip
 *  nobody is told about is the silent-backup-failure this whole file exists to prevent. */
function captureLog(fn: () => void): string {
  const lines: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...a: unknown[]) => void lines.push(a.join(" "));
  console.error = (...a: unknown[]) => void lines.push(a.join(" "));
  try {
    fn();
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
  return lines.join("\n");
}
```

Add these two tests at the end of the file:

```ts
test("SYNC: a skip NAMES the body and exits non-zero — but the verified bodies still went", () => {
  // This is the one structural difference from a refusal: `refused` returns before the push,
  // a skip does not. Copying the refused block wholesale would silently stop backing
  // everything up the moment one sidecar went missing.
  const archiveDir = archiveWith("de pagina");
  const orphan = addUnhashedBody(archiveDir);
  const repoPath = archiveRepo();

  let r: ReturnType<typeof syncArchive> | undefined;
  const log = captureLog(() => {
    r = syncArchive({ archiveDir, repoPath, repoUrl: "unused", push: false });
  });

  assert.match(log, /brochure-2026-08\.pdf/, "the skipped body must be named — a silent skip is the bug");
  assert.match(log, /geen gepubliceerde hash|zonder gepubliceerde hash/, "and the report must say why");
  assert.equal(process.exitCode, 1, "a run that left work behind must not exit 0");
  assert.deepEqual(r!.added, [path.join("testco", "site-2026-07.pdf")], "the verified body still went");
  assert.ok(
    fs.existsSync(path.join(repoPath, DEST_SUBDIR, "testco", "site-2026-07.pdf")),
    "a skip must not behave like a refusal and hold back the bodies that verified fine",
  );
  assert.ok(!fs.existsSync(path.join(repoPath, DEST_SUBDIR, orphan)));
  process.exitCode = 0;
});

test("SYNC: a mismatch still pushes nothing, even when a skip is present too", () => {
  // The two dispositions must not contaminate each other. A skip is the milder one; it must
  // never downgrade a refusal, which is the emergency.
  const archiveDir = archiveWith("de pagina", sha256("een ANDERE pagina"));
  const orphan = addUnhashedBody(archiveDir);
  const repoPath = archiveRepo();

  const r = syncArchive({ archiveDir, repoPath, repoUrl: "unused", push: false });

  assert.equal(r.refused.length, 1, "the mismatch is still a refusal");
  assert.deepEqual(r.skipped, [orphan], "and the skip is still reported alongside it");
  assert.deepEqual(r.added, [], "a refusal means NOTHING is pushed — the skip does not soften that");
  assert.ok(!fs.existsSync(path.join(repoPath, DEST_SUBDIR, "testco", "site-2026-07.pdf")));
  assert.ok(!fs.existsSync(path.join(repoPath, DEST_SUBDIR, orphan)));
  process.exitCode = 0;
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --test-name-pattern="NAMES the body|even when a skip is present"`

Expected: FAIL — nothing is printed about the skip, and `process.exitCode` is 0.

- [ ] **Step 3: Add the report**

In `scripts/sync-archive.ts`, insert immediately **before** `if (refused.length) {` (~line 178):

```ts
  // BEFORE the refused block, so a skip is reported on a refused run too — both are things
  // the author has to fix, and hiding one behind the other loses it.
  if (skipped.length) {
    console.error(`\n✗ archief: ${skipped.length} body/bodies zonder gepubliceerde hash — NIET meegestuurd:`);
    for (const s of skipped) console.error(`    ${s}`);
    console.error("  Een body zonder .sha256 kan niet geverifieerd worden, en wat wij niet");
    console.error("  kunnen verifiëren sturen wij niet mee als bewijs.");
    console.error("  Draai `npm run archive` opnieuw, of hash hem, en push daarna.");
    // Non-zero, but NOT an early return: the bodies that DID verify still go. A missing
    // receipt is a gap in one record, not a reason to stop backing up everyone else.
    process.exitCode = 1;
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test` then `npm run test:ci` then `npx tsc --noEmit`

Expected: all green, 2 more tests than after Task 1.

- [ ] **Step 5: Verify the early-return mistake is caught**

Temporarily add `return { added: [], unchanged, refused, skipped, pushed: false };` as the last line inside the new `if (skipped.length)` block — the mistake of copying the refused block wholesale. Run `npm test`. Expected: the *"NAMES the body and exits non-zero"* test goes RED on the "verified body still went" assertion. Revert, confirm with `git diff`, re-run to green. Report the observed failure message.

- [ ] **Step 6: Commit**

```bash
git add yoga-trainingen-directory/scripts/sync-archive.ts yoga-trainingen-directory/src/lib/sync-archive.test.ts
git commit -F - <<'MSG'
Sync: name every skipped body and exit non-zero, without holding back the rest (#7)

A skipped body stays on one machine until someone hashes it — which is
the exact risk this sync exists to remove — so the report names each one
and the run exits non-zero. It is reported before the refused block, so
a refused run still surfaces it.

The exit code is set AFTER the push rather than instead of it: unlike a
refusal, a missing receipt is a gap in one record, not a reason to stop
backing up every other provider.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 3: Neither the commit message nor "up-to-date" may claim completeness on a partial run

**Files:**
- Modify: `yoga-trainingen-directory/scripts/sync-archive.ts` (the `!added.length` early return ~line 189; the commit message `body` ~line 206)
- Test: `yoga-trainingen-directory/src/lib/sync-archive.test.ts`

**Interfaces:**
- Consumes: `SyncResult.skipped` (Task 1), `captureLog(fn)`, `archiveWithoutReceipt()`, `addUnhashedBody(dir)` (Tasks 1-2).
- Produces: nothing further.

- [ ] **Step 1: Write the failing tests**

Add these two tests at the end of the file:

```ts
test("SYNC: a partial run's COMMIT MESSAGE says bodies were left behind; a clean run's does not", () => {
  // The private repo's history is the record of what it holds. A commit asserting every body
  // was verified, on a run that skipped some, makes that history read as a complete backup
  // when it was not.
  const archiveDir = archiveWith("de pagina");
  addUnhashedBody(archiveDir);
  const repoPath = archiveRepo();
  captureLog(() => void syncArchive({ archiveDir, repoPath, repoUrl: "unused", push: false }));
  const msg = execFileSync("git", ["log", "-1", "--format=%B"], { cwd: repoPath, encoding: "utf8" });
  assert.match(msg, /NIET meegestuurd/, "the archive's own history must record that this run was partial");
  process.exitCode = 0;

  const cleanDir = archiveWith("een andere pagina");
  const cleanRepo = archiveRepo();
  captureLog(() => void syncArchive({ archiveDir: cleanDir, repoPath: cleanRepo, repoUrl: "unused", push: false }));
  const cleanMsg = execFileSync("git", ["log", "-1", "--format=%B"], { cwd: cleanRepo, encoding: "utf8" });
  assert.doesNotMatch(cleanMsg, /NIET meegestuurd/, "a complete run must not apologise for nothing");
});

test("SYNC: a run where EVERY new body was skipped must not report 'up-to-date'", () => {
  // With nothing added, the early return prints a completeness claim. On a run that left work
  // behind that sentence is false in exactly the way this change exists to stop — and it is
  // easy to miss, because the obvious fix touches the commit message and never looks here.
  const archiveDir = archiveWithoutReceipt();
  const repoPath = archiveRepo();

  let r: ReturnType<typeof syncArchive> | undefined;
  const log = captureLog(() => {
    r = syncArchive({ archiveDir, repoPath, repoUrl: "unused", push: false });
  });

  assert.equal(r!.added.length, 0);
  assert.equal(r!.skipped.length, 1);
  assert.doesNotMatch(log, /up-to-date/, "a run that left work behind reported completion");
  assert.equal(process.exitCode, 1);
  process.exitCode = 0;
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --test-name-pattern="COMMIT MESSAGE|EVERY new body"`

Expected: FAIL — the commit message carries no skip line, and "up-to-date" is printed.

- [ ] **Step 3: Gate the "up-to-date" line**

Replace the `!added.length` block (~line 189):

```ts
  if (!added.length) {
    console.log(`archief: up-to-date (${unchanged} bodies al vastgelegd).`);
    return { added, unchanged, refused, skipped, pushed: false };
  }
```

with:

```ts
  if (!added.length) {
    // "up-to-date" is a claim of COMPLETENESS. A run that skipped something is not entitled
    // to it; the skip report and its non-zero exit have already fired above.
    if (!skipped.length) console.log(`archief: up-to-date (${unchanged} bodies al vastgelegd).`);
    return { added, unchanged, refused, skipped, pushed: false };
  }
```

- [ ] **Step 4: Make the commit message earn its sentence**

Replace the `body` assignment (~line 206):

```ts
  const body =
    "De bodies horend bij de hashes die in de publieke repo staan.\n\n" +
    added.map((r) => `  ${r}`).join("\n") +
    "\n\nGeschreven door `npm run archive` (scripts/sync-archive.ts). Append-only;\n" +
    "elke body is geverifieerd tegen de .sha256 die publiek gepubliceerd is.\n";
```

with:

```ts
  // The attestation is not deleted — it is EARNED. Now that unverifiable bodies are skipped,
  // every body in this commit really was verified, so the sentence is true as written. The
  // extra line exists so the archive's own history cannot read as a complete backup when it
  // was not; it counts what stayed behind without naming files this repo does not contain.
  const body =
    "De bodies horend bij de hashes die in de publieke repo staan.\n\n" +
    added.map((r) => `  ${r}`).join("\n") +
    "\n\nGeschreven door `npm run archive` (scripts/sync-archive.ts). Append-only;\n" +
    "elke body is geverifieerd tegen de .sha256 die publiek gepubliceerd is.\n" +
    (skipped.length
      ? `\n${skipped.length} body/bodies zijn NIET meegestuurd: geen gepubliceerde hash.\n`
      : "");
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test` then `npm run test:ci` then `npx tsc --noEmit`

Expected: all green, 2 more tests than after Task 2.

- [ ] **Step 6: Run the full build**

Run: `npm run build`

Expected: exit 0, with `npm run provenance` reporting **✓ 165/165** inside it. Then confirm `git status` shows nothing under `data/`.

- [ ] **Step 7: Commit**

```bash
git add yoga-trainingen-directory/scripts/sync-archive.ts yoga-trainingen-directory/src/lib/sync-archive.test.ts
git commit -F - <<'MSG'
Sync: no output may claim completeness on a run that left work behind (#7)

Two sentences asserted a completeness the run did not have. The commit
message attested that every body was verified — now true as written,
because unverifiable bodies are skipped, but a partial run also records
how many stayed behind so the archive's history cannot read as a full
backup. And the "up-to-date" early return, reached when every new body
was skipped, reported completion for a run that did nothing: it is now
gated on there being no skips.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Verification checklist

After Task 3, all of the following must hold:

- `npm test` and `npm run test:ci` green, **315 tests** — 6 more than the 309 baseline (2 per task). The existing happy-path test is strengthened in place, so it adds an assertion but not a count.
- `npx tsc --noEmit` exit 0
- `npm run provenance` ✓ 165/165
- `npm run build` exit 0
- `git status` clean of everything under `data/`
- `npm run archive` was never run
