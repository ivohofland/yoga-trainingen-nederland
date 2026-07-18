/**
 * The public JSON API — `public/data/v1/providers.json`.
 *
 * CLAUDE.md calls this file "the API… designed so a future frontend under a
 * different brand can consume it without touching this repo". It shipped the RAW
 * `Provider[]` and no derived state whatsoever, so a consumer could reconstruct,
 * from scratch, the exact bug this project spent a release eliminating — and could
 * not have done better, because the rule that prevents it (`priceQuad`) lived
 * behind `node:fs` and was literally unimportable.
 *
 * These tests hold the export to the same rule as both site surfaces.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadDataset } from "./loader";
import { toApiPayload } from "./api";
import { ourWorking, scheduledHoursCeiling, hoursDisconnect } from "./derive";
import { toListingRows, toProviderView } from "./presenters";
import { priceAmountIsOurGap, priceQuad } from "./rules";
import { saysNotPublished, quadClass } from "./quad";
import { nl } from "./strings";
import { priceGapProvider } from "./price-gap.fixture";

const { providers } = loadDataset();
const NOW = new Date("2026-07-01T00:00:00Z");
const PAYLOAD = toApiPayload(providers);

/** The price cell as each of the three surfaces renders it, for one programme. */
const surfaces = (providerId: string, programId: string) => {
  const provider = providers.find((p) => p.id === providerId)!;
  const program = provider.programs.find((pr) => pr.id === programId)!;
  const api = PAYLOAD.providers
    .find((p) => p.id === providerId)!
    .programs.find((pr) => pr.id === programId)!;
  const listing = toListingRows(providers, NOW)
    .find((r) => r.providerId === providerId && r.programId === programId)!;
  const record = toProviderView(provider)
    .programs.find((v) => v.id === programId)!
    .rows.find((r) => r.label === nl.colPrice)!;
  return { program, api, listing, record };
};

test("API: derived.price_state IS what the listing renders and what the record page renders — every programme", () => {
  // THE test for the Critical finding. Three surfaces — the static JSON API, the
  // listing, the provider record — and ONE rule between them. Before, the API had
  // no state at all and could only offer `price.published`; a consumer rendering
  // that field printed a bare "ja" in fact ink for four named businesses.
  //
  // Not "the API agrees with itself": each surface is asked independently, and all
  // three must equal priceQuad(). Any one of them re-deriving the quad fails here.
  const rows = toListingRows(providers, NOW);
  let checked = 0;
  for (const provider of PAYLOAD.providers) {
    const view = toProviderView(providers.find((p) => p.id === provider.id)!);
    for (const program of provider.programs) {
      const listing = rows.find((r) => r.providerId === provider.id && r.programId === program.id)!;
      const record = view.programs
        .find((v) => v.id === program.id)!
        .rows.find((r) => r.label === nl.colPrice)!;
      const rule = priceQuad(providers.find((p) => p.id === provider.id)!, program);

      assert.equal(program.derived.price_state, listing.priceState,
        `${provider.id}/${program.id}: the JSON API says the price is "${program.derived.price_state}" and ` +
        `the listing says "${listing.priceState}" — one dataset, one programme, two contradictory claims ` +
        `about a named business`);
      assert.equal(program.derived.price_state, record.state,
        `${provider.id}/${program.id}: the JSON API and the provider record disagree about the price ` +
        `("${program.derived.price_state}" vs "${record.state}")`);
      assert.equal(program.derived.price_state, rule,
        `${provider.id}/${program.id}: the export re-derived the price quad instead of calling priceQuad()`);
      // The same rule governs the €/contactuur the API ships.
      assert.equal(program.derived.pph_state, listing.pphState,
        `${provider.id}/${program.id}: the API and the listing disagree about the €/contactuur state`);
      assert.equal(program.derived.pph.value, listing.pph,
        `${provider.id}/${program.id}: the API and the listing publish different €/contactuur figures`);
      assert.equal(program.derived.price_band, listing.priceBand);
      checked++;
    }
  }
  assert.ok(checked > 0, "the export has no programmes — this test tests nothing");
});

