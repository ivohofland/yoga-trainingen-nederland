# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An independent, factual directory of yoga teacher trainings in the Netherlands.
It is run as a **publication, not a database** — verbatim claims, mandatory
sources, archived evidence, and a published methodology are first-class
concerns. The editorial stance is encoded directly in the data model; respect
it when editing data or code.

The repo has two halves:
- **Specs & research at the root** — `data-model-spec.md` (the source of
  truth for the model), `project-decisions.md` (decision log), `enumeration/`
  (the provider-universe candidate list + method), `pilot/` (the original
  pilot records and findings).
- **The application in `yoga-trainingen-directory/`** — a Next.js (App Router,
  SSG) site plus the Zod schema, validation, archiving, and JSON-export
  tooling. All `npm` commands run from inside this subdirectory.

## Commands

All commands run from `yoga-trainingen-directory/`:

```bash
npm install
npx playwright install chromium   # once, only needed for the archive script
npm run validate          # parse + integrity-check every record; run after EVERY edit to data/
npm run dev               # local site on :3000
npm run build             # runs validate first, then next build — refuses to build on invalid data
npm run export-json       # writes the validated dataset to public/data/v1/providers.json (this is the API)
npm run archive -- --all  # local snapshots + Wayback for sources missing them (run locally; needs network + chromium)
```

There is no test runner, linter, or single-test command — `npm run validate`
is the gate that everything passes through.

Archive script flags: `npm run archive -- <provider-id> [...ids]`,
`--all`, `--force` (re-archive sources that already have a copy),
`--skip-wayback`. Wayback API keys (`WAYBACK_ACCESS_KEY`/`WAYBACK_SECRET_KEY`,
or via `.env`) make submissions reliable; without them it falls back to the
rate-limited public save URL.

## Architecture

**The spec is the source of truth.** `data-model-spec.md` (currently v0.2)
defines the model; `src/schema/index.ts` (Zod) mirrors it. **Change the spec
first, then the schema.** The schema's inline comments cite the spec sections
(`§N`) and explain *why* each field exists — read them before changing a field.

**Data is files-in-git, one YAML per provider.** `data/providers/<id>.yaml`,
where `<id>` (a kebab-case slug) is the brand name and must match the filename.
The brand name is the canonical identifier; register entities (CRKBO holder,
KvK legal name, YA registration holder) are *data about* the brand, because
registrations are frequently held under a different BV/holding/person name.

**The load pipeline** is `src/lib/dataset.ts`:
1. parses each YAML, validates against the `Provider` Zod schema;
2. runs **referential-integrity checks** beyond what Zod can express — every
   `source:` ref must exist in `sources[]`, `composition.modules` must point at
   real modules, nested cohorts' `program` field must match the parent, claim
   `scope` (`program:<id>` / `module:<id>`) must resolve;
3. exposes **derived values** (`pricePerContactHour`, `contactRatio`,
   `bundleDelta`, `completeness`). Derived values are computed here and
   **never stored** (spec §6) — if you find yourself adding a computed field to
   a YAML record, it belongs in this module instead.

**Views and the API are both consumers of one dataset.** `app/page.tsx` is the
listing view (Server Component, calls `loadDataset()` directly; throws if the
data is invalid). `export-json.ts` writes the same validated data to a
static, versioned `public/data/v1/providers.json` — designed so a future
frontend under a different brand can consume it without touching this repo.
The `@/*` path alias maps to `src/*`.

## Editorial conventions that the model enforces

These are not style preferences — they are the point of the project. Violating
them silently corrupts the dataset's credibility.

- **Quad-state fields** (`yes | no | not_published | unknown`): `not_published`
  = "we looked, they don't publish it" (a publishable *finding*); `unknown` =
  "not yet investigated" (a *gap*, never rendered as a finding). Never collapse
  the two. A negative finding stays `unknown` until verified — see the
  enumeration notes on Yogapoint/Delight.
- **Claims are quoted verbatim, never characterized** (legal posture, spec §3).
  Claims are stored as claims with a mandatory `source`, never as facts. Any
  analysis of a claim lives in a separate, methodology-versioned `analysis`
  sub-object (layer 3 only).
- **Every cohort needs `status` + `source`** — an announced cohort is not a
  cohort that ran; recording one as if it ran is the central trap (spec §8).
- **No composite scores. Anywhere.** Assessments have per-axis sub-scores by
  design and there is deliberately no field where a total could live (spec §4.8).
- **Archive before citing critically** — ALWAYS both a public archive (Wayback,
  or archive.today for Wayback-excluded domains) AND a local copy in
  `data/archives/`. Public archives can be retroactively withdrawn by the site
  owner; local copies (dated by git) cannot. JS-heavy pages (e.g. Yoga Alliance
  registers are Salesforce-rendered) need the browser-rendered local capture —
  Wayback stores only an empty shell, so it's skipped for those domains.
- `depth` (`listed | reviewed | assessed`) states honestly how far a record has
  been taken; `archived_url: null` means a source is consciously not yet
  archived, and such records do not meet the publication bar.
