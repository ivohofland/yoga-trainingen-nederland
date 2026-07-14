/**
 * Exports the validated dataset as static JSON — this IS the API (spec §1):
 * versioned, cacheable, zero runtime. The future values-brand frontend can
 * consume the same export without touching this repo.
 *
 * A thin WRITER, and nothing more. The payload's shape and its derived values
 * live in src/lib/api.ts, which is pure — so the test suite can hold what this
 * script emits against what the two site surfaces render, and prove all three say
 * the same thing about every named business. Read the header of api.ts for why
 * shipping the raw records was not merely thin but dangerous.
 *
 * THE API PUBLISHES WHAT IS COMMITTED. An untracked record in data/providers/ is
 * work in progress — a draft the author has not yet stood behind — and this script
 * will not publish it. That is not a convenience: publishing an unfinished record
 * about a named business is exactly the failure this project exists to avoid, and
 * git is where "finished" is declared (spec §1: the git history IS the audit trail).
 *
 * It is also a hard-won rule. Before this check existed, the way to keep a draft out
 * of the export was to MOVE the untracked file out of the repo, export, and move it
 * back. That worked every time until an agent doing it crashed between the two steps
 * and the author's uncommitted record was destroyed — 364 lines of research, gone,
 * because a build script could not tell a draft from a published record. It can now.
 * Never move the author's files to work around this script again.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { loadDataset } from "../src/lib/loader";
import { API_VERSION, toApiPayload } from "../src/lib/api";

/** Provider ids whose YAML is tracked in git. Untracked = a draft; drafts are not published. */
function committedProviderIds(): Set<string> | null {
  try {
    const out = execFileSync("git", ["ls-files", "data/providers"], { encoding: "utf8" });
    const ids = out
      .split("\n")
      .filter((f) => f.endsWith(".yaml"))
      .map((f) => path.basename(f, ".yaml"));
    return ids.length ? new Set(ids) : null;
  } catch {
    // Not a git checkout (a tarball, a vendored copy). Publish everything that
    // validates rather than silently emitting an empty API — but say so.
    console.warn("export-json: not a git checkout — cannot tell drafts from records; exporting all.");
    return null;
  }
}

const { providers, errors } = loadDataset();
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const committed = committedProviderIds();
const published = committed ? providers.filter((p) => committed.has(p.id)) : providers;
const drafts = providers.filter((p) => !published.includes(p));

const outDir = path.join(process.cwd(), "public", "data", API_VERSION);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "providers.json"),
  JSON.stringify(toApiPayload(published), null, 2),
);

console.log(
  `exported ${published.length} providers (+ derived) → public/data/${API_VERSION}/providers.json`,
);
if (drafts.length) {
  console.log(
    `  ${drafts.length} draft record(s) held back (untracked in git): ${drafts.map((p) => p.id).join(", ")}`,
  );
}
