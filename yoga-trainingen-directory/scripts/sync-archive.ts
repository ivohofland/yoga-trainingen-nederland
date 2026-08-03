/**
 * Push the snapshot BODIES to the private, git-dated archive repo.
 *
 * The public repo publishes the `.sha256` of every snapshot and none of the bodies —
 * they are other people's copyrighted pages (data/archives/README.md). A hash proves a
 * file is unaltered; it CANNOT reproduce the file. So the hash is only worth something
 * if the body still exists somewhere, and "somewhere" was, for a while, one laptop:
 * 32 captures — including the two the published Yoga Den price finding rests on — had
 * never left this disk, while their hashes sat in a public repo attesting to files that
 * only one hard-drive failure separated from gone.
 *
 * It was not that anyone decided to skip it. It was a step someone had to REMEMBER, at
 * the end of the one task (archiving) where the interesting part is already over. So it
 * is no longer a step: `npm run archive` runs this when it finishes, and you have to say
 * `--no-sync` to not do it.
 *
 * TWO RULES, AND THEY ARE WHY THIS IS SAFE TO RUN UNATTENDED:
 *
 *   APPEND-ONLY. It copies bodies IN. It never deletes, never moves, never overwrites a
 *   body already there with different content. An archive that can remove evidence is not
 *   an archive, and the one time an agent in this project moved a file "temporarily" it
 *   crashed in between and destroyed 364 lines of unrecoverable research.
 *
 *   THE BODY MUST MATCH THE PUBLISHED HASH. Each file is checked against the `.sha256`
 *   the public repo already commits for it. A mismatch is refused, loudly, and nothing is
 *   pushed: the public hash is a claim about that exact byte sequence, and shipping a body
 *   that fails its own hash would make a liar of the one artefact this project offers as
 *   proof. Never "fix" a mismatch by re-hashing the file — find out why it changed.
 *
 * Config (both optional):
 *   ARCHIVE_REPO_URL   default https://github.com/ivohofland/yoga-trainingen-archief.git
 *   ARCHIVE_REPO_PATH  default ../../yoga-trainingen-archief (sibling of the project root)
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const CWD = process.cwd(); // yoga-trainingen-directory/

/** Where the bodies live INSIDE the private repo — the same path they have here. */
const DEST_SUBDIR = path.join("yoga-trainingen-directory", "data", "archives");

export interface SyncOptions {
  archiveDir: string;
  repoPath: string;
  repoUrl: string;
  /** Off in tests: the two rules below are what the tests are for, not the network. */
  push: boolean;
}

export function defaultOptions(): SyncOptions {
  return {
    archiveDir: path.join(CWD, "data", "archives"),
    repoUrl:
      process.env.ARCHIVE_REPO_URL ?? "https://github.com/ivohofland/yoga-trainingen-archief.git",
    repoPath:
      process.env.ARCHIVE_REPO_PATH ?? path.resolve(CWD, "..", "..", "yoga-trainingen-archief"),
    push: true,
  };
}

/** What the sync did — returned so a test can hold it to the two rules, and so a caller
 *  can tell "nothing to do" from "refused to do it". */
export interface SyncResult {
  added: string[];
  unchanged: number;
  /** Bodies that FAILED their published hash, or already exist with different content.
   *  Non-empty means NOTHING was pushed. */
  refused: string[];
  /** Bodies with NO published hash: nothing to verify against, so not pushed and not
   *  attested to. Distinct from `refused` on purpose — a refusal says a body CONTRADICTS
   *  its receipt and stops the whole push; this says a body HAS no receipt, so only it is
   *  left behind. Collapsing the two would either let one forgotten sidecar block every
   *  provider's backup, or stop a genuine mismatch being an emergency. */
  skipped: string[];
  pushed: boolean;
}

/** A body is anything that is not its own receipt. `.md` files are our reading notes,
 *  not captures (see data/archives/README.md), and they are already public. */
const isBody = (f: string) => !/\.(sha256|md)$/i.test(f);

const sha256 = (buf: Buffer) => crypto.createHash("sha256").update(buf).digest("hex");

const git = (cwd: string, args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/** Every body under the archive dir, relative to it. */
function localBodies(archiveDir: string): string[] {
  const out: string[] = [];
  for (const provider of fs.readdirSync(archiveDir)) {
    const dir = path.join(archiveDir, provider);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) if (isBody(f)) out.push(path.join(provider, f));
  }
  return out.sort();
}

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

/**
 * The hash the PUBLIC repo publishes for this body, or null if it publishes none.
 * The sidecar lists one `<hash>  <filename>` line per file captured for that source.
 */
function publishedHash(archiveDir: string, rel: string): string | null {
  const sidecar = path.join(archiveDir, sidecarFor(rel));
  if (!fs.existsSync(sidecar)) return null;
  for (const line of fs.readFileSync(sidecar, "utf8").split("\n")) {
    const [hash, name] = line.trim().split(/\s+/);
    if (name === path.basename(rel)) return hash;
  }
  return null;
}

