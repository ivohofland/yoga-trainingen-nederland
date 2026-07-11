# Public-Facing Listing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder `app/page.tsx` with the public site — a filterable, sortable listing of all 77 programmes, a provider record page per provider, and the methodology page.

**Architecture:** `loadDataset()` (existing, unchanged) validates YAML → a new pure `presenters.ts` maps `Provider[]` to a serialisable view-model → Server Components render it. One client component (`ProgrammeTable`) does in-memory filter/sort over ~77 rows. The provider record and methodology pages ship zero client JS. Everything is SSG.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, CSS Modules + CSS custom properties, `next/font/google` (self-hosting), `node:test` via `tsx --test`, `marked` (new dependency, methodology page only).

**Spec:** `docs/superpowers/specs/2026-07-11-public-listing-design.md`. Read it first. This plan implements it exactly.

## Global Constraints

- **All commands run from `yoga-trainingen-directory/`.** Every path in this plan is relative to that directory unless it starts with `docs/`.
- **No change to `data-model-spec.md` and no change to `src/schema/index.ts`.** The design does not get to invent the data model. If something seems to need a new field, it is out of scope — stop and ask.
- **No change to `src/lib/dataset.ts`.** It already validates, integrity-checks, and computes the derived values. Presenters consume it; they never duplicate it.
- **Derived values are computed, never stored** (spec §6). No computed field ever goes into a YAML file.
- **NL-only.** Every user-facing string lives in `src/lib/strings.ts`. No user-facing string is inlined in a component, ever.
- **The quad rule (spec §4) is the single most important invariant in this codebase.** `not_published` ("we looked; they don't say" — a *finding*) and `unknown` ("we haven't looked" — a *gap*) must never render identically. `src/components/Quad.tsx` is the **only** place a quad value becomes pixels. No other component may colour a quad.
- **Colour encodes how well we know something. It never encodes whether the answer is good.** `coherence_signals.modules_sold_separately: yes` is not "good"; `accreditation.verified: no` is a *fact* and renders as one.
- **An absent optional object renders as a gap.** `program.coherence_signals === undefined` is treated exactly as `unknown` — not investigated is not investigated. Same for `transparency`, `contract`, `track_record`, `group_size_claimed`, `assessment_described`.
- **Counts are derived at build, never hard-coded.** The dataset is 48 providers / 77 programmes / 7 computable price-per-contact-hour today, and it changes every time a record lands. Any number in the copy comes from `datasetStats()`.
- **`announced` is not `confirmed_ran`** (spec §8). A cohort's `status` renders explicitly. An announced cohort is labelled *aangekondigd*.
- **Claims are verbatim** (spec §3). Never truncate, ellipsise, re-case, or "clean up" a `claim.quote`. It renders exactly as stored, in the source language.
- **Commit after every task.** Message style: sentence-case subject, no `feat:`/`fix:` prefixes (match existing history).

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/lib/quad.ts` | Quad state → semantic class + NL label. The §4 invariant, as two pure functions. |
| `src/lib/quad.test.ts` | Locks the §4 invariant. |
| `src/lib/strings.ts` | Every NL user-facing string, one object. |
| `src/lib/presenters.ts` | Pure `Provider[]` → `ListingRow[]` / `ProviderView`. All display strings. |
| `src/lib/presenters.test.ts` | Locks the editorial invariants in the presenters. |
| `src/lib/filters.ts` | Pure filter + sort over `ListingRow[]`. |
| `src/lib/filters.test.ts` | Locks filter coverage and sort ordering. |
| `src/components/Quad.tsx` + `.module.css` | The only quad → pixels mapping. |
| `src/components/ProgrammeTable.tsx` + `.module.css` | `"use client"` — the only client component. Filters, sort, rows. |
| `src/components/record/*.tsx` + `.module.css` | Server components for the record page sections. |
| `app/globals.css` | Design tokens as CSS custom properties. |
| `app/aanbieder/[id]/page.tsx` | Provider record, SSG via `generateStaticParams()`. |
| `app/methodologie/page.tsx` | Renders `content/methodologie.md`. |

**Modified:** `package.json` (test script + build gate, `marked`), `app/layout.tsx` (fonts, masthead, footer), `app/page.tsx` (the listing), `CLAUDE.md` (the "no test runner" line is no longer true).

---

## Task 1: Test runner as a build gate

Establishes `npm test` and wires it into `npm run build`, so the build refuses to ship on a broken editorial invariant exactly as it already refuses to ship on invalid data.

**Files:**
- Modify: `package.json`
- Modify: `CLAUDE.md` (repo root — `/Users/ivohofland/Projects/yoga-trainingen/CLAUDE.md`)
- Test: `src/lib/dataset.test.ts` (create)

**Interfaces:**
- Consumes: `loadDataset()` from `src/lib/dataset.ts` (existing).
- Produces: `npm test` runs every `*.test.ts` under `src/`. All later tasks add tests here.

- [ ] **Step 1: Write the failing test**

Create `src/lib/dataset.test.ts`. This is a real regression guard, not a smoke test: the whole project rests on the dataset being valid, and the build must fail if it is not.

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDataset } from "./dataset";

test("the committed dataset is valid — zero schema or integrity errors", () => {
  const { providers, errors } = loadDataset();
  assert.deepEqual(errors, [], `dataset invalid:\n${errors.join("\n")}`);
  assert.ok(providers.length > 0, "expected at least one provider");
});

test("every provider id matches its filename slug", () => {
  const { providers } = loadDataset();
  for (const p of providers) {
    assert.match(p.id, /^[a-z0-9][a-z0-9-]*$/, `provider id '${p.id}' is not a kebab-case slug`);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`

Expected: FAIL — `npm error Missing script: "test"`. The script does not exist yet.

- [ ] **Step 3: Add the test script and the build gate**

In `package.json`, replace the `"scripts"` block with:

```json
  "scripts": {
    "dev": "next dev",
    "build": "npm run gen-schema && npm run validate && npm test && npm run export-json && next build",
    "start": "next start",
    "test": "tsx --test src/**/*.test.ts",
    "validate": "tsx scripts/validate.ts",
    "gen-schema": "tsx scripts/gen-schema.ts",
    "export-json": "tsx scripts/export-json.ts",
    "archive": "tsx scripts/archive.ts"
  },
```

Note `npm test` sits **after** `validate` and **before** `export-json`: validate proves the data parses, the tests prove the editorial rules hold, and only then do we export and build.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npm test`

Expected: PASS — `# pass 2`, `# fail 0`.

If the glob does not expand (zsh may not pass `src/**/*.test.ts` through), the script still works because npm runs scripts under `sh`. If you see "Could not find" errors, verify with: `npx tsx --test src/lib/dataset.test.ts`

- [ ] **Step 5: Update CLAUDE.md**

In `/Users/ivohofland/Projects/yoga-trainingen/CLAUDE.md`, find this text under `## Commands`:

```
There is no test runner, linter, or single-test command — `npm run validate`
is the gate that everything passes through.
```

Replace it with:

```
`npm test` runs the unit tests (`node:test` via `tsx --test`, no extra
dependency). There is no linter. Both `validate` and `test` are build gates —
`npm run build` runs them in order and refuses to build if either fails.

The tests exist to lock the *editorial* invariants, not to chase coverage. The
one that matters most is in `src/lib/quad.test.ts`: `not_published` (a finding)
and `unknown` (a gap) must never render identically. `src/components/Quad.tsx`
is the only place a quad value becomes pixels — keep it that way.
```

Also add `npm test` to the command block above it:

```bash
npm test                  # unit tests (node:test); locks the quad/editorial invariants
```

- [ ] **Step 6: Verify the build gate actually gates**

Temporarily break a test to prove the wiring works. In `src/lib/dataset.test.ts`, change `assert.ok(providers.length > 0, ...)` to `assert.ok(providers.length > 9999, ...)`.

Run: `npm run build`

Expected: FAIL at the test step, **before** `export-json` or `next build` run.

Now revert that change (back to `> 0`) and re-run `npm test` — expected PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json src/lib/dataset.test.ts ../CLAUDE.md
git commit -m "Add node:test as a build gate

npm run build now runs the tests after validate and before export-json,
so the build refuses to ship on a broken invariant the same way it
already refuses to ship on invalid data. No new dependency: tsx and
node:test are both already present."
```

---

## Task 2: The quad — the editorial invariant, encoded

The heart of the project. Two pure functions and one component; nothing else in the codebase may colour a quad.

**Files:**
- Create: `src/lib/quad.ts`, `src/lib/quad.test.ts`
- Create: `src/components/Quad.tsx`, `src/components/Quad.module.css`
- Create: `app/globals.css`

**Interfaces:**
- Consumes: `Quad` type from `src/schema/index.ts` (`"yes" | "no" | "not_published" | "unknown"`).
- Produces:
  - `type QuadClass = "fact" | "finding" | "gap"`
  - `quadClass(v: Quad | undefined | null): QuadClass`
  - `quadLabel(v: Quad | undefined | null): string`
  - `<Quad state={...}>{children?}</Quad>` — React component.
  - CSS custom properties in `app/globals.css`, consumed by every later `.module.css`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/quad.test.ts`. These assertions ARE the spec — read spec §4 before writing them.

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { quadClass, quadLabel, type QuadClass } from "./quad";
import type { Quad } from "../schema";

const ALL: Quad[] = ["yes", "no", "not_published", "unknown"];

test("THE RULE: not_published and unknown never render identically", () => {
  // spec §4 / CLAUDE.md. `not_published` is a finding about the provider;
  // `unknown` is a gap in our research. Collapsing them publishes our own
  // gaps as findings about named businesses. This test must never be deleted.
  assert.notEqual(quadClass("not_published"), quadClass("unknown"));
  assert.notEqual(quadLabel("not_published"), quadLabel("unknown"));
});

test("yes and no are both facts — we established them", () => {
  // `accreditation.verified: "no"` means "claimed, and NOT found in the
  // register". That is a severe statement, but it is a *fact*, and the words
  // carry the severity, not the colour.
  assert.equal(quadClass("yes"), "fact");
  assert.equal(quadClass("no"), "fact");
});

test("not_published is a finding; unknown is a gap", () => {
  assert.equal(quadClass("not_published"), "finding");
  assert.equal(quadClass("unknown"), "gap");
});

test("an absent optional object is a gap, not a finding", () => {
  // program.coherence_signals is optional and undefined on 52 of 77
  // programmes. Not investigated is not investigated — it must never render
  // as "the provider does not publish this".
  assert.equal(quadClass(undefined), "gap");
  assert.equal(quadClass(null), "gap");
  assert.equal(quadLabel(undefined), quadLabel("unknown"));
});

test("the mapping is total — every schema quad value has a class", () => {
  const valid: QuadClass[] = ["fact", "finding", "gap"];
  for (const v of ALL) {
    assert.ok(valid.includes(quadClass(v)), `${v} produced an invalid class`);
  }
});

test("labels are Dutch and non-empty", () => {
  assert.equal(quadLabel("yes"), "ja");
  assert.equal(quadLabel("no"), "nee");
  assert.equal(quadLabel("not_published"), "niet gepubliceerd");
  assert.equal(quadLabel("unknown"), "nog niet onderzocht");
});

