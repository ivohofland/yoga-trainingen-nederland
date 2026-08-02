# Held-but-unreadable Artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the provenance gate reporting an archived artifact it is holding as a body that is not in this checkout.

**Architecture:** `artifactsFor()` currently derives "present" from `READABLE = [".pdf", ".html"]`, so any other format can never be present and always sets `bodyWithheld`. Derive presence from the sidecar's listed filenames that actually exist on disk instead, split those into `readable` (we extract text) and `opaque` (no extraction available), and give opaque claims a counted state that is **not** a finding — findings exit non-zero, and a certificate photo must not break the build.

**Tech Stack:** TypeScript, `node:test` via `tsx --test`, `node:fs`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-02-held-unreadable-artifacts-design.md`.
- **The `unreadable` tier is untouched.** A `.pdf`/`.html` that yields no text stays a FINDING and still fails the build.
- **`PROVENANCE_WITHHOLD_BODIES=1` behaviour must not change.** It is the mechanism that keeps CI honest rather than green.
- Dutch console strings are user-facing; write them in Dutch, matching the surrounding style.
- Tests live in `src/**/*.test.ts`. All npm commands run from `/Users/ivohofland/Projects/yoga-trainingen/yoga-trainingen-directory`.
- `npm test` and `npm run test:ci` must both stay green after every task.
- After the change, `npm run provenance` on the real corpus must stay **165/165 with zero opaque** — today's corpus is 229 `.html` + 236 `.pdf` and nothing else, so any opaque count means the format detection is wrong.

---

### Task 1: Presence is a fact about the disk

**Files:**
- Modify: `yoga-trainingen-directory/src/lib/provenance.ts` — the `Artifacts` interface (~line 561) and `artifactsFor()` (~line 611)
- Test: `yoga-trainingen-directory/src/lib/provenance.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Artifacts` gains `opaque: string[]` (absolute paths of held artifacts with no text extraction available). `artifactsFor(source, cwd?)` keeps its signature.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/provenance.test.ts`:

```ts
test("a held .png is PRESENT — presence is a fact about the disk, not about the extension", () => {
  // The bug: `present` was derived from READABLE, so any artifact that was not .pdf/.html
  // could never be present, and the run said "snapshot-body niet in deze checkout" about a
  // file it was holding. That sentence blames the ENVIRONMENT for evidence we have.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prov-"));
  fs.mkdirSync(path.join(dir, "data/archives/testco"), { recursive: true });
  fs.writeFileSync(path.join(dir, "data/archives/testco/cert-2026-08.png"), "\x89PNG\r\n");
  fs.writeFileSync(
    path.join(dir, "data/archives/testco/cert-2026-08.sha256"),
    "aaa  cert-2026-08.png\n",
  );

  const source = { id: "cert", local_snapshot: "data/archives/testco/cert-2026-08.png" } as never;
  const a = artifactsFor(source, dir);

  assert.equal(a.bodyWithheld, false, "we are holding it — it is not withheld");
  assert.equal(a.nothingCaptured, false);
  assert.equal(a.readable.length, 0, "a .png yields no text extraction");
  assert.equal(a.opaque.length, 1, "but it IS held, and must be reported as such");
  assert.match(a.opaque[0], /cert-2026-08\.png$/);
});

test("a held .png beside a MISSING .html is still withheld — one absent body is not masked", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prov-"));
  fs.mkdirSync(path.join(dir, "data/archives/testco"), { recursive: true });
  fs.writeFileSync(path.join(dir, "data/archives/testco/site-2026-08.png"), "\x89PNG\r\n");
  // The sidecar lists BOTH; only the .png is on disk.
  fs.writeFileSync(
    path.join(dir, "data/archives/testco/site-2026-08.sha256"),
    "aaa  site-2026-08.png\nbbb  site-2026-08.html\n",
  );

  const source = { id: "site", local_snapshot: "data/archives/testco/site-2026-08.png" } as never;
  const a = artifactsFor(source, dir);

  assert.equal(a.bodyWithheld, true, "the .html was captured and is not here — that is still withheld");
  assert.equal(a.opaque.length, 1, "the .png we DO hold is still reported as held");
});

test("WITHHOLD_BODIES still blanks everything — the CI simulation is unchanged", () => {
  // `withheldBodies()` only fires when the cwd IS process.cwd(), so this must run against
  // the real corpus rather than a temp dir. tribes-academy's site capture is committed as
  // a .sha256 listing both a .html and a .pdf; with bodies withheld we must hold NEITHER,
  // and opaque must not become a back door that reports artifacts as held in CI.
  const source = {
    id: "site-vinyasa200-2026-06",
    local_snapshot: "data/archives/tribes-academy/site-vinyasa200-2026-06-2026-06-28.pdf",
  } as never;

  const before = process.env.PROVENANCE_WITHHOLD_BODIES;
  try {
    process.env.PROVENANCE_WITHHOLD_BODIES = "1";
    const a = artifactsFor(source, process.cwd());
    assert.equal(a.readable.length, 0, "bodies are withheld — nothing is readable");
    assert.equal(a.opaque.length, 0, "withheld means we hold nothing, opaque included");
    assert.equal(a.bodyWithheld, true, "and the claim must still be SKIPPED, never passed");
  } finally {
    if (before === undefined) delete process.env.PROVENANCE_WITHHOLD_BODIES;
    else process.env.PROVENANCE_WITHHOLD_BODIES = before;
  }
});
```

