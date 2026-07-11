import { test } from "node:test";
import assert from "node:assert/strict";
import { quadClass, quadLabel, type QuadClass } from "./quad";
import type { Quad } from "../schema";

const ALL: Quad[] = ["yes", "no", "not_published", "unknown"];

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
  const valid: QuadClass[] = ["fact", "finding", "gap"];
  for (const v of ALL) {
    assert.ok(valid.includes(quadClass(v)), `${v} produced an invalid class`);
  }
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
