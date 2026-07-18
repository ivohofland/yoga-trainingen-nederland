# Schedule-derived hours: ceiling + disconnect — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a provider's published session schedule into a strict *upper bound* on contact hours (ours), and set it beside their claimed total to surface the "200 uur" the timetable can't account for.

**Architecture:** A new optional `schedule` object on `hours_claimed` (blocks of `count × start–end`, with an optional published `pause_min`). Two pure functions in `derive.ts` — `scheduledHoursCeiling` (ours, a ceiling) and `hoursDisconnect` (claimed total − ceiling) — return the same discriminated unions as the other derived values. They render as ours via the existing `derivedRow` + `inkFor` path (so the record page needs no change) and ship in the API's `derived` block.

**Tech Stack:** TypeScript, Zod (schema), `yaml` (data), Next.js static export, `node:test` via `tsx --test`. No new dependencies.

## Global Constraints

Copied from `docs/superpowers/specs/2026-07-18-schedule-hours-disconnect-design.md`. Every task's requirements implicitly include these.

- **The derived total is NEVER stored** (spec §6). No ceiling/hours number is written into `data/`; `derive` recomputes it every load.
- **The ceiling is an UPPER BOUND.** Render it as "ten hoogste ≤"; the disconnect as "minstens ≥". A published `pause_min` only tightens it downward — it never becomes a precise claim.
- **The figure is OURS, not theirs.** It renders as a derived row (muted, working shown, **no `source` key**); `hours_claimed.contact_published` is untouched. The block *times* are their facts, cited via `schedule.source`.
- **Additive and silent by default.** No `schedule` → no rows, no new finding. The disconnect row shows only when a claimed total exists AND the gap is positive.
- **`pause_min` is present only when the school states the break.** Omitted ≠ "no break" — it means "not stated," so nothing is deducted.
- **No new dependencies. One YAML per provider. Static export (`output: "export"`).**
- `derive.ts`, `rules.ts`, `quad.ts`, `presenters.ts`, `api.ts` must import **nothing** from `node:*`.
- Non-goals (do NOT build): a listing filter/sort on the disconnect; a per-session dated schedule list; a new "schedule_published" finding axis.

**Commands** (all from `yoga-trainingen-directory/`): `npm run validate`, `npm run gen-schema`, `npm run provenance`, `npx tsx --test <file>`, `npm test`.

---

### Task 1: Bump the spec to v0.12

**Files:**
- Modify: `data-model-spec.md` (repo root — the source of truth; change the spec BEFORE the schema, per CLAUDE.md)

No code, no test — this is the spec change the rest of the plan mirrors. Its deliverable is a reviewer being able to check every later task against §4.3 and §6.

- [ ] **Step 1: Add the v0.12 changelog entry**

Insert immediately **above** the `**v0.11 (2026-07-14)** …` line (currently line 5):

```markdown
**v0.12 (2026-07-18)** — `hours_claimed.schedule` + two derived values (`scheduled_hours_ceiling`, `hours_disconnect`). A programme claims a round total (200 uur) and often publishes no contact-hour figure, so the total stands unexamined — while the *schedule* is published (the DNYS Intensive: 21 dagen, 10:00–17:00). Contact time can only ever be ≤ time in the room, so the raw clock sum is a strict **upper bound** on contact hours: at most 147 u, ≥ 53 u short of the claimed 200. The figure is OURS (derived ink, working shown, `contact_published` untouched — *they* didn't publish it, *we* bounded it); a published break (`pause_min`) tightens the ceiling downward but never makes it a precise claim, because we can only subtract the breaks they state. `schedule.blocks[]` model irregular timetables (Friday evening + full Saturday + half Sunday = three blocks). Silent without a schedule; no new finding axis.
```

- [ ] **Step 2: Extend the `hours_claimed` row in §4.3**

In the `hours_claimed` table row (currently line 164), append to the Type cell's field list `schedule?` and add to the Notes cell (after the existing `breakdown_published`/`contact_published` paragraph):

```markdown
<br><br>**`schedule?` = `{source!, note?, blocks[]}`, each block `{count, start "HH:MM", end "HH:MM", pause_min?, label?}` (v0.12).** The published session times, per session type: `count` sessions of `start`–`end`, minus a stated break (`pause_min`, minutes — omit when not stated; omitted ≠ no break). `scheduled_hours_ceiling` (§6) sums them as a strict UPPER BOUND on contact hours; `hours_disconnect` (§6) sets it beside the claimed total. Blocks are per *full run*, not per cohort. Silent where the school publishes dates without times.
```