Add `artifactsFor` to the existing import from `./provenance` at the top of the file if it is not already there.

- [ ] **Step 2: Run them and verify they fail**

Run: `cd yoga-trainingen-directory && npx tsx --test src/lib/provenance.test.ts`

Expected: FAIL — `Artifacts` has no `opaque` property (a TypeScript error), and `bodyWithheld` is `true` for the held `.png`.

- [ ] **Step 3: Add `opaque` to the interface**

In `src/lib/provenance.ts`, extend the `Artifacts` interface:

```ts
interface Artifacts {
  /** Artifact files we can actually open here. */
  readable: string[];
  /** Artifact files we ARE holding but have no text extraction for: an image with no
   *  text layer, or a format we simply do not read (.docx, .zip). Held, so not
   *  `bodyWithheld`; unextractable, so never `readable`. The distinction matters because
   *  "we do not have it" excuses us and "we have it and cannot read it" does not. */
  opaque: string[];
  /** True when the archiver captured a file for this source that is NOT in this
   *  checkout — i.e. a gitignored body. Its `.sha256` is the receipt. */
  bodyWithheld: boolean;
  /** True when nothing was ever captured: no body, no hash, no text extraction. */
  nothingCaptured: boolean;
}
```

- [ ] **Step 4: Derive presence from the disk**

Replace the body of `artifactsFor()` in `src/lib/provenance.ts`:

```ts
export function artifactsFor(source: Source, cwd = process.cwd()): Artifacts {
  if (!source.local_snapshot)
    return { readable: [], opaque: [], bodyWithheld: false, nothingCaptured: true };
  const base = source.local_snapshot.replace(/\.[a-z0-9]+$/i, "");
  const dir = path.dirname(source.local_snapshot);

  const hashFile = path.join(cwd, `${base}.sha256`);
  const hashed = fs.existsSync(hashFile)
    ? fs
        .readFileSync(hashFile, "utf8")
        .split("\n")
        .map((line) => line.trim().split(/\s+/)[1])
        .filter((name): name is string => !!name)
    : [];

  // ASK THE DISK, NOT THE EXTENSION. Deriving presence from READABLE meant a .png could
  // never be "present", so a file we were holding reported as a body missing from this
  // checkout — blaming the environment for evidence we have. The sidecar lists what was
  // captured; the filesystem says which of those are here.
  const held = withheldBodies(cwd)
    ? [] // the bodies are gitignored away, as in a fresh clone — see withheldBodies()
    : hashed.filter((name) => fs.existsSync(path.join(cwd, dir, name)));

  const isReadable = (name: string) =>
    READABLE.some((ext) => name.toLowerCase().endsWith(ext));

  return {
    readable: held.filter(isReadable).map((name) => path.join(cwd, dir, name)),
    opaque: held.filter((name) => !isReadable(name)).map((name) => path.join(cwd, dir, name)),
    bodyWithheld: hashed.some((name) => !held.includes(name)),
    nothingCaptured: held.length === 0 && hashed.length === 0,
  };
}
```

