# Public-facing listing — design

**Status:** draft for review
**Date:** 2026-07-11
**Source design:** Claude Design project `7d10d4e7-7d86-4df3-b99e-1fa1e1389588`,
file `Yoga Trainingen Directory.dc.html` (imported via the `claude_design` MCP).
**Relates to:** `data-model-spec.md` v0.2 (unchanged by this work), `CLAUDE.md`.

---

## 1. Purpose

Replace the placeholder `app/page.tsx` with the public site: a filterable,
sortable listing of every programme in the dataset, a provider record page per
provider, and the methodology page. The imported design supplies the visual and
structural language; this spec records where the design is followed, where it is
cut, and where it is extended.

## 2. The governing rule

**The design does not get to invent the data model.** Anything the design shows
that has no home in `src/schema/index.ts` is omitted, not backfilled with a new
field. This spec makes **no change to `data-model-spec.md` and no change to the
Zod schema.** The data model is the constraint; the design is the variable.

Everything below follows from that.

## 3. Scope

### 3.1 In

| Area | Backed by |
|---|---|
| Listing: filters, sort, programme rows | `format_label`, `delivery.*`, `price.*`, `locations[].city`, `crkbo`, `registrations[]`, `cohorts[]`, derived `pricePerContactHour()` |
| Provider record: registers, programmes, claims, sources | `crkbo`, `registrations[]`, `programs[]`, `claims[]`, `sources[]` |
| Provider record: coherence signals, transparency, disclosure | `coherence_signals`, `transparency`, `disclosure` |
| Methodology page | the existing `content/methodologie.md` |

### 3.2 Cut, and why

