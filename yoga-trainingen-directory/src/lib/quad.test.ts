import { test } from "node:test";
import assert from "node:assert/strict";
import { quadClass, quadLabel, saysNotPublished, type QuadClass } from "./quad";
// THE SCHEMA, as a value. `ALL` used to be a hand-maintained literal — a list of
// the four quad values, kept in a test whose job is to prove the mapping covers
// every quad value. It could not: add a fifth member to the schema and this file
// keeps testing the old four, in green, while quadClass's `default:` silently
// files the new one under "gap". A guard that reads its expectations from a copy
// of the thing it guards guards nothing. So: walk the schema.
import { Quad } from "../schema";

const ALL: Quad[] = [...Quad.options];

test("THE RULE: not_published and unknown never render identically", () => {
  // spec §4 / CLAUDE.md. `not_published` is a finding about the provider;
  // `unknown` is a gap in our research. Collapsing them publishes our own
  // gaps as findings about named businesses. This test must never be deleted.
  assert.notEqual(quadClass("not_published"), quadClass("unknown"));
  assert.notEqual(quadLabel("not_published"), quadLabel("unknown"));
});

test("yes and no are both facts — we established them", () => {
  // `accreditation.verified: "no"` means "claimed, and NOT found in the
  // register". That is a severe statement, but it is a *fact*, and the words
  // carry the severity, not the colour.
  assert.equal(quadClass("yes"), "fact");
  assert.equal(quadClass("no"), "fact");
});

test("not_published is a finding; unknown is a gap", () => {
  assert.equal(quadClass("not_published"), "finding");
  assert.equal(quadClass("unknown"), "gap");
});

test("an absent optional object is a gap, not a finding", () => {
  // program.coherence_signals is optional and undefined on 52 of 77
  // programmes. Not investigated is not investigated — it must never render
  // as "the provider does not publish this".
  assert.equal(quadClass(undefined), "gap");
  assert.equal(quadClass(null), "gap");
  assert.equal(quadLabel(undefined), quadLabel("unknown"));
});

test("the mapping is total — every schema quad value has a class", () => {
  // The key list is the SCHEMA's, not a copy of it: a fifth quad value is in
  // `ALL` the moment it is in `Quad`, and every assertion below then runs on it.
  assert.ok(ALL.length >= 4, "the schema lost a quad value");
  const valid: QuadClass[] = ["fact", "finding", "gap"];
  for (const v of ALL) {
    assert.ok(valid.includes(quadClass(v)), `${v} produced an invalid class`);
    assert.equal(typeof quadLabel(v), "string", `${v} has no label`);
    assert.equal(typeof saysNotPublished(v), "boolean", `${v} is not decided by saysNotPublished`);
  }
});

test("a quad nobody classified is a LOUD failure, never a quiet gap", () => {
  // The whole point of the `never` check. Before it, a fifth quad member — say
  // "disputed", a finding — produced exactly ONE compile error (LABEL, a
  // Record<Quad, string>). Fix that one line and the build is green while
  // quadClass files the new finding under "gap" (grey, italic, "nog niet
  // onderzocht") and saysNotPublished drops it out of the price band. A finding
  // about a named business, rendered as a hole in our own research, shipped by a
  // build that felt like a gate.
  //
  // Now it fails: at compile time in every switch that must think about it, and
  // at runtime for a value that arrives from outside the type system.
  const alien = "disputed" as unknown as Quad;
  assert.throws(() => quadClass(alien), /unhandled quad state/);
  assert.throws(() => saysNotPublished(alien), /unhandled quad state/);
});

test("saysNotPublished is the one finding-vs-gap rule, and it never guesses", () => {
  // `no` and `not_published` are ONE finding on a *_published field: wij keken,
  // zij publiceren het niet. `yes` is a value; `unknown` — and an absent optional
  // object — is our own gap, and must never be swept into an accusation.
  assert.equal(saysNotPublished("not_published"), true);
  assert.equal(saysNotPublished("no"), true);
  assert.equal(saysNotPublished("yes"), false);
  assert.equal(saysNotPublished("unknown"), false);
  assert.equal(saysNotPublished(undefined), false);
  assert.equal(saysNotPublished(null), false);
});

test("labels are Dutch and non-empty", () => {
  assert.equal(quadLabel("yes"), "ja");
  assert.equal(quadLabel("no"), "nee");
  assert.equal(quadLabel("not_published"), "niet gepubliceerd");
  assert.equal(quadLabel("unknown"), "nog niet onderzocht");
});

test("a gap never uses wording that reads as a finding about a provider", () => {
  // "niet gepubliceerd" accuses the provider of an omission. A gap is OUR
  // omission and must not borrow that wording.
  assert.doesNotMatch(quadLabel("unknown"), /gepubliceerd/);
  assert.doesNotMatch(quadLabel(undefined), /gepubliceerd/);
});
