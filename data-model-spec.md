# Yoga Teacher Training Directory — Data Model Spec

*Follow-up to `yoga-opleidingen-directory-overwegingen.md`. This document makes the deferred decisions concrete: storage/stack, the flat-vs-entity question, the full schema with layer markings, and two example records.*

**v0.2 (2026-06-12)** — revised after the 5-provider pilot (`pilot/pilot-findings.md`): price variants + excludes, delivery language, program prerequisites, per-signal notes, module days, registration holder.

---

## 0. Scope (inclusion criteria)

**In scope, phase 1:** teacher trainings offered in the Netherlands marketed under the official 200/300/500-hour format labels (in-person, hybrid, or online from a NL-based provider).

**Deferred, explicitly:** standalone smaller formats (50/85/100hr specializations sold as independent trainings — they already appear as `Module` records where they're part of a path); YACEP claim verification; foreign online-only schools selling into NL.

The criteria are published with the directory, so "why is X listed and Y not" always has an answer. Inclusion is descriptive (they market a 200/300/500), never an endorsement.

---

## 1. Architecture advice (stack, database, API)

**Recommendation: Next.js only, flat-file dataset in git, no database, no NestJS, no separate API — for phase 1 and 2.**

### Why files-in-git beat a database here

The dataset is small (NL yoga teacher trainings ≈ low hundreds of providers), write frequency is editorial (you, occasionally), and reads are all build-time. That profile is exactly what a database is *not* needed for. More importantly, three of your own requirements are git features for free:

1. **"Laatst geverifieerd" + audit trail** — every change to every record is dated, attributed, and diffable. When a school disputes "you wrote X", the git history is your receipt.
2. **Curriculum drift detection (§8)** — you planned to use Wayback diffs on *their* site; git gives you the same on *your* records. Two-sided provenance.
3. **Dataset-with-views (§4, §11)** — records are the source of truth; listing, comparison and detail pages are generated. Migrating to the values-brand later means pointing a new frontend at the same files.

### Stack

| Concern | Choice | Notes |
|---|---|---|
| Frontend/site | **Next.js (App Router, SSG)** | You know it. Statically generate listing/detail/compare pages at build time. |
| Data storage | **One YAML file per provider** in `/data/providers/` | Programs, modules, cohorts nested inside (see §3). Human-editable, reviewable in PRs. |
| Validation | **Zod schema** in the repo | Single source of truth for the model. Parse at build → build fails on invalid data. Types flow into the frontend for free. |
| Derived values | Computed at build, never stored | See §6. |
| API | **Deferred — but cheap when wanted** | Export the validated dataset as static JSON (`/data/v1/*.json`) at build time. That *is* an API: versioned, cacheable, zero runtime. If you later need query semantics, add Next.js route handlers over the same dataset. |
| NestJS | **Not yet** | NestJS earns its place only when a real backend emerges: a correction portal for schools, auth, submission workflows. None of that exists in phase 1–2. The §12 correction workflow is email + you editing YAML. |
| Database | **Not yet** | Trigger points to revisit: cohort logs grow beyond editorial scale, community contributions, server-side search/filtering over thousands of records. Even then: ingest the same files into SQLite/Postgres; files stay canonical until proven otherwise. |
| Hosting | Vercel or any static host | Free tier covers this for years. |

**The decoupling principle holds throughout:** Zod schema = the contract; YAML files = the dataset; Next.js = one view; static JSON export = the future-proofing. Nothing in phase 1 locks you in.

---

## 2. Modeling principles

These encode the epistemics from the research doc as schema rules.

1. **Claim vs. fact is structural, not editorial.** Fields that record what the school says are named `*_claimed` or live in `claims[]` as verbatim quotes. Fields that record what you verified carry a `source` and a `verified` flag. Nothing the school says is ever stored as bare fact.
2. **Quad-state for observable booleans.** `yes | no | not_published | unknown`. `not_published` ≠ `unknown`: "we looked and they don't say" is itself data (the §9 meta-axis); `unknown` means "not investigated yet". Numeric fields are nullable and pair with a `*_published` quad-state where the distinction matters.
3. **No composite scores, anywhere.** Layer-3 assessment has per-axis sub-scores with rationale; the schema has no field where a total *could* live.
4. **Type/instance split.** `Program` = what they offer; `Cohort` = whether it ran. Every cohort carries `status` + `source` — registering an advertised cohort as if it ran is the trap (§8), so the schema makes the distinction mandatory.
5. **Modules are first-class; a program is a path over modules** (§6). Coherence is never a field — it's the pattern that emerges from six checkable signals.
6. **Depth and freshness on every record.** `depth: listed | reviewed | assessed` and `last_verified` are required. Honest about limits, and it pre-empts "you only reviewed the schools you dislike".
7. **Editorial is quarantined.** Facts, `assessment` (scored, methodology-versioned), and `editorial` (explicit opinion) are separate blocks that views can render with visibly different framing. Right of reply is data, not a footnote.
8. **Silence is recordable.** Correction requests are logged as `inquiries[]`; "invited to correct on date X, no response" becomes a displayable, defensible fact (§12).
9. **Derived values are never stored** — price per contact hour, contact ratio, etc. are computed at build from primary fields, so they can never go stale or contradict their inputs.
10. **IDs are stable slugs, never reused.** Renames keep the id.

---

## 3. The flat-vs-entity decision (open decision #2)

**Resolution: entity model in the schema, document storage on disk.**

The model is a graph — Provider → Programs → (Modules, Cohorts), plus Claims, People, Sources, Inquiries. But it is *stored* as one YAML document per provider with everything nested inside, because that's the unit you edit, verify, and date. Cross-references use ids (`module: yin-50`) and stay provider-internal in phase 1–2.

What this buys: layer 1 entries are tiny files with five fields filled; deepening a record means adding blocks to the same file, never restructuring (the §4 principle: deepen = fill fields). If a genuinely cross-provider entity appears later (a teacher working at three schools), promote `Person` to its own `/data/people/` directory then — the id reference syntax doesn't change.

```
data/
  providers/
    studio-x.yaml        # provider + programs + modules + cohorts + claims + inquiries
    school-y.yaml
  people/                # phase 3+, only if cross-provider dedup becomes real
  schema/                # zod schemas (or generated JSON Schema)
```

---

## 4. Entity reference

Layer column: **L1** = basic listing (live-worthy minimum), **L2** = broad-but-cheap facts, **L3** = deep review only.
Quad-state fields are marked **(q)** = `yes | no | not_published | unknown`.
Fields holding externally sourced facts accept an optional `source` (a Source id) — mandatory where marked.

### 4.1 Source

Provenance anchor; everything contested points at one of these.

| Field | Type | Notes |
|---|---|---|
| `id` | slug | e.g. `site-pricing-2026-05` |
| `type` | enum | `website \| wayback \| brochure \| register \| inquiry_response \| reader_report \| email \| other` — `reader_report` = a validated correction from a reader ("meld een fout" route); validation happens before entry, the source type preserves provenance |
| `url` | url? | |
| `archived_url` | url? | Wayback/archive.today — archive *before* citing critically |
| `captured` | date | when you saw it |
| `note` | string? | |

### 4.2 Provider

| Field | Type | Layer | Notes |
|---|---|---|---|
| `id` | slug | L1 | |
| `name` | string | L1 | **the publicly known brand name — this is the canonical identifier** throughout the directory. Legal/register entities (`legal`, `crkbo.holder`, `registrations[].holder`, `contract.invoicing_entity`) are recorded as official data *about* the brand, never as its replacement: readers search for "De Nieuwe Yogaschool", not "Johan Noorloos Teachertraining" |
| `website` | url | L1 | |
| `locations[]` | `{city, address?}` | L1 | |
| `status` | enum | L1 | `active \| inactive \| unknown` |
| `crkbo` | `{registered (q), holder?, checked: date, source}` | L1 | public register → verifiable; **fact, never endorsement** (§10). `holder` = the registered entity's name, which often differs from the studio brand (BV, holding, or person name) — same pattern as `registrations[].holder`. Consequence for method: CRKBO must be checked per provider via their legal name (KvK), not assumed absent because the brand name isn't in the register |
| `registrations[]` | `{body, identifier?, holder?, first_registered?, verified_in_register (q), source}` | L1 | `body: yoga_alliance \| vyn \| other` — recorded as claim until checked against the register. `holder` = the name the registration is actually held under; pilot found an RYS registered to the lead teacher personally while the studio markets the training, so the holder is real consumer-relevant data |
| `legal` | `{kvk?, legal_name?}` | L2 | |
| `founded_year` | `{value: int, source}` | L2 | cheap track-record anchor (§8) |
| `people[]` | Person[] | L3 | see 4.7 |
| `programs[]` | Program[] | L1 | |
| `modules[]` | Module[] | L2 | |
| `claims[]` | Claim[] | L2/L3 | |
| `inquiries[]` | Inquiry[] | L2 | |
| `sources[]` | Source[] | L1 | |
| `disclosure` | string? | L1 | personal/business relationship between author and provider (e.g. teaching drop-in classes at a studio that also trains) — rendered prominently on the listing; required the moment such a relationship exists |
| `depth` | enum | L1 | `listed \| reviewed \| assessed` |
| `last_verified` | date | L1 | |

### 4.3 Program

| Field | Type | Layer | Notes |
|---|---|---|---|
| `id` | slug | L1 | e.g. `200-vinyasa` |
| `name` | string | L1 | their name, verbatim |
| `url` | url | L1 | |
| `format_label` | enum | L1 | `200 \| 300 \| 500 \| other \| none` — **descriptive label, not quality signal** (§5); origin (YA category) noted in spec, not per record |
| `style_claimed` | string? | L1 | their words, short; labelled as claim by the field name |
| `accreditation[]` | `{body, label_claimed, verified (q), source}` | L1 | separate from the hour number (§5) |
| `delivery` | `{mode, structure, duration_months_min?, duration_months_max?, language?}` | L1 | `mode: in_person \| online \| hybrid`; `structure: weekends \| evenings \| intensive \| modular \| mixed` — own axis, not part of the hour count (§5). `language: nl \| en \| mixed` — pilot: Arhanta teaches in English, Namasté "depends on the group" |
| `price` | `{amount_eur?, variants[]?, vat: incl \| exempt_crkbo \| excl \| unknown, published (q), includes?, excludes?, note?, source!}` | L1 | `published: no/on_request` is itself a signal (§9). `amount_eur` = comparable base: **cheapest generally-available variant** (convention published in methodology); `variants[] {label, amount_eur}` for tiers (accommodation classes, member/non-member — the latter is also an upsell signal). `excludes` is first-class: mandatory-but-excluded costs (literature, studio lessons, stiltedagen) silently break price comparisons |
| `prerequisites_claimed` | string? | L1 | their stated entry requirements, verbatim-ish ("min. 2 jaar yoga-ervaring", "RYT 200 vereist voor YA-registratie") |
| `hours_claimed` | `{total?, contact?, self_study?, supervised_teaching_practice?, breakdown_published (q), source!, note?}` | L1 | the §5 decomposition. `supervised_teaching_practice` = the only number about teaching ability — always attempt it. `note` records what the provider says about practice/hours when it isn't given as an isolated number (e.g. "lespraktijk aanwezig maar niet als urental geïsoleerd") |
| `group_size_claimed` | `{max?, source, note?}` | L2 | hard to fake, they state it themselves (§9) |
| `composition` | `{type: single_program \| fixed_modular \| free_assembly, modules: id[]?, }` | L2 | §6 |
| `coherence_signals` | 6 × (q), each with optional `source` and `note` | L2 | `required_sequence`, `single_cohort_intake`, `integrative_assessment`, `continuous_lead_teacher`, `modules_sold_separately`, `bundle_price_below_sum` — **no aggregate field exists** (§7). Per-signal `note` carries nuance the quad-state can't ("ingangseisen per module verschillend") without softening the quad-state itself. `integrative_assessment` measures *integration* (any assessment spanning the parts, continuous-cumulative or final), not assessment quality — formative/continuous assessment is pedagogically superior to a single final exam, which is an L3 pedagogiek-axis consideration, not this signal |
| `assessment_described` | `{exists (q), continuous (q)?, final (q)?, quote?}` | L2 | how they test, in their words — recorded for **every** program, not only modular ones. `continuous` vs `final` captures the form: continuous/formative assessment demonstrably outperforms a single final exam, so the form is data. Distinct from `coherence_signals.integrative_assessment`, which measures integration across parts |
| `contract` | `{cancellation_published (q), refund_published (q), min_participants: {clause (q), value?}, installments_published (q), invoicing_entity?, source, note?}` | L2 | §9 commercial axis. `invoicing_entity` = the legal entity that actually invoices the training (from voorwaarden/factuur) — together with `crkbo.holder` and KvK director overlap this makes VAT-structuring visible as plain fact (training in separate exempt entity, studio keeps input-VAT recovery) without asserting motive |
| `transparency` | 5 × (q) `+ source?` | L2 | `syllabus_published`, `hours_breakdown_published`, `assessment_criteria_published`, `reading_list_published`, `teacher_bios_published` — the meta-axis (§9): *how assessable they are* is itself data |
| `track_record` | `{first_seen_year?, last_confirmed_cohort?, cadence_note?, source}` | L2 | cheap summary; full log in `cohorts[]`. Established ≠ good — views must not render this as endorsement (§8) |
| `cohorts[]` | Cohort[] | L3 | full instance log only where you go deep |
| `teachers[]` | `{person_id, role, teaches: string[]}` | L3 | who *actually* teaches what — bait-and-switch axis, anatomy-by-whom (§9) |
| `assessment` | Assessment | L3 | see 4.8 |
| `editorial` | string? | L3 | explicit opinion, rendered visibly apart |

### 4.4 Module

| Field | Type | Layer | Notes |
|---|---|---|---|
| `id` | slug | L2 | |
| `name`, `url` | | L2 | |
| `hours` | `{total?, contact?}` | L2 | |
| `days_claimed` | int? | L2 | pilot: YAN advertises modules in days only ("8 dagen"); record what they publish, hours stay null |
| `type` | enum | L2 | `core_pedagogy \| specialization \| other` |
| `sold_separately` | (q) | L2 | §6/§7 cross-check |
| `listed_in_ce_catalog` | (q) | L2 | double-duty inventory check (§7) |
| `price` | `{amount_eur?, vat, source}` | L2 | enables `bundle_price_below_sum` |

**Standalone modules are valid.** A module needs no referencing program — a workshop sold only on its own is simply an unreferenced Module record. Program-vs-module is a *role*, not an intrinsic property: the same 50hr Yin training can be a building block, a standalone bijscholing, or both at once (the §7 double-duty cross-check depends on representing exactly that). The role (`standalone \| building_block \| both`) is derived from references at build time, never stored. Phase 1 records standalone modules where encountered (they feed the coherence cross-checks) but doesn't render them as listings — scope deferral is a display decision, not a data decision. When standalone formats enter scope, Modules gain optional `accreditation[]` (YACEP claims), `delivery`, and `prerequisites_claimed` fields; they are not promoted to Program.

### 4.5 Cohort

| Field | Type | Layer | Notes |
|---|---|---|---|
| `id` | slug | L3 | |
| `program` | id | L3 | |
| `start` | YYYY-MM | L3 | |
| `end` | YYYY-MM? | L3 | |
| `status` | enum | L3 | `announced \| confirmed_ran \| cancelled \| unknown` — **required** |
| `source` | Source id | L3 | **required**; `wayback` sources reconstruct history (§8) |
| `price_at_time` | `{amount_eur, vat}`? | L3 | enables price-trajectory view |
| `lead_teachers` | string[]? | L3 | teacher stability across runs |
| `language` | enum? | L3 | `nl \| en \| mixed` — per-run override where the program says `mixed` ("afhankelijk van de groep"); what a specific run actually was is instance data |

### 4.6 Claim

Verbatim quotes; the raw material of the evidence-base axis. Capturing (L2) is cheap; analyzing (L3) is the work.

| Field | Type | Layer | Notes |
|---|---|---|---|
| `id` | slug | L2 | |
| `scope` | `provider \| program:id \| module:id` | L2 | |
| `quote` | string | L2 | **verbatim** — quote them, don't characterize them (§3 legal posture) |
| `category` | enum | L2 | `scientific \| health_outcome \| income_outcome \| accreditation \| lineage_authority \| scope_of_practice \| other` — `health_outcome` can be legally regulated → hard red-flag axis (§9); `lineage_authority` = tradition/discipleship as authority claim (see 4.7) |
| `source` | Source id | L2 | required; archive first |
| `analysis` | `{note, status: accurate \| unsubstantiated \| misleading \| regulated_claim, reviewed: date, methodology_version}` | L3 | separate from the quote; the quote stands on its own |

### 4.7 Person

Inline under provider until cross-provider dedup is real (§3). Promotion trigger: the same teacher appearing at 2+ providers (common for name-brand guest teachers — the bait-and-switch axis makes this worth tracking).

| Field | Type | Layer | Notes |
|---|---|---|---|
| `id` | slug | L3 | |
| `name` | string | L3 | |
| `trainings_claimed[]` | `{label, school?, year?, verified (q), source}` | L3 | "RYT 500", "500hr bij school X (2018)" — RYT claims are checkable in the public Yoga Alliance registry; a named school/year is at least falsifiable |
| `background[]` | `{field, credential, registry: big \| other \| none, verified (q), source}` | L3 | the hard axis: healthcare credentials (fysiotherapeut, arts) are verifiable in the **BIG-register**. "Anatomie door een fysio" becomes a register lookup, not bio-prose |
| `lineage_claims[]` | Claim ids | L3 | tradition/discipleship statements — **verbatim quotes only**, category `lineage_authority`; never modeled as a trust graph (see below) |

**Why lineage is a claim, not a graph.** A `trained_under` edge between persons would reify lineage as verified data and import the authority framing — the same mistake as treating accreditation as a quality signal. "Studied with [famous teacher]" spans ten years of apprenticeship to one weekend workshop, indistinguishable from outside. So the model decomposes the bundle: completed trainings (semi-verifiable, structured), professional background (register-verifiable, structured), and tradition/discipleship (pure claim, quoted verbatim). Lineage-as-evidence-substitute ("our authority comes from the tradition") feeds the evidence-base axis as a quoted claim. Note `style_claimed` on Program handles the reader-facing tradition taxonomy (filter on Iyengar/Yin/etc.) — a descriptive label like `format_label`, deliberately separate from authority claims.

### 4.8 Assessment (layer 3 only)

| Field | Type | Notes |
|---|---|---|
| `methodology_version` | string | assessments are reproducible against a published methodology version |
| `axes` | 4 × `{score: 1–5?, rationale, evidence: id[]}` | `pedagogy`, `evidence_base`, `transparency`, `commercial_fairness` — sub-scores only, reader weighs them (§3); `evidence` points at claims/sources |
| `right_of_reply` | `{sent: date, method, response_received: date?, response_summary?, changes_made?}` | wederhoor as data |
| `assessed` | date | |

### 4.9 Inquiry

The §12 correction workflow, logged.

| Field | Type | Notes |
|---|---|---|
| `sent` | date | |
| `type` | `correction_request \| question \| right_of_reply` | |
| `summary` | string | what you showed them / asked |
| `response` | `{received: date, summary, source}` or `none` | `none` after a stated window = displayable: "invited to correct, no response" |

### 4.10 Deliberate omissions

Two §9 axes are intentionally *not* fields. **Soft signals** (post-training support, alumni community, responsiveness tone) are gameable and corroboration-only — they belong in `editorial`, never in structured data where a filter could treat them as fact. **Upsell structure** ("do you really need the 300?") emerges from `composition` + module pricing + derived `bundle_delta`; a dedicated field would be opinion dressed as data. And there is no `coherence` field by design — only the six signals.

---

## 5. Layer 1 — minimum live-worthy record (open decision #4)

A provider entry may go live when it has: `name`, `website`, `locations[].city`, `crkbo.registered` (checked — it's a 1-minute register lookup), `depth: listed`, `last_verified`, and per program: `name`, `url`, `format_label`, `delivery.mode` + `structure` + `language`, `price` (amount or `published: no`, with `includes`/`excludes` where stated), `prerequisites_claimed` (if published), `hours_claimed.total` + `contact` + `supervised_teaching_practice` (numbers or `breakdown_published: not_published`), `accreditation[]` as claims, and at least one `source`.

Pilot-calibrated cost: **~20–30 minutes per entry** (the 15–20 estimate held for extraction; fetch retries and a missing-city contact-page lookup add the rest). Fully factual, zero legal exposure — and already enables the two killer views: the side-by-side 200-hour decomposition and the "filter on min. supervised teaching practice" filter no marketing listicle offers (§5 UX-subversion). Pilot validation: all five pilot programs landed on `supervised_teaching_practice: not_published` — the field's emptiness is the finding.

---

## 6. Derived fields (computed at build, never stored)

- `price_per_contact_hour` = price / contact hours — the §4 deepening of "price". **Comparability guard:** only computed when `includes`/`excludes` allow a fair comparison; a residential price including room and board (Arhanta) is not comparable to a studio price excluding mandatory literature (Namasté) — views must flag this rather than render misleading numbers side by side |
- `contact_ratio` = contact / total claimed hours
- `practice_share` = supervised teaching practice / contact hours
- `bundle_delta` = program price − Σ module prices (feeds `bundle_price_below_sum` display)
- `coherence_pattern` = rendering of the six signals (display-only; the doc's "pattern that emerges from facts")
- `completeness` = % of layer-appropriate fields filled → powers the "alleen basislisting / volledig beoordeeld" badge
- `change_log` = per-record change history derived from git at build time, rendered publicly on detail pages — the audit trail as a visible trust feature; corrections (including reader reports) are never silent
- `vat_comparison` view: same-price programs with/without CRKBO exemption side by side — the §10 "where does the VAT difference go?" question, asked by juxtaposition, asserted by no one

---

## 7. Example records

### 7.1 Minimal entry (`depth: listed`)

```yaml
id: studio-noord
name: Studio Noord Yoga
website: https://studionoord.example.nl
status: active
locations:
  - city: Groningen
crkbo:
  registered: no
  checked: 2026-06-10
  source: crkbo-register
registrations:
  - body: yoga_alliance
    verified_in_register: unknown
    source: site-2026-06
depth: listed
last_verified: 2026-06-10
sources:
  - id: site-2026-06
    type: website
    url: https://studionoord.example.nl/opleiding
    archived_url: https://web.archive.org/web/20260610/...
    captured: 2026-06-10
  - id: crkbo-register
    type: register
    url: https://www.crkbo.nl/register
    captured: 2026-06-10

programs:
  - id: 200-hatha
    name: "200-uurs Hatha Yoga Docentenopleiding"
    url: https://studionoord.example.nl/opleiding
    format_label: 200
    style_claimed: "klassieke hatha yoga"
    accreditation:
      - body: yoga_alliance
        label_claimed: "RYS 200"
        verified: unknown
        source: site-2026-06
    delivery:
      mode: in_person
      structure: weekends
      duration_months_min: 9
      language: nl
    prerequisites_claimed: "enige yoga-ervaring gewenst"
    price:
      amount_eur: 2750
      vat: incl
      published: yes
      excludes: "literatuur"
      source: site-2026-06
    hours_claimed:
      total: 200
      contact: null
      self_study: null
      supervised_teaching_practice: null
      breakdown_published: not_published   # ← data, not a gap
      source: site-2026-06
```

### 7.2 Deep entry (`depth: assessed`, abridged)

```yaml
id: school-y
name: Yoga School Y
website: https://schooly.example.nl
status: active
locations: [{city: Utrecht}]
crkbo: {registered: yes, checked: 2026-05-02, source: crkbo-register}
depth: assessed
last_verified: 2026-06-01

modules:
  - id: yin-50
    name: "Yin Yoga Module (50u)"
    hours: {total: 50, contact: 40}
    type: specialization
    sold_separately: yes
    listed_in_ce_catalog: yes          # same module doubles as YACEP bijscholing (§7 cross-check)
    price: {amount_eur: 695, vat: exempt_crkbo, source: site-2026-05}

programs:
  - id: 300-advanced
    name: "300-uurs Advanced Teacher Training"
    format_label: 300
    accreditation:
      - {body: yoga_alliance, label_claimed: "RYS 300", verified: yes, source: ya-register-2026-05}
    delivery: {mode: hybrid, structure: modular, duration_months_min: 12, duration_months_max: 36, language: nl}
    price:
      amount_eur: 3950          # comparable base: cheapest generally-available variant
      variants:
        - { label: "regulier", amount_eur: 3950 }
        - { label: "leden", amount_eur: 3700 }   # member pricing = ook upsell-signaal
      vat: exempt_crkbo
      published: yes
      excludes: "verplichte literatuur"
      source: site-2026-05
    hours_claimed:
      total: 300
      contact: 180
      self_study: 120
      supervised_teaching_practice: 8   # vs. 60 elsewhere — the number deconstructs itself (§5)
      breakdown_published: yes
      source: site-2026-05
    composition:
      type: free_assembly
      modules: [yin-50, nidra-50]       # "+ vrij aan te vullen tot 300"
    coherence_signals:
      required_sequence: no             # "in willekeurige volgorde te volgen" — their words
      single_cohort_intake: no
      integrative_assessment: not_published
      continuous_lead_teacher: no
      modules_sold_separately: yes
      bundle_price_below_sum: yes       # bundle €3950 < Σ modules €4170
    transparency:
      syllabus_published: not_published
      hours_breakdown_published: yes
      assessment_criteria_published: not_published
      reading_list_published: yes
      teacher_bios_published: yes
    track_record:
      first_seen_year: 2019
      last_confirmed_cohort: 2025-09
      source: wayback-2026-05
    cohorts:
      - {id: c-2024-09, program: 300-advanced, start: 2024-09, end: 2025-06,
         status: confirmed_ran, source: wayback-2026-05}
      - {id: c-2025-02, program: 300-advanced, start: 2025-02,
         status: cancelled, source: inquiry-2026-05}   # min. 8 deelnemers niet gehaald
    claims:
      - id: fascia-claim
        scope: program:300-advanced
        quote: "Yin yoga maakt fascia los en voert toxines af"
        category: scientific
        source: site-2026-05
        analysis:
          status: unsubstantiated
          note: "Geen ondersteunend bewijs voor 'toxines afvoeren'; mechanisme niet aangetoond."
          reviewed: 2026-05-20
          methodology_version: "0.1"
    assessment:
      methodology_version: "0.1"
      assessed: 2026-06-01
      axes:
        pedagogy:
          score: 2
          rationale: "8u begeleide lespraktijk op 300u; geen programma-overspannende toetsing aangetroffen."
          evidence: [site-2026-05]
        evidence_base:
          score: 2
          rationale: "Zie fascia-claim; anatomie gegeven door yogadocent zonder aantoonbare bewegingsachtergrond."
          evidence: [fascia-claim]
        transparency:
          score: 3
          rationale: "Urenverdeling en leeslijst publiek; syllabus en toetscriteria niet."
          evidence: [site-2026-05]
        commercial_fairness:
          score: 3
          rationale: "Prijs publiek; min-8-clausule aanwezig, restitutiebeleid gepubliceerd."
          evidence: [site-2026-05]
      right_of_reply:
        sent: 2026-05-25
        method: email
        response_received: null
        response_summary: null

inquiries:
  - sent: 2026-05-25
    type: correction_request
    summary: "Genoteerde uren/prijs/samenstelling voorgelegd ter correctie"
    response: none
```

---

## 8. Next steps

1. ~~Pilot: 5 real providers~~ — **done** (`pilot/`, 2026-06-12); findings folded into this v0.2.
2. Write the Zod schemas mirroring §4 (the schema *is* the architecture decision made executable).
3. Build the provider-universe enumeration list (YA directory, VYN, CRKBO register, Maps) — record **fetchability** per site (pilot: 2 of 7 sites need a browser) and whether the YA registration is studio-held or teacher-held.
4. Archive the pilot's cited pages retroactively, then make archiving routine: Wayback *plus* local PDF (Wayback fails on JS-heavy sites; YA register pages are Salesforce-rendered and need a browser + PDF snapshot).
5. Decide the correction-window convention (e.g. 4 weeks) so `response: none` has a defined meaning before the first publication.
6. Before publication: methodology page v0.1 (including the price-base convention and the comparability guard) and the complaints/correction procedure page (see `project-decisions.md` #3, #5, #7).
