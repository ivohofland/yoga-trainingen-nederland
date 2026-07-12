# Technical TODO

*Engineering work only — data extraction, enumeration, and editorial tasks live
in `project-decisions.md` and the READMEs. Items reference the spec (`§N`) and
the decision log (`#N`) where relevant.*

## Publication features (gate first launch)

These are required by the project's own decisions before any critical/assessed
content can go live, and the code to render them does not exist yet.

- [ ] **Render the methodology page.** `content/methodologie.md` exists but no
  route serves it. Decision #5 makes it a founding deliverable that must be
  public before the first critical content; the schema's `methodology_version`
  points at it. Add a route that renders the markdown.
- [ ] **Provider detail pages.** Only the listing (`app/page.tsx`) exists. A
  detail view per provider needs to render: claims *verbatim* with their
  sources, the full §5 hour decomposition (incl. `supervised_teaching_practice`
  emptiness as a finding), quad-state fields as findings vs gaps, and the
  `coherence_signals`.
- [ ] **Sources + archive links in the views.** Transparency is the product
  (decision #6/#8). Render each `source` with its `archived_url` and
  `local_snapshot`, and surface `archived_url: null` as "not yet archived"
  rather than hiding it.
- [ ] **Disclosure rendering.** The schema has `provider.disclosure`
  (author–provider relationship); the methodology promises it's shown
  prominently on the listing. Currently unrendered.
- [ ] **"Meld een fout" / correction route.** Decision #7: a lightweight
  correction channel whose validated reports enter the dataset as a
  `reader_report` source. Needs a public form/route + an intake path into
  `data/`.
- [ ] **Complaints/correction procedure page.** Decision #3 — operate like a
  publication from day one; this page precedes publication.
- [ ] **Public per-record change history from git.** Decision #7 wants the git
  history of each `data/providers/<id>.yaml` shown publicly as a trust feature.
- [ ] **Inquiry / right-of-reply display.** Schema models `inquiries` with
  `response: "none"` as defensible silence after the window; no view renders it.

## Build pipeline & data integrity

- [x] **Wire `export-json` into the build.** Now chained into `build`
  (`validate && export-json && next build`) so the static API can't drift.
  Currency is derived from the data (`data_current_as_of` = max `last_verified`)
  instead of build time, so unchanged data rebuilds byte-identically.
- [x] **CI on push.** `.github/workflows/validate.yml` runs `npm run validate`
  on every push and pull request.
- [ ] **Publication-bar check.** Encode the rule that a record above
  `depth: listed` (or anything published critically) must have non-null
  `archived_url` on its cited sources — surface it as a validate-time warning,
  not just prose in the README.

## Authoring & QA tooling

The deliberate position (see *Decisions* below) is **no general admin/edit UI** —
records stay files-in-git. These items make that workflow fast and safe instead.

- [x] **Editor schema validation.** `scripts/gen-schema.ts` generates
  `data/provider.schema.json` from the Zod schema (wired into `build`,
  deterministic so it can't drift); each `data/providers/*.yaml` references it
  with a `# yaml-language-server: $schema=` header for autocomplete, quad-state
  enum hints, and inline validation. New record files should start with the same
  header line.
- [x] **Read-only QA / review dashboard.** `providerQa()` in `dataset.ts` +
  the `/qa` route surface, per record, open `unknown` gaps, unarchived sources,
  completeness, depth, and `last_verified` age — most-incomplete-first. Never
  writes.

## Research debt

*Not engineering: named, actionable extraction work that the records themselves
already admit to. Each item below is a record whose `price.published: yes` is
**cited against a source that does not evidence it** — the overview page we
captured carries no € amount at all, and the page that does carry the price was
never captured and never archived. `published: yes` is CORRECT (they do publish a
price); the amount and its source are missing from our record, and each
`price.note` now says so in as many words. Until these are done, the price on
these is our gap, never a finding about them.*

The fix for each: read the page that carries the price, add it to that record's
`sources[]` (with `captured`), archive it (`npm run archive -- <id>` — public +
local, per the publication bar), set `price.amount_eur` (cheapest
generally-available variant, per the §4 convention) or `variants[]`, set `vat`
where the page states it, and trim the note back to what is still true.

**The class of bug is now caught automatically** — `src/lib/provenance.ts` opens the
archived artifacts of every cited price source and warns (in `npm run validate`, on
`/qa`, and strictly in `npm run provenance`) when they contain no amount at all. It
found exactly these records. Four are done; the list below is what it still finds.

- [x] **`aalo-yoga-academie/yin-yang-ryt200`** — lesgeld € 2.988,- (€ 2.838,60 bij
  eenmalige betaling, 5% korting) + **examengeld € 553,-** apart; sourced +
  archived as `site-yin-yang-2026-07`.
- [x] **`aalo-yoga-academie/yin-ryt200`** — same lesgeld, but **examengeld € 435,-**:
  same price, different mandatory extra. Sourced + archived as `site-yin-2026-07`.
- [x] **`de-blikopener/hatha-raja-opleiding`** — € 1.290,- **per studiejaar** (no total
  is published anywhere). Sourced + archived as `tarieven-2026-07`. **Resolved in spec
  v0.5**: `price.period: per_year` + `periods`, the total DERIVED and shown as ours;
  the opleidingspagina (`opleiding-2026-07`, now sourced + archived) gave the hours and
  the two trajects, so the record is now **two programmes** (500 u / 4 jaar and 372 u /
  3 jaar). `vat` → **`unknown`**: the rates page states no BTW at all and §4.11 forbids
  inferring the exemption from the CRKBO registration.
- [ ] **`sanayou/200-online`** — modular online, 3 routes; prices are per
  module/traject on the **module-/inschrijfpagina's** (`site-online-2026-06` = the
  overzicht, which prices the OTHER two routes — which is why the provenance check
  passes it: it is page-level, not fact-level). Needs a decision on the comparable
  base across the 3 routes as well as the extraction.
- [x] **`yoga-academie-nederland/300-hatha-verdieping`** — € 5.095,- from the linked
  datakosten PDF, sourced + archived as `datakosten-pdf-2026-07` (Wayback refused it
  on the day — daily limit for that resource type — so `archived_url: null`; the local
  copy + SHA-256 stands, and the submission must be retried). All 8 module prices
  came from the same PDF, so `bundleDelta` now computes: **−€ 775,-** (bundle below
  the sum of its parts).

### Provenance audit, spec v0.5 — hours and BTW (6 open)

*The provenance check now runs over three claims, not one: the PRICE, the HOURS total,
and the VAT treatment (`src/lib/provenance.ts`; warning in `npm run validate`, counted
on `/qa`, strict in `npm run provenance`). Widening it found six citations that the
archived artifact does not carry. **Every one of these is a defect in OUR sourcing, not
a finding about the provider** — the record cites a page that does not state the thing
it is cited for. Triage, do not bulk-fix: each needs a human to find the page that DOES
state it, archive that page, and re-point the citation. Pinned in `provenance.test.ts`
(`KNOWN_FINDINGS`), so the count cannot grow unnoticed.*

### The corpus sweep (all 48 records) — and the ONE distinction that matters

*Run over every record: **170 claims examined, 0 skipped** (all snapshot bodies present
locally), of which **72 are a stored `hours_claimed.total`**. Both hours findings are now
closed, and they closed for **opposite reasons**. That split is the whole point, and it
cannot be guessed from the YAML — only from the archive:*

- **(a) A SOURCING ERROR** — the school **does** publish the figure, on a page we never
  captured or never cited. The record is right; our citation was pointing at the wrong
  page. → *Find the page, archive it, cite it.*
- **(b) A STORED SUM** — the school **does not** publish the figure; we computed it and
  stored it in a field that renders as their claim. → *Stop storing it* (§6, principle 9:
  derived values are never stored).

**Hours — (a) sourcing errors** (1, fixed)

- [x] **`wahe/500-pathway`** — **the 500-hour route is real; our sourcing was wrong.** The
  figure was flagged because the cited overview page never prints "500" — but Wahé markets
  the stacked route explicitly, on `https://wahe-by-gitty.nl/yoga-alliance/`, a page we had
  never captured: *"Samen vormen de 200-uurs basisopleiding en de 300 uur aan
  verdiepingsmodules een totaal van 500 uur opleiding, wat voldoet aan de eisen voor
  registratie op het 500-uurs niveau bij Yoga Alliance."* Archived as
  `site-yoga-alliance-2026-07` (Wayback + local); `hours_claimed` and `accreditation` now
  cite it, the sentences are in `claims[]` **verbatim**, and `composition.modules` lists
  the four components the school itself names (200 + 150 + 100 + 50). `total: 500` is
  therefore **their published claim**, not our sum. `label_claimed` was *"RYS 500
  (YA-leerroute, gestapeld uit de losse opleidingen)"* — half our characterisation, in a
  field that exists to hold the school's words; it is now the school's own phrase
  (*"registratie op het 500-uurs niveau bij Yoga Alliance"*), with our commentary moved to
  `note`.
  **A real finding fell out of it:** of the four components, three (200u Vinyasa, 150u
  Yin/Lunar, 100u Restorative) have their own opleidingspagina with dates and enrolment;
  the **50u Filosofie, Pranayama en meditatie** module has none — the overview page files
  it under *"Coming:"* and publishes no dates and no price. **The published 500-hour route
  is currently not completable: 450 of the 500 hours are bookable.** Stated as fact in
  `hours_claimed.note`, not as characterisation.

**Hours — (b) stored sums** (1, fixed)

- [x] **`de-yogaschool-enschede/docentenopleiding-raja`** — **confirmed against every
  artifact this provider has: the string "600" appears ZERO times.** The page states
  *"De opleiding neemt drie jaar of 360 uren in beslag. Daarnaast is er minimale zelfstudie
  van 240 uur."* — they publish 360 and 240, separately, and **never their sum**. The 600
  was OUR arithmetic, stored in a field that renders as the school's claimed total.
  `hours_claimed.total` → **`null`**; `contact: 360` and `self_study: 240` stay (those ARE
  published and sourced), and the note now says plainly that the school publishes no
  combined total.
  **Consequence, and it is a real one:** the reader now sees **no total** for this
  programme. A derived `total_hours` — same shape as v0.5's derived `total_price` for
  `de-blikopener` (computed in `derive.ts`, rendered *visibly as ours*, never stored) —
  would restore it honestly. **Not done here: a deliberate follow-up decision, not a
  drive-by.**

*No other stored hours total in the corpus fails the check: the remaining 70 all appear,
as printed figures, on the page they are cited to.*

### BTW cited to a page that never mentions BTW (3 open)

*§4.11: a VAT treatment is **directly observed or it is not known** — it may never be
inferred from a CRKBO registration, from the invoicing entity, or from a sibling
programme's page. The same (a)/(b) logic applies, and the archives settle three of the
four. `vat: unknown` is the honest value for (b) — that is what the two records corrected
in v0.5 (`de-blikopener` ×2, `yogatreat/200-functional-yin`) now carry.*

**(b) Inferred, never observed — the VAT twin of a stored sum.** Both records' own notes
admit the inference in as many words. Neither needs a live page to fix: the fix is to stop
asserting. *(Left as data changes for the maintainer to sign off — this sweep only
classified them.)*

- [ ] **`adhouna/200-multistyle`** — `vat: incl`, cited to `site-multistyle-2026-06`. That
  page publishes **no price at all** for this programme, and mentions no BTW. The `incl`
  is carried over from a **different programme's** page (Yin XL, which does state *"€
  1.420,00 incl. BTW"*). No archived artifact states this programme's VAT. → `unknown`.
- [ ] **`yoga-den/500-pathway`** — `vat: incl`, cited to `site-ytt-overview-2026-06`. The
  note infers it outright: *"zelfde btw-belaste entiteit (Yoga Den B.V., niet-CRKBO)"* —
  precisely the inference §4.11 forbids. **No Yoga Den artifact mentions BTW anywhere.**
  → `unknown`.

**Cannot be settled from the archive — needs a live re-check** (not done here: this task
fetched live pages only for `wahe` and `de-yogaschool-enschede`).

- [ ] **`yoga-den/200-vinyasa`** — `vat: incl`, cited to `site-ytt-200-2026-06`. The record's
  note claims the page *"vermeldde 'Pricing incl. VAT'"* (past tense), but **no Yoga Den
  artifact contains the string** — and this is not a partial capture: the cited page's
  pricing block IS fully captured (*"Pricing"*, *"Investment: €3597"*) and carries no VAT
  wording beside it. Either the page changed after it was read, or the wording was never
  there. **Our note and our archive contradict each other**, and only the live page can say
  which is right: re-check → if the wording is there, this is **(a)** (recapture + re-cite);
  if not, it is **(b)** (→ `unknown`).

## Code health

- [ ] **Linter + formatter.** No ESLint/Prettier config exists. Add `next lint`
  (eslint-config-next) and a formatter before the view layer grows.
- [ ] **Unit tests.** There is no test runner. The derived-value functions in
  `src/lib/dataset.ts` (`pricePerContactHour`, `contactRatio`, `bundleDelta`,
  `completeness`) and the referential-integrity checks (`integrityErrors`) are
  pure and the highest-value things to lock down with tests — they encode
  methodology rules (e.g. incomplete inputs → `null`, never a guessed number).
- [ ] **Styling approach.** Views use ad-hoc inline styles. Pick a convention
  (CSS Modules / a small token set) before building the detail pages so the
  publication has a consistent, accessible presentation.

## SSG / SEO for a publication

- [ ] Per-page metadata, a sitemap, and `robots` — it's a static publication
  meant to be found and cited; only the root `layout.tsx` sets metadata today.

## Decisions

- **No general admin/edit interface.** Considered and declined. Files-in-git is
  a deliberate architectural choice (spec §1) and the git history is itself a
  trust feature (decision #7) — a GUI editor would sit on top of git rather than
  replace it, and risks noisy commit history. The real bottleneck is research
  (sourcing, archiving, verbatim quotes), not data entry, so an editor wouldn't
  move the needle, and it's a large surface to maintain on a hobby project
  (decision #4). The value is captured instead by *editor schema validation* and
  the *read-only QA dashboard* above. The one editing UI worth building is the
  narrow **"Meld een fout" intake** for outside corrections (already listed under
  publication features), not a general editor for the author. Revisit only if
  non-technical contributors need to author records directly.