test("a gap never uses wording that reads as a finding about a provider", () => {
  // "niet gepubliceerd" accuses the provider of an omission. A gap is OUR
  // omission and must not borrow that wording.
  assert.doesNotMatch(quadLabel("unknown"), /gepubliceerd/);
  assert.doesNotMatch(quadLabel(undefined), /gepubliceerd/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --test src/lib/quad.test.ts`

Expected: FAIL — `Cannot find module './quad'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/quad.ts`:

```ts
/**
 * Quad state → semantic class + NL label.
 *
 * THE rule of this project (spec §4, CLAUDE.md): `not_published` and `unknown`
 * must never render identically.
 *
 *   not_published — we looked; the provider does not state it. A FINDING.
 *   unknown       — we have not looked yet. A GAP in our own research.
 *
 * The class encodes HOW WELL WE KNOW something. It never encodes whether the
 * answer is good: `coherence_signals.modules_sold_separately: "yes"` is not
 * praise, and `accreditation.verified: "no"` is a fact, not an accusation.
 *
 * An absent optional object (undefined/null) is a gap, not a finding — an
 * un-investigated field is not an omission by the provider.
 */
import type { Quad } from "../schema";

export type QuadClass = "fact" | "finding" | "gap";

export function quadClass(v: Quad | undefined | null): QuadClass {
  switch (v) {
    case "yes":
    case "no":
      return "fact";
    case "not_published":
      return "finding";
    default:
      // "unknown", undefined, null
      return "gap";
  }
}

const LABEL: Record<Quad, string> = {
  yes: "ja",
  no: "nee",
  not_published: "niet gepubliceerd",
  unknown: "nog niet onderzocht",
};

export function quadLabel(v: Quad | undefined | null): string {
  return LABEL[v ?? "unknown"];
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx tsx --test src/lib/quad.test.ts`

Expected: PASS — `# pass 7`, `# fail 0`.

- [ ] **Step 5: Write the design tokens**

Create `app/globals.css`. Values are taken from the imported design; the semantic block is spec §4.

```css
/*
 * Design tokens. Values from the imported Claude Design prototype.
 *
 * NOTE: --muted and --gap hold the same value and are SEPARATE ON PURPOSE.
 * --muted is chrome (overlines, column headers, secondary text).
 * --gap is a quad state (spec §4). They mean different things and may
 * diverge. Do not "clean up the duplicate".
 */
:root {
  /* surface + structure */
  --paper: #fbfbf9;
  --ink-2: #33332f;
  --muted: #6e6e68;
  --rule: #e3e2dd;
  --rule-2: #c9c8c2;
  --rule-dot: #d8d7d1;
  --hover: #f3f2ee;

  /* semantic — quad state (spec §4).
     The colour encodes how well we know something,
     NEVER whether the answer is good. */
  --ink: #161616;     /* fact — yes | no, established           */
  --finding: #8a5a00; /* not_published — they don't say it      */
  --gap: #6e6e68;     /* unknown — we haven't looked (+ italic) */

  --error: #b00020;

  --serif: var(--font-newsreader), Georgia, serif;
  --mono: var(--font-plex-mono), ui-monospace, monospace;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--serif);
}

a {
  color: var(--ink);
  text-decoration: underline;
  text-underline-offset: 2px;
  text-decoration-thickness: 1px;
}

a:hover {
  color: var(--muted);
}

::selection {
  background: var(--ink);
  color: var(--paper);
}
```

- [ ] **Step 6: Write the Quad component**

Create `src/components/Quad.module.css`:

```css
/* The ONLY place a quad value becomes pixels. See spec §4. */
.fact {
  color: var(--ink);
}

.finding {
  color: var(--finding);
}

/* Deliberately recessive: a gap is an absence in OUR work and must never
   compete with facts for attention, let alone read as an accusation. */
.gap {
  color: var(--gap);
  font-style: italic;
}
```

Create `src/components/Quad.tsx`:

```tsx
/**
 * The only quad → pixels mapping in the codebase (spec §4). Nothing else may
 * colour a quad value. If you find yourself reaching for --finding or --gap in
 * another stylesheet, you are about to break the invariant — use this instead.
 */
import type { ReactNode } from "react";
import type { Quad as QuadState } from "@/schema";
import { quadClass, quadLabel } from "@/lib/quad";
import styles from "./Quad.module.css";

interface Props {
  state: QuadState | undefined | null;
  /** The established value, rendered when `state` is a fact (yes/no). */
  children?: ReactNode;
}

export function Quad({ state, children }: Props) {
  const cls = quadClass(state);
  const showValue = cls === "fact" && children != null;
  return (
    <span className={styles[cls]}>{showValue ? children : quadLabel(state)}</span>
  );
}
```

- [ ] **Step 7: Run the full suite and commit**

Run: `npm test`

Expected: PASS — `# pass 9`, `# fail 0`.

```bash
git add src/lib/quad.ts src/lib/quad.test.ts src/components/Quad.tsx src/components/Quad.module.css app/globals.css
git commit -m "Encode the quad rule as the one place a quad becomes pixels

not_published (a finding about the provider) and unknown (a gap in our
research) can no longer render identically — the test asserts it, and
Quad.tsx is the single mapping point. An absent optional object is a
gap, not a finding.

The colour encodes how well we know something, never whether the answer
is good, which is what makes coherence_signals safe to render later."
```

---

## Task 3: Strings and the listing presenter

**Files:**
- Create: `src/lib/strings.ts`, `src/lib/presenters.ts`, `src/lib/presenters.test.ts`

**Interfaces:**
- Consumes: `loadDataset()`, `pricePerContactHour()` from `src/lib/dataset.ts`; `Provider`, `Program`, `Cohort`, `Quad` from `src/schema`; `quadLabel` from `src/lib/quad.ts`.
- Produces (later tasks depend on these **exact** names and types):

```ts
export interface NextCohort { start: string; status: Cohort["status"]; label: string }
export interface RegisterChip { body: string; label: string; verified: Quad }
export interface ListingRow {
  providerId: string; providerName: string; providerCityDisplay: string; cities: string[];
  programId: string; programName: string; href: string;
  styleClaimed: string | null;
  formatLabel: Program["format_label"]; formatDisplay: string;
  mode: Program["delivery"]["mode"]; language: "nl" | "en" | "mixed" | null;
  deliveryDisplay: string;
  priceAmount: number | null; pricePublished: Quad; priceDisplay: string | null;
  pph: number | null; pphCaveat: string | null;
  registers: RegisterChip[]; crkboRegistered: Quad; yaVerified: Quad;
  nextCohort: NextCohort | null;
  lastVerified: string; hasDisclosure: boolean;
}
export interface DatasetStats { providers: number; programs: number; pphComputable: number; lastVerified: string | null }
export function toListingRows(providers: Provider[], now?: Date): ListingRow[]
export function datasetStats(providers: Provider[]): DatasetStats
export function topCities(rows: ListingRow[], n?: number): string[]
```

- [ ] **Step 1: Write the failing test**

Create `src/lib/presenters.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDataset } from "./dataset";
import { toListingRows, datasetStats, topCities } from "./presenters";

const { providers } = loadDataset();
const NOW = new Date("2026-07-01T00:00:00Z"); // fixed — never let a test depend on the wall clock

test("every programme in the dataset becomes exactly one row", () => {
  const rows = toListingRows(providers, NOW);
  const programCount = providers.reduce((n, p) => n + p.programs.length, 0);
  assert.equal(rows.length, programCount);
});

test("an announced cohort is never labelled as one that ran", () => {
  // spec §8: recording an announcement as if it happened is the central trap.
  const rows = toListingRows(providers, NOW);
  for (const r of rows) {
    if (r.nextCohort?.status === "announced") {
      assert.match(r.nextCohort.label, /aangekondigd/,
        `programme ${r.programId} shows an announced cohort without saying so`);
    }
    if (r.nextCohort) {
      assert.doesNotMatch(r.nextCohort.label, /gedraaid|gestart|liep/,
        `programme ${r.programId} implies a cohort ran`);
    }
  }
});

test("next cohort is never in the past", () => {
  const rows = toListingRows(providers, NOW);
  for (const r of rows) {
    if (r.nextCohort) {
      assert.ok(r.nextCohort.start >= "2026-07",
        `programme ${r.programId} offers a next cohort of ${r.nextCohort.start}, which is past`);
    }
  }
});

test("a programme with no computable price-per-contact-hour carries a caveat, not a zero", () => {
  const rows = toListingRows(providers, NOW);
  for (const r of rows) {
    if (r.pph == null) {
      assert.ok(r.pphCaveat && r.pphCaveat.length > 0,
        `programme ${r.programId} has no pph and no explanation why`);
    } else {
      assert.ok(r.pph > 0, `programme ${r.programId} has a non-positive pph`);
    }
  }
});

test("a price that is not published never renders as a number", () => {
  const rows = toListingRows(providers, NOW);
  for (const r of rows) {
    if (r.pricePublished === "not_published" || r.pricePublished === "unknown") {
      assert.equal(r.priceAmount, null,
        `programme ${r.programId} has an amount despite pricePublished=${r.pricePublished}`);
    }
  }
});

test("the disclosure flag is set for every provider that has one", () => {
  // content/methodologie.md promises: "Zulke banden staan expliciet vermeld
  // bij de betreffende vermelding."
  const rows = toListingRows(providers, NOW);
  const withDisclosure = new Set(providers.filter((p) => p.disclosure).map((p) => p.id));
  for (const r of rows) {
    assert.equal(r.hasDisclosure, withDisclosure.has(r.providerId),
      `disclosure flag wrong for ${r.providerId}`);
  }
});

test("row hrefs deep-link to the programme on the provider record", () => {
  const rows = toListingRows(providers, NOW);
  for (const r of rows) {
    assert.equal(r.href, `/aanbieder/${r.providerId}#programma-${r.programId}`);
  }
});

test("stats are derived from the data, never hard-coded", () => {
  const stats = datasetStats(providers);
  assert.equal(stats.providers, providers.length);
  assert.equal(stats.programs, providers.reduce((n, p) => n + p.programs.length, 0));
  assert.ok(stats.pphComputable <= stats.programs);
  assert.match(stats.lastVerified ?? "", /^\d{4}-\d{2}/);
});

test("presenters are pure — they never mutate the dataset", () => {
  const before = JSON.stringify(providers);
  toListingRows(providers, NOW);
  datasetStats(providers);
  assert.equal(JSON.stringify(providers), before, "a presenter mutated its input");
});

test("topCities is deterministic and returns real cities", () => {
  const rows = toListingRows(providers, NOW);
  const a = topCities(rows);
  const b = topCities(rows);
  assert.deepEqual(a, b, "topCities is not deterministic");
  assert.equal(a.length, 4);
  const all = new Set(rows.flatMap((r) => r.cities));
  for (const c of a) assert.ok(all.has(c), `${c} is not a city in the dataset`);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --test src/lib/presenters.test.ts`

Expected: FAIL — `Cannot find module './presenters'`.

- [ ] **Step 3: Write the strings module**

Create `src/lib/strings.ts`:

```ts
/**
 * Every user-facing string, in one place. NL-only for now (spec §3.2): all
 * record notes in the dataset are Dutch, so the site is Dutch. Adding EN later
 * means adding a second keyed object here — not a refactor.
 *
 * No user-facing string may be inlined in a component.
 */
export const nl = {
  overline: "Onafhankelijk onderzoek · Nederland",
  title: "Yoga-docentenopleidingen",
  navDirectory: "Overzicht",
  navMethod: "Methode",

  statProviders: "aanbieders",
  statPrograms: "opleidingen",
  statRegisters: "getoetst aan openbare registers (CRKBO, Yoga Alliance, VYN)",
  statVerified: (d: string) => `records geverifieerd ${d}`,

  intro:
    "Een feitelijk overzicht van yoga-docentenopleidingen, samengesteld uit " +
    "websites van aanbieders en openbare registers. Beweringen staan er letterlijk, " +
    "nooit gekarakteriseerd. Er wordt hier niets gerangschikt, gescoord of gesponsord.",
  legend:
    "“niet gepubliceerd” = wij keken; de aanbieder vermeldt het niet — een bevinding. · " +
    "“nog niet onderzocht” = een gat in ons onderzoek, nooit getoond als bevinding.",

  sortLabel: "Sorteer",
  sortUpcoming: "eerstvolgende start",
  sortAlphabetical: "A–Z",
  sortPph: "€ / contactuur",
  sortVerified: "laatst geverifieerd",

  filterCity: "Stad",
  filterFormat: "Uren-format",
  filterLanguage: "Voertaal",
  filterMode: "Uitvoering",
  filterRegister: "Registerstatus",
  filterPrice: "Prijs (gepubliceerd)",
  filterElsewhere: "elders",
  filterOwnFormat: "eigen vorm",
  filterYaVerified: "YA register-geverifieerd",
  filterCrkbo: "CRKBO-geregistreerd",
  filterUnder3000: "onder €3.000",
  filterFrom3000: "€3.000 en hoger",
  filterPriceNotPublished: "niet gepubliceerd",

  colProgramme: "Opleiding",
  colFormat: "Format",
  colDelivery: "Uitvoering",
  colPrice: "Prijs",
  colPph: "€ / contactuur",
  colRegister: "Registerstatus",

  noResults: "Geen opleidingen voldoen aan de huidige filters.",
  clearFilters: "Filters wissen",
  resultLine: (progShown: number, progTotal: number, provShown: number, provTotal: number) =>
    `${progShown} van ${progTotal} opleidingen · ${provShown} van ${provTotal} aanbieders`,
  priceFootnote: (computable: number, total: number) =>
    `Prijzen zijn niet direct vergelijkbaar: de btw-behandeling en wat de prijs omvat ` +
    `verschillen per aanbieder. Prijs per contactuur is berekenbaar voor ${computable} van ` +
    `${total} opleidingen — de meeste aanbieders publiceren geen urenuitsplitsing. ` +
    `Die afwezigheid is zelf een bevinding.`,

  backAll: "← Alle opleidingen",
  depthLabel: "onderzoeksdiepte",
  lastVerifiedLabel: "laatst geverifieerd",
  disclosureLabel: "Belangenverstrengeling",

  secRegisters: "Registers & verificatie",
  secProgrammes: "Opleidingen",
  secCoherence: "Samenhang — zes controleerbare signalen",
  secCoherenceNote:
    "Geen oordeel “samenhang: hoog/laag”. De signalen staan er; u weegt zelf.",
  secTransparency: "Wat de aanbieder publiceert",
  secClaims: "Beweringen in het record",
  claimsNote:
    "Letterlijk geciteerd in de brontaal. Beweringen zijn genoteerd als bewering — nooit als feit.",
  secSources: "Bronnen",
  pubBar:
    "Publicatielat: elke kritisch geciteerde bron heeft zowel een publiek archief als een " +
    "gedateerde lokale kopie. Records die de lat niet halen worden gemarkeerd, niet verborgen.",
  notArchived: "nog niet gearchiveerd",
  archivePublic: "publiek",
  archiveLocal: "lokaal",

  depth: { listed: "basisvermelding", reviewed: "onderzocht", assessed: "beoordeeld" } as const,

  cohortStatus: {
    announced: "aangekondigd",
    confirmed_ran: "bevestigd gedraaid",
    cancelled: "geannuleerd",
    unknown: "status onbekend",
  } as const,

  vat: {
    incl: "incl. btw",
    exempt_crkbo: "btw-vrij (CRKBO)",
    excl: "excl. btw",
    unknown: "btw onbekend",
  } as const,

  mode: { in_person: "op locatie", online: "online", hybrid: "hybride" } as const,

  structure: {
    weekends: "weekenden",
    evenings: "avonden",
    intensive: "intensief",
    modular: "modulair",
    mixed: "gemengd",
  } as const,

  body: {
    yoga_alliance: "Yoga Alliance",
    vyn: "VYN",
    crkbo: "CRKBO",
    other: "overig",
  } as const,

  claimCategory: {
    scientific: "wetenschappelijk",
    health_outcome: "gezondheidsbelofte",
    income_outcome: "inkomensbelofte",
    accreditation: "accreditatie",
    lineage_authority: "lineage / autoriteit",
    scope_of_practice: "behandelpretentie",
    other: "overig",
  } as const,

  coherence: {
    required_sequence: "Verplichte volgorde",
    single_cohort_intake: "Eén vast startmoment per groep",
    integrative_assessment: "Toetsing die de onderdelen samenbrengt",
    continuous_lead_teacher: "Doorlopende hoofddocent",
    modules_sold_separately: "Modules ook los verkocht",
    bundle_price_below_sum: "Pakketprijs lager dan som van de modules",
  } as const,

  transparency: {
    syllabus_published: "Syllabus",
    hours_breakdown_published: "Urenuitsplitsing",
    assessment_criteria_published: "Toetscriteria",
    reading_list_published: "Leeslijst",
    teacher_bios_published: "Docentbio’s",
  } as const,

  footLeft: "Geen totaalscores. Geen ranglijsten. Geen affiliate-links. Geen betaalde plaatsing.",
  footRight: "Onderzoek door Ivo Hofland",
  footGithub: "data, schema & methode op GitHub ↗",
  githubUrl: "https://github.com/ivohofland/yoga-trainingen",
} as const;
```

Note: `githubUrl` — confirm the real repo URL with `git remote -v` and correct it if it differs. The design's placeholder was `your-org/yoga-trainingen`.

- [ ] **Step 4: Write the listing presenter**

Create `src/lib/presenters.ts`:

```ts
/**
 * Pure Provider → view-model. No file reads, no side effects, no business
 * logic that belongs in dataset.ts (which owns validation and the derived
 * values, spec §6). This module owns *display*: the strings a component
 * renders, and nothing else.
 */
import { pricePerContactHour } from "./dataset";
import { nl } from "./strings";
import type { Cohort, Program, Provider, Quad } from "../schema";

export interface NextCohort {
  start: string;
  status: Cohort["status"];
  label: string;
}

export interface RegisterChip {
  body: string;
  label: string;
  verified: Quad;
}

export interface ListingRow {
  providerId: string;
  providerName: string;
  providerCityDisplay: string;
  cities: string[];
  programId: string;
  programName: string;
  href: string;
  styleClaimed: string | null;
  formatLabel: Program["format_label"];
  formatDisplay: string;
  mode: Program["delivery"]["mode"];
  language: "nl" | "en" | "mixed" | null;
  deliveryDisplay: string;
  priceAmount: number | null;
  pricePublished: Quad;
  priceDisplay: string | null;
  pph: number | null;
  pphCaveat: string | null;
  registers: RegisterChip[];
  crkboRegistered: Quad;
  yaVerified: Quad;
  nextCohort: NextCohort | null;
  lastVerified: string;
  hasDisclosure: boolean;
}

export interface DatasetStats {
  providers: number;
  programs: number;
  pphComputable: number;
  lastVerified: string | null;
}

const EUR = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const EUR2 = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

export function formatEuro(n: number): string {
  return EUR.format(n);
}

export function formatEuro2(n: number): string {
  return EUR2.format(n);
}

/** "2026-09" → "sep 2026". Month-precision only; never invents a day. */
export function formatMonth(ym: string): string {
  const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  const [y, m] = ym.split("-");
  const idx = Number(m) - 1;
  return MONTHS[idx] ? `${MONTHS[idx]} ${y}` : ym;
}

function cityDisplay(p: Provider): string {
  const cities = p.locations.map((l) => l.city).filter((c): c is string => c != null);
  return cities.length ? [...new Set(cities)].join(" · ") : "locatie niet vermeld";
}

function formatDisplay(f: Program["format_label"]): string {
  if (f === "other" || f === "none") return nl.filterOwnFormat;
  return `${f} u`;
}

function deliveryDisplay(d: Program["delivery"]): string {
  const parts: string[] = [nl.mode[d.mode], nl.structure[d.structure]];
  const { duration_months_min: lo, duration_months_max: hi } = d;
  if (lo != null && hi != null && lo !== hi) parts.push(`${lo}–${hi} mnd`);
  else if (lo != null) parts.push(`${lo} mnd`);
  else if (hi != null) parts.push(`${hi} mnd`);
  if (d.language) parts.push(d.language.toUpperCase());
  return parts.join(" · ");
}

/** null when the price is not a published number — never a zero, never a guess. */
function priceDisplay(p: Program["price"]): string | null {
  if (p.amount_eur == null) return null;
  const base = `${formatEuro(p.amount_eur)} · ${nl.vat[p.vat]}`;
  const extra = p.variants?.length ? ` · ${p.variants.length + 1} varianten` : "";
  return base + extra;
}

/**
 * The earliest cohort starting at or after `now`. An announced cohort is
 * labelled as announced (spec §8) — announced is not ran, and the label must
 * never let a reader believe otherwise.
 */
function nextCohort(program: Program, now: Date): NextCohort | null {
  const currentYm = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const upcoming = (program.cohorts ?? [])
    .filter((c) => c.status !== "cancelled" && c.start.slice(0, 7) >= currentYm)
    .sort((a, b) => a.start.localeCompare(b.start));
  const c = upcoming[0];
  if (!c) return null;
  return {
    start: c.start.slice(0, 7),
    status: c.status,
    label: `start ${formatMonth(c.start.slice(0, 7))} — ${nl.cohortStatus[c.status]}`,
  };
}

function registers(provider: Provider, program: Program): RegisterChip[] {
  return program.accreditation.map((a) => ({
    body: nl.body[a.body],
    label: a.label_claimed,
    verified: a.verified,
  }));
}

function yaVerified(provider: Provider): Quad {
  const ya = provider.registrations.filter((r) => r.body === "yoga_alliance");
  if (!ya.length) return "unknown";
  if (ya.some((r) => r.verified_in_register === "yes")) return "yes";
  if (ya.some((r) => r.verified_in_register === "no")) return "no";
  if (ya.some((r) => r.verified_in_register === "not_published")) return "not_published";
  return "unknown";
}

export function toListingRows(providers: Provider[], now: Date = new Date()): ListingRow[] {
  const rows: ListingRow[] = [];
  for (const provider of providers) {
    const cities = [...new Set(provider.locations.map((l) => l.city).filter((c): c is string => c != null))];
    for (const program of provider.programs) {
      const pph = pricePerContactHour(program);
      rows.push({
        providerId: provider.id,
        providerName: provider.name,
        providerCityDisplay: cityDisplay(provider),
        cities,
        programId: program.id,
        programName: program.name,
        href: `/aanbieder/${provider.id}#programma-${program.id}`,
        styleClaimed: program.style_claimed ?? null,
        formatLabel: program.format_label,
        formatDisplay: formatDisplay(program.format_label),
        mode: program.delivery.mode,
        language: program.delivery.language ?? null,
        deliveryDisplay: deliveryDisplay(program.delivery),
        priceAmount: program.price.amount_eur ?? null,
        pricePublished: program.price.published,
        priceDisplay: priceDisplay(program.price),
        pph: pph.value,
        pphCaveat: pph.value == null ? (pph.caveat ?? nl.filterPriceNotPublished) : (pph.caveat ?? null),
        registers: registers(provider, program),
        crkboRegistered: provider.crkbo.registered,
        yaVerified: yaVerified(provider),
        nextCohort: nextCohort(program, now),
        lastVerified: provider.last_verified,
        hasDisclosure: provider.disclosure != null,
      });
    }
  }
  return rows;
}

export function datasetStats(providers: Provider[]): DatasetStats {
  const programs = providers.flatMap((p) => p.programs);
  return {
    providers: providers.length,
    programs: programs.length,
    pphComputable: programs.filter((p) => pricePerContactHour(p).value != null).length,
    lastVerified: providers.map((p) => p.last_verified).sort().at(-1) ?? null,
  };
}

/**
 * The n cities carrying the most programmes, for the filter chips. Derived, not
 * hard-coded: the design hard-coded four, but the dataset holds 44 (including
 * one in Austria). Ties break alphabetically so the output is deterministic.
 */
export function topCities(rows: ListingRow[], n = 4): string[] {
  const count = new Map<string, number>();
  for (const r of rows) {
    for (const c of r.cities) count.set(c, (count.get(c) ?? 0) + 1);
  }
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "nl"))
    .slice(0, n)
    .map(([city]) => city);
}
```

- [ ] **Step 5: Run the tests and make sure they pass**

Run: `npx tsx --test src/lib/presenters.test.ts`

Expected: PASS — `# pass 10`, `# fail 0`.

If "next cohort is never in the past" fails, the bug is in `nextCohort`'s month comparison — it compares `YYYY-MM` strings lexically, which is only correct because both sides are zero-padded. Do not "fix" it by parsing to `Date`; a `YYYY-MM` has no day and constructing a `Date` from it invents one.

- [ ] **Step 6: Commit**

```bash
git add src/lib/strings.ts src/lib/presenters.ts src/lib/presenters.test.ts
git commit -m "Add the NL strings module and the listing presenter

Presenters are pure Provider → display; dataset.ts keeps validation and
the derived values. Every count in the copy is derived (7 of 77 today,
not the design's hard-coded '2 of 15'), and the city chips are derived
too — the design hard-coded four cities, the dataset holds 44."
```

---

## Task 4: Filters, sort, and the listing page

**Files:**
- Create: `src/lib/filters.ts`, `src/lib/filters.test.ts`
- Create: `src/components/ProgrammeTable.tsx`, `src/components/ProgrammeTable.module.css`
- Modify: `app/layout.tsx`, `app/page.tsx`

**Interfaces:**
- Consumes: `ListingRow`, `topCities`, `datasetStats` from `src/lib/presenters.ts`; `<Quad>`; `nl` from strings.
- Produces:

```ts
export interface Filters {
  city: string | null; format: string | null; language: string | null;
  mode: string | null; register: string | null; price: string | null;
}
export const EMPTY_FILTERS: Filters
export type SortKey = "upcoming" | "alphabetical" | "pph" | "verified"
export function filterRows(rows: ListingRow[], f: Filters, cities: string[]): ListingRow[]
export function sortRows(rows: ListingRow[], key: SortKey): ListingRow[]
```

- [ ] **Step 1: Write the failing test**

Create `src/lib/filters.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDataset } from "./dataset";
import { toListingRows, topCities } from "./presenters";
import { EMPTY_FILTERS, filterRows, sortRows, type Filters } from "./filters";

const { providers } = loadDataset();
const NOW = new Date("2026-07-01T00:00:00Z");
const ROWS = toListingRows(providers, NOW);
const CITIES = topCities(ROWS);

test("no filters returns everything", () => {
  assert.equal(filterRows(ROWS, EMPTY_FILTERS, CITIES).length, ROWS.length);
});

test("every delivery mode in the data is reachable by a filter", () => {
  // The design offered only in_person and hybrid. The dataset also holds
  // `online` — those programmes must not be unreachable.
  const modes = new Set(ROWS.map((r) => r.mode));
  for (const mode of modes) {
    const got = filterRows(ROWS, { ...EMPTY_FILTERS, mode }, CITIES);
    assert.ok(got.length > 0, `mode '${mode}' matches nothing — programmes are unreachable`);
    assert.ok(got.every((r) => r.mode === mode));
  }
});

test("every format in the data is reachable by a filter", () => {
  const formats = new Set(ROWS.map((r) => r.formatLabel));
  for (const format of formats) {
    const got = filterRows(ROWS, { ...EMPTY_FILTERS, format }, CITIES);
    assert.ok(got.length > 0, `format '${format}' matches nothing`);
  }
});

test("the 'elders' city filter catches every city outside the top four", () => {
  const elsewhere = filterRows(ROWS, { ...EMPTY_FILTERS, city: "__elders__" }, CITIES);
  for (const r of elsewhere) {
    assert.ok(!r.cities.some((c) => CITIES.includes(c)),
      `${r.programId} is in a top-four city but matched 'elders'`);
  }
  // Together, the four chips plus 'elders' must cover every row that has a city.
  const inTop = ROWS.filter((r) => r.cities.some((c) => CITIES.includes(c)));
  const withCity = ROWS.filter((r) => r.cities.length > 0);
  assert.equal(inTop.length + elsewhere.filter((r) => r.cities.length > 0).length, withCity.length);
});

test("the price filter never matches a programme whose price is not published", () => {
  for (const band of ["under3000", "from3000"]) {
    const got = filterRows(ROWS, { ...EMPTY_FILTERS, price: band }, CITIES);
    assert.ok(got.every((r) => r.priceAmount != null),
      `price band '${band}' matched a programme with no published price`);
  }
  const notPub = filterRows(ROWS, { ...EMPTY_FILTERS, price: "not_published" }, CITIES);
  assert.ok(notPub.every((r) => r.priceAmount == null));
});

test("SORT: programmes without a computable €/contactuur sort LAST, never first", () => {
  // A programme that publishes no hours must not top a price ranking — that
  // would reward not publishing.
  const sorted = sortRows(ROWS, "pph");
  const firstNull = sorted.findIndex((r) => r.pph == null);
  if (firstNull !== -1) {
    assert.ok(sorted.slice(firstNull).every((r) => r.pph == null),
      "a computable price-per-contact-hour appears after a non-computable one");
  }
  const values = sorted.filter((r) => r.pph != null).map((r) => r.pph as number);
  assert.deepEqual(values, [...values].sort((a, b) => a - b),
    "computable price-per-contact-hour values are not in ascending order");
});

test("SORT: 'eerstvolgende start' puts programmes with no announced start last", () => {
  const sorted = sortRows(ROWS, "upcoming");
  const firstNull = sorted.findIndex((r) => r.nextCohort == null);
  if (firstNull !== -1) {
    assert.ok(sorted.slice(firstNull).every((r) => r.nextCohort == null),
      "a programme with an upcoming cohort appears after one without");
  }
});

test("SORT: A–Z is stable and alphabetical by provider then programme", () => {
  const sorted = sortRows(ROWS, "alphabetical");
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i];
    const cmp = a.providerName.localeCompare(b.providerName, "nl");
    assert.ok(cmp < 0 || (cmp === 0 && a.programName.localeCompare(b.programName, "nl") <= 0),
      `${a.providerName}/${a.programName} sorted before ${b.providerName}/${b.programName}`);
  }
});

test("sort never drops or duplicates a row", () => {
  for (const key of ["upcoming", "alphabetical", "pph", "verified"] as const) {
    const sorted = sortRows(ROWS, key);
    assert.equal(sorted.length, ROWS.length, `sort '${key}' changed the row count`);
    assert.equal(new Set(sorted.map((r) => r.href)).size, ROWS.length, `sort '${key}' duplicated a row`);
  }
});

test("filter and sort are pure — they never mutate their input", () => {
  const before = ROWS.map((r) => r.href).join("|");
  sortRows(ROWS, "pph");
  filterRows(ROWS, { ...EMPTY_FILTERS, mode: "online" } as Filters, CITIES);
  assert.equal(ROWS.map((r) => r.href).join("|"), before, "input array was mutated");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --test src/lib/filters.test.ts`

Expected: FAIL — `Cannot find module './filters'`.

- [ ] **Step 3: Write filters.ts**

Create `src/lib/filters.ts`:

```ts
/**
 * Pure filter + sort over ListingRow[]. Kept out of the React component so the
 * editorial ordering rules (a programme that publishes no hours must not top a
 * price ranking) can be tested without rendering anything.
 */
import type { ListingRow } from "./presenters";

export interface Filters {
  city: string | null;
  format: string | null;
  language: string | null;
  mode: string | null;
  register: string | null;
  price: string | null;
}

export const EMPTY_FILTERS: Filters = {
  city: null,
  format: null,
  language: null,
  mode: null,
  register: null,
  price: null,
};

/** Sentinel for "any city outside the derived top four". */
export const ELSEWHERE = "__elders__";

export type SortKey = "upcoming" | "alphabetical" | "pph" | "verified";

export function filterRows(rows: ListingRow[], f: Filters, cities: string[]): ListingRow[] {
  return rows.filter((r) => {
    if (f.city === ELSEWHERE) {
      if (r.cities.some((c) => cities.includes(c))) return false;
    } else if (f.city && !r.cities.includes(f.city)) {
      return false;
    }
    if (f.format && r.formatLabel !== f.format) return false;
    if (f.language && r.language !== f.language) return false;
    if (f.mode && r.mode !== f.mode) return false;
    if (f.register === "ya" && r.yaVerified !== "yes") return false;
    if (f.register === "crkbo" && r.crkboRegistered !== "yes") return false;
    // Price bands operate on published amounts only. "not_published" is its own
    // band — it is a finding, and it is filterable as one.
    if (f.price === "under3000" && !(r.priceAmount != null && r.priceAmount < 3000)) return false;
    if (f.price === "from3000" && !(r.priceAmount != null && r.priceAmount >= 3000)) return false;
    if (f.price === "not_published" && r.priceAmount != null) return false;
    return true;
  });
}

const byName = (a: ListingRow, b: ListingRow) =>
  a.providerName.localeCompare(b.providerName, "nl") ||
  a.programName.localeCompare(b.programName, "nl");

export function sortRows(rows: ListingRow[], key: SortKey): ListingRow[] {
  const out = [...rows]; // never mutate the caller's array
  switch (key) {
    case "alphabetical":
      return out.sort(byName);
    case "upcoming":
      // No announced start sorts LAST: "9999" is beyond any real YYYY-MM.
      return out.sort(
        (a, b) =>
          (a.nextCohort?.start ?? "9999").localeCompare(b.nextCohort?.start ?? "9999") || byName(a, b),
      );
    case "pph":
      // Nulls LAST. A programme that publishes no hours must not top a price
      // ranking — that would reward not publishing.
      return out.sort(
        (a, b) => (a.pph ?? Infinity) - (b.pph ?? Infinity) || byName(a, b),
      );
    case "verified":
      // Most recently verified first.
      return out.sort((a, b) => b.lastVerified.localeCompare(a.lastVerified) || byName(a, b));
  }
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx tsx --test src/lib/filters.test.ts`

Expected: PASS — `# pass 10`, `# fail 0`.

- [ ] **Step 5: Write the layout shell (fonts, masthead, footer)**

Replace `app/layout.tsx` entirely:

```tsx
import type { ReactNode } from "react";
import Link from "next/link";
import { Newsreader, IBM_Plex_Mono } from "next/font/google";
import { nl } from "@/lib/strings";
import "./globals.css";
import styles from "./layout.module.css";

// Self-hosted at build time by next/font — no runtime request to
// fonts.googleapis.com (faster, and no third-party font call from a Dutch
// public site).
const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});

export const metadata = {
  title: "Yoga-docentenopleidingen — onafhankelijk onderzoek",
  description:
    "Onafhankelijk, feitelijk overzicht van yoga-docentenopleidingen in Nederland. " +
    "Bronnen bij elk gegeven, beweringen letterlijk geciteerd, geen scores of ranglijsten.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl" className={`${newsreader.variable} ${plexMono.variable}`}>
      <body>
        <div className={styles.shell}>
          <header className={styles.masthead}>
            <Link href="/" className={styles.brand}>
              <div className={styles.overline}>{nl.overline}</div>
              <h1 className={styles.title}>{nl.title}</h1>
            </Link>
            <nav className={styles.nav}>
              <Link href="/" className={styles.navLink}>{nl.navDirectory}</Link>
              <Link href="/methodologie" className={styles.navLink}>{nl.navMethod}</Link>
            </nav>
          </header>

          {children}

          <footer className={styles.footer}>
            <span>{nl.footLeft}</span>
            <span>
              {nl.footRight} ·{" "}
              <a href={nl.githubUrl} target="_blank" rel="noopener">
                {nl.footGithub}
              </a>
            </span>
          </footer>
        </div>
      </body>
    </html>
  );
}
```

Create `app/layout.module.css`:

```css
.shell {
  max-width: 1180px;
  margin: 0 auto;
  padding: 0 32px 96px;
}

.masthead {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-top: 24px;
  padding: 44px 0 28px;
  border-top: 6px solid var(--ink);
  border-bottom: 2px solid var(--ink);
}

.brand {
  text-decoration: none;
  color: inherit;
}

.overline {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 8px;
}

.title {
  margin: 0;
  font-size: 34px;
  font-weight: 500;
  line-height: 1.1;
  letter-spacing: -0.01em;
}

.nav {
  display: flex;
  gap: 8px;
  align-items: center;
}

.navLink {
  font-family: var(--mono);
  font-size: 12px;
  padding: 7px 14px;
  border: 1px solid var(--ink);
  text-decoration: none;
  color: var(--ink);
  background: var(--paper);
}

.navLink:hover {
  background: var(--ink);
  color: var(--paper);
}

.footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 10px 32px;
  margin-top: 72px;
  padding-top: 18px;
  border-top: 2px solid var(--ink);
  font-family: var(--mono);
  font-size: 11px;
  color: var(--muted);
  line-height: 1.7;
}
```

- [ ] **Step 6: Write the ProgrammeTable client component**

Create `src/components/ProgrammeTable.module.css`:

```css
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 22px 44px;
  align-items: flex-start;
  padding: 24px 0 22px;
  border-top: 1px solid var(--ink);
  border-bottom: 1px solid var(--rule);
}

.group {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.groupLabel {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.chip {
  font-family: var(--mono);
  font-size: 11.5px;
  padding: 4px 10px;
  cursor: pointer;
  background: var(--paper);
  color: var(--ink);
  border: 1px solid var(--rule-2);
}

.chipActive {
  composes: chip;
  background: var(--ink);
  color: var(--paper);
  border-color: var(--ink);
}

.sortBar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 18px 0;
  border-bottom: 1px solid var(--rule);
  margin-bottom: 16px;
}

.sortGroup {
  display: flex;
  align-items: center;
  gap: 8px;
}

.resultLine {
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--muted);
}

.grid {
  display: grid;
  grid-template-columns: minmax(240px, 2.6fr) 0.8fr 1.7fr 1.7fr 1.5fr 1.8fr;
  gap: 16px;
}

.head {
  composes: grid;
  padding: 10px 0 8px;
  border-bottom: 1px solid var(--ink);
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
}

.row {
  composes: grid;
  align-items: baseline;
  padding: 20px 16px;
  margin: 0 -16px;
  border-bottom: 1px solid var(--rule);
  text-decoration: none;
  color: inherit;
}

.row:hover {
  background: var(--hover);
}

.provider {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 4px;
}

.providerName {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.programName {
  font-size: 16.5px;
  font-weight: 500;
  line-height: 1.35;
}

.style {
  font-size: 12.5px;
  color: var(--muted);
  line-height: 1.4;
  margin-top: 2px;
  font-style: italic;
}

.cohort {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--muted);
  margin-top: 6px;
}

.disclosure {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--finding);
  margin-top: 6px;
}

.cell {
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1.5;
}

.cellSmall {
  composes: cell;
  font-size: 11.5px;
}

.empty {
  padding: 48px 0;
  font-family: var(--mono);
  font-size: 13px;
  color: var(--muted);
}

.footnote {
  font-family: var(--mono);
  font-size: 11px;
  line-height: 1.7;
  color: var(--muted);
  max-width: 780px;
  margin: 20px 0 0;
}

@media (max-width: 860px) {
  .grid {
    grid-template-columns: 1fr;
    gap: 6px;
  }
  .head {
    display: none;
  }
}
```

Create `src/components/ProgrammeTable.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { nl } from "@/lib/strings";
import { Quad } from "./Quad";
import { EMPTY_FILTERS, ELSEWHERE, filterRows, sortRows, type Filters, type SortKey } from "@/lib/filters";
import type { ListingRow } from "@/lib/presenters";
import styles from "./ProgrammeTable.module.css";

interface Props {
  rows: ListingRow[];
  cities: string[];
  providerCount: number;
}

interface Chip {
  value: string;
  label: string;
}

export function ProgrammeTable({ rows, cities, providerCount }: Props) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortKey>("upcoming");

  const shown = useMemo(
    () => sortRows(filterRows(rows, filters, cities), sort),
    [rows, filters, cities, sort],
  );

  const toggle = (group: keyof Filters, value: string) =>
    setFilters((f) => ({ ...f, [group]: f[group] === value ? null : value }));

  // Chip sets are derived from the data, not hard-coded: `online` exists in the
  // dataset and the design omitted it, which would have made those programmes
  // unreachable.
  const formats = [...new Set(rows.map((r) => r.formatLabel))].sort();
  const modes = [...new Set(rows.map((r) => r.mode))].sort();
  const languages = [...new Set(rows.map((r) => r.language).filter((l): l is NonNullable<typeof l> => l != null))].sort();

  const groups: { key: keyof Filters; label: string; chips: Chip[] }[] = [
    {
      key: "city",
      label: nl.filterCity,
      chips: [
        ...cities.map((c) => ({ value: c, label: c })),
        { value: ELSEWHERE, label: nl.filterElsewhere },
      ],
    },
    {
      key: "format",
      label: nl.filterFormat,
      chips: formats.map((f) => ({
        value: f,
        label: f === "other" || f === "none" ? nl.filterOwnFormat : f,
      })),
    },
    { key: "language", label: nl.filterLanguage, chips: languages.map((l) => ({ value: l, label: l.toUpperCase() })) },
    { key: "mode", label: nl.filterMode, chips: modes.map((m) => ({ value: m, label: nl.mode[m] })) },
    {
      key: "register",
      label: nl.filterRegister,
      chips: [
        { value: "ya", label: nl.filterYaVerified },
        { value: "crkbo", label: nl.filterCrkbo },
      ],
    },
    {
      key: "price",
      label: nl.filterPrice,
      chips: [
        { value: "under3000", label: nl.filterUnder3000 },
        { value: "from3000", label: nl.filterFrom3000 },
        { value: "not_published", label: nl.filterPriceNotPublished },
      ],
    },
  ];

  const sorts: { key: SortKey; label: string }[] = [
    { key: "upcoming", label: nl.sortUpcoming },
    { key: "alphabetical", label: nl.sortAlphabetical },
    { key: "pph", label: nl.sortPph },
    { key: "verified", label: nl.sortVerified },
  ];

  const provShown = new Set(shown.map((r) => r.providerId)).size;

  return (
    <>
      <div className={styles.filters}>
        {groups.map((g) => (
          <div key={g.key} className={styles.group}>
            <div className={styles.groupLabel}>{g.label}</div>
            <div className={styles.chips}>
              {g.chips.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => toggle(g.key, c.value)}
                  aria-pressed={filters[g.key] === c.value}
                  className={filters[g.key] === c.value ? styles.chipActive : styles.chip}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.sortBar}>
        <div className={styles.sortGroup}>
          <span className={styles.groupLabel}>{nl.sortLabel}</span>
          {sorts.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSort(s.key)}
              aria-pressed={sort === s.key}
              className={sort === s.key ? styles.chipActive : styles.chip}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className={styles.resultLine}>
          {nl.resultLine(shown.length, rows.length, provShown, providerCount)}
        </div>
      </div>

      <div className={styles.head}>
        <div>{nl.colProgramme}</div>
        <div>{nl.colFormat}</div>
        <div>{nl.colDelivery}</div>
        <div>{nl.colPrice}</div>
        <div>{nl.colPph}</div>
        <div>{nl.colRegister}</div>
      </div>

      {shown.map((r) => (
        <Link key={r.href} href={r.href} className={styles.row}>
          <div>
            <div className={styles.provider}>
              <span className={styles.providerName}>{r.providerName}</span> · {r.providerCityDisplay}
            </div>
            <div className={styles.programName}>{r.programName}</div>
            {r.styleClaimed && <div className={styles.style}>{r.styleClaimed}</div>}
            {r.nextCohort && <div className={styles.cohort}>{r.nextCohort.label}</div>}
            {r.hasDisclosure && <div className={styles.disclosure}>{nl.disclosureLabel}</div>}
          </div>
          <div className={styles.cell}>{r.formatDisplay}</div>
          <div className={styles.cellSmall}>{r.deliveryDisplay}</div>
          <div className={styles.cell}>
            <Quad state={r.pricePublished}>{r.priceDisplay}</Quad>
          </div>
          <div className={styles.cellSmall}>
            {r.pph != null ? `€ ${r.pph.toFixed(2).replace(".", ",")}` : <Quad state="not_published" />}
          </div>
          <div className={styles.cellSmall}>
            {r.registers.length === 0 ? (
              <Quad state="unknown" />
            ) : (
              r.registers.map((reg, i) => (
                <div key={i}>
                  {reg.body} <Quad state={reg.verified} />
                </div>
              ))
            )}
          </div>
        </Link>
      ))}

      {shown.length === 0 && (
        <div className={styles.empty}>
          {nl.noResults}{" "}
          <button type="button" className={styles.chip} onClick={() => setFilters(EMPTY_FILTERS)}>
            {nl.clearFilters}
          </button>
        </div>
      )}
    </>
  );
}
```

Note the €/contactuur cell: when `pph` is null it renders `<Quad state="not_published" />` — because `pricePerContactHour()` returns null precisely when the provider did not publish the hours or the price. That IS a finding.

- [ ] **Step 7: Write the listing page**

Replace `app/page.tsx` entirely:

```tsx
/**
 * Listing view (spec §1). A Server Component: it loads and validates the
 * dataset at build time and throws if it is invalid — the site refuses to
 * render invalid data. Only the filter/sort island below is client-side.
 */
import { loadDataset } from "@/lib/dataset";
import { toListingRows, datasetStats, topCities } from "@/lib/presenters";
import { ProgrammeTable } from "@/components/ProgrammeTable";
import { nl } from "@/lib/strings";
import { formatMonth } from "@/lib/presenters";
import styles from "./page.module.css";

export default function Home() {
  const { providers, errors } = loadDataset();
  if (errors.length > 0) throw new Error(`Dataset invalid:\n${errors.join("\n")}`);

  const rows = toListingRows(providers);
  const stats = datasetStats(providers);
  const cities = topCities(rows);

  return (
    <main>
      <div className={styles.stats}>
        <span>{stats.providers} {nl.statProviders}</span>
        <span>{stats.programs} {nl.statPrograms}</span>
        <span>{nl.statRegisters}</span>
        {stats.lastVerified && <span>{nl.statVerified(formatMonth(stats.lastVerified.slice(0, 7)))}</span>}
      </div>

      <p className={styles.intro}>{nl.intro}</p>
      <p className={styles.legend}>{nl.legend}</p>

      <ProgrammeTable rows={rows} cities={cities} providerCount={stats.providers} />

      <p className={styles.footnote}>{nl.priceFootnote(stats.pphComputable, stats.programs)}</p>
    </main>
  );
}
```

Create `app/page.module.css`:

```css
.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 24px;
  padding: 14px 0 0;
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--muted);
}

.intro {
  max-width: 640px;
  font-size: 17px;
  line-height: 1.55;
  color: var(--ink-2);
  margin: 44px 0 12px;
}

.legend {
  font-family: var(--mono);
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--muted);
  max-width: 720px;
  margin: 0 0 44px;
}

.footnote {
  font-family: var(--mono);
  font-size: 11px;
  line-height: 1.7;
  color: var(--muted);
  max-width: 780px;
  margin: 20px 0 0;
}
```

- [ ] **Step 8: Run the tests, then look at it**

Run: `npm test`

Expected: PASS — all suites green.

Run: `npm run dev`, open `http://localhost:3000`.

Verify by eye:
1. 77 rows, 48 providers in the result line.
2. Filter chips include an **online** option under Uitvoering.
3. Sort by *€ / contactuur* → the 7 computable rows come first, ascending; everything else follows in amber "niet gepubliceerd".
4. "niet gepubliceerd" is amber; nothing on the page is amber that shouldn't be.
5. Clicking a row lands on `/aanbieder/<id>#programma-<pid>` — a 404 for now; the next task builds it.

- [ ] **Step 9: Commit**

```bash
git add src/lib/filters.ts src/lib/filters.test.ts src/components/ProgrammeTable.tsx src/components/ProgrammeTable.module.css app/layout.tsx app/layout.module.css app/page.tsx app/page.module.css
git commit -m "Build the listing: filters, sort, and the programme table

Filter and sort are pure functions, tested apart from React: a
programme that publishes no hours sorts last under €/contactuur rather
than topping it, and every delivery mode in the data is reachable —
the design offered only in_person and hybrid, which would have made the
five online programmes unreachable.

Fonts are self-hosted via next/font, so no runtime call to Google."
```

---

## Task 5: The provider record

**Files:**
- Create: `app/aanbieder/[id]/page.tsx`, `app/aanbieder/[id]/page.module.css`
- Create: `src/components/record/Registers.tsx`, `Programme.tsx`, `Claims.tsx`, `Sources.tsx`, `record.module.css`
- Modify: `src/lib/presenters.ts` (add `toProviderView`), `src/lib/presenters.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–3.
- Produces:

```ts
export interface SourceView {
  id: string; type: string; url: string | null; captured: string;
  note: string | null; archivePublic: boolean; archiveLocal: boolean;
}
export interface ClaimView { id: string; quote: string; category: string; scope: string; analysis: {...} | null }
export interface ProviderView {
  id: string; name: string; aka: string[]; website: string; domain: string;
  cityDisplay: string; depth: string; lastVerified: string; disclosure: string | null;
  crkbo: {...}; registrations: {...}[]; programs: ProgramView[];
  claims: ClaimView[]; sources: SourceView[];
  sourcesArchived: number;
}
export function toProviderView(p: Provider): ProviderView
```

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/presenters.test.ts`:

```ts
import { toProviderView } from "./presenters";

test("RECORD: a claim quote is reproduced verbatim, never altered", () => {
  // spec §3, the legal posture. Not truncated, not ellipsised, not re-cased.
  for (const p of providers) {
    const view = toProviderView(p);
    assert.equal(view.claims.length, p.claims.length);
    for (const [i, c] of p.claims.entries()) {
      assert.equal(view.claims[i].quote, c.quote, `claim ${c.id} was altered`);
    }
  }
});

test("RECORD: disclosure is always carried through when present", () => {
  for (const p of providers) {
    assert.equal(toProviderView(p).disclosure, p.disclosure ?? null);
  }
});

test("RECORD: a source with no public archive is marked, not hidden", () => {
  // The publication bar: records below it are marked, never dropped.
  for (const p of providers) {
    const view = toProviderView(p);
    assert.equal(view.sources.length, p.sources.length, `${p.id} dropped a source`);
    for (const [i, s] of p.sources.entries()) {
      assert.equal(view.sources[i].archivePublic, s.archived_url != null);
      assert.equal(view.sources[i].archiveLocal, s.local_snapshot != null);
    }
  }
});

test("RECORD: an absent coherence_signals object yields gaps, not findings", () => {
  // 52 of 77 programmes have no coherence_signals at all. Not investigated is
  // not investigated — it must not read as "the provider does not publish it".
  for (const p of providers) {
    for (const prog of toProviderView(p).programs) {
      for (const sig of prog.coherence) {
        assert.ok(["yes", "no", "not_published", "unknown"].includes(sig.state));
      }
    }
  }
  const bare = providers.find((p) => p.programs.some((pr) => pr.coherence_signals == null));
  assert.ok(bare, "expected at least one programme without coherence_signals");
  const prog = toProviderView(bare).programs.find((pr) => pr.coherence.every((s) => s.state === "unknown"));
  assert.ok(prog, "a programme with no coherence_signals did not render as all-unknown");
});

test("RECORD: every programme has a stable anchor id matching its listing href", () => {
  const rows = toListingRows(providers, NOW);
  for (const p of providers) {
    for (const prog of toProviderView(p).programs) {
      const row = rows.find((r) => r.providerId === p.id && r.programId === prog.id);
      assert.ok(row, `no listing row for ${p.id}/${prog.id}`);
      assert.equal(row.href, `/aanbieder/${p.id}#programma-${prog.id}`);
    }
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx --test src/lib/presenters.test.ts`

Expected: FAIL — `toProviderView is not a function` / not exported.

- [ ] **Step 3: Add `toProviderView` to `src/lib/presenters.ts`**

Append (keeping everything already there):

```ts
import { bundleDelta } from "./dataset";
import type { Source } from "../schema";

