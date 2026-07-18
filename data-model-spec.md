# Yoga Teacher Training Directory — Data Model Spec

*Follow-up to `yoga-opleidingen-directory-overwegingen.md`. This document makes the deferred decisions concrete: storage/stack, the flat-vs-entity question, the full schema with layer markings, and two example records.*

**v0.12 (2026-07-18)** — `hours_claimed.schedule` + two derived values (`scheduled_hours_ceiling`, `hours_disconnect`). A programme claims a round total (200 uur) and often publishes no contact-hour figure, so the total stands unexamined — while the *schedule* is published (the DNYS Intensive: 21 dagen, 10:00–17:00). Contact time can only ever be ≤ time in the room, so the raw clock sum is a strict **upper bound** on contact hours: at most 147 u, ≥ 53 u short of the claimed 200. The figure is OURS (derived ink, working shown, `contact_published` untouched — *they* didn't publish it, *we* bounded it); a published break (`pause_min`) tightens the ceiling downward but never makes it a precise claim, because we can only subtract the breaks they state. `schedule.blocks[]` model irregular timetables (Friday evening + full Saturday + half Sunday = three blocks). Silent without a schedule; no new finding axis.

**v0.11 (2026-07-14)** — `inquiries[].respond_by` + `response: awaiting`, and the right of reply is **rendered**. Principle 8 promises that *"invited to correct on date X, no response"* becomes a displayable, defensible fact — a strong sentence to print about a real company. Two things had to be true for it to be defensible and the model could express neither. **The window was never in the data**, so "no reply within the stated window" was unfalsifiable: a reader could not tell whether we waited a month or an afternoon. And **`response` was required with `none` as its only silent value**, so logging a correction request on the day you sent it forced you to publish the school's silence before they had had a single day to break it — a gap in OUR process, rendered as a FINDING about them. That is the quad's `unknown`-vs-`not_published` error, in the one place where it is defamatory. `awaiting` is now the honest state while the window is open, `integrityErrors` refuses `none` before `respond_by` has passed, and the record page renders all three states through `<Quad>` — so the finding-vs-gap ink rule holds here too. Also: `inquiries[]` had existed since v0.1 and **no surface had ever rendered one**, which is the same as not having it. Seven providers carry published findings; none had ever been asked.

**v0.10 (2026-07-14)** — `crkbo.searched[]` (structured). **A register MISS is not a register FINDING, and saying so three times did not stop it.** §4.11 already forbade `registered: no` from a brand-name miss; the schema comment repeated it; and `de-yogaschool-enschede` carried `registered: no` on the evidence *"naam 'Yogaschool' en website 'yogaschool' → geen treffer"* — published on the site as an established fact about a named business. The register is complete; **our search of it is not**, and those are different sentences. A registration is routinely held by a BV, a holding, or the founder personally in the Docentenregister — de Yogaschool's own `legal_name` is *"onbekend"*, so the search that could have justified a `no` was not merely skipped, it was impossible. The spec said "record the searched names in `note`" — free text, which nothing can check. They are now a structured list, and `registered: no` **requires** that the search covered the identifier the registration would be held under (`legal_name` or `kvk`). A brand-or-website miss can only ever yield `unknown`. Same disease as v0.5–v0.9: **a rule the model cannot express is a rule that lives in prose and gets broken.**

**v0.9 (2026-07-13)** — `prerequisite[]` (structured) + `total_path_cost` (derived, §6). **The same disease, a fourth time.** de Yogaschool's teacher training is € 1.530/jaar × 3, and you cannot start it without first completing the Basisopleiding at € 1.590 — so qualifying there costs € 6.180, and the site published € 4.590. The record *knew*: the gate and its price sat in `prerequisites_claimed`, as prose, where no comparison could reach them. 20 of 74 programmes are gated; 2 carried the cost anywhere computable. As with v0.5 (per-period), v0.6 (hours) and v0.8 (unequal parts): **a number the reader needs, which the model cannot express, ends up in prose — and the comparison silently lies.** Structure the gate; derive the path; render it as ours.

**v0.8 (2026-07-13)** — `total_price` gains its third derivation: the **sum of unequal composed parts**. `periods` can only multiply, so a training sold as Deel I € 1.420 + Deel II € 1.305 had no honest home for its € 2.725 total — and so it was stored in `amount_eur` and published in the school's own ink, cited to a page that prints only the parts. The same disease as v0.5 and v0.6, in its third costume: **a total the provider never states, stored as though they had.** Compose it from the modules, render it as ours.

**v0.7 (2026-07-13)** — §4.11 gains the half that was being enforced without being written: `price.vat` is **observed on the page that states it, or it is `unknown`** — never deduced from a CRKBO registration, from the invoicing entity, or from a sibling programme's page. That rule had been applied to six records and cited as §4.11 while §4.11 said only that the treatment "is directly observed"; the prohibition itself was never in the spec. Enforced now by `provenance.ts`, which must check *which* treatment a page states, not merely that it mentions tax. And `Cohort.price_at_time` (L3 → L2) is promoted from a dead field to a rendered one: a price that changed between cohorts is a finding, not a correction to bury.

**v0.6 (2026-07-12)** — `total_hours` becomes a derived field (§6). Same disease as v0.5, the other unit: two records stored a sum of ours as the school's claimed total. de Yogaschool Enschede publishes 360 contacturen and 240 zelfstudie-uren separately and never their sum — yet `hours_claimed.total: 600` rendered as their figure, and "600" appears in none of their archived sources. Sums are computed at render and shown as ours. (Wahé's 500 survives untouched: they DO publish it — that one was a sourcing error, not a fabricated fact, and the distinction is the whole point.)

