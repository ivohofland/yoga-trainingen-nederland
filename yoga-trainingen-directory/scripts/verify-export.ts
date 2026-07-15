/**
 * POSTBUILD: proves the shipped BYTES, not merely that gen-schema/validate/provenance/test
 * passed. `next build`'s export phase — which writes `out/` — runs LAST in the gate chain
 * (package.json's `build` script), and `npm test` runs BEFORE it, so no unit test can open
 * `out/` at all: it does not exist yet at that point in the chain. `npm run postbuild`
 * (wired via package.json's `postbuild` hook, which npm runs automatically right after
 * `build` — no separate CI step to remember) is the one place that runs after `out/` exists,
 * on every build, local or CI. next-config.test.ts is the unit-level half of the /qa
 * guarantee (our predicate reads NODE_ENV correctly) — it cannot prove Next actually acted
 * on it; this can, because this reads what Next actually wrote.
 *
 * State honestly what this costs: the BUILD already ran, in full, immediately before this
 * script starts. This is a handful of file checks tacked onto the end of it — near-zero
 * marginal time — for catching a leak or a truncated export that the unit suite structurally
 * cannot see.
 *
 * `deploy/deploy.sh`'s own GATE 3a/3b re-check the QA leak and the page-count floor again,
 * on the server, immediately before the rsync — this script does not replace that gate, it
 * moves the same two failure modes earlier: onto every contributor's machine and onto CI,
 * before a bad build is ever pushed, not merely before it is deployed.
 */
import fs from "node:fs";
import path from "node:path";

const APP_DIR = process.cwd();
const OUT = path.join(APP_DIR, "out");

function fail(msg: string): never {
  console.error(`✗ verify-export: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(OUT)) {
  fail(`out/ does not exist — this script runs as a "postbuild" hook and expects next build's export to have just written it`);
}

// 1. THE INTERNAL WORK-LIST MUST NOT SHIP. Checked by PATH first, in every shape an
// accidental route could take.
for (const rel of ["qa", "qa.html", "qa/index.html"]) {
  if (fs.existsSync(path.join(OUT, rel))) {
    fail(`out/${rel} exists — the internal work-list (every open gap, per-provider completeness, unarchived-source count) would ship`);
  }
}

// A CONTENT TRIPWIRE, not just a path check — it still catches a leak if the route were
// ever renamed to something the list above doesn't anticipate. Read the title straight out
// of the page's own metadata rather than hardcoding a second copy that could drift from it.
const qaPageSrc = fs.readFileSync(path.join(APP_DIR, "app", "qa", "page.dev.tsx"), "utf8");
const titleMatch = qaPageSrc.match(/title:\s*"([^"]+)"/);
if (!titleMatch) fail(`could not find metadata.title in app/qa/page.dev.tsx — update this check to match`);
const qaTitle = titleMatch[1];

function walkHtml(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walkHtml(full);
    return e.name.endsWith(".html") ? [full] : [];
  });
}
for (const f of walkHtml(OUT)) {
  if (fs.readFileSync(f, "utf8").includes(qaTitle)) {
    fail(
      `${path.relative(OUT, f)} contains the QA page's own title ("${qaTitle}") — the work-list ` +
        `leaked under a different route than /qa`,
    );
  }
}

// 2. THE SITE ITSELF MUST EXIST.
if (!fs.existsSync(path.join(OUT, "index.html"))) fail(`out/index.html is missing`);

// 3. THE JSON API MUST SHIP, MUST PARSE, AND MUST MATCH WHAT export-json.ts JUST WROTE.
// Comparing counts against public/data/v1/providers.json (rather than trusting out/'s copy
// alone) catches `next build` shipping something OTHER than this run's export — a stale
// public/ left over from an earlier, aborted build, for instance — even though
// export-json.ts itself ran correctly moments earlier in this same build. This is also the
// static-export half of the documented public JSON API contract: the file that ships is the
// file that was written.
const outJsonPath = path.join(OUT, "data", "v1", "providers.json");
const publicJsonPath = path.join(APP_DIR, "public", "data", "v1", "providers.json");
if (!fs.existsSync(outJsonPath)) fail(`out/data/v1/providers.json is missing`);
if (!fs.existsSync(publicJsonPath)) fail(`public/data/v1/providers.json is missing — export-json did not run before this script`);

let outPayload: { providers: Array<{ id: string }> };
try {
  outPayload = JSON.parse(fs.readFileSync(outJsonPath, "utf8"));
} catch (e) {
  fail(`out/data/v1/providers.json does not parse as JSON: ${e}`);
}
let publicPayload: { providers: Array<{ id: string }> };
try {
  publicPayload = JSON.parse(fs.readFileSync(publicJsonPath, "utf8"));
} catch (e) {
  fail(`public/data/v1/providers.json does not parse as JSON: ${e}`);
}

if (!Array.isArray(outPayload.providers) || outPayload.providers.length === 0) {
  fail(`out/data/v1/providers.json has no providers — an empty API would ship`);
}
if (outPayload.providers.length !== publicPayload.providers.length) {
  fail(
    `out/data/v1/providers.json has ${outPayload.providers.length} provider(s), but ` +
      `public/data/v1/providers.json (written moments earlier, this same build, by ` +
      `export-json) has ${publicPayload.providers.length} — next build copied something ` +
      `other than this run's export into out/`,
  );
}

// 4. A REAL RECORD MUST RESOLVE, IN THE TRAILING-SLASH SHAPE THE STOCK VHOST DEPENDS ON
// (next.config.ts's `trailingSlash: true` — see that file's docblock for why).
const sampleId = outPayload.providers[0].id;
const providerPage = path.join(OUT, "aanbieder", sampleId, "index.html");
if (!fs.existsSync(providerPage)) {
  fail(`out/aanbieder/${sampleId}/index.html is missing — no provider page resolves in the shape the vhost needs`);
}

console.log(
  `✓ verify-export: /qa absent (path + content), out/index.html present, ` +
    `${outPayload.providers.length} provider(s) in out/data/v1/providers.json (matches public/), ` +
    `out/aanbieder/${sampleId}/ resolves`,
);