export interface QuadRow {
  key: string;
  label: string;
  state: Quad;
  note: string | null;
}

export interface KeyValueRow {
  label: string;
  /** null → render as a Quad gap. */
  value: string | null;
  state: Quad;
  note: string | null;
}

export interface ProgramView {
  id: string;
  name: string;
  url: string | null;
  styleClaimed: string | null;
  rows: KeyValueRow[];
  coherence: QuadRow[];
  transparency: QuadRow[];
  accreditation: { body: string; label: string; verified: Quad; note: string | null }[];
  cohorts: { id: string; start: string; status: Cohort["status"]; label: string; note: string | null }[];
}

export interface ClaimView {
  id: string;
  quote: string;
  category: string;
  scope: string;
  analysis: { note: string; status: string; reviewed: string; methodologyVersion: string } | null;
}

export interface SourceView {
  id: string;
  type: string;
  url: string | null;
  captured: string;
  note: string | null;
  archivePublic: boolean;
  archiveLocal: boolean;
}

export interface ProviderView {
  id: string;
  name: string;
  aka: string[];
  website: string;
  domain: string;
  cityDisplay: string;
  depth: string;
  lastVerified: string;
  disclosure: string | null;
  crkbo: { registered: Quad; register: string | null; holder: string | null; checked: string | null; note: string | null };
  registrations: { body: string; identifier: string | null; holder: string | null; firstRegistered: string | null; verified: Quad; note: string | null }[];
  programs: ProgramView[];
  claims: ClaimView[];
  sources: SourceView[];
  sourcesArchived: number;
}

