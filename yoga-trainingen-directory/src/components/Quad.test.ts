/**
 * <Quad> is the ONE place a quad value becomes pixels (spec §2.2), and it had zero
 * tests. quad.test.ts asserts the class-name STRINGS differ — "fact" !== "gap" —
 * which is true of any three distinct strings and says nothing whatever about what
 * the reader sees.
 *
 * Two things were unpinned, and both fail silently:
 *
 *   1. THE STYLESHEET. `styles[cls]` looks up the class in Quad.module.css. Rename
 *      `.gap` there and the lookup returns `undefined`, `className` becomes
 *      undefined, and the recessive grey italic that stops a gap in OUR research
 *      from reading as an established fact about a named business simply vanishes —
 *      no error, no failing test, an un-styled span in default ink. The mapping is
 *      a contract between a TS union and a CSS file, and nothing checked the CSS
 *      end of it.
 *
 *   2. THE BRANCH. "render children only for a fact that has children" is the whole
 *      decision the component makes, and it decided it inline. It is now
 *      showsValue() in quad.ts, and it is tested here as a truth table.
 *
 * No React renderer, and none is needed: the component is now a wire between three
 * pure functions and the DOM. This project deliberately adds no React testing
 * library — testing the wire would test React, not us.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { quadClass, quadLabel, showsValue, type QuadClass } from "@/lib/quad";
import { Quad } from "@/schema";

/**
 * The stylesheet, read from disk. A CSS module cannot be imported into this test
 * runner (tsx does not transform CSS), and the file IS the artefact under test:
 * what ships is these rules, not a mock of them.
 */
const CSS = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "Quad.module.css"),
  "utf8",
);

/** Every class the component can ever ask the stylesheet for — derived from the
 *  SCHEMA's quad values through the very function that maps them, so a fifth quad
 *  value (or a re-classified one) is covered here the moment it exists. */
const CLASSES: QuadClass[] = [...new Set(Quad.options.map((v) => quadClass(v)))];

test("STYLE: every class <Quad> can ask for is defined in Quad.module.css", () => {
  // Rename `.gap` and `styles.gap` is `undefined`: the span renders with no class
  // at all, in default ink, and a gap in our own research reads exactly like an
  // established fact about a named business. That is THE failure this project
  // exists to prevent, and it would ship green.
  assert.ok(CLASSES.length >= 3, `only ${CLASSES.length} quad classes reachable — the mapping collapsed`);
  for (const cls of CLASSES) {
    assert.match(CSS, new RegExp(`^\\.${cls}\\s*(,|\\{)`, "m"),
      `Quad.module.css defines no ".${cls}" rule, so <Quad> renders className={undefined} for every ` +
      `quad that maps to "${cls}" — the one place a quad becomes pixels, silently unstyled`);
  }
  // The three are the whole mapping — a fourth class in the CSS is dead style, and
  // a class the component cannot reach is a rule nobody will maintain.
  for (const cls of ["fact", "finding", "gap"]) {
    assert.ok(CLASSES.includes(cls as QuadClass), `"${cls}" is no longer a quad class`);
  }
});

test("STYLE: a gap is visually recessive, and a finding is not styled like a fact", () => {
  // The classes must not merely EXIST — they must differ. Three identical rules
  // pass the test above and render a finding, a fact and a gap identically.
  const ruleOf = (cls: string) => {
    const m = new RegExp(`^\\.${cls}\\s*\\{([^}]*)\\}`, "m").exec(CSS);
    assert.ok(m, `no .${cls} rule`);
    return m[1].replace(/\s+/g, " ").trim();
  };
  const fact = ruleOf("fact");
  const finding = ruleOf("finding");
  const gap = ruleOf("gap");
  assert.notEqual(fact, finding, "a FINDING about a named business renders identically to an established fact");
  assert.notEqual(fact, gap, "a GAP in our research renders identically to an established fact");
  assert.notEqual(finding, gap, "a finding and a gap render identically — THE rule of this project (spec §2.2)");
  // A gap must not compete with facts for attention: it is an absence in OUR work.
  assert.match(gap, /font-style:\s*italic/,
    "the gap style lost its italic — the one visual cue that it is not a fact");
});

/* ---------- The branch: value, or the state word? ---------- */

test("QUAD: a fact WITH a value shows the value; everything else shows the state word", () => {
  // The truth table, in full. Both halves of the condition are load-bearing:
  //
  //   drop `quadClass(...) === "fact"` → a `not_published` cell renders its
  //     children: the FINDING replaced by the value it is a finding about;
  //   drop `hasValue`                  → a fact with nothing to show renders an
  //     empty span, where "ja" or a price belongs.
  assert.equal(showsValue("yes", true), true, "a fact we hold must show what we hold");
  assert.equal(showsValue("no", true), true);

  assert.equal(showsValue("yes", false), false, "a fact with no value must fall back to the state word");
  assert.equal(showsValue("no", false), false);

  // A non-fact NEVER renders children, whatever it was handed.
  for (const state of ["not_published", "unknown"] as const) {
    assert.equal(showsValue(state, true), false,
      `a "${state}" cell rendered a value: <Quad> would print the number instead of the finding/gap it is`);
    assert.equal(showsValue(state, false), false);
  }
  // An absent optional object is a gap — it shows "nog niet onderzocht", never children.
  assert.equal(showsValue(undefined, true), false);
  assert.equal(showsValue(null, true), false);
});

test("QUAD: what a cell falls back to is the state word — and a gap's word is never a finding's", () => {
  // The label a non-fact cell renders IS the statement the page makes. Pinned here
  // because this is the component's other output, and the component has no test.
  assert.equal(quadLabel("not_published"), "niet gepubliceerd");
  assert.equal(quadLabel("unknown"), "nog niet onderzocht");
  assert.notEqual(quadLabel("not_published"), quadLabel("unknown"));
  // …and an absent object falls back to the gap, never to the accusation.
  assert.equal(quadLabel(undefined), quadLabel("unknown"));
  assert.equal(quadClass(undefined), "gap");
});
