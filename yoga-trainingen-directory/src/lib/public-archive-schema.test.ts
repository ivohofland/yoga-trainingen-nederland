/**
 * `public_archive` (spec §4.1/§4.1b, v0.14) replaces `archived_url`. The old field's
 * `null` carried two opposite editorial meanings — a gap (not archived yet) and a
 * finding (no public archive can evidence this page) — in one key. The union's
 * variants carry DIFFERENT KEY SETS so those two states cannot be confused: this
 * is a schema-shape test, the convention for which lives in `src/lib/*-schema.test.ts`
 * (see `schedule-schema.test.ts`), since there is no test file under `src/schema/`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PublicArchive } from "../schema";

test("SCHEMA: public_archive variants carry different key sets", () => {
  // The guarantee is structural: a consumer reading `url` when present is right by
  // construction, not by accident. "impossible with no reason" must not parse.
  assert.ok(PublicArchive.safeParse({ kind: "archived", url: "https://web.archive.org/x" }).success);
  assert.ok(PublicArchive.safeParse({ kind: "impossible", reason: "JS-shell" }).success);
  assert.ok(PublicArchive.safeParse({ kind: "not_yet" }).success);

  assert.ok(!PublicArchive.safeParse({ kind: "impossible" }).success, "impossible needs a reason");
  assert.ok(!PublicArchive.safeParse({ kind: "impossible", reason: "" }).success, "empty reason is no reason");
  assert.ok(!PublicArchive.safeParse({ kind: "archived" }).success, "archived needs a url");
  assert.ok(!PublicArchive.safeParse({ kind: "not_archived" }).success, "unknown kind");
});
