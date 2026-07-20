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