function ensureClone(o: SyncOptions): void {
  if (fs.existsSync(path.join(o.repoPath, ".git"))) {
    process.stdout.write(`archief: ${o.repoPath} — bijwerken… `);
    git(o.repoPath, ["fetch", "--quiet", "origin", "main"]);
    git(o.repoPath, ["checkout", "--quiet", "main"]);
    git(o.repoPath, ["merge", "--ff-only", "--quiet", "origin/main"]);
    console.log("ok");
    return;
  }
  console.log(`archief: geen lokale kloon — klonen naar ${o.repoPath} (dit duurt even; ~240 MB)…`);
  fs.mkdirSync(path.dirname(o.repoPath), { recursive: true });
  execFileSync("git", ["clone", "--quiet", o.repoUrl, o.repoPath], { stdio: "inherit" });
}

export function syncArchive(opts: Partial<SyncOptions> = {}): SyncResult {
  const o: SyncOptions = { ...defaultOptions(), ...opts };
  const empty: SyncResult = { added: [], unchanged: 0, refused: [], skipped: [], pushed: false };
  if (!fs.existsSync(o.archiveDir)) return empty;

  try {
    ensureClone(o);
  } catch (e) {
    console.error(`\narchief: kon de private archiefrepo niet openen — ${(e as Error).message}`);
    console.error("archief: NIET GESYNCHRONISEERD. De bodies staan alleen op deze schijf.");
    console.error("         Los dit op en draai `npm run archive -- --sync-only` opnieuw.");
    process.exitCode = 1;
    return empty;
  }

  const dest = path.join(o.repoPath, DEST_SUBDIR);
  const added: string[] = [];
  const refused: string[] = [];
  const skipped: string[] = [];
  let unchanged = 0;

  for (const rel of localBodies(o.archiveDir)) {
    const src = path.join(o.archiveDir, rel);
    const buf = fs.readFileSync(src);

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
      // dated evidence; make a human look.
      refused.push(`${rel} — staat al in het archief met ANDERE inhoud (niet overschreven)`);
      continue;
    }

    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, buf);
    // the receipt travels with the body, so the private repo is self-contained
    const sidecar = sidecarFor(rel);
    const sidecarSrc = path.join(o.archiveDir, sidecar);
    // No existence check: we reach this line only because publishedHash() just read a hash
    // for this body OUT OF that sidecar, so it is there. A conditional would describe a
    // state the skip above has made unreachable — and a dead branch is how the next reader
    // learns the wrong invariant.
    fs.copyFileSync(sidecarSrc, path.join(dest, sidecar));
    added.push(rel);
  }

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

  if (refused.length) {
    console.error(`\n✗ archief: ${refused.length} body/bodies geweigerd:`);
    for (const c of refused) console.error(`    ${c}`);
    console.error("  Er is NIETS gepusht. Een hash is een bewering over precies deze bytes —");
    console.error("  hash de file niet opnieuw, zoek uit waaróm hij veranderd is.");
    process.exitCode = 1;
    return { added: [], unchanged, refused, skipped, pushed: false };
  }

  if (!added.length) {
    // "up-to-date" is a claim of COMPLETENESS. A run that skipped something is not entitled
    // to it; the skip report and its non-zero exit have already fired above.
    if (!skipped.length) console.log(`archief: up-to-date (${unchanged} bodies al vastgelegd).`);
    return { added, unchanged, refused, skipped, pushed: false };
  }

  // --force ON PURPOSE. The private repo is a copy of the project, so it can inherit the
  // PUBLIC repo's .gitignore — the one whose whole job is to keep bodies out of git. If that
  // ever lands there, a plain `git add` stages nothing, this script reports success, and the
  // bodies silently stop being backed up while the hashes keep being published. The bodies
  // belong in THIS repo; that is what it is for.
  git(o.repoPath, ["add", "--force", "--", DEST_SUBDIR]);
  if (!git(o.repoPath, ["diff", "--cached", "--name-only"]).trim()) {
    console.error("✗ archief: bodies gekopieerd, maar git stagede niets — negeert de archiefrepo ze?");
    process.exitCode = 1;
    return { added, unchanged, refused, skipped, pushed: false };
  }

  const providers = [...new Set(added.map((r) => r.split(path.sep)[0]))].sort();
  const subject = `Archief: ${added.length} snapshot(s) — ${providers.join(", ")}`.slice(0, 72);
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
  git(o.repoPath, ["commit", "--quiet", "-m", subject, "-m", body]);

  if (!o.push) return { added, unchanged, refused, skipped, pushed: false };

  process.stdout.write(`archief: ${added.length} nieuwe body/bodies — pushen… `);
  git(o.repoPath, ["push", "--quiet", "origin", "main"]);
  console.log("ok");
  console.log(`  ${providers.length} aanbieder(s): ${providers.join(", ")}`);
  return { added, unchanged, refused, skipped, pushed: true };
}

// Direct aanroepbaar: `npx tsx scripts/sync-archive.ts`
if (process.argv[1] && path.resolve(process.argv[1]).endsWith("sync-archive.ts")) syncArchive();