test("API: the exported total_price is OUR arithmetic, flagged as ours, and never stored", () => {
  // A consumer's only honest basis for comparing or ranking (spec v0.5, §6). Three
  // things are asserted, and each one is a way the number could become a lie:
  //
  //   1. the value is the whole-course figure, not the per-period one;
  //   2. `derived: true` says WE made it — a consumer that renders it as the school's
  //      published price publishes a figure de Blikopener has never stated;
  //   3. it is NOWHERE in `data/` — the export is a rendering of the records, never a
  //      second source of truth (spec §6, principle 9).
  // Against the PARSED record, not the file text: the YAML's comments explain the
  // derivation and naturally mention the figure, and a check that cannot tell a comment
  // from a field would forbid the record from explaining itself.
  const record = providers.find((p) => p.id === "de-blikopener")!;
  assert.ok(!JSON.stringify(record).includes("5160"),
    "a derived total was STORED in the record — it would rot the day their price moves, " +
    "and it would cite a source that never said it");
  const yaml = fs.readFileSync(path.join(process.cwd(), "data/providers/de-blikopener.yaml"), "utf8");
  assert.ok(!/^\s*total_price\s*:/m.test(yaml), "`total_price` is a DERIVED field (spec §6) — it has no home in data/");

  const blikopener = PAYLOAD.providers.find((p) => p.id === "de-blikopener")!;
  const four = blikopener.programs.find((p) => p.id === "hatha-raja-opleiding")!;
  assert.equal(four.price.amount_eur, 1290, "guard: the record holds their per-year figure");
  assert.equal(four.derived.total_price.value, 5160, "4 × € 1.290 is € 5.160");
  assert.equal(four.derived.total_price.kind, "computed",
    "a consumer told `kind: \"published\"` would render our multiplication as de Blikopener's own price");
  // THE WORKING — and it exists ONLY on the `computed` variant, which is the whole design.
  // A consumer that prints `working` whenever it finds one is now correct BY ACCIDENT; under
  // `{value, derived, caveat}` the same laziness (destructure `{value}`, ignore the flag) printed
  // our multiplication as the school's own price. The safe path is now the lazy path.
  // (nl-NL formats € with a non-breaking space, so this normalises it rather than pinning an
  // invisible character.)
  assert.equal(ourWorking(four.derived.total_price)?.replace(/ /g, " "), "onze berekening: 4 × € 1.290");

  // THE THIRD DERIVATION (spec v0.8): a SUM of unequal parts, and it is ours too. Adhouna
  // prices its Yin XL as Deel I € 1.420 + Deel II € 1.305 and states no total; € 2.725 was
  // STORED in `amount_eur` and shipped to every consumer as Adhouna's own published price.
  const adhounaRecord = providers.find((p) => p.id === "adhouna")!;
  // NO FIELD HOLDS IT — and the assertion says "field", not "string", deliberately. The
  // price note EXPLAINS the derivation ("€ 1.420 + € 1.305 = € 2.725 is ONZE optelling"),
  // which is exactly what a record should do; a substring check would forbid the record
  // from explaining itself and, worse, would pass the moment someone rephrased the prose.
  // What may never exist is a NUMERIC FIELD carrying the sum, because that is the field a
  // surface renders in the school's ink. So the numbers are what we look at.
  const numbersIn = (v: unknown): number[] =>
    typeof v === "number"
      ? [v]
      : Array.isArray(v)
        ? v.flatMap(numbersIn)
        : v != null && typeof v === "object"
          ? Object.values(v).flatMap(numbersIn)
          : [];
  assert.ok(!numbersIn(adhounaRecord).includes(2725),
    "a derived total was STORED in a field of the record — '2725' appears in none of Adhouna's artifacts, " +
    "and a field is what a surface renders as their published price (spec §6, principle 9)");
  const adhouna = PAYLOAD.providers.find((p) => p.id === "adhouna")!;
  const yinxl = adhouna.programs.find((p) => p.id === "200-yin-xl")!;
  assert.equal(yinxl.price.amount_eur, null, "guard: the record holds no whole-course amount, because they publish none");
  assert.equal(yinxl.derived.total_price.value, 2725, "€ 1.420 + € 1.305 is € 2.725");
  assert.equal(yinxl.derived.total_price.kind, "computed",
    "a consumer told `kind: \"published\"` would render our ADDITION as Adhouna's own published price");
  // The working, so a consumer can show it — asserted on its PARTS rather than as one
  // long literal: nl-NL puts a NON-BREAKING space after the €, and pinning an invisible
  // character is how this assertion would fail for the wrong reason.
  const sum = ourWorking(yinxl.derived.total_price) ?? "";
  assert.match(sum, /onze optelling/, "the working must say whose sum it is");
  assert.match(sum, /1\.420/);
  assert.match(sum, /1\.305/);

  // …and on a school that publishes a whole-course price, the total IS theirs. Wahé states
  // € 2.495 on the page we cite; relabelling it `derived: true` is the same falsehood
  // pointing the other way, and no smaller.
  const wahe = PAYLOAD.providers.find((p) => p.id === "wahe")!;
  const vinyasa = wahe.programs.find((p) => p.id === "200-vinyasa-ayurveda")!;
  assert.deepEqual(vinyasa.derived.total_price, { kind: "published", value: 2495 });
  // NO `working` KEY AT ALL — not `working: null`, no key. The key set IS the claim, and a
  // consumer holding this object cannot be told that our arithmetic produced it.
  assert.ok(!("working" in vinyasa.derived.total_price),
    "a school's own published price shipped with a `working` — our arithmetic's clothing on their fact");
});

