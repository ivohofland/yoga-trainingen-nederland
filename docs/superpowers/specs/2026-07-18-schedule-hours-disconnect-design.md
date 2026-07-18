# Schedule-derived hours: the ceiling and the disconnect

**Date:** 2026-07-18
**Status:** design, awaiting review
**Touches:** `data-model-spec.md` (→ v0.12), `src/schema/index.ts`, `src/lib/derive.ts`,
`src/lib/rules.ts`, `src/lib/quad.ts`, `src/lib/presenters.ts`, `src/lib/api.ts`, the
record page, and tests.

## Goal

Let a provider's **published schedule** (session dates/times) produce a defensible
**ceiling on contact hours**, and set it beside the school's **claimed total** to
surface the gap — the "200 uur" that the timetable cannot account for.

## Why this exists

Every DNYS programme claims a round total (200 uur) and none publishes a contact-hour
figure, so `pricePerContactHour` is blocked and the total stands unexamined. But the
schedule *is* published: the Vinyasa Teacher Training Intensive runs **21 days, 10:00–17:00**.
That is at most `21 × 7 = 147` clock hours — and with the lunch break the school's own
"10–17" implies, less. Either way it is **well short of 200**, and the ~53+ uur difference
is the self-study the round number quietly folds in (the reading list, the oefengroepje,
the persoonlijk verslag). At € 2.964,50 that is the difference between € 14,82 per claimed
"uur" and roughly € 22,80 per real contact hour. The disconnect between the claim and the
timetable is exactly the gap this publication exists to make checkable.

## Two principles this rests on

1. **The number is OURS, never theirs.** A figure computed from what they published is our
   arithmetic — the same footing as de Blikopener's derived € 5.160. It renders visibly as
   ours (`derived` ink, working shown, never cited as their figure), and
   `hours_claimed.contact_published` stays whatever it was: *they* still did not publish a
   contact-hour figure, *we* derived a bound. The block *times* underneath are their
   published facts and are cited; the sum over them is ours.

2. **Clock time is a ceiling on contact hours, so we never guess the break.** Contact time
   ≤ time in the room, always. The raw sum is therefore a strict **upper bound**: "at most
   147 uur, before any break." Breaks only lower the true figure, so the disconnect stated
   against the ceiling is conservative *against our own critique* — if we say "≥ 53 uur
   unscheduled" and the truth is 74, we understated it. That is the correct direction to be
   wrong about a named business. A **published** break (see `pause_min`) tightens the
   ceiling downward — a stronger, still-defensible statement — but the figure stays an
   upper bound, because we can only ever subtract the breaks they *state*, never prove we
   caught them all.

## Non-goals (v1)

- **No listing filter or sort on the disconnect.** Record page + API export only.
- **No per-session dated list.** The schedule is modelled as *typed blocks with counts*
  (below), not one row per calendar date. A schedule where every session has bespoke times
  would need the fuller per-session model — that is a later upgrade, not the common case.
- **No new "did they publish a schedule?" finding.** Absent blocks render nothing; the
  existing `breakdown_published` / `contact_published` quads already carry the
  finding-vs-gap story for hours. Adding a `schedule_published` axis is out of scope.