- [ ] **Step 3: Add the two derived fields to §6**

In §6 ("Derived fields (computed at build, never stored)", line 304), add two rows matching the existing column layout of that table, with this content:

```markdown
| `scheduled_hours_ceiling` | `{kind: computed, value, working}` \| `{kind: no_schedule, value: null}` | OURS on every programme — no `published` variant (no school publishes it). `Σ count × (end − start − pause_min)`, an **upper bound** on contact hours: clock time in the room ≥ contact time. Rendered "ten hoogste ≤ X". `no_schedule` where the record holds no `schedule`. Never stored. |
| `hours_disconnect` | `{kind: computed, value, working}` \| `{kind: no_comparison, value: null}` | OURS. `total_hours − scheduled_hours_ceiling` — a **lower bound** on the hours the timetable can't account for (the ceiling is an upper bound, so the gap is "minstens ≥ Y"). `no_comparison` where there's no schedule or no claimed total. Never stored. |
```

- [ ] **Step 4: Commit**

```bash
git add data-model-spec.md
git commit -m "Spec v0.12: hours_claimed.schedule + scheduled_hours_ceiling/hours_disconnect"
```

---

### Task 2: Schema — `Time` primitive, `Schedule`, and the block invariants

**Files:**
- Modify: `src/schema/index.ts` (add `Time`, `Schedule`; add `schedule?` to `hours_claimed`; export `Schedule`, `Time`)
- Create: `src/lib/schedule-schema.test.ts`
- Regenerate: `public/provider.schema.json` (via `npm run gen-schema`)

**Interfaces:**
- Produces: `export const Time` (a `z.string()` HH:MM); `export const Schedule` (a `strictObject` with `source`, `note?`, `blocks[]`); `Program["hours_claimed"]["schedule"]` optional, typed `{ source: string; note?: string; blocks: { count: number; start: string; end: string; pause_min?: number; label?: string }[] } | undefined`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/schedule-schema.test.ts`:

```ts
/**
 * The `schedule` block invariants live in the schema (Zod), because they are
 * intra-block facts — end after start, a break shorter than the session, a real
 * clock time — that Zod can check from the block alone. `validate` then names the
 * offending record and field, rather than a formatter blowing up downstream.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Schedule } from "../schema";

const ok = { source: "s", blocks: [{ count: 21, start: "10:00", end: "17:00" }] };

test("schema: a well-formed schedule parses", () => {
  assert.equal(Schedule.safeParse(ok).success, true);
});

test("schema: a schedule needs at least one block", () => {
  assert.equal(Schedule.safeParse({ source: "s", blocks: [] }).success, false);
});

test("schema: end must be after start", () => {
  const r = Schedule.safeParse({ source: "s", blocks: [{ count: 1, start: "17:00", end: "10:00" }] });
  assert.equal(r.success, false);
});

test("schema: pause_min must be shorter than the session", () => {
  // 10:00–11:00 is 60 min; a 60-min pause leaves zero, which is not a session.
  const r = Schedule.safeParse({ source: "s", blocks: [{ count: 1, start: "10:00", end: "11:00", pause_min: 60 }] });
  assert.equal(r.success, false);
});

test("schema: a published pause shorter than the session is fine", () => {
  const r = Schedule.safeParse({ source: "s", blocks: [{ count: 1, start: "10:00", end: "17:00", pause_min: 60 }] });
  assert.equal(r.success, true);
});

test("schema: a non-HH:MM time is rejected", () => {
  assert.equal(Schedule.safeParse({ source: "s", blocks: [{ count: 1, start: "10", end: "17:00" }] }).success, false);
  assert.equal(Schedule.safeParse({ source: "s", blocks: [{ count: 1, start: "24:00", end: "25:00" }] }).success, false);
});

test("schema: count must be a positive integer", () => {
  assert.equal(Schedule.safeParse({ source: "s", blocks: [{ count: 0, start: "10:00", end: "17:00" }] }).success, false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --test src/lib/schedule-schema.test.ts`
Expected: FAIL — `Schedule` is not exported from `../schema`.

- [ ] **Step 3: Add the schema**

In `src/schema/index.ts`, add the `Time` primitive right after the `YearMonth`/`Year` block (after line ~59):

```ts
/** A clock time "HH:MM", 00:00–23:59 (spec §4.3, v0.12). Validated HERE, like YearMonth —
 *  so `validate` names a bad time by record and field, and derive.ts may assume a real one. */