test("API: the exported total_path_cost is what it costs to QUALIFY — and it is always ours", () => {
  // A consumer that bands or ranks on `total_price` publishes € 4.590 for a training you
  // cannot enrol in without first buying a € 1.590 one. The rule that fixes that (v0.9) must
  // be reachable by anyone holding nothing but this JSON file — the same reason `price_state`
  // and `total_hours` ship here at all.
  const enschede = PAYLOAD.providers.find((p) => p.id === "de-yogaschool-enschede")!;
  const docent = enschede.programs.find((p) => p.id === "docentenopleiding-raja")!;
  assert.equal(docent.derived.total_price.value, 4590, "guard: the course itself");
  assert.equal(docent.derived.total_path_cost.value, 6180, "…and € 1.590 more to be allowed to start it");
  assert.equal(docent.derived.total_path_cost.kind, "computed",
    "the PATH is never the school's own figure, even where the course price is — € 6.180 is on no page of theirs");
  assert.match(ourWorking(docent.derived.total_path_cost) ?? "", /Basisopleiding/);

  const meester = enschede.programs.find((p) => p.id === "meesteropleiding-raja")!;
  assert.equal(meester.derived.total_path_cost.value, 10770, "three links: Basis → Docenten → Meester");

  // Where nothing must be bought first it EQUALS total_price — so a consumer that always
  // reads the path cost is never worse off, and is protected on the gated ones.
  const wahe = PAYLOAD.providers.find((p) => p.id === "wahe")!;
  const vinyasa = wahe.programs.find((p) => p.id === "200-vinyasa-ayurveda")!;
  assert.equal(vinyasa.derived.total_path_cost.value, vinyasa.derived.total_price.value);
  assert.equal(vinyasa.derived.total_path_cost.kind, "no_gates");
  assert.equal(ourWorking(vinyasa.derived.total_path_cost), null,
    "no gate, no working: there is nothing to show, and printing an 'onze optelling' over a school's " +
    "own published price would manufacture a second figure out of one number");

  // And, like every derived value: nowhere in data/ (§6).
  const yaml = fs.readFileSync(path.join(process.cwd(), "data/providers/de-yogaschool-enschede.yaml"), "utf8");
  assert.ok(!/^\s*total_path_cost\s*:/m.test(yaml), "a derived field found a home in the data");
  assert.ok(!/6180|6\.180/.test(yaml), "€ 6.180 is stored in the record — it is our sum, not a fact we hold");
});

