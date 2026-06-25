# Yoga Alliance Monitor — Specification

**Status:** v0.2 (draft, not yet implemented)
**Scope:** A standalone dataset and pipeline that periodically snapshots Yoga
Alliance (YA) Registered Yoga School (RYS) registrations — together with their
**reviews** and **teaching staff** — for the Netherlands, records how they
change over time, and derives a **teacher → training-origin lookup** (the seed
of a lineage network) from review authorship.
**Relationship to the main project:** This is a *separate, machine-owned
dataset*. It does not live in `data/providers/` and does not use the curated
provider schema. It is linked to the editorial directory only by the YA school
id (and, where resolvable, the YA member id of a person). The teacher-origin
lookup is an **internal research aid**: it surfaces candidates that a human
confirms before anything enters a curated record. See `data-model-spec.md` for
the directory's model and `project-decisions.md` (decision #10) for the
decision log.

---

## 1. Purpose & motivation

YA profiles show only *current* state with no history. A school or teacher can
let a registration lapse and quietly re-register when it is convenient — a
pattern that is invisible on the live profile but materially relevant to an
independent directory. This monitor exists to make that history observable and
citable.

There is a second blind spot the monitor is uniquely placed to fill. **A YA
teacher's profile does not say where that teacher trained.** But a review on a
*school's* profile is written by someone who trained at that school, and the
review carries the author's full name (often a link to their own paid profile)
and the exact training-program dates. So capturing every school's reviews
yields the reverse index YA refuses to expose directly: *reviewer → school they
reviewed ≈ where they graduated.* For any teacher, you can then recover their
origin school; and when a reviewer later appears as teaching staff or an owner
elsewhere, you have traced a lineage edge (trained at X → now teaches at Y).

The core deliverables are therefore **not** a copy of YA's current data; they
are two derived time-aware artifacts:

1. A **time series** per school — the intervals during which it was listed,
   delisted, and re-listed, plus changes to its designations (RYS 200 / 300 /
   500), teaching staff, and registration dates.
2. A **lineage edge list** — `person → school` (trained-at, from reviews),
   `person → school` (teaches-at, from staff), and `school → school` (brand
   reviewers), each dated and confidence-tagged. The teacher-origin lookup is a
   filtered view of this; a rendered network (if ever wanted) is the same data
   drawn as nodes and edges.

A lapse-and-renew round trip (`active → delisted → active`, with dates), a
*deleted* review, and an inferred training origin are all *findings* — the kind
of evidence that cannot be reconstructed after the fact if it is not captured
as it happens.

## 2. Design principles

These mirror the editorial discipline of the main project (`data-model-spec.md`):

- **Capture absence honestly.** A school disappearing — or a review being
  deleted — is among the most valuable signals this system produces. It is
  recorded, never erased.
- **Distinguish authoritative absence from capture failure** — the monitoring
  analogue of `not_published` (a finding) vs `unknown` (a gap). Never mark a
  school delisted, or a review deleted, because a single run failed to see it.
  See §6.
- **Inferred links are claims, never facts.** A "person trained at school X"
  derived from review authorship is a claim with a **confidence tier** (§9) and
  full provenance (which review, what name/id match), exactly as the provider
  records store claims rather than asserting facts. A weak match is a candidate,
  not an edge.
- **Capture, then derive.** Per-school JSON files are the source of truth.
  Everything queryable — the status timeline, the reverse index, the lineage
  edge list — is *materialized at build time* from those files. The storage
  layout never has to be "searchable" or "a graph"; the derivations are. See §4
  and §8.
- **Files-in-git; git is the capture log, not the query layer.** History and
  edges are derived once at build time into explicit records; nothing at render
  time parses git diffs (the published site is static SSG and has no git at
  runtime anyway).
- **Machine-owned, never hand-edited.** Unlike the provider YAMLs, these files
  are generated. Hand-editing a snapshot corrupts the time series. The only
  human-authored artifacts are this spec and the pipeline code — plus the
  human *confirmation* step that promotes a candidate origin into a curated
  record (§10), which is recorded in the provider YAML, not here.
- **Preserve evidence.** Keep the raw API response as immutable capture, not
  just the normalized form — the "archive before citing" posture applied to a
  JSON API.

## 3. Data sources

YA's `app.yogaalliance.org` is a **Lightning Web Runtime (LWR) Experience
site**. The public profile hydrates from a guest JSON API; the rendered HTML is
secondary.