| Design element | Why it is cut |
|---|---|
| **EN/NL toggle** | Every `note:` in the dataset is Dutch; the design's own NL disclaimer ("record content is maintained in English") is false. NL-only. UI strings live in one module so EN remains a data change, not a refactor. |
| **"Research notes" section** (design's `flags[]`) | No field in the model holds a provider-level sourced finding. Per §2, the section is cut rather than the field invented. |
| **Field notes / blog** (list + article views) | Cut when no content existed. **Superseded 2026-07-16** by `docs/superpowers/specs/2026-07-16-notities-field-notes-design.md` — built as `/notities` once a real content directory, schema and authoring pipeline existed (ships with an honest empty state; posts follow). |
| **Correction form** | `inquiries[]` records inquiries *we sent*; it is not a submission inbox, and a static export has no endpoint. Reduced to a `mailto:` link — chrome, not data. |

### 3.3 Where the notes go instead

The design wanted `flags[]` to aggregate findings into one block. The model
already places each note next to the fact it annotates, so that is where each
renders:

- `crkbo.note` → beside the CRKBO row in **Registers**
- `registrations[].note` → beside that register's row
- `accreditation[].note` → beside the accreditation row on the programme
- `sources[].note` → beside its source
- `price.note`, `hours_claimed.note`, `track_record.note`, `contract.note`,
  `group_size_claimed.note`, `coherence_signals.*_note` → beside their row

This is in-model, in-context, and frames a note as **provenance for a fact**
rather than as a standalone published finding about a named business — which
matters because every record is currently `depth: listed`, and the spec confines
characterisation to the layer-3 `analysis` object (schema §4.6: *"Layer 3 only;
separate from the quote, methodology-versioned"*).

### 3.4 Extensions the design lacks

Three fields exist in the model, are load-bearing in the published methodology,
and appear nowhere in the design. All three render:

- **`disclosure`** — `content/methodologie.md` (§ *Onafhankelijkheid en
  financiering*) promises: *"Zulke banden staan expliciet vermeld bij de
  betreffende vermelding."* Not rendering it would leave the published
  methodology describing a site that does not exist. Renders prominently on the
  provider record, and as a marker on the listing row.
- **`coherence_signals`** — the six checkable signals the methodology devotes a
  full paragraph to (*"registreer ik per opleiding zes controleerbare
  signalen"*). Renders as a six-row table on the programme. No verdict, no
  aggregation — spec §7 is explicit that coherence is a pattern the reader
  weighs, never a field.
- **`transparency`** — the five publication quads. Renders as a compact row;
  supports the methodology's *"de methode beloont publiceren"* point.

## 4. The quad-state rendering rule

This is the core invariant and the reason the styling approach is what it is.

The imported design has a **two**-colour semantic system: ink for verified, amber
for "not published". It has **no treatment for `unknown`**. Shipping that would
render research gaps in the same colour as findings about a provider — the one
collapse `CLAUDE.md` forbids.

So the site renders **three** states, and:

> **The colour encodes how well we know something. It never encodes whether the
> answer is good.**

| Quad value | Meaning | Token | Rendered as |
|---|---|---|---|
| `yes` / `no` | We established it (self-published or register-checked) | `--ink` `#161616` | the value |
| `not_published` | We looked; the provider does not state it — **a finding** | `--finding` `#8A5A00` | "niet gepubliceerd" |
| `unknown` | Not yet investigated — **a gap in our research** | `--gap` `#6E6E68`, italic | "nog niet onderzocht" |

Note the asymmetry, which is deliberate: `--finding` (amber) is the **only**
colour on the page that draws the eye, and `--gap` is *recessive* — the same
muted grey as ordinary chrome, distinguished by italic. That is the correct
editorial weighting. A finding is signal and should be seen; a gap is an absence
in our own work and must never compete with facts for a reader's attention, let
alone read as an accusation against a provider.

`--gap` and `--muted` therefore share a hex value but are **separate tokens**.
They mean different things and may diverge; do not "clean up the duplicate".

Consequences that must hold:

- `accreditation.verified: "no"` ("claimed, not found in the register") is a
  **fact**, so it renders in ink. It is a severe statement, but the words carry
  the severity, not the colour.
- In `coherence_signals`, `yes` is not "good" and `no` is not "bad" —
  `modules_sold_separately: yes` is neutral. Since colour tracks only epistemic
  state, this falls out for free.
- A single `<Quad>` component is the *only* place a quad value becomes pixels.
  Nothing else may colour a quad.

## 5. Architecture

Server-computed view-model, one client island.

```
data/providers/*.yaml
        │
        ▼
src/lib/dataset.ts          ← UNCHANGED. validation + integrity + derived (spec §6)
        │  Provider[]
        ▼
src/lib/presenters.ts       ← NEW. pure: Provider[] → ListingRow[] / ProviderView
        │  serialisable view-model
        ├──────────────────────────────┬─────────────────────────────┐
        ▼                              ▼                             ▼
app/page.tsx (server)      app/aanbieder/[id]/page.tsx    app/methodologie/page.tsx
        │                      (server, 0 client JS)         (server, 0 client JS)
        ▼
ProgrammeTable.tsx ("use client")   ← the only client component: filter + sort
```

- `dataset.ts` is untouched: it already validates, integrity-checks, and computes
  the derived values (`pricePerContactHour`, `contactRatio`, `bundleDelta`,
  `completeness`). Derived values stay computed, never stored (spec §6).
- `presenters.ts` is **pure and side-effect free**: it maps a validated
  `Provider` to display data. It does not fetch, read files, or compute business
  logic that belongs in `dataset.ts`. This is where the design's `priceDisplay` /
  `pphDisplay` / `deliveryLabel` strings come from.
- `strings.ts` holds every NL UI string in one object. No user-facing string is
  inlined in a component.
- Filtering/sorting is in-memory over ~48 providers / ~60 programmes. No index,
  no search library, no server round-trip.
- The provider record and methodology pages ship **zero client JavaScript**.

### 5.1 Routes

| Route | Rendering | Notes |
|---|---|---|
| `/` | SSG, server-rendered rows + client island | listing |
| `/aanbieder/[id]` | SSG via `generateStaticParams()` | the provider record; programmes are anchors `#programma-<program-id>` so a listing row can deep-link to the programme it represents |
| `/methodologie` | SSG | renders `content/methodologie.md` |

Build fails on invalid data — `app/page.tsx` already throws when
`loadDataset()` returns errors, and `npm run build` runs `validate` first. Both
behaviours are kept.

### 5.2 New files

```
src/lib/presenters.ts            Provider → view-model (pure)
src/lib/strings.ts               all NL UI copy, one object
src/components/Quad.tsx          the ONLY quad → pixels mapping
src/components/Quad.module.css
src/components/ProgrammeTable.tsx  "use client" — filter + sort
src/components/ProgrammeTable.module.css
src/components/record/*.tsx      Registers, Programme, Coherence, Transparency,
                                 Claims, Sources (all server components)
app/globals.css                  design tokens as custom properties
app/aanbieder/[id]/page.tsx
app/methodologie/page.tsx
```

## 6. Presenter mapping

Every listing column and record row, and the field it derives from. Anything not
in this table does not render.

### 6.1 Listing row

| Column | Derived from |
|---|---|
| Programme (provider · city, name, style, next cohort) | `name`, `locations[].city`, `program.name`, `style_claimed`, `cohorts[]` |
| Format | `format_label` (`200 \| 300 \| 500 \| other \| none` — descriptive label, never a quality signal, spec §5) |
| Delivery | `delivery.mode` + `.structure` + `.duration_months_min/max` + `.language` |
| Price | `price.amount_eur` + `.vat` + `.variants`, else `<Quad>` of `price.published` |
| € / contactuur | `pricePerContactHour()`; when null, its `caveat` via `<Quad>` |
| Register status | `accreditation[]` — `body` + `label_claimed` + `<Quad>` of `verified` |
| Disclosure marker | `disclosure` present → visible marker |

**Next cohort** takes the earliest `cohorts[].start` at or after the current
month. Its `status` is rendered explicitly — an `announced` cohort is labelled
*aangekondigd*, never presented as one that ran (spec §8).

### 6.2 Filters and sort

Filters: **location + radius** (see §6.4), format (`format_label`), language
(`delivery.language`), delivery (`delivery.mode`), register status
(`crkbo.registered`, `registrations[].verified_in_register`), price
(`price.amount_eur` bands + `not_published`).

Sort: eerstvolgende start (`cohorts[].start`), A–Z, € / contactuur
(`pricePerContactHour()`, nulls last), laatst geverifieerd (`last_verified`),
and — only when a location is entered — afstand.

### 6.3 Location and distance

The design offered a hard-coded four-city chip list (Amsterdam / Utrecht /
Rotterdam / Den Haag / elders). The dataset holds **44 cities**, one of them in
Austria, so the chip list is both wrong and unbounded. It is replaced by the
filter people actually need: a training attended over nine months of weekends is
chosen on travel distance, not on municipality.

**The visitor** enters a Dutch postcode; radius chips offer 25 / 50 / 100 km /
heel NL.

**No provider-schema change.** Coordinates are not a fact *about a provider* —
they are a fact about the Netherlands. `locations[].city` is untouched. Distance
is computed at render from a reference table, and is therefore a derived value:
computed, never stored (spec §6).

Two reference tables live in `src/data/`, generated by `scripts/build-geo.ts`
and committed with their source and retrieval date, exactly as any other source
in this repo:

| File | Rows | Source |
|---|---|---|
| `city-centroids.json` | the provider cities | PDOK Locatieserver (`api.pdok.nl/bzk/locatieserver`) |
| `pc4-centroids.json` | 4,070 | CBS Postcode4 via PDOK WFS (`service.pdok.nl/cbs/postcode4/2023`) |

`pc4-centroids.json` is ~94 KB raw / **32 KB gzipped**, and is **lazy-imported
in the client island only when the visitor actually uses the location filter** —
so it costs nothing for anyone who does not. There is no runtime call to any
third party: the whole lookup is local, which is the same reason the fonts are
self-hosted.

Verified during design: PC4 `7065` → `51.9174, 6.4485` matches the independent
Locatieserver geocode of Sinderen to four decimals.

### 6.4 What distance cannot describe

A radius filter must not silently delete rows it cannot place — that is the same
failure as the design's missing `online` chip. Rows that distance cannot describe
stay visible, **below** the matched rows, under a heading that says why:

| Group | Backed by | Heading |
|---|---|---|
| Distance does not apply | `delivery.mode === "online"` | "online — afstand niet van toepassing" |
| We cannot place them | every `locations[].city` is `null` | "locatie niet vermeld" |

**There is deliberately no "residential" group.** An earlier draft proposed one
(you sleep at the ashram, so distance barely matters), but the schema has no
`residential` field — it would have meant inferring it from
`delivery.structure: "intensive"`, which is precisely the invention §2 forbids.
Residential intensives are therefore distance-filtered like anything else, and
the reader sees `intensief · 1 mnd` in the Uitvoering column and draws their own
conclusion.

A provider with several locations (Balanzs runs the same training in Den Haag,
Utrecht and Rotterdam) matches on its **nearest** location, and the distance
shown is that one.

### 6.5 Provider record

- **Head** — `name`, `aka[]`, `locations[]`, `website`, `depth`, `last_verified`,
  and `disclosure` if present.
- **Registers** — `crkbo` (`registered`, `register`, `holder`, `checked`, `note`)
  and each `registrations[]` (`body`, `identifier`, `holder`,
  `first_registered`, `verified_in_register`, `note`).
- **Programme**, per programme: format, style, delivery, price (incl.
  `includes` / `excludes` — mandatory-but-excluded costs are first-class),
  € / contactuur, hour decomposition (`total`, `contact`, `self_study`, and
  **`supervised_teaching_practice`** — the §5 field whose market-wide emptiness
  is the finding), `assessment_described`, `group_size_claimed`,
  `prerequisites_claimed`, `composition` + `bundleDelta()`, `contract`,
  `track_record`, `cohorts[]` with status, accreditation, **coherence signals**
  (6 quads), **transparency** (5 quads).
- **Claims** — `claims[]`: verbatim `quote` in the source language, plus the enum
  `category`. Never characterised, never paraphrased (spec §3). `analysis` is
  rendered only when present, visually separated, with its
  `methodology_version`.
- **Sources** — `sources[]`: `type`, `url`, `captured`, and archive status
  derived from `archived_url` + `local_snapshot`. `archived_url: null` renders as
  *not yet archived* — marked, not hidden, per the publication bar.

## 7. Styling

CSS Modules + design tokens as CSS custom properties. No Tailwind.

Rationale: the design is a typographic editorial system, not a component system.
Its type scale (10 / 10.5 / 11 / 11.5 / 12 / 12.5 / 14.5 / 16.5 / 17 / 19 / 22 /
28 / 32 / 34 px) sits off any standard scale, and its listing grid is
`minmax(240px, 2.6fr) 0.8fr 1.7fr 1.7fr 1.5fr 1.8fr` — both become arbitrary
values under utility classes. More importantly, a **semantic class** (`.finding`,
`.gap`) enforces §4; a **colour utility** (`text-[#8A5A00]`) does not, and nothing
would stop a gap being styled as a finding.

**Tokens** (`app/globals.css`), taken from the design:

```
/* surface + structure */          /* semantic — quad state (§4) */
--paper:  #FBFBF9                  --ink:     #161616   fact / verified
--ink-2:  #33332F                  --finding: #8A5A00   not_published
--muted:  #6E6E68                  --gap:     #6E6E68   unknown  (+ italic)
--rule:   #E3E2DD
--rule-2: #C9C8C2                  --error:   #B00020
--hover:  #F3F2EE
```

`--muted` (chrome: overlines, column headers, secondary text) and `--gap` (the
quad state) currently hold the same value. They are kept separate on purpose —
see §4.

**Type**: Newsreader (serif, body/headings) + IBM Plex Mono (data, labels,
chrome), loaded with `next/font/google`, which self-hosts at build time. This
drops the design's runtime request to `fonts.googleapis.com` — faster, and no
third-party font request from a Dutch public site (AVG).

## 8. Error handling

- Invalid dataset → `loadDataset()` returns errors → the page throws → the build
  fails. This is existing behaviour and is deliberate: the site refuses to render
  invalid data.
- A missing optional field is not an error — it is a quad state, and renders as
  one.
- A provider with zero programmes renders as a record with no programme rows and
  does not appear in the listing table.

## 9. Testing

The repo had no test runner; `npm run validate` was the only gate. This work
introduces logic that warrants one: `presenters.ts` is pure, and it is where the
§4 editorial invariant is encoded.

**Decided:** adopt `node:test` run via `tsx --test` — no new dependency, both are
already in `devDependencies`. Add `npm test`, and make `npm run build` run it
after `validate`, so the build refuses to ship on a broken editorial invariant
exactly as it already refuses to ship on invalid data.

```json
"test":  "tsx --test src/**/*.test.ts",
"build": "npm run gen-schema && npm run validate && npm test && npm run export-json && next build"
```

Tests are written **test-first** and cover the invariants, not the markup:

1. **The quad mapping is total and injective on state.** `not_published` and
   `unknown` never map to the same class. This is the §4 rule, and it is the
   single most important test in the repo.
2. `unknown` never renders wording that reads as a finding about a provider.
3. `pricePerContactHour()` nulls sort **last** under the €/contactuur sort, never
   first — a programme that publishes no hours must not top a price ranking.
4. A cohort with `status: announced` is never labelled as one that ran (spec §8).
5. A provider with `disclosure` set always renders it (the methodology's promise).
6. Presenters are pure: the same `Provider` always yields the same view-model,
   and no presenter mutates its input.

`CLAUDE.md` must be updated: the line *"There is no test runner, linter, or
single-test command — `npm run validate` is the gate"* is no longer true.

## 10. Out of scope / deferred

- EN locale (the strings module makes it additive).
- Research-notes findings — needs a decision on whether a `research_notes[]`
  field or a public marker belongs in the spec. Deliberately not decided here.
- Field notes / blog. **Superseded 2026-07-16** — built as `/notities`; see `docs/superpowers/specs/2026-07-16-notities-field-notes-design.md`.
- A real correction workflow with an endpoint.
- Rendering `people[]`, `inquiries[]`, `assessment` (layer 3) — no record is at
  `depth: assessed` yet.

## 11. Open questions

None. §9 (adopting `node:test`) was confirmed 2026-07-11.
