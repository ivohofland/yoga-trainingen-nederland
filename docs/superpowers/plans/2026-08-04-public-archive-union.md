# A missing public archive is a finding or a gap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `archived_url` with a required `public_archive` discriminated union so "no public archive can evidence this page" (a finding) and "not archived yet" (a gap) stop sharing a key, and every consumer reads `kind` instead of truthiness.

**Architecture:** Spec first (v0.14), then the Zod union on `Source` and `Reference`, then a one-shot in-place migration of all 237 records that preserves comments. The loader gains a cross-check binding the stored reason to `waybackPointlessReason()`. Consumers move from `== null` to `kind`.

**Tech Stack:** TypeScript, Zod, `yaml` (`parseDocument` — comment-preserving), `node:test` via `tsx --test`, Next.js App Router.

## Global Constraints

- Design: `docs/superpowers/specs/2026-08-04-public-archive-union-design.md`. Read it before Task 1.
- All `npm` commands run from `yoga-trainingen-directory/`. Baseline is **322 tests**.
- **Never move, rename, delete, re-hash or re-capture ANY file under `data/archives/`.** This work changes *records*, never evidence. Archive bodies are gitignored and exist on one machine; an agent once moved one meaning to move it back, crashed in between, and destroyed 364 lines of unrecoverable research.
- **Never run `npm run archive`** — it pushes to the real private archive repo and hits the network.
- **The spec is the source of truth and changes first** (CLAUDE.md). `data-model-spec.md` → v0.14 before the schema.
- **A migration that mislabels a gap as a finding publishes a false claim about our own diligence.** The 107 mechanical conversions are classified by the same predicate the loader then cross-checks; the 16 non-mechanical ones are enumerated below and decided individually, never by rule.
- The migration must **preserve comments and field order**. A naive `parse` → `stringify` drops every comment in the corpus. Verification: `git diff` touches only `archived_url`/`public_archive` lines.
- Quad discipline: `not_yet` and `impossible` must never render identically. This is the same rule `src/lib/quad.test.ts` locks for the data model.
- Code comments in English, user-facing output in Dutch.
- Gates after every task: `npm run validate`, `npm test`, `npm run test:ci`, `npx tsc --noEmit`. Full `npm run build` before the final commit. `npm run provenance` must stay ✓ 165/165.

## File Structure

- **Modify:** `data-model-spec.md` (§4.1, §4.1b, version header)
- **Modify:** `yoga-trainingen-directory/src/schema/index.ts` — the union, on both `Source` and `Reference`
- **Modify:** all 48 `data/providers/*.yaml` and 5 `data/references/*.yaml`
- **Modify:** `src/lib/loader.ts`, `src/lib/derive.ts`, `src/lib/presenters.ts`, `app/qa/page.dev.tsx`, `scripts/archive.ts`
- **Modify:** the corresponding `*.test.ts` files

No new production files. The migration script is a one-off: write it in the SDD workspace (git-ignored), run it once, commit only its output. The diff is the reviewable artifact, not the script.

---

### Task 1: Spec v0.14, the union, and the migration

**Files:**
- Modify: `data-model-spec.md`
- Modify: `yoga-trainingen-directory/src/schema/index.ts:85` (Source), `:122` (Reference)
- Modify: all 53 record files under `yoga-trainingen-directory/data/`
- Create: `yoga-trainingen-directory/src/lib/public-archive-schema.test.ts` — there is no test file under `src/schema/`; the convention for schema-shape tests is a `*-schema.test.ts` in `src/lib/` (see the existing `src/lib/schedule-schema.test.ts`)

**Interfaces:**
- Consumes: nothing.
- Produces: `PublicArchive` (exported Zod schema) and the field `public_archive` on both `Source` and `Reference`, **required**. Variants: `{kind:"archived", url}` | `{kind:"impossible", reason}` | `{kind:"not_yet"}`. Tasks 2-4 read `.kind`.

This task is atomic on purpose: a required field renamed without its data migrated means nothing loads.

- [ ] **Step 1: Update the spec first**