/** An absent optional object is a gap, never a finding (spec §4). */
function q(v: Quad | undefined): Quad {
  return v ?? "unknown";
}

function fact(label: string, value: string | null | undefined, note?: string): KeyValueRow {
  return {
    label,
    value: value ?? null,
    state: value == null ? "unknown" : "yes",
    note: note ?? null,
  };
}

function coherenceRows(program: Program): QuadRow[] {
  const cs = program.coherence_signals;
  return (Object.keys(nl.coherence) as (keyof typeof nl.coherence)[]).map((key) => ({
    key,
    label: nl.coherence[key],
    state: q(cs?.[key]),
    note: (cs?.[`${key}_note` as keyof typeof cs] as string | undefined) ?? null,
  }));
}

function transparencyRows(program: Program): QuadRow[] {
  const t = program.transparency;
  return (Object.keys(nl.transparency) as (keyof typeof nl.transparency)[]).map((key) => ({
    key,
    label: nl.transparency[key],
    state: q(t?.[key]),
    note: null,
  }));
}

function programRows(provider: Provider, program: Program): KeyValueRow[] {
  const h = program.hours_claimed;
  const pph = pricePerContactHour(program);
  const delta = bundleDelta(provider, program);
  const rows: KeyValueRow[] = [];

  rows.push(fact("Format", formatDisplay(program.format_label)));
  rows.push(fact("Stijl (geclaimd)", program.style_claimed));
  rows.push(fact("Uitvoering", deliveryDisplay(program.delivery)));

  rows.push({
    label: "Prijs",
    value: priceDisplay(program.price),
    state: program.price.published,
    note: [program.price.includes && `inclusief: ${program.price.includes}`,
           program.price.excludes && `exclusief: ${program.price.excludes}`,
           program.price.note].filter(Boolean).join(" · ") || null,
  });

  rows.push({
    label: "Prijs per contactuur",
    value: pph.value != null ? formatEuro2(pph.value) : null,
    state: pph.value != null ? "yes" : "not_published",
    note: pph.caveat ?? null,
  });

  rows.push({
    label: "Urenuitsplitsing",
    value: [h.total != null && `${h.total} totaal`, h.contact != null && `${h.contact} contact`,
            h.self_study != null && `${h.self_study} zelfstudie`].filter(Boolean).join(" · ") || null,
    state: h.breakdown_published,
    note: h.note ?? null,
  });

  // The §5 field. Its emptiness across the market is the finding — so it gets
  // its own row on every programme, always.
  rows.push({
    label: "Begeleide lespraktijk",
    value: h.supervised_teaching_practice != null ? `${h.supervised_teaching_practice} uur` : null,
    state: h.supervised_teaching_practice != null ? "yes" : h.breakdown_published,
    note: null,
  });

  rows.push({
    label: "Toetsing",
    value: program.assessment_described?.quote ?? null,
    state: q(program.assessment_described?.exists),
    note: null,
  });

  rows.push({
    label: "Groepsgrootte",
    value: [program.group_size_claimed?.min != null && `min ${program.group_size_claimed.min}`,
            program.group_size_claimed?.max != null && `max ${program.group_size_claimed.max}`]
      .filter(Boolean).join(" · ") || null,
    state: program.group_size_claimed ? "yes" : "unknown",
    note: program.group_size_claimed?.note ?? null,
  });

  rows.push(fact("Vooropleiding", program.prerequisites_claimed));

  if (program.composition) {
    rows.push({
      label: "Samenstelling",
      value: `${program.composition.type}${program.composition.modules?.length ? ` · ${program.composition.modules.length} modules` : ""}`,
      state: "yes",
      note: delta != null
        ? `Pakketprijs ${delta < 0 ? formatEuro(Math.abs(delta)) + " onder" : formatEuro(delta) + " boven"} de som van de losse modules.`
        : null,
    });
  }

  if (program.contract) {
    rows.push({
      label: "Voorwaarden",
      value: [program.contract.cancellation_published && `annulering: ${quadLabel(program.contract.cancellation_published)}`,
              program.contract.refund_published && `terugbetaling: ${quadLabel(program.contract.refund_published)}`,
              program.contract.installments_published && `termijnen: ${quadLabel(program.contract.installments_published)}`]
        .filter(Boolean).join(" · ") || null,
      state: "yes",
      note: [program.contract.invoicing_entity && `factureert: ${program.contract.invoicing_entity}`, program.contract.note]
        .filter(Boolean).join(" · ") || null,
    });
  }

  if (program.track_record) {
    rows.push({
      label: "Track record",
      value: [program.track_record.first_seen_year != null && `sinds ${program.track_record.first_seen_year}`,
              program.track_record.last_confirmed_cohort && `laatst bevestigd ${formatMonth(program.track_record.last_confirmed_cohort.slice(0, 7))}`]
        .filter(Boolean).join(" · ") || null,
      state: "yes",
      note: [program.track_record.cadence_note, program.track_record.note].filter(Boolean).join(" · ") || null,
    });
  }

  return rows;
}

