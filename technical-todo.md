# Technical TODO

*Engineering work only — data extraction, enumeration, and editorial tasks live
in `project-decisions.md` and the READMEs. Items reference the spec (`§N`) and
the decision log (`#N`) where relevant.*

*Last pruned 2026-07-12, after the public site shipped (PR #1) and the
provenance work landed (PR #2). Closed items are one-liners; their full
reasoning is in the PRs and the git history, which is where it belongs.*

---

## Open — publication features

These are required by the project's own decisions before critical/assessed
content goes live. The site itself now exists; these are the parts of the
*publication* apparatus that don't.

- [ ] **"Meld een fout" / correction route.** Decision #7: a lightweight
  correction channel whose validated reports enter the dataset as a
  `reader_report` source. Needs a public route + an intake path into `data/`.
  The imported design drew a form; it was cut because a static export has no
  endpoint and `inquiries[]` models inquiries *we* sent, not a submission inbox.
  Needs a real decision about where submissions land.
- [ ] **Complaints/correction procedure page.** Decision #3 — operate like a
  publication from day one; this page precedes any assessed content. The
  methodology already promises it ("een formele klachten- en correctieprocedure
  is in ontwikkeling").
- [ ] **Public per-record change history from git.** Decision #7 wants the git
  history of each `data/providers/<id>.yaml` rendered publicly — the audit trail
  as a visible trust feature. The methodology already promises it: *"elke
  vermelding heeft een openbare wijzigingsgeschiedenis … Stilzwijgende correcties
  bestaan hier niet."* Nothing renders it yet.
- [ ] **Inquiry / right-of-reply display.** The schema models `inquiries` with
  `response: "none"` as defensible silence after the window; no view renders it.
  Not urgent — no record has an inquiry yet — but it gates `depth: assessed`.

## Open — the publication bar

- [ ] **110 of 220 sources have no public archive.** The methodology states the
  bar: *"elke geciteerde pagina wordt dubbel bewaard: in een publiek webarchief
  … én als eigen kopie."* Today 104 sources meet it, 103 are local-only, 5 are
  public-only, 8 have neither. The record pages now show **both halves
  honestly** (`publiek — · lokaal ✓`), so the site no longer implies a bar it
  doesn't meet — but the gap is real and it is the largest one left.
  Many local-only sources are legitimate (Wayback-excluded domains,
  JS-rendered registers), but that distinction is not currently recorded, so a
  reader cannot tell a deliberate skip from a missing submission. Consider a
  reason field, or a retry pass with `npm run archive`.
*(The provenance build gate is done — see Closed.)*

## Open — research debt

*Named, actionable extraction work the records already admit to.*

- [ ] **`sanayou/200-online`** — modular online, 3 routes; prices are per
  module/traject on the inschrijfpagina's. The cited overzicht prices the *other
  two* routes, which is why the provenance check passes it — the check is
  **page-level, not fact-level**, and this is its known false negative. Needs an
  editorial decision on the comparable base across the three routes, then the
  extraction.
- [ ] **`yoga-den/200-vinyasa` publishes TWO different investments, in its own two
  channels.** The opleidingspagina says *"Investment: €3597 (200 euro discount
  before March 31st)"*; the Mindbody booking page its own **Sign Up** button leads
  to says *"Member price €3297 until March 31 / Non member price €3397 until March
  31"* — a different amount, a membership tier the website never mentions, and a
  different early-bird date (Mar 15 vs Mar 31). Every deadline named is in the
  past. **A reader cannot determine from the school's own channels what this
  training costs today.** Both are archived (`site-ytt-200-2026-07`,
  `mindbody-enrolment-200-2026-07`). Recorded as a finding in the price note, and
  deliberately NOT as `price.variants` — that field means "tariffs you may choose
  between" and renders as *"3 prijsvarianten"*, which would present a contradiction
  as a tidy menu. **Actionable:** put it to the school as a correction request
  (§4.9 `inquiries`), exactly as with de Yogaschool's two Basisopleiding prices.
- [ ] **The Mindbody enrolment page cannot be captured locally.** Mindbody answers
  our Playwright capture with a Cloudflare bot-check (*"Verifying you are human"*),
  so the local artifact was a captcha, not the page — it has been deleted, because
  a snapshot that evidences nothing is worse than none: it *looks* like evidence.
  Wayback's snapshot DID render (verified: it contains the four price lines
  verbatim), so this is a **public-only source** — the mirror image of the
  Wayback-excluded YA registers, where only the local copy is evidence. Fine for
  now, but it means one price finding rests on a snapshot the site owner could ask
  to have withdrawn. Worth a browser-based local capture route if more providers
  turn out to book through Mindbody (many Dutch studios do).
- [ ] **`de-yogaschool-enschede` publishes TWO prices for the Basisopleiding.**
  The general opleidingspagina (`/yoga-opleiding/`) says *"€1510,00 per jaar"*;
  the Basisopleiding's own page (`/basisopleiding/`) says *"€ 1590,00 per seizoen
  of lesjaar van 40 weken"* (vanaf januari 2026). Both are archived; neither is
  marked superseded by the school. v0.9 cites the **Basisopleiding page** for the
  mandatory-gate cost (it is the page about that training), and the record states
  the discrepancy as a finding. **Actionable:** put it to the school as a
  correction request (§4.9 `inquiries`) — a school with two live prices for one
  training is exactly the kind of thing a reader cannot resolve alone. Note the
  /yoga-opleiding/ page also prints an internally impossible instalment line
  (*"termijnen van €1510,00 per maand (10 maanden)"* against €1510 per year).
- [ ] **Gated programmes whose gate this school does not sell (`prerequisite[]`
  `kind: other`, 7 programmes).** An "afgeronde RYT200" on a 300-hour course is a
  purchasable gate *in the market* — but not one the school forces you to buy
  from them, so no amount is summed into `total_path_cost` (spec §4.3/§6). The
  reader therefore still cannot see what qualifying at, e.g., yogic-life
  *actually* costs end-to-end. **Open editorial question, deliberately not
  answered by inventing a number**: a market range would be our estimate about
  other people's prices. Revisit only if a *published* figure exists to cite.
- [ ] **20 providers have `crkbo.registered: unknown`.** The spec calls this "a
  1-minute register lookup". It is a **gap** (ours), not a finding (theirs), so
  the site correctly says nothing about them — but it is cheap to close and it
  suppresses a real signal.
- [ ] **`supervised_teaching_practice` is unrecorded on 72 of 77 programmes.**
  Expected — its emptiness across the market *is* the finding (§5), and the site
  renders it as one. Listed here only so it is not mistaken for an oversight.

## Open — code health & SEO

- [ ] **Linter + formatter.** No ESLint/Prettier config exists.
- [ ] **Per-page metadata, sitemap, `robots`.** Only the root `layout.tsx` sets
  metadata. It's a static publication meant to be found and cited.

---

## Closed

*Reasoning lives in the PRs; kept here as one-liners so the file does not
understate the project.*

**The public site (PR #1).**
- [x] Listing at `/` — filters, sort, and a postcode + radius distance filter.
- [x] Provider detail pages at `/aanbieder/[id]` — 48 statically generated.
- [x] Methodology page at `/methodologie` — renders `content/methodologie.md`.
- [x] Sources + archive status in the views — **both** halves always shown.
- [x] Disclosure rendering — bordered block on the record, marker on the listing.
- [x] Styling approach — CSS Modules + design tokens. `<Quad>` is the only place
  a quad becomes pixels, and `--finding`/`--gap` appear in no other stylesheet.
- [x] **Unit tests.** 153, `node:test` via `tsx --test`, wired into `npm run build`
  after `validate`. They exist to lock the *editorial* invariants, not to chase
  coverage — chiefly that `not_published` (a finding) and `unknown` (a gap) can
  never render identically.
- [x] `export-json` wired into the build; CI runs `validate` on every push.
- [x] Editor schema validation (`gen-schema` → `data/provider.schema.json`).
- [x] Read-only QA dashboard at `/qa` — **excluded from production builds**.

**Provenance and the data model (PR #2).**
- [x] **`src/lib/provenance.ts`** — opens the archived artifacts of every cited
  source and warns when they do not evidence the price, the hours total, or the
  VAT treatment they are cited for. It found six defects. It searches **both**
  the raw HTML and the browser-rendered PDF and passes on either: neither alone
  is sufficient (JS-injected prices appear only in the PDF).
- [x] **spec v0.3** — `YYYY-MM` rejects a month outside 01–12. A typo'd month was
  schema-valid data that only blew up inside a date formatter during `next build`.
- [x] **spec v0.4** — `hours_claimed.contact_published`. One quad was answering
  two questions, so the market's three most transparent schools were being told
  to readers as "not investigated".
- [x] **spec v0.5** — `price.period` + `periods`; `total_price` derived.
  `amount_eur` silently assumed a whole-course total, which ranked de Blikopener
  3rd cheapest of 54 when the real cost is ≈ € 5.160.
- [x] **spec v0.6** — `total_hours` derived. Two records stored *our* sum in a
  field that renders as the school's claim.
- [x] Five prices sourced, archived and extracted (AALO ×2, de Blikopener,
  Yoga Academie Nederland); de Blikopener split into two properly-sourced
  programmes; Wahé's 500-hour route re-cited to the page that actually states it;
  four VAT treatments corrected to `unknown` per §4.11.
- [x] **The provenance check is a BUILD GATE** (2026-07-14). It ran as a warning
  until it had held at zero findings across 163 claims — the condition it set for
  itself — and `npm run provenance` now runs inside `npm run build` and fails it.
  It enforces two tiers, because the archive bodies are gitignored and a gate that
  cannot open its evidence must say so rather than pass: **structural** ("cited, but
  in no archive") is provable from the record plus the committed `.sha256` sidecars
  alone and binds in CI too; **content** ("the artifact does not state it") needs the
  body, and without it the claim is SKIPPED and the run prints `INHOUD NIET GETOETST`
  instead of a tick. Proven both ways: breaking a price fails the build locally, and
  citing an unarchived page fails it in a fresh clone with zero bodies present.

---

## Decisions

- **No general admin/edit interface.** Considered and declined. Files-in-git is
  a deliberate architectural choice (spec §1) and the git history is itself a
  trust feature (decision #7) — a GUI editor would sit on top of git rather than
  replace it, and risks noisy commit history. The real bottleneck is research
  (sourcing, archiving, verbatim quotes), not data entry, so an editor wouldn't
  move the needle, and it's a large surface to maintain on a hobby project
  (decision #4). The value is captured instead by *editor schema validation* and
  the *read-only QA dashboard*. The one editing UI worth building is the narrow
  **"Meld een fout" intake** for outside corrections (listed above), not a
  general editor for the author. Revisit only if non-technical contributors need
  to author records directly.

- **Archive bodies are not published; their hashes are.** The repo is public.
  `data/archives/**/*.pdf|*.html` are gitignored and live in the private,
  git-dated archive repo; the `.sha256` beside each one *is* committed and proves
  the snapshot exists and is unaltered. Quoting a provider verbatim is
  citaatrecht (Art. 15a Aw); republishing their entire brochure is not. See
  `data/archives/README.md`.

- **Cite the page that states the fact.** If it is not captured, capture it —
  never cite the page that merely links to it. Enforced by `provenance.ts`.
  Note the trap it exists to catch: a raw HTML capture misses JS-injected prices
  (add-to-cart widgets), exactly as it misses the Salesforce-rendered YA
  registers — so the browser-rendered PDF is part of the evidence, not a
  convenience.
