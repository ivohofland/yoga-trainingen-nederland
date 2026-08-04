/**
 * `public_archive` (spec §4.1/§4.1b, v0.14) replaces the old nullable URL field it is
 * named for in the version log. That field's `null` carried two opposite editorial
 * meanings — a gap (not archived yet) and a finding (no public archive can evidence
 * this page) — in one key. The union's
 * variants carry DIFFERENT KEY SETS so those two states cannot be confused: this
 * is a schema-shape test, the convention for which lives in `src/lib/*-schema.test.ts`
 * (see `schedule-schema.test.ts`), since there is no test file under `src/schema/`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PublicArchive, Source, Reference } from "../schema";

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

test("SCHEMA: a member does not silently strip a foreign key from another member", () => {
  // A plain `z.object` strips keys it doesn't declare instead of rejecting them, and
  // `Source`/`Reference` being strict does not help — strictness does not recurse into
  // a nested plain object. Undetected, this deletes a real archive URL from the loaded
  // dataset ("not_yet" + "url") or silently downgrades a published finding to a gap
  // ("not_yet" + "reason") — the exact conflation this task exists to prevent, one
  // level down from where the union's distinct key sets stop it.
  assert.ok(
    !PublicArchive.safeParse({ kind: "not_yet", url: "https://web.archive.org/web/2026/x" }).success,
    "a Wayback url under not_yet must be rejected, not silently dropped",
  );
  assert.ok(
    !PublicArchive.safeParse({ kind: "not_yet", reason: "no public archive can evidence this" }).success,
    "a reason under not_yet must be rejected, not silently dropped",
  );
  assert.ok(
    !PublicArchive.safeParse({ kind: "archived", url: "https://web.archive.org/x", reason: "bogus" }).success,
    "a reason alongside an archived url must be rejected, not silently dropped",
  );
});

test("SCHEMA: public_archive is REQUIRED on Source and on Reference", () => {
  // Nothing else pins this. Re-adding `.optional()` to either field would leave this
  // suite — and `npm run validate` — green today, because every record in the corpus
  // happens to carry the field.
  const minimalSource = { id: "s", type: "website", captured: "2026-01" };
  assert.ok(!Source.safeParse(minimalSource).success, "Source without public_archive must not parse");

  const minimalReference = {
    id: "ref-id",
    title: "t",
    publisher: "p",
    type: "other",
    captured: "2026-01",
  };
  assert.ok(!Reference.safeParse(minimalReference).success, "Reference without public_archive must not parse");
});