In `data-model-spec.md`: add a v0.14 entry to the version header explaining the finding-vs-gap split (match the register of the v0.13 entry above it). In the §4.1 table replace the `archived_url` row, and in the §4.1b table likewise:

```
| `public_archive` | union | `{kind: archived, url}` \| `{kind: impossible, reason}` \| `{kind: not_yet}`. **Required.** A missing public archive is either a FINDING (no public archive can evidence this page — a JS-shell register, a gated PDF) or a GAP (not attempted yet, below the publication bar). `null` used to mean both. `reason` exists only on `impossible`, and where the URL is Wayback-pointless it must equal `waybackPointlessReason(url)` |
```

- [ ] **Step 2: Write the failing schema tests**

In the schema test file, add:

```ts
test("SCHEMA: public_archive variants carry different key sets", () => {
  // The guarantee is structural: a consumer reading `url` when present is right by
  // construction, not by accident. "impossible with no reason" must not parse.
  assert.ok(PublicArchive.safeParse({ kind: "archived", url: "https://web.archive.org/x" }).success);
  assert.ok(PublicArchive.safeParse({ kind: "impossible", reason: "JS-shell" }).success);
  assert.ok(PublicArchive.safeParse({ kind: "not_yet" }).success);

  assert.ok(!PublicArchive.safeParse({ kind: "impossible" }).success, "impossible needs a reason");
  assert.ok(!PublicArchive.safeParse({ kind: "impossible", reason: "" }).success, "empty reason is no reason");
  assert.ok(!PublicArchive.safeParse({ kind: "archived" }).success, "archived needs a url");
  assert.ok(!PublicArchive.safeParse({ kind: "not_archived" }).success, "unknown kind");
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- --test-name-pattern="different key sets"`
Expected: FAIL — `PublicArchive` is not exported yet.

- [ ] **Step 4: Add the union to the schema**

In `src/schema/index.ts`, above `Source`:

```ts
/** A missing public archive is either a FINDING or a GAP, and the record must say which.
 *  `null` meant both: spec §4.1 called it "consciously not yet archived" (a gap) while
 *  loader.ts instructed authors to write it for pages Wayback cannot evidence (a finding) —
 *  not_published collapsed into unknown, in the field the archive discipline rests on.
 *  Variants carry DIFFERENT KEY SETS, so "impossible with no reason" and "archived with no
 *  url" do not compile and a consumer that reads `url` when present is right by
 *  construction. Spec §4.1, v0.14. */
export const PublicArchive = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("archived"), url: z.string().url() }),
  z.object({ kind: z.literal("impossible"), reason: z.string().min(1) }),
  z.object({ kind: z.literal("not_yet") }),
]);
```

Then replace `archived_url: z.string().url().nullable().optional(),` with `public_archive: PublicArchive,` in **both** `Source` (~line 85) and `Reference` (~line 122). Required — no `.optional()`.

- [ ] **Step 5: Write the migration script in the SDD workspace**

Write to `<workspace>/migrate.mjs` (NOT into the repo). It rewrites each record in place with `parseDocument`, which preserves comments:

```js
import fs from "node:fs"; import path from "node:path";
const YAML = await import("<repo>/yoga-trainingen-directory/node_modules/yaml/dist/index.js");
const POINTLESS = [/app\.yogaalliance\.org/i, /help\.yogaalliance\.org/i, /crkbo\.nl\/Register\//i];
const pointless = (u) => POINTLESS.some((re) => re.test(u));
const reasonFor = (u) =>
  /crkbo/i.test(u) ? "zoekregister zonder permalink: Wayback legt alleen pagina 1 vast, nooit de gezochte rij"
  : /help\.yogaalliance\.org/i.test(u) ? "JS-shell (Salesforce): Wayback bewaart alleen het omhulsel, geen letter van het artikel"
  : "JS-shell (Salesforce): Wayback bewaart header/footer zonder registergegevens";

// The 16 records no rule decides. Keyed "<file>::<id>" — see the plan for why each.
const EXPLICIT = new Map(Object.entries({
  "adhouna.yaml::overview-image-2026-06":        { kind: "impossible", reason: "door de gebruiker aangeleverde afbeelding: er is geen publieke bron-URL om te archiveren" },
  "pure-yoga.yaml::lesdata-image-2026-06":       { kind: "impossible", reason: "door de gebruiker aangeleverde afbeelding: er is geen publieke bron-URL om te archiveren" },
  "yoga-den.yaml::pathway-image-2026-06":        { kind: "impossible", reason: "door de gebruiker aangeleverde afbeelding: er is geen publieke bron-URL om te archiveren" },
  "tribes-academy.yaml::brochure-curriculum-2026-07": { kind: "impossible", reason: "niet vrij op de site gepubliceerd (achter een e-mailformulier): er is geen publieke pagina om te archiveren" },
}));

function classify(file, id, archivedUrl, url) {
  const explicit = EXPLICIT.get(`${file}::${id}`);
  if (explicit) return explicit;
  if (archivedUrl != null) return { kind: "archived", url: archivedUrl };
  if (url && pointless(url)) return { kind: "impossible", reason: reasonFor(url) };
  if (!url) throw new Error(`no url and not enumerated: ${file}::${id}`);
  return { kind: "not_yet" };
}

function rewrite(doc, node, file, id) {
  const idx = node.items.findIndex((p) => String(p.key) === "archived_url");
  const archivedUrl = idx >= 0 ? node.get("archived_url") : null;
  const value = classify(file, id, archivedUrl ?? null, node.get("url"));
  const pair = doc.createPair("public_archive", value);
  if (idx >= 0) {
    // Carry any comment that sat on the old key, or the migration eats it silently.
    pair.key.commentBefore = node.items[idx].key.commentBefore;
    pair.key.comment = node.items[idx].key.comment;
    node.items[idx] = pair;
  } else {
    const after = node.items.findIndex((p) => String(p.key) === "url");
    node.items.splice(after >= 0 ? after + 1 : node.items.length, 0, pair);
  }
}

const D = "<repo>/yoga-trainingen-directory/data";
let n = 0;
for (const dir of ["providers", "references"]) {
  for (const f of fs.readdirSync(path.join(D, dir)).filter((x) => x.endsWith(".yaml"))) {
    const p = path.join(D, dir, f);
    const doc = YAML.parseDocument(fs.readFileSync(p, "utf8"));
    if (dir === "providers") {
      const sources = doc.get("sources");
      for (const s of sources.items) { rewrite(doc, s, f, String(s.get("id"))); n++; }
    } else { rewrite(doc, doc.contents, f, String(doc.get("id"))); n++; }
    fs.writeFileSync(p, String(doc));
  }
}
console.log("records rewritten:", n);
```

The 12 `not_yet` records fall out of the rule (a live URL that is not Wayback-pointless) and are listed here so the reviewer can check the outcome rather than the code: `de-yogaschool-enschede::site-docenten-2026-07`, `dru-yoga::site-2026-06`, `dru-yoga::checkout-2026-06`, `pure-yoga::site-opbouw-2026-06`, `pure-yoga::site-leerdoelen-2026-06`, `sanayou::site-online-2026-06`, `spark-of-light::site-300-2026-06`, `yagoy::overview-yin-2026-06`, `yoga-moves::site-ashtanga-2026-06`, `yogaplace::site-2026-06`, `yogaschool-noord::site-voorwaarden-2026-06`, `yogic-life::site-ryt300-2026-06`.

- [ ] **Step 6: Run the migration and check the counts**

Run: `node <workspace>/migrate.mjs`
Expected: `records rewritten: 237`. If the script throws "no url and not enumerated", a record needs an explicit decision — stop and report it rather than inventing a rule.

- [ ] **Step 7: Verify the diff touches ONLY this field**

Run: `git diff -U0 -- yoga-trainingen-directory/data/ | grep '^[+-]' | grep -v '^[+-][+-]' | grep -vE 'archived_url|public_archive|kind:|url:|reason:' | head -40`