test("API: the exported total_hours says whose figure it is — ours or the school's", () => {
  // The same contract as total_price, in the other unit (spec v0.6, §6), and the same
  // three ways to turn it into a lie. Both directions are pinned, because a consumer that
  // gets EITHER wrong publishes a falsehood about a named business:
  //
  //   - de Yogaschool: `derived: true`. They publish 360 contacturen and 240 zelfstudie
  //     and never their sum. Ship `derived: false` and every consumer prints 600 as their
  //     claimed total — which is what this repo did, until v0.6.
  //   - Wahé:          `derived: false`. They publish the 500 themselves. Ship
  //     `derived: true` and we tell every consumer we invented a figure the school states
  //     on its own page.
  //
  // And, as with total_price: the number is NOWHERE in data/. The export renders the
  // records; it is never a second source of truth.
  const record = providers.find((p) => p.id === "de-yogaschool-enschede")!;
  const yaml = fs.readFileSync(
    path.join(process.cwd(), "data/providers/de-yogaschool-enschede.yaml"),
    "utf8",
  );
  assert.ok(!/^\s*total_hours\s*:/m.test(yaml), "`total_hours` is a DERIVED field (§6) — it has no home in data/");
  assert.ok(!record.programs.some((pr) => pr.hours_claimed.total === 600),
    "the stored 600 is back in the record — a sum of ours in a field that renders as their claim");

  const enschede = PAYLOAD.providers.find((p) => p.id === "de-yogaschool-enschede")!;
  const raja = enschede.programs.find((p) => p.id === "docentenopleiding-raja")!;
  assert.equal(raja.hours_claimed.total, null, "guard: the raw field a naive consumer would read is null");
  assert.equal(raja.derived.total_hours.value, 600, "360 + 240 is 600");
  assert.equal(raja.derived.total_hours.kind, "computed",
    "a consumer told `kind: \"published\"` would render OUR addition as de Yogaschool's published total");
  assert.match(ourWorking(raja.derived.total_hours) ?? "", /onze optelling/,
    "the working must ship with the number, so a consumer can show it");
  // The ratio a consumer compares on is over the DERIVED total — not null, as the raw
  // field would have made it.
  assert.equal(raja.derived.contact_ratio.value, 0.6);
  // AND IT IS OURS. It shipped as a bare `0.6` with no flag and no working — a figure no school
  // publishes, over a denominator that is ITSELF our addition (360 + 240). Our arithmetic over our
  // arithmetic, handed to every consumer as a plain fact about a named business.
  assert.equal(raja.derived.contact_ratio.kind, "computed",
    "no school publishes a contact ratio — there is no `published` variant, and there must not be");
  assert.match(ourWorking(raja.derived.contact_ratio) ?? "", /onze berekening/);

  const wahe = PAYLOAD.providers.find((p) => p.id === "wahe")!;
  const pathway = wahe.programs.find((p) => p.id === "500-pathway")!;
  assert.deepEqual(pathway.derived.total_hours, { kind: "published", value: 500 },
    "Wahé PUBLISHES its 500 — the API must hand it to a consumer as the school's own figure");
  assert.ok(!("working" in pathway.derived.total_hours),
    "the school's own figure shipped with a working — the one mark that says a number is ours");
});