**v0.5 (2026-07-12)** — `price.period` + `price.periods` added; `total_price` becomes a derived field (§6). `amount_eur` silently assumed a whole-course total. de Blikopener prices per studiejaar over a four-year, 500-hour opleiding and publishes no total, so the bare figure ranked them 3rd cheapest of 54 trainings when the real cost is ≈ € 5.160. The total is derived and shown as our arithmetic — storing it would publish a number they never stated, resting on price stability their own "(vanaf 1 juni 2026)" denies.

**v0.4 (2026-07-12)** — `hours_claimed.contact_published` (q) added. `breakdown_published` was doing two jobs: "do they break the total down at all?" and "do they publish the contact-hour figure?". Three providers answer yes to the first and no to the second — they publish by subject, by delivery mode, or as ranges — so the single quad forced the directory to call its most transparent schools either un-investigated or non-publishers. Both false. The model now asks twice, and `pricePerContactHour`'s blocking field is `contact_published`, not `breakdown_published`.

**v0.3 (2026-07-12)** — `YYYY-MM` now states that the month part must be `01`–`12`. The old definition accepted `2026-13`, so a typo'd month was schema-valid data that only failed when a renderer tried to name the month — a validation job landing in a formatter. No record changes: all 78 month values in the corpus were already in range.

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
**YYYY-MM** = a calendar month, `YYYY-MM` or `YYYY-MM-DD`; **the month part must be
`01`–`12`**. A typo'd month is not a rendering problem to be handled downstream —
it is invalid data, and `npm run validate` must reject it by name. The renderer
may then assume a real month, and treat anything else as a bug in our code
rather than a fact about a provider.

### 4.1 Source

Provenance anchor; everything contested points at one of these.

