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
import { inkFor, quadClass, quadLabel, showsValue, type Ink, type QuadClass } from "@/lib/quad";
import { Quad } from "@/schema";

/**
 * The stylesheet, read from disk. A CSS module cannot be imported into this test
 * runner (tsx does not transform CSS), and the file IS the artefact under test:
 * what ships is these rules, not a mock of them.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, "..", "..");
const CSS = fs.readFileSync(path.join(HERE, "Quad.module.css"), "utf8");

const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), "utf8");

/** A class is DEFINED in a stylesheet: `.name {` or `.name,`. The same probe the
 *  Quad tests have always used, lifted out because three stylesheets now need it. */
const defines = (sheet: string, cls: string) =>
  new RegExp(`^\\.${cls}\\s*(,|\\{)`, "m").test(sheet);

/** The body of a rule, whitespace-normalised — so two rules can be compared. */
const ruleBody = (sheet: string, cls: string): string | null => {
  const m = new RegExp(`^\\.${cls}\\s*\\{([^}]*)\\}`, "m").exec(sheet);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
};

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
    const body = ruleBody(CSS, cls);
    assert.ok(body, `no .${cls} rule`);
    return body;
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


/* ---------- THE FOURTH INK: our arithmetic, and the stylesheets that carry it ----------
 *
 * A number published about a named business is either THEIR CLAIM — fact ink, cited — or
 * VISIBLY OUR ARITHMETIC — muted, uncited, working shown (spec §6). The three quad inks
 * above cannot say the second thing: a derived total is not a fact about the provider, not
 * a finding against them, and not a gap in us.
 *
 * So there is a fourth ink, and it had NO test of any kind — neither the decision that
 * selects it nor the stylesheet that gives it a colour.
 */

test("INK: inkFor is the whole decision — our arithmetic never wears a provider's colours", () => {
  // THE TRUTH TABLE. This decision lived as a ternary inside app/aanbieder/[id]/page.tsx —
  // `row.derived && row.state === "yes"` — and neutralising it left ALL 181 TESTS GREEN
  // while `± € 6.180`, `± € 5.160` and `± 600 uur` went out through <Quad> in FACT INK, one
  // row below the very schools' own published figures. None of those numbers appears in any
  // source those schools published.
  //
  // Both halves of the condition are load-bearing, and they fail in OPPOSITE directions.

  // 1. OURS, with a figure → the derived ink. Drop the `derived` half and this line returns
  //    "fact": our sum, painted as the school's own claim. That is the bug.
  assert.equal(inkFor({ state: "yes", derived: true }), "derived",
    "a figure WE computed renders in the ink reserved for the provider's own claims");

  // 2. OURS, with NO figure → a FINDING about them, and it must stay one. Drop the
  //    `state === "yes"` half and de Blikopener-with-no-period-count — "zij publiceren een
  //    prijs per studiejaar en niet uit hoeveel studiejaren de opleiding bestaat", a
  //    researched, sourced finding — is repainted as a muted aside of ours, disowning it.
  assert.equal(inkFor({ state: "not_published", derived: true }), "finding",
    "a derived row with no value states a FINDING about the provider; `derived` governs the " +
    "ink of a VALUE, never whether one exists");
  assert.equal(inkFor({ state: "unknown", derived: true }), "gap");
  assert.equal(inkFor({ state: "no", derived: true }), "fact");

  // 3. THEIRS → exactly the quad inks, unchanged. `inkFor` must not become a fourth opinion
  //    about a quad: it adds an ink, it does not reclassify one.
  for (const state of Quad.options) {
    assert.equal(inkFor({ state }), quadClass(state),
      `inkFor re-classified the quad "${state}" — the three quad inks are quadClass's alone`);
    assert.equal(inkFor({ state, derived: false }), quadClass(state),
      `an explicit \`derived: false\` changed the ink of "${state}"`);
  }

  // 4. And the ink is never invented: every value it returns is one a stylesheet defines.
  const INKS: Ink[] = ["fact", "finding", "gap", "derived"];
  for (const state of Quad.options) {
    for (const derived of [true, false, undefined]) {
      assert.ok(INKS.includes(inkFor({ state, derived })),
        `inkFor({state: "${state}", derived: ${derived}}) returned an ink nothing can style`);
    }
  }
});