Expected: **no output**. Any line here is something the rewriter changed that it should not have — a dropped comment, a re-quoted string, a reflowed block. If there is output, stop and report it; do not "clean it up".

Also run `git diff --stat -- yoga-trainingen-directory/data/` and confirm 53 files changed.

- [ ] **Step 8: Validate**

Run: `npm run validate`, then `npm test`, `npm run test:ci`, `npx tsc --noEmit`

Expected: validate parses all 48 providers + 5 references with no schema errors. Tests will FAIL in `loader`/`derive`/`presenters` — those are Tasks 2-4 and are expected here; `npx tsc --noEmit` will also report the consumer sites. Record which fail; the schema test from Step 2 must PASS.

- [ ] **Step 9: Commit**

```bash
git add data-model-spec.md yoga-trainingen-directory/src/schema/ yoga-trainingen-directory/data/
git commit -F - <<'MSG'
Spec v0.14 + schema: public_archive is a finding or a gap, never both (#8)

archived_url had three states for two meanings, and null carried two
OPPOSITE editorial ones: a gap (consciously not yet archived) and a
finding (no public archive can evidence this page — which loader.ts
itself instructs authors to record as null).

Replaced by a required discriminated union whose variants carry
different key sets, so "impossible with no reason" does not compile.
237 records migrated in place with parseDocument, which preserves
comments; the diff touches only this field's lines.

Consumers still read the old field and are fixed in the following
commits.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 2: The loader cross-check gets something to check against

**Files:**
- Modify: `yoga-trainingen-directory/src/lib/loader.ts:106-113` (provider sources), `:384-392` (references)
- Test: `yoga-trainingen-directory/src/lib/loader.test.ts`

**Interfaces:**
- Consumes: `public_archive` with `.kind` (Task 1).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the failing tests**

```ts
test("LOADER: an impossible whose stored reason drifts from the deriver is an error", () => {
  // 107 records carry a reason generated by waybackPointlessReason(). Stored, so a
  // non-derivable case (a gated PDF, a robots.txt block) stays expressible — cross-checked,
  // so the 107 cannot quietly drift away from the function that produced them.
  const p = providerWithSource({
    url: "https://app.yogaalliance.org/SchoolProfile?id=1",
    public_archive: { kind: "impossible", reason: "een andere reden dan de functie geeft" },
  });
  const errs = integrityErrors(p, "x.yaml");
  assert.equal(errs.filter((e) => /reden/i.test(e)).length, 1);
});

test("LOADER: an impossible with NO url accepts any reason", () => {
  // The gated brochure and the author-supplied images have no URL at all — nothing to
  // derive a reason from, and the reason is exactly what makes them publishable.
  const p = providerWithSource({
    url: undefined,
    public_archive: { kind: "impossible", reason: "niet vrij op de site gepubliceerd" },
  });
  assert.deepEqual(integrityErrors(p, "x.yaml").filter((e) => /reden/i.test(e)), []);
});

test("LOADER: an ARCHIVED Wayback url on a Wayback-pointless page is still an error", () => {
  // The pre-existing rule, restated against `kind`: the site must never render "publiek ✓"
  // over an archive that shows none of what we cite.
  const p = providerWithSource({
    url: "https://app.yogaalliance.org/SchoolProfile?id=1",
    public_archive: { kind: "archived", url: "https://web.archive.org/web/2026/x" },
  });
  assert.equal(integrityErrors(p, "x.yaml").filter((e) => /Wayback/i.test(e)).length, 1);
});
```

`loader.test.ts` has no constructed-provider helper — it uses `providerOf(id)` / `programOf(providerId, programId)` against the loaded corpus, and `refFixture(...)` (around line 46) for references. Build each case above by **spreading a real record** and replacing only `public_archive` on one source, the same way `price-gap.fixture.ts` does; do not hand-write a whole `Provider` literal, which would drift from the schema the moment a required field is added.

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- --test-name-pattern="drifts from the deriver|NO url accepts any reason|still an error"`
Expected: FAIL — the loader still reads `s.archived_url`.

