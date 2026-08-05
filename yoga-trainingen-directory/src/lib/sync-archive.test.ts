/**
 * The archive sync, and the two rules that make it safe to run unattended.
 *
 * `npm run archive` now pushes the snapshot bodies to the private archive repo by itself,
 * because the alternative — a step someone has to remember at the end of the one task
 * whose interesting part is already over — is how 32 captures came to exist on a single
 * laptop while their hashes sat published in a public repo, attesting to files that one
 * disk failure separated from gone. Two of them were the evidence for a live price finding
 * about a named business.
 *
 * A thing that runs automatically has to be trustworthy about what it will NOT do:
 *
 *   1. It refuses a body that fails the hash we published for it. The `.sha256` in the
 *      public repo is a claim about precisely those bytes; pushing a body that does not
 *      match it would make a liar of the only artefact this project offers as proof.
 *   2. It is APPEND-ONLY. It never overwrites a body already in the archive with different
 *      content, and it never deletes. An archive that can remove evidence is not an
 *      archive — and the one time an agent here moved a file "temporarily", it crashed in
 *      between and destroyed 364 lines of unrecoverable research.
 *
 * Neither rule involves the network, so neither test does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { syncArchive } from "../../scripts/sync-archive";

const DEST_SUBDIR = path.join("yoga-trainingen-directory", "data", "archives");
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** An archive dir with one captured body and the .sha256 receipt the public repo commits. */
function archiveWith(body: string, hashOverride?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-src-"));
  const provider = path.join(dir, "testco");
  fs.mkdirSync(provider, { recursive: true });
  fs.writeFileSync(path.join(provider, "site-2026-07.pdf"), body);
  fs.writeFileSync(
    path.join(provider, "site-2026-07.sha256"),
    `${hashOverride ?? sha256(body)}  site-2026-07.pdf\n`,
  );
  return dir;
}

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

/** A `copyFile` that lands the file whose path ends in `needle` SHORT — four bytes — and
 *  copies everything else faithfully. This is the disk-full / killed-mid-write / flushed-late
 *  failure, and there is no way to make the real fs.copyFileSync do it from inside a test.
 *  Selective on purpose: pass 3 checks the body and its receipt separately, and a fake that
 *  broke both at once could not tell the two checks apart. */
const shortWriteOn = (needle: string) => (src: string, dst: string) =>
  src.endsWith(needle)
    ? fs.writeFileSync(dst, fs.readFileSync(src).subarray(0, 4))
    : fs.copyFileSync(src, dst);

/** A `copyFile` that rewrites the SOURCE and then copies it faithfully — the
 *  time-of-check/time-of-use drift #20 accepted between its two passes, and which pass 3
 *  closes. The destination ends up a perfect copy of a file that is no longer the one pass 1
 *  verified. That is a different event from a short write and needs the opposite response
 *  from the author, so the report must not confuse the two. */
const driftingCopy = (src: string, dst: string) => {
  if (src.endsWith(".pdf")) fs.writeFileSync(src, "de bron veranderde onder ons");
  fs.copyFileSync(src, dst);
};

/** A git repo standing in for the private archive, with a real `origin` to push to. */
function archiveRepo(): string {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), "sync-origin-"));
  execFileSync("git", ["init", "--quiet", "--bare", "-b", "main", bare]);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "sync-repo-"));
  const g = (...a: string[]) => execFileSync("git", a, { cwd: work, stdio: "ignore" });
  execFileSync("git", ["init", "--quiet", "-b", "main", work]);
  g("remote", "add", "origin", bare);
  g("config", "user.email", "t@t.test");
  g("config", "user.name", "t");
  fs.writeFileSync(path.join(work, "README.md"), "archive\n");
  g("add", "-A");
  g("commit", "--quiet", "-m", "init");
  g("push", "--quiet", "-u", "origin", "main");
  return work;
}

/** Commits whatever is currently sitting in the destination working tree, standing in for a
 *  prior, successful sync. Task 3's dirty-tree gate means "a body already archived" now has to
 *  be one the destination repo actually committed — an uncommitted one reads as an interrupted
 *  run and is refused before Rule 2 (append-only) is ever reached, so fixtures for Rule 2 must
 *  commit their setup or they are testing a state the gate no longer lets through. */
