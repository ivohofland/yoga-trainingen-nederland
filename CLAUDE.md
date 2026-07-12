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
npm run build             # gen-schema → validate → test → export-json → next build; refuses to build on invalid data
npm run export-json       # writes the validated dataset to public/data/v1/providers.json (this is the API)
npm run archive -- --all  # local snapshots + Wayback for sources missing them (run locally; needs network + chromium)
npm test                  # unit tests (node:test); locks the quad/editorial invariants
```

`npm test` runs the unit tests (`node:test` via `tsx --test`, no extra
dependency). There is no linter. Both `validate` and `test` are build gates —
`npm run build` runs them in order and refuses to build if either fails.

The tests exist to lock the *editorial* invariants, not to chase coverage. The
one that matters most is in `src/lib/quad.test.ts`: `not_published` (a finding)
and `unknown` (a gap) must never render identically. `src/components/Quad.tsx`
is the only place a quad value becomes pixels — keep it that way.

Archive script flags: `npm run archive -- <provider-id> [...ids]`,
`--all`, `--force` (re-archive sources that already have a copy),
`--skip-wayback`. Wayback API keys (`WAYBACK_ACCESS_KEY`/`WAYBACK_SECRET_KEY`,
or via `.env`) make submissions reliable; without them it falls back to the
rate-limited public save URL.

## Architecture

**The spec is the source of truth.** `data-model-spec.md` (currently v0.5)
defines the model; `src/schema/index.ts` (Zod) mirrors it. **Change the spec
first, then the schema.** The schema's inline comments cite the spec sections
(`§N`) and explain *why* each field exists — read them before changing a field.

**Data is files-in-git, one YAML per provider.** `data/providers/<id>.yaml`,
where `<id>` (a kebab-case slug) is the brand name and must match the filename.
The brand name is the canonical identifier; register entities (CRKBO holder,
KvK legal name, YA registration holder) are *data about* the brand, because
registrations are frequently held under a different BV/holding/person name.

**The load pipeline is split by purity, and the split is load-bearing:**

- `src/lib/loader.ts` — **the only impure module.** `node:fs`, YAML parsing,
  Zod validation, and the **referential-integrity checks** beyond what Zod can
  express: every `source:` ref must exist in `sources[]`, `composition.modules`
  must point at real modules, nested cohorts' `program` field must match the
  parent, claim `scope` (`program:<id>` / `module:<id>`) must resolve.
- `src/lib/derive.ts` — the **derived values** (`totalPrice`,
  `pricePerContactHour`, `contactRatio`, `bundleDelta`, `isMultistyle`,
  `completeness`, `providerQa`). Computed, **never stored** (spec §6) — if you
  find yourself adding a computed field to a YAML record, it belongs here instead.
- `src/lib/rules.ts` — **the finding-vs-gap rule** (`priceQuad`, `pphQuad`,
  `missingBecause`, `publishedQuad`, `priceBand`, `pphBlocker`). What any surface
  is ALLOWED to say about a value our record does not hold. Stated once, here.
- `src/lib/presenters.ts` — display only: the strings a component renders.

`derive.ts`, `rules.ts`, `quad.ts` and `presenters.ts` **must import nothing
from `node:*`.** That is not tidiness. When the rule lived behind `node:fs`, the
JSON API could not import it, so it shipped the raw records — and any consumer
rendering `price.published` reconstructed the bug the site had just fixed.
The rule must stay reachable by the server pages, the client filter island, and
`export-json.ts` alike.

**Views and the API are all consumers of one dataset, and of one rule.**
`app/page.tsx` is the listing view (Server Component, calls `loadDataset()`
directly; throws if the data is invalid). `export-json.ts` writes the same
validated data to a static, versioned `public/data/v1/providers.json` —
designed so a future frontend under a different brand can consume it without
touching this repo. The `@/*` path alias maps to `src/*`.

**The export ships a `derived` block per programme** (`price_state`,
`price_band`, `total_price`, `pph`, `pph_state`, `contact_ratio`,
`bundle_delta`, `multistyle`), built in `src/lib/api.ts` by the same functions
the site renders from. **Consumers must read `derived.price_state`, never the raw
`price.published`** — a programme can carry `published: "yes"` with no
`amount_eur` (they publish a price; we have not captured it — five once did, one
still does), and rendering the raw field states a bare "ja" as established fact
about a named business. Likewise **`derived.total_price`, never the raw
`price.amount_eur`**, for anything that compares or ranks (see below).
Derived values are computed **at export** and are still never stored in `data/`:
spec §6 holds — the export is a *rendering* of the records, not the source of
truth. A test pins `derived.price_state` to what the listing and the record page
render, for every programme.

## Editorial conventions that the model enforces

These are not style preferences — they are the point of the project. Violating
them silently corrupts the dataset's credibility.

- **Quad-state fields** (`yes | no | not_published | unknown`): `not_published`
  = "we looked, they don't publish it" (a publishable *finding*); `unknown` =
  "not yet investigated" (a *gap*, never rendered as a finding). Never collapse
  the two. A negative finding stays `unknown` until verified — see the
  enumeration notes on Yogapoint/Delight.
- **`hours_claimed` asks about the breakdown TWICE, and the two answers differ**
  (spec §4.3, v0.4). `breakdown_published` = do they break the total down *at
  all*? `contact_published` = do they publish the **contact-hour figure
  specifically** — the number `pricePerContactHour` needs? Both are required on
  every programme, and both directions occur: three providers publish a rich
  breakdown by *subject*, by *delivery mode*, or in *ranges* with no contact
  figure in it (`breakdown_published: yes` + `contact_published: not_published`);
  two publish the contact figure and nothing else (the reverse). **`pphBlocker`
  blocks on `contact_published`** — the field that stops a derivation is the
  field we must cite when we say why. Do not "simplify" it back to one quad: one
  quad for two questions is what made the site call its most transparent schools
  un-investigated. `supervised_teaching_practice` is still governed by
  `breakdown_published` (there is no `supervised_published`).
- **`price.amount_eur` buys what `price.period` says it buys, and the whole-course
  total is DERIVED** (spec §4 `price`, §6 `total_price`, v0.5). `period` defaults to
  `total` — 53 of 54 priced programmes — which is exactly why the exception was
  invisible: de Blikopener publishes **€ 1.290 per studiejaar** over a four-year, 500-hour
  opleiding and no total at all, and a bare `amount_eur` ranked them 3rd cheapest of 54
  trainings when the training costs ≈ € 5.260. `periods` = how many periods make the
  whole training; `null` = they do not publish it, and then **there is no comparable
  total**: the programme is banded nowhere and ranked nowhere (`priceBand →
  `no_comparable_total``). **Price bands, price sorting and €/contactuur all consume
  `totalPrice()`, never `amount_eur`.** The total is never stored — storing `4 × 1290`
  would publish a figure the provider never stated, resting on a price stability their
  own "(vanaf 1 juni 2026)" denies — and it renders **visibly as ours**, with the working
  shown ("± € 5.160 totaal — onze berekening: 4 × € 1.290"), never in the ink of a
  provider claim. `excludes` is never added into it: it is free text and cannot be summed.
- **A BTW treatment is observed, never inferred** (spec §4.11, §10). `vat: exempt_crkbo`
  requires a page that SAYS so. Deducing the exemption from the school's CRKBO
  registration is forbidden in as many words, and two records carried exactly that
  deduction, cited to pages that mention no BTW at all (both now `unknown`). The
  provenance check enforces it: `incl`/`excl`/`exempt_crkbo` must cite a source whose
  archived artifact mentions BTW.
- **Claims are quoted verbatim, never characterized** (legal posture, spec §3).
  Claims are stored as claims with a mandatory `source`, never as facts. Any
  analysis of a claim lives in a separate, methodology-versioned `analysis`
  sub-object (layer 3 only). **A `claim.quote` stores the provider's words and no
  delimiters** — the record page supplies the quotation marks, so a value stored
  as `"…"` renders doubled. `integrityErrors()` rejects a quote that both opens
  and closes with a quote mark; the renderer never edits a quote to compensate,
  because a renderer that may edit verbatim text is the thing §3 forbids.
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
- **Cite the page that STATES the fact — never the page that links to it. If it is
  not captured, capture it.** A `source` is not a pointer to the provider; it is the
  evidence for one field. Four records carried `price.published: "yes"` citing an
  overview page with no € on it anywhere, while the rates page / the enrolment page /
  the linked datakosten PDF that actually stated the price was never sourced and
  never archived — so the archive, which is the whole evidentiary basis here, held
  nothing behind the claim. The record looked perfect; only the ARTIFACT could tell.
  The order is therefore: find the page that states it → add it to `sources[]` →
  **archive it** → extract the value FROM THE CAPTURED FILE. Never from a search
  summary, never from memory. `src/lib/provenance.ts` enforces this for the **price,
  the hours total and the BTW treatment** (warning in `npm run validate`, counted on
  `/qa`, strict in `npm run provenance`); a linked PDF is exactly the artefact a
  provider can silently replace, so it gets its own `Source` with its own capture.
  The check searches the **visible text** of the HTML (scripts, styles and tags
  stripped): an hours figure matched against raw markup is a `font-weight:500`
  vouching for a claim about a named business. Its open findings are triaged in
  `technical-todo.md` and pinned in `provenance.test.ts` so the count cannot grow
  unnoticed.
- **The JS-rendered-price trap: search BOTH artifacts.** Each source is captured as
  `<id>-<date>.html` (raw DOM) *and* `<id>-<date>.pdf` (browser-rendered). Neither
  alone is evidence: 3 providers' prices exist ONLY in the PDF (injected by a JS
  add-to-cart widget after load, so the saved DOM never contains them) and 7 exist
  ONLY in the HTML (print CSS and lazy sections drop them from the PDF render). This
  is the same trap as the Salesforce-rendered YA registers — *a stored page is not
  the page a reader saw* — and it is why the provenance check reads both and passes
  on either. Use `pdftotext` for the PDFs; `strings` cannot read compressed PDF text
  streams and will happily "find" a price in binary noise.
- **Archive bodies are NOT published; their hashes are.** This repo is public.
  `data/archives/**/*.pdf|*.html` are gitignored — they live on disk and in the
  private, git-dated archive repo (`yoga-trainingen-archief`). The `.sha256`
  beside each one IS committed, and proves the snapshot exists and is unaltered
  without republishing a provider's copyrighted page. Quoting verbatim is
  citaatrecht (Art. 15a Aw); mirroring a whole brochure is not. See
  `data/archives/README.md`. Commit new bodies to the private repo so git keeps
  dating them — that dating is what gives them their weight.
- `depth` (`listed | reviewed | assessed`) states honestly how far a record has
  been taken; `archived_url: null` means a source is consciously not yet
  archived, and such records do not meet the publication bar.