- **Profile data — guest Apex API.**
  `POST https://app.yogaalliance.org/webruntime/api/apex/execute?language=en-US&asGuest=true&htmlEncode=false`
  A single profile load fires ~8 of these calls (school info, training dates,
  **reviews**, **teaching staff**, …). `asGuest=true` means **public,
  unauthenticated** — the same data the page serves anyone. No login, no
  credential entry, no bot-detection bypass.
- **Reviews.** Each review on a school profile exposes (confirmed from a live
  capture, 2026-06): a **rating** (e.g. `5`, `3.5`), the **author's full name**
  (`Natalie Anna`, `Ilario Savi`, or a brand like `Gaja Luna Yoga`), a **link
  to the author's own paid YA profile when they have one** (→ a stable YA member
  id — the strong identity key), the **review date**, and the **training-program
  dates** the author attended (`held on Jan 11, 2025 – Jun 28, 2025`). The
  training dates tie a reviewer to a *specific cohort*, not merely the school.
- **Teaching staff.** Name, credential level (E-RYT 200/500), YACEP flag, and a
  link to the member profile where present. This is the `teaches_at` edge
  source and a cross-check on review-author identity.
- **Designation signal — static badge assets.** The RYS badges load as PNGs,
  e.g. `…/backgroundImages/RYS200.png` / `RYS300.png`. Which badge PNGs a
  profile requests is an independent, machine-readable confirmation of
  designation level (this is how Spark of Light was confirmed to hold both RYS
  200 and RYS 300 when the rendered DOM had no alt-text). The Apex JSON also
  carries it as a field; the PNG request is a cross-check.
- **Enumeration — directory search.** The "find a training" directory provides
  the population of currently-listed NL schools (filter by country). This is the
  discovery source for *new* schools (§7).

**Stable keys:** the YA **school id** in the profile URL (e.g.
`0013g000002pjxpAAA`) keys every school snapshot; the YA **member id** (from a
linked author/staff profile) keys a person when available. These do not change
when a profile is edited.

**Volatile elements:** the Apex `classname`/method ids (e.g. `01pTR000001kBkA`)
can rotate when YA redeploys; the guest session requires a cookie + CSRF-style
token obtained by first loading the page. The pipeline must therefore
re-discover endpoints rather than hard-code them (§9).

## 4. Storage model

A separate top-level directory, `ya-monitor/`, with three **capture** layers
(per school, keyed by YA id) and a **derived** layer rebuilt every run:

```
ya-monitor/
  raw/<ya_id>/<capture_date>.json   # immutable raw API response(s) — incl. reviews
  snapshots/<ya_id>.json            # normalized CURRENT state (overwritten); incl. reviews[], teaching_staff[]
  history/<ya_id>.json              # append-only event/interval log (school status, designations, reviews)
  derived/
    edges.json                      # graph-shaped edge list (trained_at / teaches_at / reviewed_by) — §5.3
    people.json                     # person registry: id, name(s), ya_member_id?, confidence notes
    origin-lookup.json              # convenience view: person -> [origin schools + cohort + confidence]
  index.json                        # master id set + last-run metadata (§7)
```

**Format: JSON, not curated YAML.** This data is generated and machine-read.
JSON matches what the API returns and the repo's existing machine output
(`public/data/v1/providers.json`). Rule of thumb for the repo: *generated =
JSON, hand-curated = YAML.*

- **`raw/`** — the unmodified API payload(s) for a capture, dated. Immutable
  evidence; never overwritten. One file per capture (these accumulate; that's
  intentional — they are the archive).
- **`snapshots/<ya_id>.json`** — the normalized **current** state, **overwritten**
  each run. Keys sorted, field order stable, volatile noise stripped (session
  ids, image GUIDs) so month-to-month git diffs show only real changes. Now also
  carries `reviews[]` and `teaching_staff[]` (§5.1).
- **`history/<ya_id>.json`** — append-only list of transitions (school status,
  designations, **and review present→deleted events**), written **only when
  something changes** (§6/§8). Powers the timeline; not reconstructed from git.
- **`derived/`** — rebuilt wholesale every run from the snapshots. `edges.json`
  is the graph (§5.3); `origin-lookup.json` is the filtered convenience view the
  internal tool reads; `people.json` is the entity-resolution registry (§9).
  These are pure functions of the snapshots — deletable and regenerable.

**On searchability and scale.** The teacher-origin query is the *inverse* of the
storage layout (you store school→reviewers, you ask person→schools), so it is
answered against `derived/origin-lookup.json`, not by scanning per-school files.
At NL scale (~200–400 schools × ~tens of reviews ≈ a few thousand reviews / a
few thousand people) the entire derived layer fits in memory; no database is
needed, and a brute-force scan would also be fine. **Escape hatch:** if the
graph ever outgrows in-memory use, load the same JSON into SQLite (or an
in-memory graph lib) *at build time* — the files remain the source of truth, so
there is no migration.