| Field | Type | Notes |
|---|---|---|
| `id` | slug | e.g. `site-pricing-2026-05` |
| `type` | enum | `website \| wayback \| brochure \| register \| inquiry_response \| reader_report \| email \| other` — `reader_report` = a validated correction from a reader ("meld een fout" route); validation happens before entry, the source type preserves provenance |
| `url` | url? | |
| `archived_url` | url? | Wayback/archive.today — archive *before* citing critically |
| `query` | string? | reproducible search term for a **no-permalink register** (CRKBO, the Salesforce-rendered YA grids): the exact text typed into the register's name filter to isolate the entry. These registers have no per-entry URL and no API, and a plain fetch/Wayback only ever captures page 1 — so the archive script types `query` into the filter, waits for the server callback, and snapshots the *filtered* result; that dated local snapshot is the evidence. Operationalizes §4.11's "record the searched names so the finding is falsifiable" |
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
| `crkbo` | `{registered (q), searched[]?, register?, holder?, checked: date, source}` | L1 | public register → verifiable; **fact, never endorsement** (§10). `register: instelling \| docent` — *instelling* = the organisation is registered; *docent* = a named individual is registered, so the VAT exemption rides on that person (same fragility as a personally-held YA registration). `holder` = the registered entity's/person's name, often ≠ brand. **`registered: no` is allowed only after a documented search by legal name (KvK) + relevant person names; a brand-name miss or a 'charges BTW' inference is `unknown`, not `no`** (see §4.11). `searched[]` records WHICH KEYS were actually queried (`brand` / `website` / `legal_name` / `kvk` / `person`) — structured, because as prose the rule was unenforceable and was duly broken. `no` requires `searched` to contain `legal_name` or `kvk`: **the register is complete, our search of it is not** |
| `registrations[]` | `{body, identifier?, holder?, first_registered?, verified_in_register (q), source}` | L1 | `body: yoga_alliance \| vyn \| other` — recorded as claim until checked against the register. `holder` = the name the registration is actually held under; pilot found an RYS registered to the lead teacher personally while the studio markets the training, so the holder is real consumer-relevant data |
| `legal` | `{kvk?, legal_name?, note?}` | L2 | `note?` records holder/entity nuance (e.g. CRKBO registered under a different name than the brand) |
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
| `price` | `{amount_eur?, period: total \| per_year \| per_module \| per_day, periods?, variants[]?, vat: incl \| exempt_crkbo \| excl \| unknown, published (q), includes?, excludes?, note?, source!}` | L1 | `published: no/on_request` is itself a signal (§9). `amount_eur` = comparable base: **cheapest generally-available variant** (convention published in methodology); `variants[] {label, amount_eur}` for tiers (accommodation classes, member/non-member — the latter is also an upsell signal). `excludes` is first-class: mandatory-but-excluded costs (literature, studio lessons, stiltedagen) silently break price comparisons.<br><br>**`period` + `periods`: what the number actually buys.** `amount_eur` alone silently assumes a whole-course total, and most providers do price that way — but not all. de Blikopener publishes **€ 1.290 per studiejaar** over a four-year, 500-hour opleiding and no total at all. Recorded as a bare `amount_eur`, that ranked them the 3rd cheapest of 54 trainings when the real cost is ≈ € 5.160 — an inversion, published about a named business.<br><br>`period` states the unit (`total` is the default and the common case); `periods` states how many of them make up the whole training (`null` = the provider does not publish it). **The total is DERIVED, never stored** (§6): storing `4 × 1290` would publish a figure the provider never stated, resting on an assumption they explicitly contradict — their price is dated *"(vanaf 1 juni 2026)"*, so next year's is not knowable. Derived, it moves when the price moves; stored, it rots and cites a source that never said it. |
| `prerequisites_claimed` | string? | L1 | their stated entry requirements, verbatim-ish ("min. 2 jaar yoga-ervaring", "RYT 200 vereist voor YA-registratie"). **Prose. Keep it — but it is not the gate.** |
| `prerequisite[]` | `{kind: program \| experience \| other, label, program?, cost_eur?, period?, periods?, source!, note?}` | L1 | **The gate, structured — because a gate you must BUY changes the price.** de Yogaschool's Docentenopleiding is € 1.530/jaar × 3 = € 4.590, and you may not start it without first completing the Basisopleiding at € 1.590. Becoming a teacher there costs **€ 6.180**, and the site showed € 4.590. The Meesteropleiding sits behind the Docentenopleiding, so that path is € 10.770 — also shown as € 4.590.<br><br>`kind: program` = a purchasable training you must complete first (`cost_eur` + `period`/`periods`, or `program:` when it is another Program on this record). `kind: experience` = an unpriced gate ("min. 2 jaar praktijk") — a real barrier, no euros. `source` is **required**: what you are forced to buy is a fact about the price, and needs a page that states it.<br><br>**20 of 74 programmes are gated behind a prerequisite; before v0.9 exactly 2 carried its cost anywhere the price comparison could see.** Feeds `total_path_cost` (§6). |
| `hours_claimed` | `{total?, contact?, self_study?, supervised_teaching_practice?, breakdown_published (q), contact_published (q), schedule?, source!, note?}` | L1 | the §5 decomposition. `supervised_teaching_practice` = the only number about teaching ability — always attempt it. `note` records what the provider says about practice/hours when it isn't given as an isolated number (e.g. "lespraktijk aanwezig maar niet als urental geïsoleerd").<br><br>**`breakdown_published` and `contact_published` answer different questions, and a provider can be `yes` on the first and `not_published` on the second.** `breakdown_published` = do they break the total down *at all*? `contact_published` = do they publish the **contact-hour figure specifically** — the number `pricePerContactHour` needs (§6)?<br><br>Three providers in the corpus publish a rich breakdown that is not this one: by *subject* (Asana 100, Anatomie 20, Filosofie 30 …), by *delivery mode* (110u pre-recorded, 30u live, 10u lespraktijk), or as *ranges* (100–150, 25–40 …). Subject hours are not contact hours; a range cannot be isolated. Collapsing the two questions into one quad forces a choice between calling the market's most transparent schools un-investigated (a gap that is ours, and false) and calling them non-publishers (a finding that is theirs, and also false). Both are lies, so the model asks twice.<br><br>**`schedule?` = `{source!, note?, blocks[]}`, each block `{count, start "HH:MM", end "HH:MM", pause_min?, label?}` (v0.12).** The published session times, per session type: `count` sessions of `start`–`end`, minus a stated break (`pause_min`, minutes — omit when not stated; omitted ≠ no break). `scheduled_hours_ceiling` (§6) sums them as a strict UPPER BOUND on contact hours; `hours_disconnect` (§6) sets it beside the claimed total. Blocks are per *full run*, not per cohort. Silent where the school publishes dates without times. |
| `group_size_claimed` | `{min?, max?, source, note?}` | L2 | hard to fake, they state it themselves (§9). `min?` for schools that publish a participant range (e.g. "16-24") |
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
| `price_at_time` | `{amount_eur, vat}`? | **L2** | **the price and VAT treatment as they stood WHEN THIS COHORT RAN.** Populated in 0 records and rendered nowhere until v0.7 — and that absence had a cost: when a training's price or VAT treatment changed between runs, the change had nowhere to live, so a second `Program` was created to hold it. Bluebirds' 2025 cohort was sold *"€3150,- Excl BTW"* on the teacher's own site; its 2026 cohort is *"0% VAT as we are CRKBO registered"* under Bluebirds BV. Two runs, two treatments — a **fact about the school**, and one the methodology's own promise of a visible change history exists to show. Record it here, with the cohort's `source`; render it on the cohort row. A price that moved is not a correction to hide — it is a finding. |
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
| `name` | string | L3 | the **publicly used** name — often a yogic/spiritual (dharma) name (e.g. "Durga Devi", "Guru Gian") |
| `legal_name` | string? | L3 | civil/registered name when it differs from `name` and is **publicly self-disclosed or register-evidenced** (e.g. "Durga Devi" → Esther, from her own @durgadevi_esther handle). The verification anchor: the registers (YA/CRKBO/KvK/BIG) key on this, not the dharma name. Record only when public — do not dig up private identities (AVG, §3). A dharma-only public identity with no `legal_name` and no register trace is itself a transparency/verification-friction signal |
| `trainings_claimed[]` | `{label, school?, year?, verified (q), source}` | L3 | "RYT 500", "500hr bij school X (2018)" — RYT claims are checkable in the public Yoga Alliance registry; a named school/year is at least falsifiable |
| `background[]` | `{field, credential, registry: big \| other \| none, verified (q), source}` | L3 | the hard axis: healthcare credentials (fysiotherapeut, arts) are verifiable in the **BIG-register**. "Anatomie door een fysio" becomes a register lookup, not bio-prose |
| `lineage_claims[]` | Claim ids | L3 | tradition/discipleship statements — **verbatim quotes only**, category `lineage_authority`; never modeled as a trust graph (see below) |

