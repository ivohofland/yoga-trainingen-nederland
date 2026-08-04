/**
 * `Reference` (spec §4.1b, v0.13) — the evidence bar for a shared normative document.
 * `public_archive` is already required (see `public-archive-schema.test.ts`), and
 * `impossible` is a legitimate public half: a JS-shell help-centre article genuinely
 * cannot be publicly archived. `local_snapshot` is the half that can never be honestly
 * absent — it is what the evidentiary chain rests on, and a normative document quoted
 * in published prose with no capture behind it is what §3 forbids. This is a
 * schema-shape test, the convention for which lives in `src/lib/*-schema.test.ts`
 * (see `schedule-schema.test.ts`), since there is no test file under `src/schema/`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Reference } from "../schema";
import { loadReferences } from "./loader";

// Built from a REAL reference, not hand-typed, so the fixture cannot drift from the
// schema when a required field is added.
const { references } = loadReferences();
const VALID_REFERENCE_FIXTURE = references[0]!;

test("REFERENCE: a reference with no local_snapshot does not parse", () => {
  const ok = Reference.safeParse(VALID_REFERENCE_FIXTURE);
  assert.ok(ok.success);
  const { local_snapshot: _drop, ...without } = VALID_REFERENCE_FIXTURE;
  assert.ok(!Reference.safeParse(without).success, "a normative document must be held");
});