## 5. Record shapes (draft)

### 5.1 Normalized snapshot (`snapshots/<ya_id>.json`)

```jsonc
{
  "ya_id": "0013g000002pjnHAAQ",
  "name": "Tula",
  "country": "NL",
  "city": "Amsterdam",
  "designations": ["RYS200"],              // from Apex field + badge cross-check
  "first_registered": "2018-09",
  "languages": ["en", "nl"],
  "teaching_staff": [
    { "name": "Eva de Hoijer", "level": "E-RYT500", "yacep": true, "ya_member_id": "0033g…" },
    { "name": "Moena de Jong", "level": "E-RYT500", "yacep": true, "ya_member_id": null }
  ],
  "reviews": [
    {
      "review_id": "r-2025-08-22-natalie-anna",  // synthesized stable key (date+name hash) if YA gives none
      "reviewer_name": "Natalie Anna",
      "reviewer_ya_member_id": "0033g…",          // present only if the name links to a paid profile
      "reviewer_profile_url": "https://app.yogaalliance.org/…",
      "rating": 5,
      "text": "…review body, verbatim…",          // stored (decision 2026-06); personal data, internal-only (§9.3)
      "review_date": "2025-08-22",
      "training_start": "2025-01-11",
      "training_end": "2025-06-28",
      "is_brand": false,                          // true for brand authors (e.g. "Gaja Luna Yoga")
      "first_seen": "2026-06",
      "status": "present"                         // present | deleted (§6)
    }
  ],
  "rating": 4.71,
  "review_count": 26,
  "status": "active",                             // school status, see §6
  "last_seen_active": "2026-06",
  "captured": "2026-06-25",
  "raw_ref": "raw/0013g000002pjnHAAQ/2026-06-25.json"
}
```

**Decision (2026-06): store the full review, including the verbatim text body.**
The teacher-origin join needs only author + dates, but the text is retained as
evidence (it may itself name a teacher, a co-student, or a tradition). Because
it is **personal data about named individuals**, it is **internal-only** —
never republished verbatim; see §9.3.

### 5.2 History event (`history/<ya_id>.json`)

Append-only. School status/designation events as in v0.1, **plus review
lifecycle events**:

```jsonc
{
  "ya_id": "0013g000002pjnHAAQ",
  "events": [
    { "date": "2018-09", "type": "first_registered" },
    { "date": "2026-06", "type": "review_added",   "review_id": "r-2025-08-22-natalie-anna" },
    { "date": "2026-11", "type": "review_deleted", "review_id": "r-2023-04-30-ilario-savi", "commit": "<sha>" }
  ],
  "intervals": [
    { "status": "active", "from": "2018-09", "to": null }
  ]
}
```

A deleted review is a recorded event with provenance, never an erasure — same
discipline as a delisting.

### 5.3 Edge (`derived/edges.json`) — the lineage layer

One flat, regenerated edge list. The lookup is a filter over it; a network
render is the same list drawn as a graph.

```jsonc
{ "generated_from": "snapshots@2026-06-25", "edges": [
  { "type": "trained_at", "person": "name:moena-de-jong",   // no linked profile → Tier B, name-keyed
    "school": "0013g…SchoolZ", "cohort": "2019-10..2020-03",
    "confidence": "B", "evidence": "raw/0013g…SchoolZ/2026-06.json#reviews[3]" },
  { "type": "teaches_at", "person": "ya:0033g…EvaId",       // linked member id → Tier A
    "school": "0013g000002pjnHAAQ", "confidence": "A",
    "evidence": "snapshots/0013g000002pjnHAAQ.json#teaching_staff[0]" },
  { "type": "reviewed_by", "person": "brand:Gaja Luna Yoga",
    "school": "0013g…", "cohort": "2023-10..2024-05", "confidence": "B" }
]}
```

`person` is the strong key when resolvable — `ya:<member_id>` (Tier A) —
otherwise a normalized `name:<slug>` (Tier B/C); brands use `brand:<slug>`.
Display names and the id↔name resolution live in `people.json` (§9.1).
**Teacher → origin lookup** = `edges.filter(e => e.type === "trained_at" && samePerson(e.person, q))`.
**Lineage network** = render `edges` as nodes + edges, filtered by confidence.

## 6. Status lifecycle

`status ∈ { active, delisted, capture_failed, unknown }` for schools, and
`status ∈ { present, deleted }` for individual reviews.

Per monthly run, per known school:

| Observation this run | Action |
|---|---|
| Present, profile fetched OK | update snapshot fields; `status: active`; bump `last_seen_active`; reconcile `reviews[]` (new → `review_added`; previously-seen review now absent → see review rule) |
| Profile id **authoritatively** absent (HTTP 404 / "not registered" / empty registered-state) | keep file; `status: delisted`; stamp the transition; **freeze last-known-good snapshot fields** (do not blank them) |
| Fetch inconclusive (network error, rate-limit, endpoint rotated, parse failure) | do **not** change `status`; record `capture_failed` marker / increment miss counter; leave prior snapshot intact |

**False-positive guard (critical).** A school moves to `delisted`, and a review
moves to `deleted`, only on a *positive* absence signal, never on mere
absence-from-this-run. Require a hard 404 **or N consecutive confirmed-absent
runs** before committing the transition. This is the `not_published` vs
`unknown` discipline: a delisting/deletion is a finding and must be earned.
Because a profile load is all-or-nothing, an individual review's absence is only
trusted when the *profile fetch succeeded* and the review is gone from a
complete review set — never when the whole capture failed.

**Freeze, don't blank.** On delisting, retain the last real snapshot data;
only `status` and the freeze flag change. A deleted review is likewise retained
with `status: deleted`, not removed.

## 7. Capture pipeline (monthly)

1. **Enumerate.** Query the directory for currently-listed NL schools → set `L`.
2. **Master set.** `index.json` holds every id ever seen, `K`. New ids
   (`L \ K`) are added with a `first_seen` capture.
3. **Probe.** For every id in `K` (not just `L` — a delisted school is absent
   from `L` and must still be probed by id), call the guest Apex API, capturing
   the raw response (school info + reviews + staff) to `raw/`.
4. **Normalize.** Strip volatile fields, sort keys, derive `designations` from
   the Apex field and the badge-PNG cross-check, and reconcile `reviews[]` /
   `teaching_staff[]`; write `snapshots/<id>.json`.
5. **Diff & classify.** Compare new normalized snapshot to prior; determine
   school status and per-review status per §6 (with the false-positive guard).
6. **Append history.** On any material change (status, designations, staff
   add/remove, credential change, first_registered change, review add/delete),
   append an event to `history/<id>.json`.
7. **Derive.** Rebuild `derived/` from all snapshots: resolve people (§9), emit
   `edges.json`, `people.json`, and `origin-lookup.json`.
8. **Commit.** One dated commit per run. Git history backs the snapshots; the
   event log + derived layer back the tools.
9. **Changelog.** Generate a human-readable digest of material events (new
   schools, delistings, deleted reviews, newly-resolved origin candidates) for
   editorial review (§8/§10).

Cadence is monthly by default; the lapse/renew and review-deletion signals do
not need finer resolution. Implemented as a scheduled job.

## 8. Derivation for the tools

The published directory is **static SSG** (Next.js), so timelines, the lookup,
and any network view are computed at **build time**, not from git at request
time. Because transitions are recorded explicitly in `history/` and edges in
`derived/edges.json` at capture time, no consumer mines git diffs.

- **Status timeline:** load `history/<id>.json`, expose `intervals[]`; render a
  horizontal status strip or compact text timeline. Each boundary links to its
  commit + raw capture (provenance).
- **Teacher → origin lookup (the internal aid):** load
  `derived/origin-lookup.json` (or filter `edges.json` on `trained_at`); given a
  teacher name or YA member id, return origin candidates with cohort dates,
  confidence tier, and the evidence pointer. Used by an editor to confirm a
  finding before it enters a curated record (§10).
- **Lineage network (deferred render):** the *same* `edges.json`, drawn as
  nodes + edges, filtered to confidence A/B. No new data primitive — choosing
  the lookup now actively builds toward the network. A small inline SVG / CSS
  view suffices at this scale; no heavy graph library required.

Git remains the audit trail / safety net; the event log + derived layer are the
queryable sources.

## 9. Identity, confidence & ethics

### 9.1 Entity resolution & confidence tiers

Matching a reviewer to a person — and a person to a curated lead teacher — is
the hard part, and it is graded, never assumed:

- **Tier A — strong.** The reviewer name links to a paid YA profile → a stable
  `ya_member_id`. Identity is as solid as a school's id; the same person across
  reviews/staff is unambiguous.
- **Tier B — medium.** Full name, no linked profile, but a distinctive name plus
  corroborating training dates (and, ideally, a cross-appearance as staff
  elsewhere). Probable, not certain.
- **Tier C — weak.** Common or ambiguous name, no link, no corroboration →
  **candidate only**, kept internal, never promoted without human review.