- [ ] **Step 3: Rewrite the provider cross-check**

Replace the `if (s.url && s.archived_url && …)` block at `loader.ts:106-113` with:

```ts
    // A WAYBACK URL ON A PAGE WAYBACK CANNOT EVIDENCE. Twelve records, captured before this
    // rule existed, carried one anyway — and the site rendered "publiek ✓" over an archive
    // showing none of what we cite; one (namaste-studios' YA profile) had been 404 for weeks.
    if (s.url && s.public_archive.kind === "archived" && waybackIsPointless(s.url) &&
        /web\.archive\.org/i.test(s.public_archive.url)) {
      errors.push(
        `${file}: source '${s.id}' claims a Wayback archive of ${s.url} — but Wayback cannot evidence it ` +
          `(${waybackPointlessReason(s.url)}). The local capture is the evidence; use ` +
          `public_archive: {kind: impossible} so the record says "publiek n.v.t. (niet vast te leggen)", ` +
          `which is true, instead of "publiek ✓", which is not.`,
      );
    }

    // THE REASON IS STORED, SO IT MUST NOT DRIFT FROM THE FUNCTION THAT GENERATED IT.
    // Only where the URL is Wayback-pointless: with no URL (a gated PDF, an author-supplied
    // image) or an ordinary one (robots.txt, a paywall) there is nothing to derive from, and
    // the stored sentence is the whole finding.
    if (s.url && s.public_archive.kind === "impossible" && waybackIsPointless(s.url) &&
        s.public_archive.reason !== waybackPointlessReason(s.url)) {
      errors.push(
        `${file}: source '${s.id}' geeft een andere reden dan waybackPointlessReason(${s.url}) — ` +
          `verwacht "${waybackPointlessReason(s.url)}". Pas de reden aan, of de functie als die verouderd is.`,
      );
    }
```

- [ ] **Step 4: Rewrite the reference cross-check**

Replace the `if (ref.url && ref.archived_url && …)` block at `loader.ts:384-392` with the same two checks, keyed on `ref.public_archive` and prefixed `references/${file}: `.

- [ ] **Step 5: Run the tests**

Run: `npm test -- --test-name-pattern="LOADER"` then `npm run validate`

Expected: the three new tests pass, and `npm run validate` is clean on the real corpus — which is the assertion that the 107 migrated reasons match the function exactly.

- [ ] **Step 6: Commit**

```bash
git add yoga-trainingen-directory/src/lib/loader.ts yoga-trainingen-directory/src/lib/loader.test.ts
git commit -F - <<'MSG'
Loader: bind the stored reason to the function that derives it (#8)

The Wayback-URL rule now keys on kind === "archived" rather than on
truthiness, and a second check binds an impossible's stored reason to
waybackPointlessReason() wherever the URL is Wayback-pointless — so the
107 migrated reasons cannot drift from the function, while a gated PDF
or a robots.txt block stays expressible because neither has anything to
derive from.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 3: The surfaces stop counting an impossible archive as a shortfall

**Files:**
- Modify: `yoga-trainingen-directory/src/lib/derive.ts:733`
- Modify: `yoga-trainingen-directory/src/lib/presenters.ts:1385-1391`, `:1475`
- Modify: `yoga-trainingen-directory/app/qa/page.dev.tsx:208-214`
- Create: `yoga-trainingen-directory/src/lib/public-archive.fixture.ts`
- Test: `yoga-trainingen-directory/src/lib/derive.test.ts`, `src/lib/presenters.test.ts`

**A constructed fixture, not a corpus sweep.** The 12 `not_yet` records are a defect the project intends to pay off by archiving those pages. A test that finds its case by sweeping the corpus would therefore be retired the day the data is fixed — and the build would go red *for having fixed it*. That already happened once here, which is why `src/lib/price-gap.fixture.ts` exists; read its header before writing this one. Follow its idiom exactly: **build the case by spreading a real, schema-valid record with one field changed**, so the fixture cannot drift from the schema.

**Interfaces:**
- Consumes: `public_archive.kind` (Task 1).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the failing tests**

First the fixture, `src/lib/public-archive.fixture.ts`. Open `src/lib/price-gap.fixture.ts` and mirror its structure and the register of its header comment — it explains *why* the case is constructed, which is the part that matters:

```ts
/**
 * THE SYNTHETIC CASE: one provider holding all three public-archive states at once.
 *
 * WHY THIS IS A FIXTURE, AND NOT A SWEEP OF data/
 *
 * Twelve sources are `not_yet` today — ordinary pages nobody has submitted to Wayback
 * yet. That is a gap the project intends to pay off, and when it does, a test that found
 * its case by sweeping the corpus would have nothing left to exercise: the build would go
 * red for having FIXED the data. That happened once already (see price-gap.fixture.ts).
 *
 * The rule being pinned is not "the corpus contains a gap". It is that a GAP and a
 * FINDING must never render identically — `not_yet` says we have not looked, `impossible`
 * says we looked and no public archive can evidence this page. Those are opposite claims
 * about our own diligence, and the quad rule (src/lib/quad.test.ts) exists because
 * collapsing them is this project's central failure mode.
 *
 * Built by SPREADING A REAL RECORD so it cannot drift from the schema.
 */