**Why a separate `legal_name`.** Yoga teachers commonly operate under a chosen spiritual name. Folding both into `name` ("Durga Devi (Esther)") destroys the distinction the data needs: `name` is what the reader sees and the school markets; `legal_name` is the key you match against the YA/CRKBO/KvK/BIG registers and what makes credential/lapse verification possible. Keeping them separate also lets a query surface the pattern *operates only under a dharma name, no civil name public, nothing in any register* — a real transparency signal that co-occurs with the unregistered/overclaim cluster. Privacy posture: record `legal_name` only when the teacher has themselves made it public (own bio/handle, KvK, a register) — the directory does not de-anonymize.

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
| `sent` | date | day-precise. "Invited to correct in July" is not a defensible sentence about a named business |
| `type` | `correction_request \| question \| right_of_reply` | |
| `summary` | string | what you showed them / asked |
| `respond_by` | date | **the window we gave them, stated (v0.11).** `response: none` used to mean "no reply after the stated window" while the window appeared *nowhere in the data* — an unfalsifiable claim. If you are going to publish a school's silence, publish how long you waited |
| `response` | `awaiting \| none \| {received: date, summary, source}` | **`awaiting` = the window is open: a fact about OUR process, and it says nothing whatever about them.** `none` = asked, deadline passed, silent — a *finding*, displayable, and defensible precisely because `sent` and `respond_by` are printed beside it. Before v0.11 `response` was required and `awaiting` did not exist, so logging a request on the day you sent it forced you to publish "invited to correct, no response" about a school that had had **zero days to answer**. `integrityErrors` now refuses `none` while `respond_by` is still in the future |