function commitPriorSync(repoPath: string): void {
  execFileSync("git", ["add", "-A"], { cwd: repoPath, stdio: "ignore" });
  execFileSync("git", ["commit", "--quiet", "-m", "eerdere sync"], { cwd: repoPath, stdio: "ignore" });
}

// This file's tests share two pieces of process-global state: captureLog() below swaps
// console.log/console.error out from under the whole process, and several tests read (and
// must reset) the process.exitCode that syncArchive() sets on a skip or a refusal. Both are
// safe to mutate per-test only because node:test runs a file's top-level tests
// sequentially, not concurrently — do not add `{ concurrency: true }` to this file without
// first giving each test its own isolated capture and its own way to observe the exit code.

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

test("SYNC: a body that matches its published hash is copied, with its receipt", () => {
  const archiveDir = archiveWith("de pagina zoals een lezer hem zag");
  const repoPath = archiveRepo();

  const r = syncArchive({ archiveDir, repoPath, repoUrl: "unused", push: false });

  assert.deepEqual(r.refused, []);
  assert.deepEqual(r.skipped, [], "a fully-hashed corpus must skip NOTHING — this is the backup");
  assert.deepEqual(r.added, [path.join("testco", "site-2026-07.pdf")]);
  const dest = path.join(repoPath, DEST_SUBDIR, "testco");
  assert.ok(fs.existsSync(path.join(dest, "site-2026-07.pdf")), "the body must reach the archive");
  assert.ok(
    fs.existsSync(path.join(dest, "site-2026-07.sha256")),
    "the receipt travels WITH the body — the private repo has to stand on its own",
  );
});

test("SYNC: a body that FAILS its published hash is refused, and NOTHING is pushed", () => {
  // The public repo already commits a hash asserting these exact bytes. If the file on
  // disk is not that file, one of two things is true and both need a human: the capture
  // was altered, or the hash is wrong. Pushing it anyway would mean the one artefact we
  // offer as proof — the hash — no longer matches the thing it proves.
  //
  // This fixture holds exactly one body, the failing one, so the assertion below only shows
  // that a body which never verified is never written. The "a body that verified earlier in
  // the same run" case is covered by "SYNC: a hash refusal leaves NOTHING behind — not even
  // a body that already verified".
  const archiveDir = archiveWith("de pagina", sha256("een ANDERE pagina"));
  const repoPath = archiveRepo();

  const r = syncArchive({ archiveDir, repoPath, repoUrl: "unused", push: false });

  assert.equal(r.added.length, 0, "a body failing its own receipt must never be added");
  assert.equal(r.refused.length, 1);
  assert.match(r.refused[0], /gepubliceerde hash/);
  assert.equal(r.pushed, false);
  assert.ok(
    !fs.existsSync(path.join(repoPath, DEST_SUBDIR, "testco", "site-2026-07.pdf")),
    "the mismatching body itself is never written to the destination",
  );
  process.exitCode = 0; // the script signals failure this way; don't fail the suite with it
});

test("SYNC: APPEND-ONLY — a body already archived is never overwritten with new content", () => {
  // A capture is named by its date, so this should be impossible; that is exactly why it
  // must be loud rather than silently resolved. Dated evidence is the whole asset.
  const repoPath = archiveRepo();
  const dest = path.join(repoPath, DEST_SUBDIR, "testco");
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, "site-2026-07.pdf"), "de ORIGINELE capture");
  commitPriorSync(repoPath);

  // …and the laptop now holds something different under the same name.
  const archiveDir = archiveWith("een ANDERE capture, zelfde naam");
  const r = syncArchive({ archiveDir, repoPath, repoUrl: "unused", push: false });

  assert.equal(r.added.length, 0);
  assert.equal(r.refused.length, 1);
  assert.match(r.refused[0], /ANDERE inhoud/);
  assert.equal(
    fs.readFileSync(path.join(dest, "site-2026-07.pdf"), "utf8"),
    "de ORIGINELE capture",
    "the archived body was overwritten — the sync destroyed dated evidence",
  );
  process.exitCode = 0;
});

test("SYNC: an unchanged body is a no-op, so running it twice pushes nothing", () => {
  const archiveDir = archiveWith("de pagina");
  const repoPath = archiveRepo();

  const first = syncArchive({ archiveDir, repoPath, repoUrl: "unused", push: false });
  assert.equal(first.added.length, 1);

  const second = syncArchive({ archiveDir, repoPath, repoUrl: "unused", push: false });
  assert.equal(second.added.length, 0, "the second run must find nothing to do");
  assert.equal(second.unchanged, 1);
  assert.deepEqual(second.refused, []);
});

