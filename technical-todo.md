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

- [ ] **Editor schema validation.** Generate a JSON Schema from the Zod schema
  and associate it with `data/providers/*.yaml`, so any editor with a YAML
  language server gives autocomplete, enum hints (the quad-states), and inline
  validation while editing — the "nice editing" experience without an edit UI,
  and the generated schema can't drift (regenerated on build, deterministic).
- [ ] **Read-only QA / review dashboard.** A route that surfaces, per record,
  what still needs work: `unknown` quad-states (gaps), sources with
  `archived_url: null`, low completeness, depth, and `last_verified` age. Speeds
  up the author's research pass; never writes, so it carries no data risk.

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