### 4.10 Deliberate omissions

Two §9 axes are intentionally *not* fields. **Soft signals** (post-training support, alumni community, responsiveness tone) are gameable and corroboration-only — they belong in `editorial`, never in structured data where a filter could treat them as fact. **Upsell structure** ("do you really need the 300?") emerges from `composition` + module pricing + derived `bundle_delta`; a dedicated field would be opinion dressed as data. And there is no `coherence` field by design — only the six signals.

---

## 4.11 CRKBO inference rule

Two facts about CRKBO must not be collapsed:

- **The VAT treatment of the price** (`price.vat`: `incl` / `excl` / `exempt_crkbo`) is *directly observed* — always recordable as fact.
- **Registration** (`crkbo.registered`) reflects the *register*, which is public and complete.

The inference between them is asymmetric. *Sold btw-vrij* → almost certainly CRKBO (or another exemption): near-definitional. *Charges BTW* → this **training** isn't being treated as exempt, but that is **not** proof the **provider** has no registration: it could be held by another entity (a BV/holding), by the founder personally in the **Docenten** register, be pending, or be lapsed. Exemption can even ride on a registered *teacher* while the school-brand holds no *Instelling* registration at all.

Therefore: never set `registered: no` from a brand-name register miss or a "charges BTW" inference — that stays `unknown`, with a note capturing the signal ("charges BTW → exemption unlikely"). Set `no` only after a **documented search by legal name (KvK) + relevant person names**.

**THE REGISTER IS COMPLETE. OUR SEARCH OF IT IS NOT.** These are different sentences, and collapsing them is how a failed lookup becomes a published finding about a named business. Completeness of the register is what makes a *properly-searched* non-membership a real `no` — it does nothing whatsoever for a search on the wrong key. A registration is routinely held by a BV, a holding, or the founder personally in the **Docenten** register, so searching the brand and the website proves only that *the brand* is not listed under *that* name.

The searched keys are therefore **structured, not prose** (`crkbo.searched[]`, v0.10). "Record them in the note" was the rule for a month, and it could not be checked, so it wasn't: `de-yogaschool-enschede` published `registered: no` on a brand-name miss while its own `legal_name` was *"onbekend"* — the search that could have justified the finding was not skipped, it was **impossible**. `registered: no` now **requires** `searched` to include `legal_name` or `kvk`: you may not assert non-membership without having looked under the name it would be registered under, and if you do not know that name, you cannot. `integrityErrors` rejects the record; the rule no longer depends on anyone remembering it.

**And the reverse inference is forbidden too — this is the half that was being enforced before it was written down.** `price.vat` is *directly observed on the page that states it, or it is `unknown`*. It may never be deduced from:

- **a CRKBO registration** — the exemption can sit in another entity, ride on a registered *docent* rather than the *instelling*, be pending, or be lapsed; and a school can hold a registration while still charging BTW on a particular training. A `crkbo.registered: yes` is evidence about the **register**, never about **this price**.
- **the invoicing entity** — that it is a BV, or is not CRKBO-registered, tells you what is *likely*, not what is *charged*.
- **a sibling programme's page** — the school's other training saying "incl. BTW" is a fact about *that* training. Bluebirds prices its 2025 cohort *"Excl BTW"* and its 2026 cohort at *"0% VAT as we are CRKBO registered"*; Yoga Den states the treatment on its 100-hour page and not on its 200-hour page. Reading one off the other is how both records came to assert a treatment their own cited page contradicts.

No page saying so → `unknown`. `unknown` is not a failure; it is the honest value, and it is what the Balanzs record already does correctly: CRKBO-registered as an *instelling*, on the same entity that runs the training, exemption *"zeer waarschijnlijk"* — and still `price.vat: unknown`, because the price pages state no VAT rule.

*(Enforced by `src/lib/provenance.ts`: a `vat` of `incl`/`excl`/`exempt_crkbo` must cite an artifact that states **that** treatment. A CRKBO badge, a footer BTW-nummer, or the word "vrijstelling" in a curriculum sense are not VAT statements.)*

**Archiving the search.** The CRKBO register has no per-entry permalink and no API — it is a DevExpress grid (≈4 800 instellingen over hundreds of pages) filtered by typing into the *Naam* / *Plaats* / *Website* boxes, server-side. A plain fetch, Wayback, or archive.today snapshot of the register URL therefore captures only page 1, never the searched row, and carries **no evidentiary value** for a specific registration — the same failure mode as the Salesforce-rendered YA register pages. The evidence is instead a **dated, browser-rendered local snapshot of the *filtered* result**, reproduced from the `Source.query` term (§4.1); Wayback is skipped for `crkbo.nl/Register/*`. A `yes` rests on that filtered snapshot, not on the bare URL.

## 4.12 Style classification

`style_claimed` stays verbatim (a claim). For filtering, `Program.styles[]` holds normalized tags from a controlled vocabulary (`vinyasa, hatha, ashtanga, yin, yang, kundalini, iyengar, restorative, raja, jnana, nidra, multistyle, own_method, other`) — descriptive, **not a quality signal** (like `format_label`).

Store the literal `multistyle` tag **only when the school self-frames that way** ("multistyle", "allround") — it records *their label*, not your conclusion. When a school instead names ≥2 **co-equal** specific styles, list those tags and leave `multistyle` out: "allround" is then **derived** (`isMultistyle()` returns true for the self-label *or* for ≥2 co-equal specifics), never stored — the same don't-store-the-conclusion rule as coherence. "Co-equal" matters: a primary style with a subordinate variant ("Vinyasa, met ruimte voor wat Hatha") is **one** style tag, not two. A program that simply states no style gets `styles: []` (unknown); absence of a statement is not a finding, never `multistyle` as a residual default.

## 5. Layer 1 — minimum live-worthy record (open decision #4)