- [ ] **Step 5: Run the tests**

Run: `cd yoga-trainingen-directory && npx tsx --test src/lib/provenance.test.ts && npm test && npx tsc --noEmit`

Expected: the three new tests PASS, the whole suite is green, `tsc` clean.

- [ ] **Step 6: Verify the real corpus is unaffected**

Run: `cd yoga-trainingen-directory && npm run provenance`

Expected: `✓ 165/165` exactly as before. Today's corpus holds only `.pdf` and `.html`, so nothing should become opaque. If the count moved, the format detection is wrong — stop and report.

- [ ] **Step 7: Commit**

```bash
git add yoga-trainingen-directory/src/lib/provenance.ts yoga-trainingen-directory/src/lib/provenance.test.ts
git commit -m "Presence is a fact about the disk, not about the extension (#13)

artifactsFor() derived `present` from READABLE = [.pdf, .html], so any other
archived format could never be present and always set bodyWithheld — and the run
printed \"snapshot-body niet in deze checkout\" about a file it was holding.

That is worse than a wrong category. bodyWithheld means the CI limitation: nobody's
fault, nothing to fix. So the gate excused itself for evidence it holds and could,
with different tooling, read.

Presence now comes from the sidecar's listed filenames that exist on disk, split
into readable (we extract text) and opaque (we do not). This also closes a latent
bug: readable probed base+ext rather than the names the sidecar lists, so an
off-pattern capture was invisible to the gate even when hashed and present."
```

---

### Task 2: An opaque claim is counted, not accused

**Files:**
- Modify: `yoga-trainingen-directory/src/lib/provenance.ts` — `ProvenanceReport` (~line 632), the counters in `providerProvenance` (~line 802), the claim loop (~line 829-891), and the two `return` blocks (~line 894, ~line 906)
- Test: `yoga-trainingen-directory/src/lib/provenance.test.ts`

**Interfaces:**
- Consumes: `Artifacts.opaque` from Task 1.
- Produces: `ProvenanceReport` gains `opaque: number` and `opaqueFiles: string[]` (basenames, for the report). Both sum across providers in `allProvenance`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/provenance.test.ts`:

```ts
test("a claim whose only artifact is a held image is OPAQUE — counted, never a finding", () => {
  // A photo of a certificate is legitimate evidence. The gate cannot read it, but nothing
  // is broken: a .png has no text layer. Making it a finding would exit non-zero and break
  // the build for adding a photograph — punishing the evidence this state exists to admit.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prov-"));
  fs.mkdirSync(path.join(dir, "data/archives/testco"), { recursive: true });
  fs.writeFileSync(path.join(dir, "data/archives/testco/tarieven-2026-08.png"), "\x89PNG\r\n");
  fs.writeFileSync(
    path.join(dir, "data/archives/testco/tarieven-2026-08.sha256"),
    "aaa  tarieven-2026-08.png\n",
  );

  const p = {
    id: "testco",
    name: "Test Co",
    programs: [
      {
        id: "200-test",
        price: { amount_eur: 1234, period: "total", vat: "unknown", published: "yes", source: "tarieven" },
        hours_claimed: { total: null, breakdown_published: "unknown", contact_published: "unknown" },
      },
    ],
    sources: [{ id: "tarieven", local_snapshot: "data/archives/testco/tarieven-2026-08.png" }],
  } as unknown as Provider;

  const r = providerProvenance(p, dir);
  assert.deepEqual(r.findings, [], "a format with no text layer is not a defect");
  assert.equal(r.opaque, 1, "it must be counted, not silently passed");
  assert.equal(r.skipped, 0, "and NOT filed as a body missing from this checkout");
  assert.ok(
    r.opaqueFiles.some((f) => f.endsWith("tarieven-2026-08.png")),
    "the report names the file, so a .docx line reads as a prompt to add support",
  );
});