test("API: every programme that publishes a price we do not hold is OUR gap in the JSON too", () => {
  // A programme carrying `price: { published: "yes" }` with no `amount_eur`. A consumer
  // rendering that raw field through its own quad component prints a bare "ja" in FACT
  // ink about a named business; rendering it as the absence of a price prints an
  // accusation instead. Both are false.
  //
  // `derived.price_state` is what it must read, and it says "unknown": a gap in OUR
  // research. This is exactly the correction the site makes, now reachable by anyone
  // holding nothing but the JSON file.
  //
  // THE CASE IS NOW SYNTHETIC, AND THAT IS THE POINT. This test used to NAME the five
  // programmes in this state, then (when four were paid off) DERIVE them from the live
  // corpus via `priceAmountIsOurGap`. Both versions had the same flaw, and the derived
  // one merely postponed it: the fifth has now been researched, sourced, archived and
  // extracted too, so the corpus holds NO programme in this state — and a test that
  // finds its case by sweeping the data has nothing left to exercise. Its anti-vacuity
  // guard fired and the build went red for having FIXED the data.
  //
  // A test that pins a RULE must not depend on the corpus containing a DEFECT. The rule
  // is unchanged and still load-bearing — the next record that lands in this state must
  // reach every API consumer as our gap — so the case is constructed (price-gap.fixture.ts)
  // and the rule is pinned against it. The live corpus is still swept below, but its
  // emptiness is now a fact about our research, not a hole in our tests.
  const { provider: gapProvider, program: gapProgram } = priceGapProvider(providers);
  assert.ok(priceAmountIsOurGap(gapProvider, gapProgram),
    "the fixture is not in the state this test exists to pin — it pins nothing");

  const gapPayload = toApiPayload([gapProvider]);
  const api = gapPayload.providers[0].programs[0];
  const listing = toListingRows([gapProvider], NOW)[0];
  const record = toProviderView(gapProvider)
    .programs[0].rows.find((r) => r.label === nl.colPrice)!;

  // The derived state a consumer must read — and all three surfaces say it.
  assert.equal(api.derived.price_state, "unknown",
    `the JSON API hands a consumer "${api.derived.price_state}" — the record says they DO publish a ` +
    `price, so the missing amount is OURS, not their omission`);
  assert.equal(api.derived.price_band, "amount_not_in_record",
    "banded as something we could state about them");
  assert.equal(listing.priceState, "unknown");
  assert.equal(record.state, "unknown");

  // And it is never the accusation, on any surface.
  assert.ok(!saysNotPublished(api.derived.price_state),
    "our own gap, published to every API consumer as a finding about a named business");
  assert.equal(quadClass(api.derived.price_state), "gap");
  // Nor a value-less fact: the raw field a naive consumer would read still says "yes".
  assert.equal(api.price.published, "yes", "guard: the raw field is the trap this rule exists to disarm");
  assert.equal(api.price.amount_eur, null);

  // INFORMATIONAL, and deliberately allowed to be empty: if the corpus ever holds a real
  // programme in this state again, it obeys the same rule — and the message names it, as
  // an accusation about a named business would be named.
  const ourGaps = providers.flatMap((p) =>
    p.programs.filter((program) => priceAmountIsOurGap(p, program)).map((program) => [p.id, program.id] as const),
  );
  for (const [providerId, programId] of ourGaps) {
    const s = surfaces(providerId, programId);
    assert.equal(s.api.derived.price_state, "unknown",
      `${providerId}/${programId}: the JSON API hands a consumer "${s.api.derived.price_state}" — the ` +
      `record says they DO publish a price, so the missing amount is OURS, not their omission`);
    assert.equal(s.api.derived.price_band, "amount_not_in_record",
      `${providerId}/${programId}: banded as something we could state about them`);
    assert.equal(s.listing.priceState, "unknown");
    assert.equal(s.record.state, "unknown");
    assert.equal(quadClass(s.api.derived.price_state), "gap");
  }
});

