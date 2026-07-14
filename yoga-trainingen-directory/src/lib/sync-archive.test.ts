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

test("SYNC: a body that matches its published hash is copied, with its receipt", () => {
  const archiveDir = archiveWith("de pagina zoals een lezer hem zag");
  const repoPath = archiveRepo();

  const r = syncArchive({ archiveDir, repoPath, repoUrl: "unused", push: false });

  assert.deepEqual(r.refused, []);
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