export function threeStateProvider(providers: readonly Provider[]): { provider: Provider } {
  const base = providers.find((p) => p.sources.length >= 3)!;
  const [a, b, c] = base.sources;
  return {
    provider: {
      ...base,
      sources: [
        { ...a, public_archive: { kind: "archived" as const, url: "https://web.archive.org/web/2026/x" } },
        { ...b, public_archive: { kind: "impossible" as const, reason: "JS-shell (Salesforce)" } },
        { ...c, public_archive: { kind: "not_yet" as const } },
      ],
    },
  };
}
```

Then the tests. `derive.test.ts` and `presenters.test.ts` both already import the loaded corpus and use `providerOf(id)` / `programOf(providerId, programId)` helpers — follow that, and import the fixture the way `presenters.test.ts:20` imports `priceGapProvider`:

```ts
test("QA: unarchivedSources counts a GAP, never a FINDING", () => {
  // The correction that matters: /qa paints a red ✗ for any provider with an unarchived
  // source, and 46 of 48 were red for archives that cannot exist.
  const { provider } = threeStateProvider(providers);
  assert.equal(providerQa(provider).unarchivedSources, 1, "only the not_yet is a gap");
});

test("PRESENT: a gap and a finding do not render identically", () => {
  // If these two ever produce the same string, the project is telling a reader it looked
  // when it did not, or that a page cannot be archived when nobody tried.
  const { provider } = threeStateProvider(providers);
  const view = toProviderView(provider);
  const [, finding, gap] = view.sources;
  assert.notEqual(finding.archive, gap.archive, "a gap and a finding must never read the same");
});
```

`archiveSlots` is module-local in `presenters.ts`; the test above goes through `toProviderView` instead, so nothing needs exporting. Confirm the field name on the source view (`archive` above is illustrative — read `ProviderView`'s source type and use the real one).

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- --test-name-pattern="counts a GAP|do not render identically"`
Expected: FAIL.

- [ ] **Step 3: Fix `unarchivedSources`**

`derive.ts:733`, replace:

```ts
  const unarchivedSources = p.sources.filter((s) => s.archived_url == null).length;
```

with:

```ts
  // A GAP, never a FINDING. This counted every absent archive, including the ones that can
  // never exist — so /qa showed a red ✗ on 46 of 48 providers, for Salesforce-rendered
  // registers Wayback genuinely cannot capture. A signal that is red for everything is not
  // a signal; what remains is a work list.
  const unarchivedSources = p.sources.filter((s) => s.public_archive.kind === "not_yet").length;
```

- [ ] **Step 4: Fix the presenter**

`presenters.ts:1385-1391`, replace the body of `archiveSlots` with:

```ts
function archiveSlots(s: Source): string | null {
  if (s.public_archive.kind === "not_yet" && s.local_snapshot == null) return null;
  const mark = (present: boolean) => (present ? nl.archivePresent : nl.archiveAbsent);
  // Reads the record's OWN finding rather than re-deriving it from the URL. The judgement
  // is the record's; this only renders it — and `impossible` now covers cases no predicate
  // could reach, like a gated PDF with no URL at all.
  const publicHalf =
    s.public_archive.kind === "impossible"
      ? `${nl.archivePublic} ${nl.archiveNotApplicable}`
      : `${nl.archivePublic} ${mark(s.public_archive.kind === "archived")}`;
  return [publicHalf, `${nl.archiveLocal} ${mark(s.local_snapshot != null)}`].join(" · ");
}
```

Then `presenters.ts:1475`:

```ts
    sourcesArchivedPublic: p.sources.filter((s) => s.public_archive.kind === "archived").length,
```

- [ ] **Step 5: Fix the QA page**

`app/qa/page.dev.tsx:208-214`, replace with:

```tsx
                        {s.public_archive.kind === "archived" ? (
                          <Lnk href={s.public_archive.url} label="archief" />
                        ) : s.public_archive.kind === "impossible" ? (
                          <span style={{ color: "#999" }} title={s.public_archive.reason}>
                            n.v.t.
                          </span>
                        ) : (
                          <span style={{ color: "#b00" }}>niet gearchiveerd</span>
                        )}
```

The old code branched on `s.url` to choose between red and grey — the truthiness path CLAUDE.md names as the wrong one. The record now says which it is.

- [ ] **Step 6: Run the tests and check the real numbers**

Run: `npm test`, `npm run test:ci`, `npx tsc --noEmit`, `npm run validate`

Then confirm the correction landed where the design predicted:

```bash
npx tsx -e 'import {loadDataset} from "./src/lib/loader"; import {providerQa} from "./src/lib/derive";
const d = loadDataset();
const red = d.providers.filter(p => providerQa(p).unarchivedSources > 0).length;
const arch = d.providers.flatMap(p=>p.sources).filter(s=>s.public_archive.kind==="archived").length;
const imp = d.providers.flatMap(p=>p.sources).filter(s=>s.public_archive.kind==="impossible").length;
const tot = d.providers.flatMap(p=>p.sources).length;
console.log({redProviders: red, archived: arch, impossible: imp, total: tot});'
```

Expected: `redProviders: 10` (was 46), and `archived + impossible` = 220 of 232. If `redProviders` is not 10, the migration classified something differently than the design measured — report the discrepancy rather than adjusting the expectation.

- [ ] **Step 7: Commit**

```bash
git add yoga-trainingen-directory/src/lib/derive.ts yoga-trainingen-directory/src/lib/presenters.ts yoga-trainingen-directory/app/qa/page.dev.tsx yoga-trainingen-directory/src/lib/derive.test.ts yoga-trainingen-directory/src/lib/presenters.test.ts
git commit -F - <<'MSG'
Surfaces: an archive that cannot exist is not a shortfall (#8)

unarchivedSources counted every absent archive, so /qa showed a red ✗
on 46 of 48 providers — for Salesforce-rendered registers Wayback
genuinely cannot capture. It now counts not_yet only: 10 providers, a
work list instead of noise.

The record page's presenter reads the record's own finding instead of
re-deriving it from the URL, which also covers cases no predicate could
reach — a gated PDF has no URL to test. And /qa's `s.archived_url ? …`
truthiness branch reads kind.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 4: The archiver must not overwrite a finding

**Files:**
- Modify: `yoga-trainingen-directory/scripts/archive.ts:393-407`
- Test: `yoga-trainingen-directory/src/lib/archive.test.ts`

**Interfaces:**
- Consumes: `public_archive.kind` (Task 1), the `captureNode` seam and `deps.submitWayback` already present in the test file.
- Produces: nothing.

- [ ] **Step 1: Write the failing tests**

```ts
test("CAPTURE: an `impossible` is never submitted and never overwritten", () => {
  // The record's finding outranks the archiver's optimism. A re-run that turned a published
  // "no public archive can evidence this" into a Wayback URL would silently replace a
  // finding with an archive that shows none of what we cite.
  const node = nodeFrom("id: s\nurl: https://example.com/x\npublic_archive:\n  kind: impossible\n  reason: JS-shell\n");
  return captureNode(node, "demo", deps({ capture: fakeCapture(), skipWayback: false,
    submitWayback: async () => { throw new Error("must never submit for an impossible"); } }))
    .then((r) => {
      assert.equal(String(node.getIn(["public_archive", "kind"])), "impossible");
      assert.equal(r.failedCapture, null);
    });
});