- **The composition of the claimed total** (e.g. the Vinyasa opleiding's *"inclusief
  lessenkaart cadeau"* — 7 class passes that arguably should not count toward the 200) is a
  *separate axis*: what is inside the claim, not what the timetable holds. Parked for its
  own treatment.

## Data model

A new optional `schedule` on `hours_claimed` (spec §4.3 / §5). Nothing about the existing
fields changes.

```yaml
hours_claimed:
  total: 200                 # their claim — unchanged
  contact: null
  breakdown_published: not_published
  contact_published: not_published
  # ... existing fields unchanged ...
  schedule:
    source: site-vinyasa-2026-06     # REQUIRED: the page that states the times
    note: "…"                        # optional
    blocks:                          # >= 1
      - { count: 10, start: "19:00", end: "21:30", label: "vrijdagavond" }
      - { count: 10, start: "10:00", end: "17:00", pause_min: 60, label: "zaterdag" }
      - { count: 10, start: "10:00", end: "13:00", label: "zondag (halve dag)" }
```

**Block fields:**

| field | type | notes |
|---|---|---|
| `count` | positive int | how many sessions of this type make up **one full run** of the programme (matches what `total` describes). |
| `start` | `"HH:MM"` | published start (`00:00`–`23:59`). |
| `end` | `"HH:MM"` | published end; **must be after `start`**. |
| `pause_min` | int ≥ 0, optional | published break per session, in minutes, subtracted from that block. **Present only when the school states it.** Omitted ≠ "no break" — it means "not stated," so nothing is deducted. Must be `< (end − start)`. |
| `label` | string, optional | e.g. "vrijdagavond", "zaterdag", "zondag (halve dag)". |

**Rules:**

- The **derived total is NEVER stored** (§6). No ceiling/hours field on the record;
  `derive` recomputes it every load, so a miscount surfaces in the visible working rather
  than baking a wrong number into the data.
- `count` is **per full run**, not per cohort. If cohorts differ materially, that is
  higher-depth per-cohort work (the per-session upgrade), not v1.
- `schedule.source` is a normal source ref — the existing referential-integrity check
  (`collectSourceRefs`) already requires it to resolve.

**New schema primitive:** a `Time` string, `^([01]\d|2[0-3]):[0-5]\d$` (mirrors how
`YearMonth` validates the range in the schema, not the renderer). The intra-block
invariants — `end` after `start`, `pause_min` under the session length — are a Zod
`.refine` on the block (they need only the block itself), keeping `loader.ts`
integrity for cross-references.

## Derived values (`derive.ts`)

Two new discriminated unions, in the house style (`kind` is the licence to print the
number). Both are **ours on every programme — no `published` variant**, exactly like
`pricePerContactHour` and `contactRatio`, because no school publishes either figure.

```ts
export type ScheduledHoursCeiling =
  | { kind: "computed"; value: number; working: string }   // hours; may be fractional (2.5)
  | { kind: "no_schedule" };                                // no blocks → value is absent

export type HoursDisconnect =
  | { kind: "computed"; value: number; working: string }   // claimed total − ceiling
  | { kind: "no_comparison" };                              // no schedule, or no claimed total
```

- **`scheduledHoursCeiling(program)`** = `Σ count × (end − start − pause_min)`, in hours.
  No `schedule`/blocks → `{ kind: "no_schedule" }`. The `working` names the blocks and
  states the caveat, e.g. `"25 + 70 + 30 u — 10 weekenden (vr 19–21:30, za 10–17 −1u pauze,
  zo 10–13); ten hoogste, overige pauzes niet meegerekend"`.
- **`hoursDisconnect(program)`** consumes the derived total via `totalHours()` (never the
  raw `hours_claimed.total` — the project's "consume the derived, not the raw" rule) and
  `scheduledHoursCeiling()`. Either missing (`no_total`/`incomplete`, or `no_schedule`) →
  `{ kind: "no_comparison" }`. Otherwise `value = total − ceiling`, a **lower bound** on the
  unscheduled hours (because the ceiling is an upper bound). `working`, e.g.
  `"200 − ten hoogste 125 = minstens 75 u niet in het rooster"`.

Both are computed at export and at render, and are still never stored (§6).

## Rules, ink, and rendering

- **Finding-vs-gap:** the feature is *additive and silent by default*. Blocks present →
  render the ceiling; render the disconnect *as well* only when a claimed total exists
  (`hoursDisconnect` is `no_comparison` otherwise, and shows nothing). No blocks → render
  nothing at all; the existing hours quads carry the story. No new quad state is introduced.
- **Ink (`quad.ts` / `inkFor`):** the ceiling and disconnect are ours → `derived` ink
  (muted/italic), working **required and shown**, never fact ink, never cited as the
  school's number. The block *times* are their facts and are cited to `schedule.source`.
  This is the `totalPrice` layout: their per-unit figure cited, our sum below it as ours.
- **Record page layout (recommended):** a compact cited "rooster" line stating their
  published block times (cited to `schedule.source`), then two derived rows — `rooster
  (onze telling): ten hoogste ≤ 125 u` and `verschil met claim: ≥ 75 u niet ingeroosterd`
  — built via `derivedRow()` (a derived row carries no `source` key; its `note` is the
  required working). Present the ceiling with **"ten hoogste ≤"** and the disconnect with
  **"minstens ≥"**, always.

## API export (`api.ts`)

Add to each programme's `derived` block, alongside `total_hours`, `pph`, etc.:

- `scheduled_hours_ceiling`: the `ScheduledHoursCeiling` union verbatim (`kind` + `value` +
  `working`, or `{kind:"no_schedule"}`).
- `hours_disconnect`: the `HoursDisconnect` union verbatim.

Consumers read `kind` (never a bare `value`), and the doc comment states the ceiling is an
**upper bound**, the disconnect a **lower bound**.

## Spec + schema changes

- **`data-model-spec.md` first (v0.11 → v0.12):** document `schedule` under §4.3/§5 and the
  two derived values under §6, including the ceiling-is-an-upper-bound rule and the
  never-stored constraint. Then mirror it in `src/schema/index.ts` — the standing order is
  spec first, schema second.

## Tests

`node:test`, locking the editorial invariants (not coverage):

- **Arithmetic:** the irregular weekend `25 + 70 + 30 = 125`; the Intensive `21 × 7 = 147`,
  and `21 × (7 − 1) = 126` with a stated `pause_min: 60`; a block with `pause_min` shorter
  than the session deducts correctly.
- **States:** `no_schedule` when `schedule` is absent; `no_comparison` when the ceiling
  exists but `totalHours()` is `no_total`, and vice-versa.
- **Never stored:** loading a record with `schedule` yields the ceiling only through
  `derive` — there is no stored total to drift.
- **Ink invariant** (the one that matters most, mirroring `quad.test`): a `no_schedule`
  gap and a `computed` ceiling never render identically, and a computed ceiling never
  renders in fact ink or with a source key.
- **Validation:** `end` after `start`; `pause_min` under the session length; `blocks` has
  ≥ 1 entry; a bad `Time` string is rejected by the schema, named by record and field.

## Worked examples

| programme | blocks | ceiling | claimed | disconnect |
|---|---|---|---|---|
| Vinyasa Intensive (EN) | 21 × 10:00–17:00 | ≤ 147 u | 200 u | ≥ 53 u |
| …with a stated 1 u lunch | 21 × 10:00–17:00, `pause_min: 60` | ≤ 126 u | 200 u | ≥ 74 u |
| Weekend opleiding (illustrative) | 10×(vr 19–21:30) + 10×(za 10–17) + 10×(zo 10–13) | ≤ 125 u | 200 u | ≥ 75 u |

The Intensive figures land in data only after the real published schedule (is it exactly
21 days? is a break stated?) is confirmed against the `site-intensive` capture — extracted
from the artifact, never from memory.
