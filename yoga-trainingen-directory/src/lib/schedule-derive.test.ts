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