test("STYLE: the derived ink is defined on BOTH surfaces, and it is not fact ink", () => {
  // THE IDENTICAL CHOKEPOINT AS `.gap`, AND IT WAS UNGUARDED — twice.
  //
  // `className={styles.derived}` looks the class up in a CSS module. Rename it in the
  // stylesheet and the lookup returns `undefined`; `className` becomes undefined; the span
  // renders with NO CLASS AT ALL, in the surrounding default ink — which is the ink of the
  // facts around it. Our arithmetic, silently promoted to a provider's claim, with no error
  // and no failing test. That is exactly why Quad.test.ts reads Quad.module.css from disk;
  // the derived ink needed the same guard and did not have it, in EITHER stylesheet.
  const sheets: [string, string][] = [
    ["app/aanbieder/[id]/page.module.css", "derived"],
    ["src/components/ProgrammeTable.module.css", "derived"],
    // The €/contactuur cell on the listing: the same ink, inline rather than as a line
    // beneath a fact. It is ours on every row that has one — price ÷ contact hours, a
    // figure no school in the corpus publishes.
    ["src/components/ProgrammeTable.module.css", "derivedInline"],
  ];
  for (const [file, cls] of sheets) {
    const sheet = read(file);
    assert.ok(defines(sheet, cls),
      `${file} defines no ".${cls}" rule, so the surface renders className={undefined} for OUR ` +
      `arithmetic — it appears in the default ink of the facts beside it, uncorrected and unmarked`);
  }

  // AND IT MUST DIFFER FROM FACT INK. A `.derived` that merely EXISTS but resolves to the
  // same paint as `.fact` passes the check above and renders our sums identically to the
  // schools' own figures — the whole bug, with a stylesheet rule in front of it.
  const factRule = ruleBody(CSS, "fact");
  assert.ok(factRule, "Quad.module.css lost its .fact rule");
  for (const file of ["app/aanbieder/[id]/page.module.css", "src/components/ProgrammeTable.module.css"]) {
    const derivedRule = ruleBody(read(file), "derived");
    assert.ok(derivedRule, `${file}: no .derived rule body`);
    assert.notEqual(derivedRule, factRule,
      `${file}: the derived ink is styled identically to fact ink — our arithmetic is indistinguishable ` +
      `from a provider's own published claim`);
    // The two cues that carry the message, and they are the same two the gap ink uses: it is
    // not a fact, and it must not compete with one.
    assert.match(derivedRule, /font-style:\s*italic/,
      `${file}: the derived ink lost its italic — the visual cue that this number is not theirs`);
    assert.match(derivedRule, /color:\s*var\(--muted\)/,
      `${file}: the derived ink is no longer muted — it now competes with the facts it sits beside`);
    assert.doesNotMatch(derivedRule, /color:\s*var\(--ink\)/,
      `${file}: OUR arithmetic is painted in --ink, the colour this project reserves for a school's ` +
      `own published claims`);
  }
});

test("STYLE: every class a surface asks its stylesheet for is actually defined", () => {
  // The general form of the bug above. `styles.whatever` is a plain property read: a typo, a
  // rename, or a deleted rule yields `undefined` and the element ships UNSTYLED — never an
  // error, never a failing test. On this site an unstyled span does not merely look wrong; it
  // silently changes what the page ASSERTS, because ink is the assertion.
  const surfaces: [string, string][] = [
    ["app/aanbieder/[id]/page.tsx", "app/aanbieder/[id]/page.module.css"],
    ["src/components/ProgrammeTable.tsx", "src/components/ProgrammeTable.module.css"],
    ["app/page.tsx", "app/page.module.css"],
  ];
  let checked = 0;
  for (const [tsx, css] of surfaces) {
    const sheet = read(css);
    const used = [...new Set([...read(tsx).matchAll(/\bstyles\.([A-Za-z]\w*)/g)].map((m) => m[1]))];
    assert.ok(used.length > 0, `${tsx} asks its stylesheet for nothing — this probe found no classes`);
    for (const cls of used) {
      assert.ok(defines(sheet, cls),
        `${tsx} renders className={styles.${cls}}, but ${css} defines no ".${cls}" — the element ships ` +
        `with no class at all, in whatever ink surrounds it`);
      checked++;
    }
  }
  assert.ok(checked > 50, `only ${checked} class references checked — this probe is not seeing the surfaces`);
});