test("API: no derived price_state is a value-less FACT — the bare “ja”/“nee” is unreachable", () => {
  // The bug, stated as a property over the whole export rather than five names: a
  // fact-class price state with no amount behind it is a claim about a named
  // business that the dataset does not hold. `derived.price_state` may be "yes" only
  // where an amount exists, and it is never "no" at all (priceQuad normalises `no`
  // into the one finding on this *_published field, so the API cannot ship the same
  // finding under two spellings).
  //
  // THE GAP DIRECTION IS EXERCISED BY A SYNTHETIC PROGRAMME. It used to be exercised by
  // five real ones, then by one; today the corpus holds none — every published price has
  // been researched and its amount extracted. That is the outcome we want, and it must
  // not silently retire the rule: `quadClass("unknown") === "gap"` is what keeps a
  // value-less price out of fact ink, and it has to stay pinned for the next record that
  // lands in that state. So the property runs over the real export PLUS the constructed
  // case (price-gap.fixture.ts), and the `gaps > 0` guard below is met honestly rather
  // than by waiting for a defect to reappear in the data.
  const { provider: gapProvider } = priceGapProvider(providers);
  const exported = [...PAYLOAD.providers, ...toApiPayload([gapProvider]).providers];

  let facts = 0;
  let findings = 0;
  let gaps = 0;
  for (const provider of exported) {
    for (const program of provider.programs) {
      const state = program.derived.price_state;
      assert.notEqual(state, "no",
        `${provider.id}/${program.id}: the API ships price_state "no" — on a *_published field that is ` +
        `the SAME finding as "not_published", and shipping both lets a consumer render one finding in ` +
        `two colours (that is the bug, exactly)`);
      if (quadClass(state) === "fact") {
        // A NUMBER MUST BE BEHIND IT — but "the number" is no longer `amount_eur` alone
        // (spec v0.8). Adhouna prices its Yin XL per DEEL (€ 1.420 + € 1.305) and states
        // no whole-course figure, so `amount_eur` is null and the comparable total is the
        // sum we derive from the parts they DO publish. That is not a bare “ja”: the cell
        // shows their two prices and the row below shows our sum. What must never exist is
        // a fact with NOTHING behind it — no amount, and no total either.
        assert.ok(program.price.amount_eur != null || program.derived.total_price.value != null,
          `${provider.id}/${program.id}: price_state "${state}" is a FACT with no amount and no derivable ` +
          `total behind it — a bare “ja” about a named business`);
        facts++;
      }
      if (state === "not_published") {
        assert.ok(saysNotPublished(program.price.published),
          `${provider.id}/${program.id}: the API accuses this business of publishing no price, but the ` +
          `record's price.published says "${program.price.published}"`);
        findings++;
      }
      if (state === "unknown") gaps++;
    }
  }
  // None of the three directions may go quiet. Facts and findings come from the real
  // corpus; the gap comes from the fixture, which guarantees it can never go vacuous
  // again — however thoroughly the data is researched.
  assert.ok(facts > 0, "no programme in the export has a price — this test tests nothing");
  assert.ok(findings > 0, "the export carries no price FINDING any more — that direction is untested");
  assert.ok(gaps > 0,
    "the price GAP direction is untested — the fixture that guarantees it is gone, so a value-less " +
    "price could ship as fact ink again with nothing to catch it");
});

test("API: every programme carries a complete derived block, and the payload documents it", () => {
  // A consumer must not have to guess whether `derived` is there. Every programme
  // has one, with every key — a partial block would send them back to the raw fields.
  const KEYS = [
    "price_state",
    "price_band",
    // v0.5: the figure a consumer must compare on. Without it in the payload, the only
    // number a consumer could rank by is `price.amount_eur` — which on de Blikopener
    // buys ONE YEAR of a four-year training.
    "total_price",
    // v0.6: the same, in hours. Without it, `hours_claimed.total` is a consumer's only
    // total — and it is null on every school that publishes its hours only as parts.
    "total_hours",
    "pph",
    "pph_state",
    "contact_ratio",
    "bundle_delta",
    "multistyle",
    "scheduled_hours_ceiling",
    "hours_disconnect",
  ];
  for (const provider of PAYLOAD.providers) {
    for (const program of provider.programs) {
      assert.ok(program.derived, `${provider.id}/${program.id} has no derived block`);
      for (const key of KEYS) {
        assert.ok(key in program.derived, `${provider.id}/${program.id}: derived.${key} is missing`);
      }
    }
  }
  // The readme is the instruction that stops a consumer reaching for price.published.
  // It must name the field it is warning them off, and both quad words it separates.
  assert.match(PAYLOAD.readme, /price_state/);
  assert.match(PAYLOAD.readme, /price\.published/);
  assert.match(PAYLOAD.readme, /not_published/);
  assert.match(PAYLOAD.readme, /unknown/);
  assert.equal(PAYLOAD.count, providers.length);
});