export const Time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM, 00:00–23:59");
```

Add the `Schedule` schema just before the `Program` definition (near line ~349, above `CoherenceSignals`):

```ts
/* ---------- Schedule (spec §4.3, v0.12) ---------- */

/** Minutes since midnight — for the intra-block invariants below. */
const hhmm = (t: string): number => {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
};

/**
 * ONE SESSION TYPE, AND HOW MANY OF IT (spec §4.3, v0.12). `count` sessions running
 * `start`–`end`, minus a STATED break (`pause_min`). The three refinements are all
 * intra-block — end after start, a break shorter than the session, a real clock time —
 * so Zod can check them from the block alone, and `validate` names the offender.
 */
const ScheduleBlock = strictObject({
  count: z.number().int().positive(),
  start: Time,
  end: Time,
  /** Published break per session, MINUTES. Present only when the school states it —
   *  omitted means "not stated", never "no break". Subtracted from the ceiling. */
  pause_min: z.number().int().nonnegative().optional(),
  label: z.string().optional(),
})
  .refine((b) => hhmm(b.end) > hhmm(b.start), {
    message: "end must be after start",
    path: ["end"],
  })
  .refine((b) => b.pause_min == null || b.pause_min < hhmm(b.end) - hhmm(b.start), {
    message: "pause_min must be shorter than the session",
    path: ["pause_min"],
  });

/**
 * A programme's published timetable, as typed blocks — irregular schedules are just more
 * blocks (Friday evening + full Saturday + half Sunday = three). `source` is required: the
 * block times are facts about a named business and need the page that states them.
 * `scheduled_hours_ceiling` (derive.ts) sums it as an UPPER BOUND on contact hours.
 */
export const Schedule = strictObject({
  source: z.string(),
  note: z.string().optional(),
  blocks: z.array(ScheduleBlock).min(1, "a schedule needs at least one block"),
});
```

Then add `schedule` to the `hours_claimed` inline object in `Program` (after the `contact_published` field, near line ~493):

```ts
    /** The published timetable (spec §4.3, v0.12). Feeds scheduled_hours_ceiling +
     *  hours_disconnect (derive.ts). Absent = we hold no session times; the feature is silent. */
    schedule: Schedule.optional(),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test src/lib/schedule-schema.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Regenerate the JSON schema and validate the corpus**

Run: `npm run gen-schema && npm run validate`
Expected: gen-schema rewrites `public/provider.schema.json` (the object shape of `schedule` appears; the cross-field refinements are Zod-only, as with other cross-field rules); validate prints `✓ 48 provider record(s) valid` (no record has a `schedule` yet, so nothing changed for them).

- [ ] **Step 6: Commit**

```bash
git add src/schema/index.ts src/lib/schedule-schema.test.ts public/provider.schema.json
git commit -m "Schema: hours_claimed.schedule (blocks) + Time primitive + block invariants"
```

---

### Task 3: `derive.ts` — `scheduledHoursCeiling` + `hoursDisconnect`

**Files:**
- Modify: `src/lib/derive.ts` (two functions + two exported union types; a local `minutesOfDay` helper)
- Modify: `src/lib/strings.ts` (the working strings)
- Create: `src/lib/schedule-derive.test.ts`

**Interfaces:**
- Consumes: `Computed` (existing interface in derive.ts), `totalHours(program)` (existing).
- Produces:
  - `export type ScheduledHoursCeiling = Computed | { kind: "no_schedule"; value: null }`
  - `export type HoursDisconnect = Computed | { kind: "no_comparison"; value: null }`
  - `export function scheduledHoursCeiling(program: Program): ScheduledHoursCeiling`
  - `export function hoursDisconnect(program: Program): HoursDisconnect`

- [ ] **Step 1: Write the failing test**

Create `src/lib/schedule-derive.test.ts`:

```ts
/**
 * The ceiling and the disconnect — OURS on every programme, and a strict upper/lower
 * bound. Pinned against CONSTRUCTED programmes (not the live corpus): a rule that finds
 * its case by sweeping data dies the day the data moves. See price-gap.fixture.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { scheduledHoursCeiling, hoursDisconnect } from "./derive";
import type { Program } from "../schema";

/** A minimal, schema-shaped Program; each test overrides only hours_claimed. */
function program(hours: Program["hours_claimed"]): Program {
  return {
    id: "t",
    name: "T",
    format_label: "200",
    accreditation: [],
    delivery: { mode: "in_person", structure: "intensive" },
    price: { period: "total", vat: "unknown", published: "unknown" },
    hours_claimed: hours,
  };
}

const HC = (extra: Partial<Program["hours_claimed"]>): Program["hours_claimed"] => ({
  breakdown_published: "not_published",
  contact_published: "not_published",
  ...extra,
});

test("ceiling: the Intensive — 21 × (10:00–17:00) = 147, before any break", () => {
  const p = program(HC({ total: 200, schedule: { source: "s", blocks: [{ count: 21, start: "10:00", end: "17:00" }] } }));
  const c = scheduledHoursCeiling(p);
  assert.equal(c.kind, "computed");
  assert.equal(c.value, 147);
  assert.match((c as { working: string }).working, /147|21/);
});

test("ceiling: a stated 60-min lunch tightens it to 126", () => {
  const p = program(HC({ total: 200, schedule: { source: "s", blocks: [{ count: 21, start: "10:00", end: "17:00", pause_min: 60 }] } }));
  assert.equal(scheduledHoursCeiling(p).value, 126);
});

test("ceiling: an irregular weekend sums its blocks — 25 + 70 + 30 = 125", () => {
  const p = program(HC({ total: 200, schedule: { source: "s", blocks: [
    { count: 10, start: "19:00", end: "21:30" },
    { count: 10, start: "10:00", end: "17:00" },
    { count: 10, start: "10:00", end: "13:00" },
  ] } }));
  assert.equal(scheduledHoursCeiling(p).value, 125);
});

test("ceiling: no schedule → no_schedule, value null", () => {
  const c = scheduledHoursCeiling(program(HC({ total: 200 })));
  assert.equal(c.kind, "no_schedule");
  assert.equal(c.value, null);
});

test("disconnect: 200 claimed − 147 ceiling = 53 (a lower bound)", () => {
  const p = program(HC({ total: 200, schedule: { source: "s", blocks: [{ count: 21, start: "10:00", end: "17:00" }] } }));
  const d = hoursDisconnect(p);
  assert.equal(d.kind, "computed");
  assert.equal(d.value, 53);
});

test("disconnect: no claimed total → no_comparison", () => {
  const p = program(HC({ schedule: { source: "s", blocks: [{ count: 21, start: "10:00", end: "17:00" }] } }));
  assert.equal(hoursDisconnect(p).kind, "no_comparison");
});

test("disconnect: no schedule → no_comparison even with a total", () => {
  assert.equal(hoursDisconnect(program(HC({ total: 200 }))).kind, "no_comparison");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --test src/lib/schedule-derive.test.ts`
Expected: FAIL — `scheduledHoursCeiling`/`hoursDisconnect` are not exported.

- [ ] **Step 3: Add the working strings to `strings.ts`**

In `src/lib/strings.ts`, immediately after the `hoursDerivedTotal` entry (line ~229), add:

```ts
  /* ---------- Rooster: het plafond op contacturen en het verschil (spec §6, v0.12) ---------- */

  /** De uitgeschreven telling per blok, zodat de lezer haar kan narekenen. "Ten hoogste":
   *  contacturen zijn nooit méér dan de tijd in de zaal, en alleen opgegeven pauzes zijn eraf. */
  scheduleCeilingWorking: (parts: string[]) =>
    `onze telling: ${parts.join(" + ")}. Ten hoogste — contacturen zijn nooit meer dan de ` +
    `ingeroosterde tijd, en alleen de opgegeven pauzes zijn afgetrokken.`,
  /** Het plafond zelf. "Ten hoogste" en het label zeggen samen dat dit ONS getal is, en een bovengrens. */
  scheduleCeilingValue: (hours: number) => `ten hoogste ${hours} uur`,
  /** Het verschil: geclaimd totaal minus het plafond. Een ONDERgrens (het plafond is een bovengrens). */
  hoursDisconnectValue: (hours: number) => `minstens ${hours} uur niet ingeroosterd`,
  hoursDisconnectWorking: (total: number, ceiling: number) =>
    `de school claimt ${total} uur; het gepubliceerde rooster beslaat ten hoogste ${ceiling} uur, ` +
    `dus ten minste ${Math.round((total - ceiling) * 100) / 100} uur valt buiten het rooster ` +
    `(zelfstudie, en wat verder niet is ingeroosterd).`,
```

- [ ] **Step 4: Add the two functions to `derive.ts`**

In `src/lib/derive.ts`, after `totalHours` (line ~390), add:

```ts
/**
 * A CEILING ON CONTACT HOURS, FROM THE PUBLISHED SCHEDULE — OURS ON EVERY PROGRAMME
 * (spec §6, v0.12). Like €/contactuur and the contact ratio, there is no `published`
 * variant: no school publishes this bound.
 *
 * Contact time can only ever be ≤ time in the room, so the raw clock sum is a strict UPPER
 * BOUND: "at most 147 u". We never guess the break — a STATED `pause_min` only lowers the
 * bound (a stronger, still-true statement), and an unstated one leaves it where it is,
 * conservative against our own critique. The block times are theirs (cited via
 * `schedule.source`); this SUM is ours, and the working shows it.
 */
export type ScheduledHoursCeiling =
  | Computed
  | { kind: "no_schedule"; value: null };

/** Minutes since midnight. The time is schema-validated HH:MM (Time), so this cannot NaN
 *  on a real record; a bad one would have failed `validate` by record and field. */
function minutesOfDay(t: string): number {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
}

export function scheduledHoursCeiling(program: Program): ScheduledHoursCeiling {
  const schedule = program.hours_claimed.schedule;
  if (!schedule) return { kind: "no_schedule", value: null };
  const parts: string[] = [];
  let minutes = 0;
  for (const b of schedule.blocks) {
    minutes += b.count * (minutesOfDay(b.end) - minutesOfDay(b.start) - (b.pause_min ?? 0));
    parts.push(`${b.count}× ${b.start}–${b.end}${b.pause_min ? ` (−${b.pause_min} min pauze)` : ""}`);
  }
  return {
    kind: "computed",
    value: Math.round((minutes / 60) * 100) / 100,
    working: nl.scheduleCeilingWorking(parts),
  };
}

/**
 * THE CLAIM MINUS THE CEILING — how much of the claimed total the timetable cannot account
 * for (spec §6, v0.12). Consumes the DERIVED total (`totalHours`), never the raw field.
 *
 * Because the ceiling is an UPPER bound, this gap is a LOWER bound: "at least 53 u are not
 * scheduled contact time" (self-study, and whatever else is not on the timetable). OURS.
 * `no_comparison` where there is no schedule, or no claimed total to compare against.
 */
export type HoursDisconnect =
  | Computed
  | { kind: "no_comparison"; value: null };

export function hoursDisconnect(program: Program): HoursDisconnect {
  const total = totalHours(program);
  const ceiling = scheduledHoursCeiling(program);
  if (total.value == null || ceiling.kind !== "computed") {
    return { kind: "no_comparison", value: null };
  }
  return {
    kind: "computed",
    value: Math.round((total.value - ceiling.value) * 100) / 100,
    working: nl.hoursDisconnectWorking(total.value, ceiling.value),
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx tsx --test src/lib/schedule-derive.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/derive.ts src/lib/strings.ts src/lib/schedule-derive.test.ts
git commit -m "derive: scheduledHoursCeiling (upper bound) + hoursDisconnect (lower bound)"
```

---

### Task 4: `presenters.ts` — render the two derived rows

**Files:**
- Modify: `src/lib/presenters.ts` (`programRows`, near the `rowTotalHours` push at line ~1191)
- Modify: `src/lib/strings.ts` (two row labels)
- Modify: `src/lib/presenters.test.ts` (assertions)

**Interfaces:**
- Consumes: `scheduledHoursCeiling`, `hoursDisconnect` (Task 3); `derivedRow` (existing).
- Produces: two extra `KeyValueRow`s in `ProgramView.rows`, labelled `nl.rowScheduleCeiling` / `nl.rowHoursDisconnect`, rendered as derived (ink `derived`). The record page (`app/aanbieder/[id]/page.tsx`) needs **no change** — it maps `prog.rows` generically and already branches on `inkFor(row) === "derived"`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/presenters.test.ts` (it already imports `toProviderView`, `nl`, and constructs providers — follow the file's existing import/fixture style; if it builds `Program` objects, reuse that; otherwise add this self-contained block):

```ts
import { inkFor } from "./quad";
// ... existing imports ...

