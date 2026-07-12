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
import { toListingRows, toProviderView } from "./presenters";
import { priceAmountIsOurGap, priceQuad } from "./rules";
import { saysNotPublished, quadClass } from "./quad";
import { nl } from "./strings";

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
      const rule = priceQuad(program);

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
      assert.equal(program.derived.pph, listing.pph,
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
  assert.equal(four.derived.total_price.derived, true,
    "a consumer told `derived: false` would render our multiplication as de Blikopener's own price");
  // The working, so a consumer can show it. (nl-NL formats € with a non-breaking space,
  // so the comparison normalises it rather than pinning an invisible character.)
  assert.equal(four.derived.total_price.caveat?.replace(/ /g, " "), "onze berekening: 4 × € 1.290");

  // …and on a school that publishes a whole-course price, the total IS theirs.
  const enschede = PAYLOAD.providers.find((p) => p.id === "de-yogaschool-enschede")!;
  const raja = enschede.programs.find((p) => p.id === "docentenopleiding-raja")!;
  assert.deepEqual(raja.derived.total_price, { value: 4590, derived: false, caveat: null });
});

test("API: every programme that publishes a price we do not hold is OUR gap in the JSON too", () => {
  // Each of these carries `price: { published: "yes" }` with no `amount_eur`. A
  // consumer rendering that raw field through its own quad component prints a bare
  // "ja" in FACT ink about a named business; rendering it as the absence of a price
  // prints an accusation instead. Both are false.
  //
  // `derived.price_state` is what it must read, and it says "unknown": a gap in OUR
  // research. This is exactly the correction the site makes, now reachable by anyone
  // holding nothing but the JSON file.
  //
  // THE LIST IS DERIVED, NOT NAMED. It used to name the five programmes it pinned,
  // and it was right to: the accusation would be named. But four of them have since
  // been paid off (their price sources were captured and the amounts extracted), and
  // a hard-coded list of records-in-a-state rots the moment the state changes — it
  // failed the build for having been FIXED. `priceAmountIsOurGap` is the same
  // predicate the rule itself uses, so the set is whatever the data currently holds
  // (today: sanayou/200-online), and the messages below still name every one of them.
  const ourGaps = providers.flatMap((p) =>
    p.programs.filter(priceAmountIsOurGap).map((program) => [p.id, program.id] as const),
  );
  assert.ok(ourGaps.length > 0, "no programme is in this state any more — the rule this pins is untested");

  for (const [providerId, programId] of ourGaps) {
    const { api, listing, record } = surfaces(providerId, programId);

    // The derived state a consumer must read — and all three surfaces say it.
    assert.equal(api.derived.price_state, "unknown",
      `${providerId}/${programId}: the JSON API hands a consumer "${api.derived.price_state}" — the ` +
      `record says they DO publish a price, so the missing amount is OURS, not their omission`);
    assert.equal(api.derived.price_band, "amount_not_in_record",
      `${providerId}/${programId}: banded as something we could state about them`);
    assert.equal(listing.priceState, "unknown");
    assert.equal(record.state, "unknown");

    // And it is never the accusation, on any surface.
    assert.ok(!saysNotPublished(api.derived.price_state),
      `${providerId}/${programId}: our own gap, published to every API consumer as a finding about a ` +
      `named business`);
    assert.equal(quadClass(api.derived.price_state), "gap");
  }
});

test("API: no derived price_state is a value-less FACT — the bare “ja”/“nee” is unreachable", () => {
  // The bug, stated as a property over the whole export rather than five names: a
  // fact-class price state with no amount behind it is a claim about a named
  // business that the dataset does not hold. `derived.price_state` may be "yes" only
  // where an amount exists, and it is never "no" at all (priceQuad normalises `no`
  // into the one finding on this *_published field, so the API cannot ship the same
  // finding under two spellings).
  let facts = 0;
  let findings = 0;
  let gaps = 0;
  for (const provider of PAYLOAD.providers) {
    for (const program of provider.programs) {
      const state = program.derived.price_state;
      assert.notEqual(state, "no",
        `${provider.id}/${program.id}: the API ships price_state "no" — on a *_published field that is ` +
        `the SAME finding as "not_published", and shipping both lets a consumer render one finding in ` +
        `two colours (that is the bug, exactly)`);
      if (quadClass(state) === "fact") {
        assert.ok(program.price.amount_eur != null,
          `${provider.id}/${program.id}: price_state "${state}" is a FACT with no amount behind it — a ` +
          `bare “ja” about a named business`);
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
  // None of the three directions may go quiet.
  assert.ok(facts > 0, "no programme in the export has a price — this test tests nothing");
  assert.ok(findings > 0, "the export carries no price FINDING any more — that direction is untested");
  assert.ok(gaps > 0, "the export carries no price GAP any more — that direction is untested");
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
    "pph",
    "pph_state",
    "contact_ratio",
    "bundle_delta",
    "multistyle",
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
