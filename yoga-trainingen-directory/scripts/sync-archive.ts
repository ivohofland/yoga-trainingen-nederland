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
  /** What actually writes a file into the destination. Injected for exactly one reason:
   *  fs.copyFileSync cannot be made to write short from inside a test, and a short write is
   *  the failure the verification pass below exists for. A failure nobody can produce on
   *  demand is pinned by nothing. Same move, for the same reason, as archive.ts's `Capture`
   *  dep ("Injected so a test can drive captureNode without a browser — and, in #6, make the
   *  capture fail on demand"). Production never passes this; defaultOptions() supplies the
   *  real thing, and every other test in the suite exercises that default. */
  copyFile: (src: string, dst: string) => void;
}

export function defaultOptions(): SyncOptions {
  return {
    archiveDir: path.join(CWD, "data", "archives"),
    repoUrl:
      process.env.ARCHIVE_REPO_URL ?? "https://github.com/ivohofland/yoga-trainingen-archief.git",
    repoPath:
      process.env.ARCHIVE_REPO_PATH ?? path.resolve(CWD, "..", "..", "yoga-trainingen-archief"),
    push: true,
    copyFile: (src, dst) => fs.copyFileSync(src, dst),
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
  /** Bodies this run WROTE into the destination whose landed bytes do not match the hash the
   *  public repo published for them. NOT folded into `refused`, for the reason #7 refused to
   *  fold `skipped` into it: a Rule 1 or Rule 2 refusal carries the guarantee that the
   *  destination was never touched, and this carries the opposite. Nothing is committed and
   *  nothing is pushed — and nothing is deleted either.
   *  See docs/superpowers/specs/2026-08-05-sync-verify-what-landed-design.md */
  mislanded: string[];
  pushed: boolean;
}

/** A body is anything that is not its own receipt. `.md` files are our reading notes,
 *  not captures (see data/archives/README.md), and they are already public. */
const isBody = (f: string) => !/\.(sha256|md)$/i.test(f);

/** OS junk is never a capture. Excluded by NAME rather than by pattern: an unrecognised
 *  file under the archive tree must still halt the run — the gate's value is that it stops
 *  for anything it cannot account for, and a pattern would quietly grow to cover things
 *  that matter. Note `isBody(".DS_Store") === true` — this is a SEPARATE exclusion, not a
 *  narrowing of `isBody`, and it is applied only to the dirty-clone gate below, never to
 *  what gets copied, verified or pushed. */
const IGNORABLE_JUNK = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

/** The path out of one `git status --porcelain` line: a two-character status, a space, then
 *  the path (e.g. `?? yoga-trainingen-directory/data/archives/testco/.DS_Store`). Matching
 *  the raw line — or taking its basename directly — would test the status code and any
 *  leading directories along with it, so junk sitting two levels deep would never match. */
const pathFromPorcelainLine = (line: string) => line.slice(3);

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

/** What to do with untracked files under the archive subdirectory of the clone. Printed by
 *  BOTH refusals that can leave them — the dirty-clone gate and the mislanded block — because
 *  both leave the author facing the same tree, and because the specific message prints once, in
 *  a run whose output may have scrolled away days ago. The gate's has to be correct WITHOUT
 *  knowing what put the files there.
 *
 *  Which is why `reasons` is the CALLER's. Only what is true in both cases lives in the shared
 *  body; the sentence explaining why these files must not be committed by hand is the one thing
 *  the two refusals disagree about. The gate never verified them, and that is its reason. The
 *  mislanded block verified them and they FAILED, which is its reason and the opposite claim.
 *  A shared block asserting either would be read as a statement about the tree by a caller that
 *  knows better, and be wrong half the time.
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
 *  a universal claim that is merely usually true is not one this project ships.
 *
 *  It promises nothing about the NEXT run, either. Whether these paths get copied and verified
 *  again depends on why they are here, which is precisely what this block does not know:
 *  after a drifted source, Rule 1 refuses until a human has worked out what changed. Where the
 *  answer is knowable, sourceVerdict() has already printed it, two lines up. */
function cleanupAdvice(repoPath: string, reasons: string[]): string[] {
  return [
    ...reasons,
    "  Elke body die hier hoort staat óók in data/archives/. Controleer dat per pad hierboven —",
    "  klopt het, dan is dit een kopie en nooit het enige exemplaar, en kun je hem hier weghalen:",
    `    git -C ${repoPath} clean -ndx -- ${DEST_SUBDIR}   (kijken)`,
    `    git -C ${repoPath} clean -fdx -- ${DEST_SUBDIR}   (opruimen)`,
    "  `git clean` raakt nooit iets aan dat is vastgelegd.",
  ];
}

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

export function syncArchive(opts: Partial<SyncOptions> = {}): SyncResult {
  const o: SyncOptions = { ...defaultOptions(), ...opts };
  const empty: SyncResult = {
    added: [],
    unchanged: 0,
    refused: [],
    skipped: [],
    mislanded: [],
    pushed: false,
  };
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

  // `unchanged` is decided by presence in the destination WORKING TREE, never by presence in
  // the history — so a body sitting there uncommitted reads as "already archived", and the
  // run reports up-to-date over something that is backed up nowhere. The sync commits
  // everything it copies, so a dirty tree here is a state nobody can account for: refuse it
  // rather than sync on top of it. Scoped to the archive subdirectory on purpose — an edited
  // README is not a threat to the evidence chain, an unaccounted-for body is.
  // --ignored is deliberate: this repo carries no .gitignore today, but `git add --force`
  // below exists precisely because it COULD inherit the public repo's one, and without
  // --ignored this check would silently pass exactly when it was needed most.
  // --untracked-files=all is also deliberate: git's default collapses an untracked directory
  // into a single "??  <dir>/" line, which would name a folder, not the body inside it — and
  // a refusal a human cannot act on is not a refusal. A pathspec that matches nothing (a fresh
  // clone with no archive subdirectory yet) still returns empty either way, so this does not
  // reopen the clean-clone risk above.
  const dirty = git(o.repoPath, [
    "status",
    "--porcelain",
    "--ignored",
    "--untracked-files=all",
    "--",
    DEST_SUBDIR,
  ]).trim();
  // OS junk (.DS_Store et al.) is excluded from the dirty check by name, not by pattern — see
  // IGNORABLE_JUNK above. It is filtered out of the lines that decide the refusal; it is never
  // touched on disk, and a run that finds only junk proceeds exactly as if the tree were clean.
  const dirtyLines = dirty.length
    ? dirty
        .split("\n")
        .filter((line) => !IGNORABLE_JUNK.has(path.basename(pathFromPorcelainLine(line))))
    : [];
  if (dirtyLines.length) {
    console.error("\n✗ archief: de archiefrepo heeft niet-vastgelegde bestanden:");
    for (const line of dirtyLines) console.error(`    ${line.trim()}`);
    console.error("  Er is NIETS gesynchroniseerd. Een body die daar ongecommit staat telt");
    console.error("  hier als 'al vastgelegd', terwijl hij nergens geback-upt is.");
    // This refusal's own reason: the gate knows nothing about these files except that THIS run
    // never looked at them, which is exactly what committing one would claim it did.
    const advice = cleanupAdvice(o.repoPath, [
      "  Leg hier NIETS met de hand vast: deze sync heeft deze bestanden nooit geverifieerd,",
      "  en vastleggen is precies de bewering dat hij dat wél deed.",
    ]);
    for (const line of advice) console.error(line);
    process.exitCode = 1;
    return empty;
  }

  const dest = path.join(o.repoPath, DEST_SUBDIR);
  const added: string[] = [];
  const refused: string[] = [];
  const skipped: string[] = [];
  const toCopy: string[] = [];
  let unchanged = 0;

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
    return { added: [], unchanged, refused, skipped, mislanded: [], pushed: false };
  }

  // PASS 2 — WRITE. This pass decides NOTHING; every body here was classified in pass 1 and
  // the run is already known to be refusal-free. copyFileSync rather than writeFileSync(buf):
  // the kernel copies the file, so no body is ever held in memory here — the corpus is
  // ≈403 MB decimal (402,748,291 bytes) across 465 bodies, the largest ≈60 MB decimal
  // (60,444,725 bytes). These bytes are therefore re-read rather than being the ones pass 1
  // hashed — and pass 3 below re-hashes what LANDED, which is what closes that gap: a source
  // that drifted in the window between the two reads produces a destination that fails there,
  // in this run.
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
  const mislanded = failures.map((f) => `${f.rel} — ${f.why}`);

  if (mislanded.length) {
    console.error(`\n✗ archief: ${mislanded.length} body/bodies kwamen VERKEERD aan in de kloon:`);
    for (const m of mislanded) console.error(`    ${m}`);
    console.error("  Er is NIETS vastgelegd en NIETS gepusht. Er is ook niets verwijderd:");
    console.error("  dit script haalt nooit iets uit een bewijsboom — en juist dit bestand is");
    console.error("  het enige bewijs van HOE het misging.");
    for (const line of sourceVerdict(o.archiveDir, failures.map((f) => f.rel))) console.error(line);
    // This refusal's own reason, and it is the opposite of the gate's: pass 3 DID verify these
    // files — that is why nothing was committed. The instruction is the same; the reason is not,
    // and the reason is what makes an instruction stick.
    // The order inside it is load-bearing. The file that failed is the only evidence of HOW it
    // failed, and the last thing printed is the thing that gets done, so "look at it" has to
    // come before the commands that clear it away.
    const advice = cleanupAdvice(o.repoPath, [
      "  Leg hier NIETS met de hand vast: deze bestanden zijn wél geverifieerd en ze klopten",
      "  niet — daarom is er niets vastgelegd.",
      "  Kijk er eerst zelf naar voordat je hier iets opruimt: de grootte en de inhoud van wat",
      "  er landde zijn wat een afgebroken schrijfactie onderscheidt van iets anders.",
    ]);
    for (const line of advice) console.error(line);
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

  if (!added.length) {
    // "up-to-date" is a claim of COMPLETENESS. A run that skipped something is not entitled
    // to it; the skip report and its non-zero exit have already fired above.
    if (!skipped.length) console.log(`archief: up-to-date (${unchanged} bodies al vastgelegd).`);
    return { added, unchanged, refused, skipped, mislanded, pushed: false };
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
    return { added, unchanged, refused, skipped, mislanded, pushed: false };
  }

  const providers = [...new Set(added.map((r) => r.split(path.sep)[0]))].sort();
  const subject = `Archief: ${added.length} snapshot(s) — ${providers.join(", ")}`.slice(0, 72);
  // The attestation is not deleted — it is EARNED. Now that unverifiable bodies are skipped,
  // every body in this commit really was verified, so the sentence is true as written. The
  // extra line exists so the archive's own history cannot read as a complete backup when it
  // was not; it counts what stayed behind without naming files this repo does not contain.
  // Verified against the bytes that actually LANDED, which is what the sentence claims: pass 3
  // re-hashed every body in this commit where it now sits in the destination, against the hash
  // the public repo published for it, and refuses before `git commit` if one disagrees. So a
  // commit can only exist for a run whose landed bytes matched — the attestation is about the
  // files this repo holds, not about the source they were copied from.
  const body =
    "De bodies horend bij de hashes die in de publieke repo staan.\n\n" +
    added.map((r) => `  ${r}`).join("\n") +
    "\n\nGeschreven door `npm run archive` (scripts/sync-archive.ts). Append-only;\n" +
    "elke body is geverifieerd tegen de .sha256 die publiek gepubliceerd is.\n" +
    (skipped.length
      ? `\n${skipped.length} body/bodies zijn NIET meegestuurd: geen gepubliceerde hash.\n`
      : "");
  git(o.repoPath, ["commit", "--quiet", "-m", subject, "-m", body]);

  if (!o.push) return { added, unchanged, refused, skipped, mislanded, pushed: false };

  process.stdout.write(`archief: ${added.length} nieuwe body/bodies — pushen… `);
  git(o.repoPath, ["push", "--quiet", "origin", "main"]);
  console.log("ok");
  console.log(`  ${providers.length} aanbieder(s): ${providers.join(", ")}`);
  return { added, unchanged, refused, skipped, mislanded, pushed: true };
}

// Direct aanroepbaar: `npx tsx scripts/sync-archive.ts`
if (process.argv[1] && path.resolve(process.argv[1]).endsWith("sync-archive.ts")) syncArchive();