test("record: a schedule adds a derived ceiling row (ours), and a disconnect row when the gap is positive", () => {
  const provider = {
    id: "sched", name: "Sched", website: "https://x.test", status: "active",
    locations: [{ city: "A" }], crkbo: { registered: "unknown", checked: null },
    registrations: [], programs: [{
      id: "p", name: "P", format_label: "200", accreditation: [],
      delivery: { mode: "in_person", structure: "intensive" },
      price: { period: "total", vat: "unknown", published: "unknown" },
      hours_claimed: {
        total: 200, breakdown_published: "not_published", contact_published: "not_published",
        schedule: { source: "s", blocks: [{ count: 21, start: "10:00", end: "17:00" }] },
      },
    }], modules: [], claims: [], people: [], inquiries: [],
    sources: [{ id: "s", type: "website", captured: "2026-07" }],
    depth: "listed", last_verified: "2026-07",
  } as unknown as import("../schema").Provider;

  const rows = toProviderView(provider).programs[0]!.rows;
  const ceiling = rows.find((r) => r.label === nl.rowScheduleCeiling)!;
  const disconnect = rows.find((r) => r.label === nl.rowHoursDisconnect)!;

  // OURS: derived ink, working in the note, and NO source key (spec §6).
  assert.equal(inkFor(ceiling), "derived");
  assert.equal(ceiling.value, nl.scheduleCeilingValue(147));
  assert.ok(ceiling.note && ceiling.note.length > 0);
  assert.equal("source" in ceiling, false);

  assert.equal(inkFor(disconnect), "derived");
  assert.equal(disconnect.value, nl.hoursDisconnectValue(53));
});