test("SYNC: it is WIRED into `npm run archive` — a backup nobody runs is not a backup", () => {
  // The failure this whole file exists to prevent was not a bug. It was a step at the end
  // of a task, which someone had to remember, and eventually didn't.
  const archive = fs.readFileSync(path.join(process.cwd(), "scripts", "archive.ts"), "utf8");
  assert.match(archive, /import \{ syncArchive \}/, "archive.ts does not import the sync");
  assert.match(archive, /if \(!NO_SYNC\) syncArchive\(\)/, "archiving no longer syncs by default");
  assert.match(archive, /--sync-only/, "there must be a way to push bodies without re-capturing");
});

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
  //
  // localBodies() sorts, so "otherco" (the skip) is examined before "testco" (the mismatch).
  // Neither body is ever a body that gets COPIED first: the orphan is skipped without a
  // write, and testco fails its own hash check before it would reach one. So the two
  // assertions below only show that the refused body and the skipped body are each,
  // individually, never copied. The "a body that verified earlier in the same run" case is
  // covered by "SYNC: a hash refusal leaves NOTHING behind — not even a body that already
  // verified".
  const archiveDir = archiveWith("de pagina", sha256("een ANDERE pagina"));
  const orphan = addUnhashedBody(archiveDir);
  const repoPath = archiveRepo();

  const r = syncArchive({ archiveDir, repoPath, repoUrl: "unused", push: false });

  assert.equal(r.refused.length, 1, "the mismatch is still a refusal");
  assert.deepEqual(r.skipped, [orphan], "and the skip is still reported alongside it");
  assert.deepEqual(r.added, [], "a refusal means NOTHING is reported as pushed — the skip does not soften that");
  assert.ok(
    !fs.existsSync(path.join(repoPath, DEST_SUBDIR, "testco", "site-2026-07.pdf")),
    "the mismatching body itself is never copied",
  );
  assert.ok(
    !fs.existsSync(path.join(repoPath, DEST_SUBDIR, orphan)),
    "the skipped body itself is never copied",
  );
  process.exitCode = 0;
});

test("SYNC: a partial run's COMMIT MESSAGE says bodies were left behind", () => {
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
});