test("a shell .pdf beside a held .png is STILL an unreadable finding", () => {
  // The opaque state must not swallow a broken capture. A format we promised to read and
  // could not is our failure; a format with no text layer is not.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prov-"));
  fs.mkdirSync(path.join(dir, "data/archives/testco"), { recursive: true });
  fs.writeFileSync(path.join(dir, "data/archives/testco/site-2026-08.html"), "   \n  \n");
  fs.writeFileSync(path.join(dir, "data/archives/testco/site-2026-08.png"), "\x89PNG\r\n");
  fs.writeFileSync(
    path.join(dir, "data/archives/testco/site-2026-08.sha256"),
    "aaa  site-2026-08.html\nbbb  site-2026-08.png\n",
  );

  const p = {
    id: "testco",
    name: "Test Co",
    programs: [
      {
        id: "200-test",
        price: { amount_eur: 1234, period: "total", vat: "unknown", published: "yes", source: "site" },
        hours_claimed: { total: null, breakdown_published: "unknown", contact_published: "unknown" },
      },
    ],
    sources: [{ id: "site", local_snapshot: "data/archives/testco/site-2026-08.html" }],
  } as unknown as Provider;

  const r = providerProvenance(p, dir);
  assert.equal(r.findings.length, 1, "the empty .html is still broken");
  assert.equal(r.findings[0].reason, "unreadable");
  assert.equal(r.opaque, 0, "the image must not mask it");
});

test("a held .docx is opaque and named — the signal that would earn a category", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prov-"));
  fs.mkdirSync(path.join(dir, "data/archives/testco"), { recursive: true });
  fs.writeFileSync(path.join(dir, "data/archives/testco/tarieven-2026-08.docx"), "PK\x03\x04");
  fs.writeFileSync(
    path.join(dir, "data/archives/testco/tarieven-2026-08.sha256"),
    "aaa  tarieven-2026-08.docx\n",
  );

  const p = {
    id: "testco",
    name: "Test Co",
    programs: [
      {
        id: "200-test",
        price: { amount_eur: 1234, period: "total", vat: "unknown", published: "yes", source: "tarieven" },
        hours_claimed: { total: null, breakdown_published: "unknown", contact_published: "unknown" },
      },
    ],
    sources: [{ id: "tarieven", local_snapshot: "data/archives/testco/tarieven-2026-08.docx" }],
  } as unknown as Provider;

  const r = providerProvenance(p, dir);
  assert.deepEqual(r.findings, []);
  assert.equal(r.opaque, 1);
  assert.ok(r.opaqueFiles.some((f) => f.endsWith("tarieven-2026-08.docx")));
});
```

- [ ] **Step 2: Run them and verify they fail**

Run: `cd yoga-trainingen-directory && npx tsx --test src/lib/provenance.test.ts`

Expected: FAIL — `ProvenanceReport` has no `opaque` or `opaqueFiles`, and the image claim currently increments `skipped`.

- [ ] **Step 3: Extend `ProvenanceReport`**

In `src/lib/provenance.ts`, add to the `ProvenanceReport` interface:

```ts
  /** Claims whose only held artifacts have no text extraction available — an image with
   *  no text layer, a .docx we do not read. NOT a finding: nothing is broken, and
   *  `scripts/provenance.ts` exits non-zero on findings, so this would break the build
   *  for adding a photograph. Counted and named instead, so the run never implies these
   *  claims were verified. */
  opaque: number;
  /** Basenames of those artifacts, so the report can name them. A `.png` line reads as
   *  expected; a `.docx` line reads as a prompt to add extraction support. */
  opaqueFiles: string[];
```

- [ ] **Step 4: Count it in `providerProvenance`**

Add the counters beside the existing ones (~line 802):

```ts
  let opaque = 0;
  const opaqueFiles: string[] = [];
```

Destructure `opaque` from `artifactsFor` (~line 829), renaming to avoid the counter:

```ts
      const { readable, opaque: opaqueHeld, bodyWithheld, nothingCaptured } = artifactsFor(source, cwd);
```

Insert this block **after** the `bodyWithheld` check and **before** the `texts.length === 0` finding:

```ts
      // HELD, BUT NOT EXTRACTABLE. `readable.length === 0` is the guard that keeps this
      // from swallowing a broken capture: if any format we promised to read is present,
      // the claim stays on the finding path below, where an empty extraction is our bug.
      if (readable.length === 0 && opaqueHeld.length > 0) {
        opaque++;
        for (const f of opaqueHeld) opaqueFiles.push(path.basename(f));
        continue;
      }
```

Add both to the `providerProvenance` return block:

```ts
    opaque,
    opaqueFiles,