`people.json` records each resolved person, the evidence behind the
resolution, and unresolved name collisions left deliberately open (`unknown`,
not a forced merge). Brand authors (`brand:…`) are kept distinct from people.

### 9.2 Robustness

- **Endpoint rotation.** Do not hard-code Apex `classname`/method ids. Load a
  profile once to obtain guest cookies + token and discover current method ids,
  then replay the calls. A capture that fails endpoint discovery is
  `capture_failed`, not `delisted`/`deleted` (§6).
- **Pipeline liveness.** Because `capture_failed` (correctly) changes nothing, a
  fully broken run looks identical to "nothing changed." Emit a **run-level
  health signal**: if the `capture_failed` rate across a run exceeds a
  threshold, alert the human — otherwise the monitor can silently stop
  collecting.
- **Rate limiting & etiquette.** Throttle; run monthly, not aggressively; cache
  the directory enumeration. Public guest data, but volume and cadence stay
  deliberate and low-impact.

### 9.3 Privacy (AVG) — load-bearing

The teacher-origin layer infers and records facts about **named individuals**
that go beyond what each school published — more sensitive than school
registration data. Therefore:

- **Internal research aid only** (decision: 2026-06). The lookup and the raw
  inferred edges are *not* published. The only public artifact is a
  human-confirmed origin written into a curated provider record as a dated,
  sourced finding (§10), subject to the directory's normal correction / right-of
  -reply posture.
- **Human in the loop before publication.** No Tier-C candidate, and no
  unconfirmed Tier-B match, ever auto-promotes into a record.
- **Review text is stored** (decision 2026-06, §5.1) and is therefore treated
  as personal data: kept internal, never republished verbatim, and used only as
  evidence behind a human-confirmed, separately-sourced record finding.
- **Review YA's terms of use *before the first capture* — including the one-off
  spike** (decision 2026-06) — and record the outcome in `project-decisions.md`.
  No capture, manual or automated, happens until that is done. Guest endpoints
  only; no login, no bypassing access controls or bot-detection.

## 10. Editorial integration

The monitor is upstream evidence, not the directory itself. Material findings —
a current cohort under a lapsed registration; an RYS 300 that appeared or
disappeared; a lead trainer no longer E-RYT 500 (the E-RYT 500 standard for RYS
200/300 since 2025-01-01); **a lead teacher's confirmed training origin** —
flow into the curated provider records as dated, sourced findings citing the
relevant snapshot/commit (and, for origins, the review evidence + confidence
tier). The provider records keep their verbatim-and-archived posture; the
monitor supplies the longitudinal and relational evidence they cannot otherwise
have. Promotion is always a human step (§9.3).

## 11. Scope & phasing

- **Phase 1 — schools + status history.** Seed from the existing enumeration
  (`enumeration/`) and the NL directory; capture §5.1 (incl. reviews + staff);
  build the school lifecycle and history. Stabilize before deriving.
- **Phase 2 — teacher-origin lookup.** Build the derived edge list, people
  registry, and the internal lookup over `trained_at` edges. This is the chosen
  primary deliverable beyond raw capture.
- **Phase 3 (deferred) — lineage network render.** Draw `edges.json` as a
  browsable graph. No capture change; a render view only. Revisit any
  public-facing exposure together with the AVG posture (§9.3).
- **Out of scope (for now):** non-NL schools; YACEP continuing-ed providers as
  a separate population; alerting beyond the pipeline-liveness signal;
  individual E-RYT teacher *registration* monitoring (distinct from origin
  inference).

## 12. Open questions

- **Prerequisite (decision 2026-06):** review YA's terms of use and record the
  decision in `project-decisions.md` *before any capture, including the spike*
  (§9.3).
- **First spike (blocks everything downstream):** capture one real guest-Apex
  request/response pair and confirm the exact field shape — for the school
  record, the **reviews** payload (author id/link encoding, training-date
  fields, text body), and designation encoding. Everything in §5 is drafted
  against a single observed profile and must be verified against the JSON.
- How many consecutive confirmed-absent runs before `delisted` / `review_deleted`
  is committed (§6)?
- Does YA keep a profile reachable by id after a school lapses (lapsed-state
  page) or hard-404? Determines the absence signal — needs a real observed lapse.
- Directory enumeration completeness for NL — does the public directory expose
  every RYS, or only those with upcoming public dates?
- ~~Store review **text** or not?~~ **Resolved (2026-06): yes** — stored as
  internal-only personal data (§5.1, §9.3).
- Retention: keep `raw/` and deleted-review records indefinitely as archive, or
  prune/compress over time?
- Entity-resolution threshold for auto-promoting a Tier-B match to "confirmed"
  vs. always requiring human review (§9.1).