test("API: the export is a rendering, not a source — nothing derived is written back to the record", () => {
  // Spec §6 still holds. The derived block is computed at export and lives ONLY in
  // the export; the YAML records are untouched, and re-exporting unchanged data
  // produces the same bytes (data_current_as_of is a function of the data, not of
  // the clock, so the committed file does not churn on every build).
  const before = JSON.stringify(providers);
  const again = toApiPayload(providers);
  assert.equal(JSON.stringify(providers), before,
    "toApiPayload mutated the records it was rendering — a derived value has leaked into the source");
  assert.equal(JSON.stringify(again), JSON.stringify(PAYLOAD),
    "two exports of the same data differ — the committed JSON would churn on every build");
  for (const p of providers) {
    for (const program of p.programs) {
      assert.ok(!("derived" in program), `${p.id}/${program.id}: a derived block reached the loaded record`);
    }
  }
});

test("API: data_current_as_of is the NEWEST last_verified — never the oldest", () => {
  // ZERO ASSERTIONS. Change `.sort().at(-1)` to `.at(0)` and the whole suite stayed green,
  // while the API told every consumer the corpus was no fresher than its STALEST record —
  // understating our own work, and pinning any cache key a consumer builds on it to a date
  // that stops moving the moment we re-verify anything.
  //
  // NOTE THE ASYMMETRY WITH THE SITE, which is deliberate and is why both need a test. The
  // site's freshness line shows BOTH ends and anchors on the OLDEST, because "records
  // geverifieerd jul 2026" printed from a max claims for 48 records what is true of two.
  // This field answers a different question — "how fresh is the DATA in this file?" — and
  // only the newest can answer it. The two are opposite by design, so each one's test has to
  // pin its own direction; the site has had one since that bug, and its API twin had none.
  const all = providers.map((p) => p.last_verified).sort();
  const oldest = all[0];
  const newest = all.at(-1)!;
  assert.notEqual(oldest, newest,
    "every record shares one last_verified — the two directions are indistinguishable and this test " +
    "would prove nothing");

  assert.equal(PAYLOAD.data_current_as_of, newest,
    `the API dates the corpus at ${PAYLOAD.data_current_as_of}. The newest record is ${newest}.`);
  assert.notEqual(PAYLOAD.data_current_as_of, oldest,
    "the API reports the corpus as no fresher than its OLDEST record — every consumer is told the data " +
    "is months more stale than it is, and re-verifying a record moves nothing");

  // ...and it is a function of the DATA, never of the clock: unchanged data must re-export
  // byte-identically, or the committed JSON churns on every build.
  assert.equal(toApiPayload(providers).data_current_as_of, PAYLOAD.data_current_as_of);
  // An empty corpus has no date at all — not today's, and not the epoch.
  assert.equal(toApiPayload([]).data_current_as_of, null);
});

test("API: multistyle is published per programme, and a single-style school is never 'allround'", () => {
  // It ships as a bare boolean about a named business, and it had no assertion anywhere.
  // `specific.length >= 1` publishes EVERY single-style programme in the corpus as
  // "allround/multistyle" — to every consumer, about every Iyengar-only and Ashtanga-only
  // school in the Netherlands. (The rule itself is truth-tabled in loader.test.ts; this pins
  // that what the API ships IS that rule, on every programme, and that both directions occur.)
  let multi = 0;
  let single = 0;
  for (const provider of PAYLOAD.providers) {
    for (const program of provider.programs) {
      const tags = program.styles ?? [];
      const specific = tags.filter((t) => t !== "other" && t !== "own_method");
      const expected = tags.includes("multistyle") || specific.length >= 2;
      assert.equal(program.derived.multistyle, expected,
        `${provider.id}/${program.id}: the API publishes multistyle=${program.derived.multistyle} for a ` +
        `programme whose styles are [${tags.join(", ")}] — a claim about what a named business teaches`);
      if (expected) multi++;
      else single++;
    }
  }
  assert.ok(multi > 0, "no programme in the export is multistyle — that direction is untested");
  assert.ok(single > 0,
    "every programme in the export is multistyle — which is exactly what the `>= 1` mutation produces, " +
    "and this test could not tell the difference");
});

test("API: derived.scheduled_hours_ceiling and hours_disconnect equal the derive functions", () => {
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