test("CAPTURE: a `not_yet` IS submitted, and becomes archived", () => {
  const node = nodeFrom("id: s\nurl: https://example.com/x\npublic_archive:\n  kind: not_yet\n");
  return captureNode(node, "demo", deps({ capture: fakeCapture(), skipWayback: false,
    submitWayback: async () => "https://web.archive.org/web/2026/x" }))
    .then(() => {
      assert.equal(String(node.getIn(["public_archive", "kind"])), "archived");
      assert.equal(String(node.getIn(["public_archive", "url"])), "https://web.archive.org/web/2026/x");
    });
});
```

Match the file's existing helpers (`nodeFrom`, `deps`, `fakeCapture`) — they are already there from earlier work.

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- --test-name-pattern="never submitted and never overwritten|IS submitted, and becomes archived"`
Expected: FAIL.

- [ ] **Step 3: Rewrite the submission decision**

`archive.ts:393`, replace:

```ts
  const archived = node.get("archived_url") as string | null | undefined;
  const needsWayback = archived == null || deps.force;
```

with:

```ts
  // A FINDING OUTRANKS THE ARCHIVER. `impossible` is a published claim that no public
  // archive can evidence this page; a re-run that replaced it with a Wayback URL would
  // overwrite a finding with an archive showing none of what we cite — and --force must not
  // override it either, because --force means "capture again", not "revise the finding".
  const kind = String(node.getIn(["public_archive", "kind"]) ?? "not_yet");
  const needsWayback = kind === "impossible" ? false : kind === "not_yet" || deps.force;
```

and at `:404` replace `node.set("archived_url", snapshot);` with:

```ts
      node.set("public_archive", { kind: "archived", url: snapshot });
```

- [ ] **Step 4: Run the tests**

Run: `npm test`, `npm run test:ci`, `npx tsc --noEmit`

Expected: all green, 322 + the tests added across Tasks 1-4.

- [ ] **Step 5: Run the full build and the smoke check**

Run: `npm run validate`, then `npm run provenance`, then `npm run build`

Expected: validate clean, provenance ✓ 165/165, build exit 0. Confirm `git status` shows nothing under `data/archives/`.

- [ ] **Step 6: Commit**

```bash
git add yoga-trainingen-directory/scripts/archive.ts yoga-trainingen-directory/src/lib/archive.test.ts
git commit -F - <<'MSG'
Archiver: a published finding outranks a re-run (#8)

Submission was decided by `archived_url == null`, which after the split
would have submitted for `impossible` too — replacing a published "no
public archive can evidence this page" with a Wayback URL that shows
none of what we cite. It now submits only for not_yet, and --force does
not override it: --force means "capture again", not "revise the
finding".

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Verification checklist

After Task 4:

- `npm run validate` clean · `npm test` / `npm run test:ci` green · `npx tsc --noEmit` exit 0
- `npm run provenance` ✓ 165/165 · `npm run build` exit 0
- `redProviders` on the real corpus is **10** (was 46); `archived + impossible` is **220 of 232**
- `git diff main -- yoga-trainingen-directory/data/` touches only `archived_url`/`public_archive` lines
- No file under `data/archives/` moved, re-hashed or re-captured; `npm run archive` never run
- No occurrence of `archived_url` remains in `src/`, `scripts/`, `app/` or `data/` (grep to confirm)