```

- [ ] **Step 5: Sum them in `allProvenance`**

In `allProvenance`, add to the returned object:

```ts
    opaque: sum((r) => r.opaque),
    opaqueFiles: reports.flatMap((r) => r.opaqueFiles),
```

- [ ] **Step 6: Run the tests**

Run: `cd yoga-trainingen-directory && npx tsx --test src/lib/provenance.test.ts && npm test && npm run test:ci && npx tsc --noEmit`

Expected: all six new tests PASS, both suites green, `tsc` clean.

- [ ] **Step 7: Verify the CI path did not move**

Run: `cd yoga-trainingen-directory && npm run test:ci 2>&1 | grep -E "^# (pass|fail)"`

Expected: identical pass/fail counts to `npm test`. `PROVENANCE_WITHHOLD_BODIES=1` must still blank everything — if the skipped count dropped, the opaque state leaked into the withheld path, which is the one regression that would make CI pass vacuously.

- [ ] **Step 8: Commit**

```bash
git add yoga-trainingen-directory/src/lib/provenance.ts yoga-trainingen-directory/src/lib/provenance.test.ts
git commit -m "An opaque claim is counted, not accused (#13)

A claim whose only held artifact has no text extraction available is now counted
as opaque rather than filed as a body missing from this checkout.

It is deliberately NOT a ProvenanceReason. scripts/provenance.ts ends with
\`if (findings.length > 0) process.exit(1)\`, so making image evidence a finding
would break the build for adding a certificate photo — punishing exactly the
evidence this state exists to admit.

The \`readable.length === 0\` guard keeps it from swallowing a broken capture: a
shell .pdf beside a held .png still reaches the unreadable finding. A format we
promised to read and could not is our failure; a format with no text layer is not."
```

---

### Task 3: Say it in the run

**Files:**
- Modify: `yoga-trainingen-directory/scripts/provenance.ts:52-85`
- Modify: `yoga-trainingen-directory/scripts/validate.ts` — the provenance block (~line 85-100)
- Test: `yoga-trainingen-directory/src/lib/provenance.test.ts`