test("SYNC: a clean run's COMMIT MESSAGE does not — a complete run must not apologise for nothing", () => {
  // The other half of the pair above, kept as its own test() so a failure in the partial-run
  // assertion can never leave a stale process.exitCode that makes THIS test's outcome ambiguous.
  const cleanDir = archiveWith("een andere pagina");
  const cleanRepo = archiveRepo();
  captureLog(() => void syncArchive({ archiveDir: cleanDir, repoPath: cleanRepo, repoUrl: "unused", push: false }));
  const cleanMsg = execFileSync("git", ["log", "-1", "--format=%B"], { cwd: cleanRepo, encoding: "utf8" });
  // If the sync never committed at all, `git log -1` falls back to archiveRepo()'s own
  // `init` commit — which also does not match /NIET meegestuurd/ below, so that assertion
  // alone would pass for the wrong reason (no commit, rather than a commit with no apology).
  // Pin the message to the sync's own commit first, so the negative assertion is about the
  // right commit.
  assert.match(cleanMsg, /^Archief: 1 snapshot/, "this must be the sync's own commit, not the fixture's init commit");
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
  commitPriorSync(repoPath);

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
  assert.ok(
    !fs.existsSync(path.join(repoPath, DEST_SUBDIR, "aaaco", "eerder-2026-07.sha256")),
    "and its receipt was never written either",
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
  assert.deepEqual(r.mislanded, [], "a clean run must not become a new way to stop backing evidence up");
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
  // The gate REFUSES — it never removes. This script deletes nothing, ever, and the leftover
  // that triggered the refusal must still be exactly what it was: a future "helpful" cleanup
  // inside this gate must fail here, not sail through with the rest of the suite green.
  assert.ok(
    fs.existsSync(path.join(stray, "leftover-2026-07.pdf")),
    "the leftover that caused the refusal must still exist",
  );
  assert.equal(
    fs.readFileSync(path.join(stray, "leftover-2026-07.pdf"), "utf8"),
    "iets wat nooit is vastgelegd",
    "and its content must be unchanged",
  );
  process.exitCode = 0;
});

test("SYNC: a stray .DS_Store under the archive tree does not halt the run — bodies still get copied", () => {
  // Finder writes .DS_Store into any directory it has ever displayed, committed or not — the
  // author's real archive clone already carries committed .DS_Store files elsewhere in the
  // tree, so this is not hypothetical. `isBody(".DS_Store") === true`, so narrowing the dirty
  // check with `isBody` would not exclude it; IGNORABLE_JUNK is a separate, name-based list
  // for exactly this reason. A .DS_Store can never read as "already archived" — it poses none
  // of the threat the gate exists to catch — so it must not stop every provider's backup.
  const archiveDir = archiveWith("de pagina");
  const repoPath = archiveRepo();
  const junkDir = path.join(repoPath, DEST_SUBDIR, "testco");
  fs.mkdirSync(junkDir, { recursive: true });
  fs.writeFileSync(path.join(junkDir, ".DS_Store"), "finder junk");

  const r = syncArchive({ archiveDir, repoPath, repoUrl: "unused", push: false });

  assert.deepEqual(r.refused, [], "a .DS_Store must never be read as an unaccounted-for body");
  assert.deepEqual(
    r.added,
    [path.join("testco", "site-2026-07.pdf")],
    "the gate must not halt the whole backup over OS junk",
  );
  assert.ok(
    fs.existsSync(path.join(repoPath, DEST_SUBDIR, "testco", "site-2026-07.pdf")),
    "the body must still reach the archive",
  );
  // The gate IGNORES junk for the purpose of the dirty check — it never removes it.
  assert.ok(
    fs.existsSync(path.join(junkDir, ".DS_Store")),
    "the .DS_Store itself must be left exactly where it was",
  );
});

test("SYNC: a stray non-junk file alongside a .DS_Store still halts the run", () => {
  // The junk exclusion must not widen into "ignore anything sitting near a .DS_Store" — a
  // real unaccounted-for body beside one must still refuse, named, same as ever.
  const archiveDir = archiveWith("de pagina");
  const repoPath = archiveRepo();
  const stray = path.join(repoPath, DEST_SUBDIR, "aaaco");
  fs.mkdirSync(stray, { recursive: true });
  fs.writeFileSync(path.join(stray, ".DS_Store"), "finder junk");
  fs.writeFileSync(path.join(stray, "leftover-2026-07.pdf"), "iets wat nooit is vastgelegd");

  const log = captureLog(() => {
    syncArchive({ archiveDir, repoPath, repoUrl: "unused", push: false });
  });

  assert.match(log, /leftover-2026-07\.pdf/, "the real leftover must still be named");
  assert.doesNotMatch(log, /\.DS_Store/, "junk is filtered OUT of the report — it is not the problem");
  assert.ok(
    !fs.existsSync(path.join(repoPath, DEST_SUBDIR, "testco", "site-2026-07.pdf")),
    "the run must still refuse — one real leftover is enough, junk or no junk",
  );
  assert.equal(process.exitCode, 1);
  process.exitCode = 0;
});

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
  assert.match(log, /het kopiëren ging mis/, "the source is intact here, so this is a bad WRITE");
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

  // node:assert throws on the first failing assertion, so the assertion that discriminates
  // hardest against the pre-fix code has to run first or it is never the one you see.
  // The `doesNotMatch(/^Archief:/)` proves a corrupt receipt gets committed pre-fix, and it
  // must run before `mislanded.length`, whose failure would otherwise hide it.
  const msg = execFileSync("git", ["log", "-1", "--format=%B"], { cwd: repoPath, encoding: "utf8" });
  assert.doesNotMatch(msg, /^Archief:/, "and it must not be committed");

  assert.equal(r!.mislanded.length, 1);
  assert.match(r!.mislanded[0], /\.sha256/, "the report must say it is the RECEIPT that failed");
  assert.equal(
    fs.readFileSync(path.join(repoPath, DEST_SUBDIR, "testco", "site-2026-07.pdf"), "utf8"),
    "de pagina",
    "the body itself landed perfectly — that is the whole point of this fixture",
  );
  process.exitCode = 0;
});

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