A provider entry may go live when it has: `name`, `website`, `locations[].city`, `crkbo.registered` (checked — it's a 1-minute register lookup), `depth: listed`, `last_verified`, and per program: `name`, `url`, `format_label`, `delivery.mode` + `structure` + `language`, `price` (amount or `published: no`, with `includes`/`excludes` where stated), `prerequisites_claimed` (if published), `hours_claimed.total` + `contact` + `supervised_teaching_practice` (numbers, or the matching quad — `contact_published: not_published` where they publish no contact-hour figure), `accreditation[]` as claims, and at least one `source`.

Pilot-calibrated cost: **~20–30 minutes per entry** (the 15–20 estimate held for extraction; fetch retries and a missing-city contact-page lookup add the rest). Fully factual, zero legal exposure — and already enables the two killer views: the side-by-side 200-hour decomposition and the "filter on min. supervised teaching practice" filter no marketing listicle offers (§5 UX-subversion). Pilot validation: all five pilot programs landed on `supervised_teaching_practice: not_published` — the field's emptiness is the finding.

---

## 6. Derived fields (computed at build, never stored)

- `total_price` — the comparable whole-course figure the reader needs, and the one the provider often does not publish. **Three derivations, and the third is not optional:**
  1. `period: total` → `amount_eur` itself. **Theirs.** Rendered in fact ink, cited.
  2. `period` is a repeating unit and `periods` is known → `amount_eur × periods`. **Ours.**
  3. `period: per_module` (or any composition of **unequal** parts) → **the SUM of the composed modules' published prices**. Multiplication cannot express this: Adhouna's 200-hour Yin XL is Deel I € 1.420 + Deel II € 1.305, and `2 × 1.420` is not € 2.725. Without this derivation the sum has nowhere honest to live — which is exactly why € 2.725 ended up *stored* in `amount_eur`, rendered in Adhouna's own ink, citing a page that prints only the two parts. **Ours**, with the working shown ("onze optelling: € 1.420 + € 1.305"). `null` if any part's price is missing — an incomplete sum is a guess, and a guessed total is a published comparison with a hole in it (same rule as `bundle_delta`).

  **What binds all three.** Derivation 1 is the school's own figure and is rendered as theirs, in fact ink, cited. Derivations 2 and 3 are **ours**, and must be rendered as ours — muted, uncited, with the working shown ("± € 5.160 — onze berekening: 4 × € 1.290"; "± € 2.725 — onze optelling: € 1.420 + € 1.305"). Relabelling in either direction is a falsehood: calling their published total "our arithmetic" strips them of a statement they made, and calling our arithmetic "their claim" attributes to them a number they never said. `null` when the inputs are incomplete — a per-period price with no period count, or a composition with a missing part price, is not comparable and must not be ranked as though it were.

  **Price bands, price sorting and €/contactuur all consume `total_price`, never a bare `amount_eur`** — otherwise a yearly fee, or one half of a two-part course, is compared against a whole course. That is the failure that ranked de Blikopener the 3rd cheapest of 54 trainings.
- `total_hours` = `contact + self_study` when `hours_claimed.total` is absent but both parts are published. **The same rule as `total_price`, in the other unit.** de Yogaschool Enschede publishes *"360 uren"* and *"minimale zelfstudie van 240 uur"* and never their sum; we stored `total: 600` and the site printed it as their claimed total. The string "600" appears in none of their archived sources. Store what they publish; compute the sum; render it as OUR arithmetic ("± 600 u — onze optelling: 360 + 240"), never as their claim. `null` when either part is missing
- `scheduled_hours_ceiling` = `{kind: computed, value, working}` | `{kind: no_schedule, value: null}`. OURS on every programme — no `published` variant (no school publishes it). `Σ count × (end − start − pause_min)`, an **upper bound** on contact hours: clock time in the room ≥ contact time. Rendered "ten hoogste ≤ X". `no_schedule` where the record holds no `schedule`. Never stored.
- `hours_disconnect` = `{kind: computed, value, working}` | `{kind: no_comparison, value: null}`. OURS. `total_hours − scheduled_hours_ceiling` — a **lower bound** on the hours the timetable can't account for (the ceiling is an upper bound, so the gap is "minstens ≥ Y"). `no_comparison` where there's no schedule, or no PUBLISHED total (a total WE summed is not a claim to disconnect from). Never stored.
- `total_path_cost` = `total_price` + Σ `total_price` of every **purchasable** prerequisite in the chain (recursively; cycles are a validation error). **The number the reader actually came for: what does it cost to qualify here?** `total_price` answers "what does this course cost"; a course you cannot enrol in without first buying another course does not answer that question. de Yogaschool: `total_price` € 4.590, `total_path_cost` € 6.180 (Basisopleiding € 1.590 + 3 × € 1.530). **OURS** — muted, uncited, working shown ("± € 6.180 om te kwalificeren — incl. verplichte Basisopleiding € 1.590. Onze optelling."). `null` if any link's cost is unknown: an incomplete path cost is a guess, and a guessed comparison is worse than none. **Price bands and price sorting consume `total_path_cost` where it exists** — otherwise a course with a € 1.590 mandatory gate is ranked against one without.
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