**Interfaces:**
- Consumes: `ProvenanceReport.opaque` and `.opaqueFiles` from Task 2.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/provenance.test.ts`:

```ts
test("REPORT: both runners print the opaque count — a silent state is a passed state", () => {
  // If the run does not say these claims were unverifiable, a green tick over them reads
  // as "checked". The whole reason opaque is not a finding is that it is reported instead.
  const prov = fs.readFileSync(path.join(process.cwd(), "scripts", "provenance.ts"), "utf8");
  const val = fs.readFileSync(path.join(process.cwd(), "scripts", "validate.ts"), "utf8");
  for (const [name, src] of [["provenance.ts", prov], ["validate.ts", val]] as const) {
    assert.match(src, /\bopaque\b/, `${name} must read the opaque count`);
    assert.match(src, /opaqueFiles/, `${name} must name the unreadable artifacts`);
  }
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `cd yoga-trainingen-directory && npx tsx --test src/lib/provenance.test.ts`

Expected: FAIL — neither script mentions `opaque`.

- [ ] **Step 3: Report it in `scripts/provenance.ts`**

Destructure the new fields at line 52:

```ts
const { findings, examined, skipped, claims, granularity, opaque, opaqueFiles } = allProvenance(providers);
```

Insert this block immediately **before** the `if (skipped > 0)` block:

```ts
if (opaque > 0) {
  // Geen bevinding: er is niets stuk. Maar ook geen vinkje — deze claims zijn niet
  // getoetst, alleen niet toetsbaar met dit gereedschap. Dat verschil moet in de run staan.
  console.log(
    `\n• ${opaque} claim(s) rusten op bewijs dat wij niet kunnen uitlezen (wél in ons bezit):`,
  );
  for (const f of [...new Set(opaqueFiles)].sort()) console.log(`    ${f}`);
  console.log("  Geen tekstlaag of geen extractie voor dit formaat — niet machinaal getoetst.");
}
```

- [ ] **Step 4: Report it in `scripts/validate.ts`**

Destructure the new fields where `allProvenance` is called, and after the existing coverage line add:

```ts
  if (opaque > 0) {
    console.log(
      `• ${opaque} claim(s) op bewijs dat wij niet kunnen uitlezen (wél in ons bezit): ` +
        `${[...new Set(opaqueFiles)].sort().join(", ")} — niet machinaal getoetst.`,
    );
  }
```

- [ ] **Step 5: Run everything**

Run: `cd yoga-trainingen-directory && npm run build`

Expected: exit 0. `validate` 48 providers + 5 references, `provenance` 165/165 with **no** opaque line (the corpus has none), `npm test` and `npm run test:ci` both green, `next build` ✓, `verify-export` ✓.

- [ ] **Step 6: Prove the report actually fires**

The corpus has no opaque artifact, so Step 5 cannot show the new output. Verify it manually in a scratch directory that is **outside the repo**:

```bash
cd /tmp && rm -rf opaque-demo && mkdir -p opaque-demo/data/archives/demo && cd opaque-demo
printf '\x89PNG\r\n' > data/archives/demo/cert-2026-08.png
printf 'aaa  cert-2026-08.png\n' > data/archives/demo/cert-2026-08.sha256
cd /Users/ivohofland/Projects/yoga-trainingen/yoga-trainingen-directory
npx tsx -e "
import { providerProvenance } from './src/lib/provenance';
const p = { id:'demo', name:'Demo', programs:[{ id:'200-x',
  price:{amount_eur:1234,period:'total',vat:'unknown',published:'yes',source:'c'},
  hours_claimed:{total:null,breakdown_published:'unknown',contact_published:'unknown'} }],
  sources:[{ id:'c', local_snapshot:'data/archives/demo/cert-2026-08.png' }] } as any;
const r = providerProvenance(p, '/tmp/opaque-demo');
console.log('findings:', r.findings.length, 'opaque:', r.opaque, 'skipped:', r.skipped, r.opaqueFiles);
"
rm -rf /tmp/opaque-demo
```

Expected: `findings: 0 opaque: 1 skipped: 0 [ 'cert-2026-08.png' ]`. Anything else — especially `skipped: 1` — means the fix did not take.

- [ ] **Step 7: Confirm the tree is clean**

Run: `git status --porcelain`

Expected: only the two scripts and the test file modified. No `data/` file, no scratch artifact left behind.

- [ ] **Step 8: Commit**

```bash
git add yoga-trainingen-directory/scripts/provenance.ts yoga-trainingen-directory/scripts/validate.ts yoga-trainingen-directory/src/lib/provenance.test.ts
git commit -m "Report the opaque count in both runners (#13)

A state that is counted but never printed is a state that reads as passed. The
whole justification for opaque not being a finding is that the run says so
instead: how many claims rest on evidence we hold and cannot read, and which
files they are.

The wording deliberately avoids a tick. These claims were not verified; they were
not verifiable with this tool, which is a different sentence."
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: the root cause and the ask-the-disk fix → Task 1; the new counted state, the ordering, and the `readable.length === 0` guard → Task 2; reporting → Task 3. The spec's seven tests map as: 1-3 → Task 1, 4-6 → Task 2 (test 4, "a `.pdf` that yields no text is still a finding", is already pinned by the existing test at `provenance.test.ts` — "an artifact that extracts to NOTHING is `unreadable`, never `no_evidence`" — and Task 2's shell-pdf-beside-png test extends it to the new interaction), 7 → Task 1's WITHHOLD_BODIES test.

**Placeholder scan.** None. Every step carries the code or the exact command.

**Type consistency.** `Artifacts.opaque` is `string[]` (absolute paths) in Tasks 1-2. `ProvenanceReport.opaque` is `number` and `.opaqueFiles` is `string[]` (basenames) in Tasks 2-3 — the two `opaque` names live on different types, which is why Task 2 destructures the artifact one as `opaqueHeld`. `artifactsFor(source, cwd?)` and `providerProvenance(p, cwd)` keep their existing signatures throughout.

**One risk the plan carries deliberately.** Task 1 changes `nothingCaptured` from `readable.length === 0 && hashed.length === 0` to `held.length === 0 && hashed.length === 0`. These agree whenever `hashed` is empty (both reduce to the same thing), and when `hashed` is non-empty both are false. The existing `no_artifact` tests cover it; if either goes red, that equivalence is wrong and the task should stop rather than adjust the test.
