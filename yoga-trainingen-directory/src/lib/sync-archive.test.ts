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
  const archiveDir = archiveWith("de pagina", sha256("een ANDERE pagina"));
  const repoPath = archiveRepo();

  const r = syncArchive({ archiveDir, repoPath, repoUrl: "unused", push: false });

  assert.equal(r.added.length, 0, "a body failing its own receipt must never be added");
  assert.equal(r.refused.length, 1);
  assert.match(r.refused[0], /gepubliceerde hash/);
  assert.equal(r.pushed, false);
  assert.ok(
    !fs.existsSync(path.join(repoPath, DEST_SUBDIR, "testco", "site-2026-07.pdf")),
    "nothing may be written when a hash fails — not even the bodies that passed",
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