function domainOf(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

export function toProviderView(p: Provider): ProviderView {
  return {
    id: p.id,
    name: p.name,
    aka: p.aka ?? [],
    website: p.website,
    domain: domainOf(p.website),
    cityDisplay: cityDisplay(p),
    depth: nl.depth[p.depth],
    lastVerified: p.last_verified,
    disclosure: p.disclosure ?? null,
    crkbo: {
      registered: p.crkbo.registered,
      register: p.crkbo.register ?? null,
      holder: p.crkbo.holder ?? null,
      checked: p.crkbo.checked ?? null,
      note: p.crkbo.note ?? null,
    },
    registrations: p.registrations.map((r) => ({
      body: nl.body[r.body],
      identifier: r.identifier ?? null,
      holder: r.holder ?? null,
      firstRegistered: r.first_registered ?? null,
      verified: r.verified_in_register,
      note: r.note ?? null,
    })),
    programs: p.programs.map((program) => ({
      id: program.id,
      name: program.name,
      url: program.url ?? null,
      styleClaimed: program.style_claimed ?? null,
      rows: programRows(p, program),
      coherence: coherenceRows(program),
      transparency: transparencyRows(program),
      accreditation: program.accreditation.map((a) => ({
        body: nl.body[a.body],
        label: a.label_claimed,
        verified: a.verified,
        note: a.note ?? null,
      })),
      cohorts: (program.cohorts ?? []).map((c) => ({
        id: c.id,
        start: c.start,
        status: c.status,
        label: `${formatMonth(c.start.slice(0, 7))} — ${nl.cohortStatus[c.status]}`,
        note: c.note ?? null,
      })),
    })),
    claims: p.claims.map((c) => ({
      id: c.id,
      quote: c.quote, // VERBATIM. Never touch this.
      category: nl.claimCategory[c.category],
      scope: c.scope,
      analysis: c.analysis
        ? {
            note: c.analysis.note,
            status: c.analysis.status,
            reviewed: c.analysis.reviewed,
            methodologyVersion: c.analysis.methodology_version,
          }
        : null,
    })),
    sources: p.sources.map((s: Source) => ({
      id: s.id,
      type: s.type,
      url: s.url ?? null,
      captured: s.captured,
      note: s.note ?? null,
      archivePublic: s.archived_url != null,
      archiveLocal: s.local_snapshot != null,
    })),
    sourcesArchived: p.sources.filter((s) => s.archived_url != null).length,
  };
}
```

Add `import { quadLabel } from "./quad";` to the imports at the top of `presenters.ts`.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx tsx --test src/lib/presenters.test.ts`

Expected: PASS — `# pass 15`, `# fail 0`.

- [ ] **Step 5: Write the record page**

Create `app/aanbieder/[id]/page.tsx`:

```tsx
/**
 * Provider record. Server Component, zero client JS. Statically generated for
 * every provider at build time.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { loadDataset } from "@/lib/dataset";
import { toProviderView, formatMonth } from "@/lib/presenters";
import { Quad } from "@/components/Quad";
import { nl } from "@/lib/strings";
import styles from "./page.module.css";

export function generateStaticParams() {
  const { providers } = loadDataset();
  return providers.map((p) => ({ id: p.id }));
}

export default async function ProviderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { providers, errors } = loadDataset();
  if (errors.length > 0) throw new Error(`Dataset invalid:\n${errors.join("\n")}`);

  const provider = providers.find((p) => p.id === id);
  if (!provider) notFound();
  const v = toProviderView(provider);

  return (
    <main>
      <div className={styles.back}>
        <Link href="/" className={styles.backLink}>{nl.backAll}</Link>
      </div>

      <div className={styles.head}>
        <div className={styles.headTop}>
          <h2 className={styles.name}>{v.name}</h2>
          {v.aka.length > 0 && <span className={styles.aka}>{v.aka.join(" / ")}</span>}
        </div>
        <div className={styles.meta}>
          <span>{v.cityDisplay}</span>
          <a href={v.website} target="_blank" rel="noopener">{v.domain}</a>
          <span>{nl.depthLabel}: {v.depth}</span>
          <span>{nl.lastVerifiedLabel}: {formatMonth(v.lastVerified.slice(0, 7))}</span>
        </div>
        {v.disclosure && (
          <div className={styles.disclosure}>
            <div className={styles.disclosureLabel}>{nl.disclosureLabel}</div>
            <p className={styles.disclosureBody}>{v.disclosure}</p>
          </div>
        )}
      </div>

      {/* Registers */}
      <section className={styles.section}>
        <div className={styles.sectionLabel}>{nl.secRegisters}</div>
        <div className={styles.regRow}>
          <div className={styles.regBody}>CRKBO</div>
          <div><Quad state={v.crkbo.registered} /></div>
          <div className={styles.regNote}>
            {[v.crkbo.holder && `houder: ${v.crkbo.holder}`,
              v.crkbo.register && `register: ${v.crkbo.register}`,
              v.crkbo.checked && `gecontroleerd ${formatMonth(v.crkbo.checked.slice(0, 7))}`]
              .filter(Boolean).join(" · ")}
            {v.crkbo.note && <div className={styles.note}>{v.crkbo.note}</div>}
          </div>
        </div>
        {v.registrations.map((r, i) => (
          <div key={i} className={styles.regRow}>
            <div className={styles.regBody}>{r.body}</div>
            <div><Quad state={r.verified} /></div>
            <div className={styles.regNote}>
              {[r.identifier, r.holder && `houder: ${r.holder}`,
                r.firstRegistered && `sinds ${formatMonth(r.firstRegistered.slice(0, 7))}`]
                .filter(Boolean).join(" · ")}
              {r.note && <div className={styles.note}>{r.note}</div>}
            </div>
          </div>
        ))}
      </section>

      {/* Programmes */}
      <section className={styles.section}>
        <div className={styles.sectionLabel}>{nl.secProgrammes}</div>
        {v.programs.map((prog) => (
          <article key={prog.id} id={`programma-${prog.id}`} className={styles.programme}>
            <h3 className={styles.progName}>{prog.name}</h3>

            {prog.rows.map((row, i) => (
              <div key={i} className={styles.kv}>
                <div className={styles.k}>{row.label}</div>
                <div className={styles.v}>
                  <Quad state={row.state}>{row.value}</Quad>
                  {row.note && <div className={styles.note}>{row.note}</div>}
                </div>
              </div>
            ))}

            {prog.accreditation.length > 0 && (
              <div className={styles.kv}>
                <div className={styles.k}>Accreditatie (geclaimd)</div>
                <div className={styles.v}>
                  {prog.accreditation.map((a, i) => (
                    <div key={i}>
                      {a.body} — “{a.label}” <Quad state={a.verified} />
                      {a.note && <div className={styles.note}>{a.note}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {prog.cohorts.length > 0 && (
              <div className={styles.kv}>
                <div className={styles.k}>Cohorten</div>
                <div className={styles.v}>
                  {prog.cohorts.map((c) => (
                    <div key={c.id}>
                      {c.label}
                      {c.note && <div className={styles.note}>{c.note}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Coherence — six signals, no verdict (spec §7) */}
            <div className={styles.subLabel}>{nl.secCoherence}</div>
            <p className={styles.subNote}>{nl.secCoherenceNote}</p>
            {prog.coherence.map((s) => (
              <div key={s.key} className={styles.kv}>
                <div className={styles.k}>{s.label}</div>
                <div className={styles.v}>
                  <Quad state={s.state} />
                  {s.note && <div className={styles.note}>{s.note}</div>}
                </div>
              </div>
            ))}

            <div className={styles.subLabel}>{nl.secTransparency}</div>
            {prog.transparency.map((s) => (
              <div key={s.key} className={styles.kv}>
                <div className={styles.k}>{s.label}</div>
                <div className={styles.v}><Quad state={s.state} /></div>
              </div>
            ))}
          </article>
        ))}
      </section>

      {/* Claims — verbatim */}
      {v.claims.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionLabel}>{nl.secClaims}</div>
          <p className={styles.subNote}>{nl.claimsNote}</p>
          {v.claims.map((c) => (
            <blockquote key={c.id} className={styles.claim}>
              <div className={styles.quote}>“{c.quote}”</div>
              <div className={styles.claimCat}>{c.category}</div>
              {c.analysis && (
                <div className={styles.analysis}>
                  <div className={styles.analysisLabel}>
                    analyse · {c.analysis.status} · methodologie {c.analysis.methodologyVersion}
                  </div>
                  <p>{c.analysis.note}</p>
                </div>
              )}
            </blockquote>
          ))}
        </section>
      )}

      {/* Sources */}
      <section className={styles.section}>
        <div className={styles.sectionLabel}>
          {nl.secSources} ({v.sources.length} · {v.sourcesArchived} publiek gearchiveerd)
        </div>
        {v.sources.map((s) => (
          <div key={s.id} className={styles.srcRow}>
            <div className={styles.srcKind}>{s.type}</div>
            <div className={styles.srcUrl}>
              {s.url ? <a href={s.url} target="_blank" rel="noopener">{s.url}</a> : s.id}
              {s.note && <div className={styles.note}>{s.note}</div>}
            </div>
            <div className={s.archivePublic || s.archiveLocal ? styles.srcArchive : styles.belowBar}>
              {s.archivePublic || s.archiveLocal
                ? [s.archivePublic && `${nl.archivePublic} ✓`, s.archiveLocal && `${nl.archiveLocal} ✓`]
                    .filter(Boolean).join(" · ")
                : nl.notArchived}
            </div>
          </div>
        ))}
        <p className={styles.pubBar}>{nl.pubBar}</p>
      </section>
    </main>
  );
}
```

**Do NOT route the archive status through `<Quad>`.** It is not a quad value, and
`<Quad state="not_published">` would print *"niet gepubliceerd"* — which says the
**provider** failed to publish something. An unarchived source is the opposite:
it is **our** record sitting below the publication bar. It gets its own class and
its own words (`nl.notArchived` — *"nog niet gearchiveerd"*), and it is marked
rather than hidden, per the spec.

The "only `<Quad>` may colour a quad" rule is intact: this is not a quad.

- [ ] **Step 6: Write the record stylesheet**

Create `app/aanbieder/[id]/page.module.css`:

```css
.back { padding: 36px 0 0; }

.backLink {
  font-family: var(--mono);
  font-size: 12px;
  padding: 5px 12px;
  border: 1px solid var(--ink);
  text-decoration: none;
  background: var(--paper);
}

.backLink:hover { background: var(--ink); color: var(--paper); }

.head { padding: 40px 0 26px; border-bottom: 1px solid var(--ink); }

.headTop { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px 18px; }

.name { margin: 0; font-size: 32px; font-weight: 600; letter-spacing: -0.01em; }

.aka { font-family: var(--mono); font-size: 12px; color: var(--muted); }

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 22px;
  margin-top: 10px;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--ink-2);
}

/* The methodology promises this is shown. It gets a border, not a footnote. */
.disclosure { margin-top: 18px; padding: 14px 18px; border: 1px solid var(--finding); max-width: 720px; }

.disclosureLabel {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--finding);
  margin-bottom: 6px;
}

.disclosureBody { margin: 0; font-size: 15px; line-height: 1.55; }

.section { padding: 38px 0; border-bottom: 1px solid var(--rule); }

.sectionLabel {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 14px;
}

.subLabel {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  margin: 26px 0 4px;
}

.subNote { font-size: 13px; color: var(--muted); font-style: italic; margin: 0 0 10px; }

.regRow {
  display: grid;
  grid-template-columns: 170px 200px 1fr;
  gap: 16px;
  padding: 9px 0;
  border-top: 1px dotted var(--rule-dot);
  align-items: baseline;
}

.regBody { font-family: var(--mono); font-size: 12px; font-weight: 600; }

.regNote { font-family: var(--mono); font-size: 12px; color: var(--ink-2); line-height: 1.5; }

.programme { padding: 18px 0 8px; scroll-margin-top: 24px; }

.progName { font-size: 20px; font-weight: 600; margin: 0 0 10px; }

.kv {
  display: grid;
  grid-template-columns: 210px 1fr;
  gap: 16px;
  padding: 6px 0;
  border-top: 1px dotted var(--rule);
  max-width: 880px;
}

.k {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
  padding-top: 2px;
}

.v { font-size: 14.5px; line-height: 1.5; }

/* Provenance for the fact above it — deliberately quiet. */
.note {
  font-family: var(--mono);
  font-size: 11px;
  line-height: 1.6;
  color: var(--muted);
  margin-top: 4px;
}

.claim { max-width: 780px; margin: 14px 0; padding-left: 18px; border-left: 2px solid var(--ink); }

.quote { font-size: 16.5px; line-height: 1.5; font-style: italic; }

.claimCat {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  margin-top: 6px;
}

/* Layer 3, methodology-versioned — visually separated from the quote. */
.analysis { margin-top: 10px; padding: 10px 14px; background: var(--hover); font-size: 14px; line-height: 1.55; }

.analysisLabel {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 4px;
}

.srcRow {
  display: grid;
  grid-template-columns: 90px minmax(180px, 1fr) 230px;
  gap: 16px;
  padding: 7px 0;
  border-top: 1px dotted var(--rule-dot);
  align-items: baseline;
  max-width: 880px;
}

.srcKind { font-family: var(--mono); font-size: 11px; color: var(--muted); }

.srcUrl { font-family: var(--mono); font-size: 12px; overflow-wrap: anywhere; }

.srcArchive { font-family: var(--mono); font-size: 11px; }

/* Below the publication bar. NOT a quad — this is a statement about OUR record,
   not about the provider. Marked, never hidden. */
.belowBar {
  composes: srcArchive;
  color: var(--finding);
}

.pubBar {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--muted);
  max-width: 780px;
  line-height: 1.7;
  margin: 16px 0 0;
}

@media (max-width: 860px) {
  .regRow, .kv, .srcRow { grid-template-columns: 1fr; gap: 4px; }
}
```

- [ ] **Step 7: Verify in the browser**

Run: `npm test` — expected PASS.

Run: `npm run dev`, then visit `http://localhost:3000/aanbieder/balanzs` and `http://localhost:3000/aanbieder/arhanta-yoga`.

Verify by eye:
1. Clicking a listing row scrolls to the right programme (the `#programma-<id>` anchor).
2. Arhanta shows its **CRKBO note** next to the CRKBO row, and its Wayback-exclusion note next to that source — provenance beside the fact, not aggregated into a findings list.
3. The coherence block shows six rows on every programme; on a programme with no `coherence_signals`, all six read *"nog niet onderzocht"* in grey italic — **not** amber "niet gepubliceerd".
4. Claims render verbatim with curly quotes around them, and nothing has been shortened.
5. Find a provider with an unarchived source and confirm it is **marked**, not hidden.

- [ ] **Step 8: Commit**

```bash
git add src/lib/presenters.ts src/lib/presenters.test.ts app/aanbieder
git commit -m "Add the provider record page

Registers, programmes (with the six coherence signals and the five
transparency quads), verbatim claims, and sources with their archive
status. Notes render beside the fact they annotate — provenance, not a
findings list.

A programme with no coherence_signals renders six gaps, not six
findings: not investigated is not investigated. Disclosure gets a
bordered block, because the published methodology promises it is shown."
```

---

## Task 6: The methodology page

**Files:**
- Create: `app/methodologie/page.tsx`, `app/methodologie/page.module.css`
- Modify: `package.json` (add `marked`)

**Interfaces:**
- Consumes: `content/methodologie.md` (exists, 91 lines, authored in Dutch).
- Produces: the `/methodologie` route.

- [ ] **Step 1: Add the markdown renderer**

Run: `npm install marked`

`marked` is a small, dependency-free markdown parser. The content is our own, authored in-repo and version-controlled, so rendering it with `dangerouslySetInnerHTML` is safe — it is not user input. Do not add a sanitiser for content we wrote ourselves; that would be cargo-culting.

- [ ] **Step 2: Write the page**

Create `app/methodologie/page.tsx`:

```tsx
/**
 * Methodology. Renders content/methodologie.md — the real, authored document,
 * not a summary. This page is the credibility anchor: everything the listing
 * does is justified here.
 */
import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";
import styles from "./page.module.css";

export const metadata = {
  title: "Methode — Yoga-docentenopleidingen",
  description: "Hoe dit onderzoek wordt gedaan: bronnen, vier noteringswaarden, diepteniveaus, wederhoor.",
};

export default function MethodologyPage() {
  const md = fs.readFileSync(path.join(process.cwd(), "content", "methodologie.md"), "utf8");
  const html = marked.parse(md, { async: false }) as string;
  return (
    <main className={styles.prose} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
```

- [ ] **Step 3: Write the stylesheet**

Create `app/methodologie/page.module.css`:

```css
.prose {
  max-width: 680px;
  padding-top: 36px;
}

.prose h1 {
  font-size: 34px;
  font-weight: 600;
  line-height: 1.15;
  margin: 0 0 8px;
}

.prose h2 {
  font-size: 22px;
  font-weight: 600;
  margin: 40px 0 10px;
  padding-top: 20px;
  border-top: 1px solid var(--rule);
}

.prose p {
  font-size: 17px;
  line-height: 1.65;
  color: var(--ink);
  margin: 0 0 18px;
}

.prose strong {
  font-weight: 600;
}

.prose em {
  font-style: italic;
  color: var(--ink-2);
}

.prose hr {
  border: none;
  border-top: 1px solid var(--ink);
  margin: 44px 0 20px;
}

/* The changelog line at the foot. */
.prose hr + p {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--muted);
}
```

- [ ] **Step 4: Verify**

Run: `npm run dev`, visit `http://localhost:3000/methodologie`.

Verify: the full document renders (headings from *Wat dit is* through *Wat hier wel en niet in staat*), the nav "Methode" button links here, and the changelog line renders in mono at the foot.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json app/methodologie
git commit -m "Add the methodology page

Renders the real content/methodologie.md rather than the nine invented
sections the design shipped. This page is what justifies every choice
the listing makes, so it renders the authored document in full."
```

---

## Task 7: Full verification

**Files:** none created — this task proves the whole thing works.

- [ ] **Step 1: The full build gate must pass**

Run: `npm run build`

Expected: `gen-schema` → `validate` (0 errors) → `test` (all pass) → `export-json` → `next build` succeeds, and the build output lists **48 static `/aanbieder/[id]` routes** plus `/`, `/methodologie`, `/qa`.

- [ ] **Step 2: Prove the gate actually gates**

The build must refuse to ship on a broken editorial invariant. Prove it:

```bash
# Temporarily break the quad rule
sed -i '' 's/case "not_published":\n      return "finding";/case "not_published":\n      return "gap";/' src/lib/quad.ts
```

If that `sed` does not apply cleanly, edit `src/lib/quad.ts` by hand: make `not_published` return `"gap"`.

Run: `npm run build`

Expected: **FAIL** at the test step with "THE RULE: not_published and unknown never render identically", *before* `next build` runs.

Now revert: `git checkout src/lib/quad.ts` and re-run `npm run build` — expected PASS.

- [ ] **Step 3: Walk the site**

Run: `npm run dev` and check each in turn:

1. `/` — 77 rows, 48 providers. Sort by *€ / contactuur*: exactly 7 rows show a number, ascending, and they come first.
2. Filter *Uitvoering → online*: 5 rows. (The design would have made these unreachable.)
3. Filter to something impossible (e.g. *online* + *€3.000 en hoger* + a small city) → the empty state with a working **Filters wissen** button.
4. Click a row → lands on the record, scrolled to that programme.
5. `/aanbieder/arhanta-yoga` — CRKBO note beside the CRKBO row; coherence signals present.
6. Find the one provider with a `disclosure` and confirm the bordered block renders: `npx tsx -e 'import {loadDataset} from "./src/lib/dataset"; console.log(loadDataset().providers.filter(p=>p.disclosure).map(p=>p.id))'`
7. `/methodologie` — full document.
8. Anywhere on the site: nothing amber that isn't a `not_published` finding; every "nog niet onderzocht" is grey italic.

- [ ] **Step 4: Confirm the API export is unchanged**

The static JSON API must not have drifted — this work touched no data and no schema.

Run: `git status public/data/v1/providers.json`

Expected: **no change**, or only a `dataCurrentAsOf` change if a record landed. If the file changed structurally, something touched the schema and that violates the plan's global constraints — stop and investigate.

- [ ] **Step 5: Commit anything outstanding and summarise**

```bash
git status
```

Expect a clean tree. If `public/data/v1/providers.json` was regenerated identically, there is nothing to commit.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §3.1 listing / record / methodology | 4 / 5 / 6 |
| §3.2 cuts (toggle, research notes, blog, form) | Not built — by omission, as specified |
| §3.3 notes render beside their fact | 5 (`.note` under each row) |
| §3.4 disclosure, coherence_signals, transparency | 3 (flag), 5 (all three render) |
| §4 three-state quad | 2 (the invariant + its test) |
| §5 architecture, routes | 4, 5, 6 |
| §6 presenter mapping | 3, 5 |
| §7 CSS Modules + tokens + next/font | 2 (tokens), 4 (fonts) |
| §8 error handling — build fails on invalid data | 1 (gate), 4 (page throws) |
| §9 node:test as a build gate | 1 |

**Deviations from the spec, discovered in the data and corrected here:**

1. **`online` is a delivery mode** (5 programmes). The spec inherited the design's `in_person`/`hybrid`-only filter. The filter chips are now *derived from the data*, so no programme can become unreachable. Tested.
2. **Counts.** The design hard-coded "2 of 15"; the real figures are 7 of 77 and will change. Everything is derived via `datasetStats()`. Tested.
3. **City chips.** The design hard-coded Amsterdam/Utrecht/Rotterdam/Den Haag. The dataset holds 44 cities, one of them in Austria. `topCities()` derives the four with the most programmes, ties broken alphabetically for determinism. Tested.
4. **`transparency` exists on only 4 of 77 programmes** and `coherence_signals` on 25. Most render as six/five gaps. This is correct and honest, but it means the record pages will look sparse — expected, not a bug.