test("record: no schedule → no ceiling row and no disconnect row", () => {
  const provider = {
    id: "nosched", name: "NoSched", website: "https://x.test", status: "active",
    locations: [{ city: "A" }], crkbo: { registered: "unknown", checked: null },
    registrations: [], programs: [{
      id: "p", name: "P", format_label: "200", accreditation: [],
      delivery: { mode: "in_person", structure: "intensive" },
      price: { period: "total", vat: "unknown", published: "unknown" },
      hours_claimed: { total: 200, breakdown_published: "not_published", contact_published: "not_published" },
    }], modules: [], claims: [], people: [], inquiries: [],
    sources: [{ id: "s", type: "website", captured: "2026-07" }],
    depth: "listed", last_verified: "2026-07",
  } as unknown as import("../schema").Provider;

  const rows = toProviderView(provider).programs[0]!.rows;
  assert.equal(rows.some((r) => r.label === nl.rowScheduleCeiling), false);
  assert.equal(rows.some((r) => r.label === nl.rowHoursDisconnect), false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --test src/lib/presenters.test.ts`
Expected: FAIL — `nl.rowScheduleCeiling` is undefined / the rows are not produced.

- [ ] **Step 3: Add the two row labels to `strings.ts`**

After `rowTotalHours: "Totaaluren (onze optelling)",` (line ~223) — or beside the other `row*` labels near line ~450 — add:

```ts
  rowScheduleCeiling: "Ingeroosterde uren (onze telling)",
  rowHoursDisconnect: "Verschil met geclaimde uren",
```

- [ ] **Step 4: Render the rows in `programRows`**

In `src/lib/presenters.ts`, import the two functions (extend the existing `./derive` import at line ~10):

```ts
import {
  bundleDelta, hoursDisconnect, pricePerContactHour, scheduledHoursCeiling,
  totalHours, totalPathCost, totalPrice,
} from "./derive";
```

Then, immediately after the `rowTotalHours` block (after line ~1194, the `if (hours.kind === "computed") { rows.push(derivedRow(nl.rowTotalHours, ...)); }`), add:

```ts
  // THE SCHEDULE CEILING + THE DISCONNECT (spec §6, v0.12) — ours, and additive: silent
  // where the school publishes no session times. The ceiling is an UPPER bound ("ten
  // hoogste"), rendered through derivedRow like every figure of ours; the block times it
  // sums are theirs, cited in the Sources section via schedule.source. The disconnect row
  // appears only where there is a claimed total to compare AND the gap is positive — a
  // non-positive gap means the timetable already covers the claim, which is not the finding.
  const ceiling = scheduledHoursCeiling(program);
  if (ceiling.kind === "computed") {
    rows.push(derivedRow(nl.rowScheduleCeiling, ceiling, nl.scheduleCeilingValue(ceiling.value)));
    const disconnect = hoursDisconnect(program);
    if (disconnect.kind === "computed" && disconnect.value > 0) {
      rows.push(derivedRow(nl.rowHoursDisconnect, disconnect, nl.hoursDisconnectValue(disconnect.value)));
    }
  }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx tsx --test src/lib/presenters.test.ts`
Expected: PASS (including the two new tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/presenters.ts src/lib/strings.ts src/lib/presenters.test.ts
git commit -m "presenters: render the schedule ceiling + disconnect as derived rows"
```

---

### Task 5: `api.ts` — ship both in the `derived` block

**Files:**
- Modify: `src/lib/api.ts` (`ProgramDerived`, `programDerived`, wire aliases, `README`)
- Modify: `src/lib/api.test.ts` (assertions)

**Interfaces:**
- Consumes: `scheduledHoursCeiling`, `hoursDisconnect`, and the exported `ScheduledHoursCeiling`/`HoursDisconnect` types (Task 3).
- Produces: `ProgramDerived.scheduled_hours_ceiling` + `ProgramDerived.hours_disconnect` on the wire.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/api.test.ts`:

```ts
test("API: derived.scheduled_hours_ceiling and hours_disconnect equal the derive functions", () => {
  const { scheduledHoursCeiling, hoursDisconnect } = require("./derive") as typeof import("./derive");
  for (const provider of PAYLOAD.providers) {
    const src = providers.find((p) => p.id === provider.id)!;
    for (const program of provider.programs) {
      const prog = src.programs.find((pr) => pr.id === program.id)!;
      assert.deepEqual(program.derived.scheduled_hours_ceiling, scheduledHoursCeiling(prog));
      assert.deepEqual(program.derived.hours_disconnect, hoursDisconnect(prog));
    }
  }
});

test("API README documents the ceiling as an upper bound", () => {
  assert.match(PAYLOAD.readme, /bovengrens|ten hoogste|upper bound/i);
});
```

(If `api.test.ts` forbids `require`, import `scheduledHoursCeiling, hoursDisconnect` at the top instead.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --test src/lib/api.test.ts`
Expected: FAIL — `derived.scheduled_hours_ceiling` is undefined; README has no such line.

- [ ] **Step 3: Add the wire types, the fields, and the README line**

In `src/lib/api.ts`, extend the `./derive` import (line ~33) to include the values and types:

```ts
import {
  bundleDelta, contactRatio, hoursDisconnect, isMultistyle, pricePerContactHour,
  scheduledHoursCeiling, totalHours, totalPathCost, totalPrice,
  type ContactRatio, type HoursDisconnect, type PricePerContactHour,
  type ScheduledHoursCeiling, type TotalHours, type TotalPathCost, type TotalPrice,
} from "./derive";
```

Add the wire aliases beside the others (after line ~79 — they are structurally identical, no `gates` to strip):

```ts
export type ScheduledHoursCeilingWire = ScheduledHoursCeiling;
export type HoursDisconnectWire = HoursDisconnect;
```

Add the two fields to `ProgramDerived` (after `multistyle`, before the closing brace at line ~193):

```ts
  /**
   * A CEILING ON CONTACT HOURS FROM THE PUBLISHED SCHEDULE (spec §6, v0.12) — OURS, no
   * `published` variant. `{kind:"computed", value, working}` is a strict UPPER BOUND
   * (clock time ≥ contact time); `{kind:"no_schedule"}` where we hold no session times.
   * Do not read it as the school's contact-hour figure — they published none; we bounded it.
   */
  scheduled_hours_ceiling: ScheduledHoursCeilingWire;
  /**
   * total_hours − scheduled_hours_ceiling (spec §6, v0.12) — a LOWER BOUND on the claimed
   * hours the timetable can't account for. OURS. `{kind:"no_comparison"}` where there is no
   * schedule or no claimed total.
   */
  hours_disconnect: HoursDisconnectWire;
```

Add them to `programDerived` (after `multistyle: isMultistyle(program),` at line ~206):

```ts
    scheduled_hours_ceiling: scheduledHoursCeiling(program),
    hours_disconnect: hoursDisconnect(program),
```

Append to the `README` string (before the closing of the template, after the `pph`/`contact_ratio` sentence at line ~265):

```ts
  " " +
  "`derived.scheduled_hours_ceiling` is ONZE bovengrens op de contacturen, afgeleid uit het " +
  "gepubliceerde rooster: contacturen zijn nooit méér dan de tijd in de zaal, dus dit is `ten " +
  "hoogste` zoveel — géén door de school gepubliceerd contactuur-getal. `derived.hours_disconnect` " +
  "= `total_hours` − dit plafond, een ONDERgrens op de geclaimde uren die niet in het rooster " +
  "terug te vinden zijn. Beide zijn van ons; `no_schedule`/`no_comparison` = geen rooster of geen " +
  "geclaimd totaal."
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test src/lib/api.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite + export**

Run: `npm test && npm run export-json`
Expected: all tests pass; `public/data/v1/providers.json` regenerates with the two new keys in every programme's `derived` block (all `no_schedule`/`no_comparison` until Task 6).

- [ ] **Step 6: Commit**

```bash
git add src/lib/api.ts src/lib/api.test.ts public/data/v1/providers.json
git commit -m "api: ship scheduled_hours_ceiling + hours_disconnect in the derived block"
```

---

### Task 6: Apply the feature to the DNYS Intensive (real data)

**Files:**
- Modify: `yoga-trainingen-directory/data/providers/de-nieuwe-yogaschool.yaml` (`200-vinyasa-intensive` programme's `hours_claimed`)

This proves the feature end-to-end on a real record. The blocks MUST be extracted from the captured artifact, never from memory or this plan's example.

- [ ] **Step 1: Read the real schedule off the capture**

Run:
```bash
cd yoga-trainingen-directory/data/archives/de-nieuwe-yogaschool && \
pdftotext -layout site-intensive-2026-06-2026-06-20.pdf - | rg -iC2 "10:00|17:00|dag|week|rooster|schedule|daily"
```
Confirm the exact number of session days and the daily start/end times (the design's "21 days, 10:00–17:00" is the user's figure — verify it, and whether any break is stated). If the HTML holds more (accordion/JS content), also probe `site-intensive-2026-06-2026-06-20.html` the same way. Use ONLY what the artifact states; if the day count or times differ, use the artifact's.

- [ ] **Step 2: Add the `schedule` block to the Intensive**

In the `200-vinyasa-intensive` programme, add to `hours_claimed` (below `contact_published`), using the confirmed values — example shape (substitute the real numbers, and add `pause_min` ONLY if a break is stated):

```yaml
      schedule:
        source: site-intensive-2026-06
        note: >
          3,5 weken immersion, dagelijks 10:00–17:00 (zie bron). Blok = het aantal
          lesdagen; onze telling is een bovengrens op de contacturen (pauzes niet
          meegerekend tenzij vermeld).
        blocks:
          - { count: 21, start: "10:00", end: "17:00", label: "lesdag" }
```

- [ ] **Step 3: Validate and check the derivation**

Run: `npm run validate && npm run provenance`
Expected: `✓ 48 provider record(s) valid`; provenance unchanged (`schedule` adds no priced/hours/BTW claim — it cites `site-intensive-2026-06`, which resolves). The record page's Intensive now shows "Ingeroosterde uren (onze telling): ten hoogste 147 uur" and "Verschil met geclaimde uren: minstens 53 uur niet ingeroosterd" (or the real numbers).

- [ ] **Step 4: Commit**

```bash
git add yoga-trainingen-directory/data/providers/de-nieuwe-yogaschool.yaml
git commit -m "data: schedule for the DNYS Vinyasa Intensive — 200u claim vs the timetable"
```

Note: the earlier uncommitted DNYS changes (the literature-list source + `site-intensive` Wayback fill) are still pending from a separate task — do NOT sweep them in; add only the explicit path above. Confirm with `git status` before committing.

---

## Self-review

**Spec coverage:** Every design-doc section maps to a task — schema (T2), derive unions + upper/lower bound (T3), rendering as ours (T4, and confirmed the record page is generic so no page change), API export + README (T5), spec bump (T1), worked examples (T3 tests). Non-goals (listing filter, per-session list, schedule_published axis) are excluded. Real-data application is T6.

**Placeholder scan:** No TBD/TODO. T6 substitutes artifact-confirmed numbers into a shown YAML shape (the one value that must come from evidence, not the plan).

**Type consistency:** `scheduledHoursCeiling`/`hoursDisconnect` names, the `Computed | {kind:"no_schedule"|"no_comparison", value:null}` unions, `nl.rowScheduleCeiling`/`nl.rowHoursDisconnect`/`nl.scheduleCeilingValue`/`nl.hoursDisconnectValue`/`nl.scheduleCeilingWorking`/`nl.hoursDisconnectWorking`, and `scheduled_hours_ceiling`/`hours_disconnect` wire keys are used identically across T3/T4/T5. The derived rows reuse `derivedRow` (which requires the `computed` object, so the ink can't disagree with the arithmetic) and render through the existing `inkFor(row) === "derived"` path — no `quad.ts`/`rules.ts`/`page.tsx` change.
