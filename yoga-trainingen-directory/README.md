# Yoga Trainingen Directory

Independent, factual directory of yoga teacher trainings in the Netherlands.
One dataset, multiple views — see `../data-model-spec.md` (v0.2) for the full
data model and the reasoning behind it.

## Architecture

- **Data** lives in `data/providers/*.yaml` — one file per provider (brand name
  = canonical identifier; one record can hold programs, modules, cohorts,
  claims, inquiries).
- **Schema** is `src/schema/index.ts` (Zod). The spec is the source of truth;
  change the spec first, then the schema.
- **Validation**: `npm run validate` — parses every record, checks referential
  integrity (source refs, module refs, cohort nesting, claim scopes), and
  prints derived values. `npm run build` refuses to build on invalid data.
- **Views**: Next.js (App Router, SSG). `app/page.tsx` is the listing view.
- **API**: `npm run export-json` writes the validated dataset to
  `public/data/v1/providers.json` — static, versioned, consumable by a future
  frontend under a different brand without touching this repo.

## Working on records

```bash
npm install
npx playwright install chromium   # once, for the archive script
npm run validate          # after every edit to data/
npm run archive -- --all  # local copies + Wayback for sources missing them (run locally)
npm run dev               # local site on :3000
```

The archive script renders each source URL with headless Chromium (full-page
PDF + HTML + SHA-256 into `data/archives/<provider>/`), submits it to Wayback
Save Page Now, and writes `archived_url`/`local_snapshot` back into the
record. Wayback API keys make submissions reliable: free archive.org account →
https://archive.org/account/s3.php, then `cp .env.example .env` and fill in
the keys (`.env` is gitignored). Without keys the script falls back to the
public save URL (rate-limited). Wayback-excluded domains are skipped with a
reminder to use archive.today manually.

Conventions that matter (spec §2):

- Quad-state fields: `yes | no | not_published | unknown`. `not_published` =
  we looked, they don't say (publishable finding). `unknown` = not yet
  investigated (renders as gap, never as finding).
- Quote claims verbatim; never characterize.
- Every cohort needs `status` + `source` — announced ≠ ran.
- Archive before citing critically, ALWAYS both: public archive (Wayback, or
  archive.today for Wayback-excluded domains) AND a local copy in
  data/archives/. Public archives can be retroactively withdrawn by the site
  owner (Arhanta proved it); local copies can't, and git dates them. JS-heavy
  pages (YA registers are Salesforce-rendered) need browser-rendered local
  capture — Wayback stores an empty shell.
- No composite scores. Anywhere.

## Status

- 5 pilot records (depth: `listed`), validated.
- Provider universe: `../enumeration/providers-enumeration.csv` (94 candidates).
- Pre-publication deliverables still open: methodology page v0.1,
  complaints/correction procedure (see `../project-decisions.md`).
- `archived_url: null` everywhere — records do not yet meet the publication
  bar until the archiving pass is done.
