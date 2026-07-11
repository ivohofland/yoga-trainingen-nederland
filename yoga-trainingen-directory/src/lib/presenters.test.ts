import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDataset } from "./dataset";
import { toListingRows, datasetStats, pphQuad, toProviderView } from "./presenters";
import { nl } from "./strings";

const { providers } = loadDataset();
const NOW = new Date("2026-07-01T00:00:00Z"); // fixed — never let a test depend on the wall clock

const programOf = (providerId: string, programId: string) =>
  providers.find((p) => p.id === providerId)!.programs.find((p) => p.id === programId)!;

test("every programme in the dataset becomes exactly one row", () => {
  const rows = toListingRows(providers, NOW);
  const programCount = providers.reduce((n, p) => n + p.programs.length, 0);
  assert.equal(rows.length, programCount);
});

test("an announced cohort is never labelled as one that ran", () => {
  // spec §8: recording an announcement as if it happened is the central trap.
  // "confirmed_ran" cohorts really did run — their Dutch label legitimately
  // contains "gedraaid", regardless of whether the start date happens to be
  // in the future (a cohort can be confirmed as running before its own start
  // month has fully passed). The invariant this guards is narrower than "no
  // cohort ever mentions running": only an ANNOUNCED cohort must never be
  // presented as one that ran.
  const rows = toListingRows(providers, NOW);
  for (const r of rows) {
    if (!r.nextCohort) continue;
    const { status, label } = r.nextCohort;
    // the status is never omitted from the label, whatever it is
    assert.ok(label.includes(nl.cohortStatus[status]),
      `programme ${r.programId} cohort label omits its status (${status})`);
    if (status === "announced") {
      assert.match(label, /aangekondigd/,
        `programme ${r.programId} shows an announced cohort without saying so`);
      assert.doesNotMatch(label, /gedraaid|gestart|liep/,
        `programme ${r.programId} implies an announced cohort ran`);
    }
    if (status === "confirmed_ran") {
      assert.match(label, /gedraaid/,
        `programme ${r.programId} confirms a cohort ran but the label doesn't say so`);
    }
  }
});

test("next cohort is never in the past", () => {
  const rows = toListingRows(providers, NOW);
  for (const r of rows) {
    if (r.nextCohort) {
      assert.ok(r.nextCohort.start >= "2026-07",
        `programme ${r.programId} offers a next cohort of ${r.nextCohort.start}, which is past`);
    }
  }
});

test("a programme with no computable price-per-contact-hour carries a caveat, not a zero", () => {
  const rows = toListingRows(providers, NOW);
  for (const r of rows) {
    if (r.pph == null) {
      assert.ok(r.pphCaveat && r.pphCaveat.length > 0,
        `programme ${r.programId} has no pph and no explanation why`);
    } else {
      assert.ok(r.pph > 0, `programme ${r.programId} has a non-positive pph`);
    }
  }
});

/* ---------- €/contactuur: the cell says what the record says. No more, no less ----------
 *
 * THE rule (CLAUDE.md, spec §4). `not_published` is a FINDING about a NAMED
 * BUSINESS — we looked, they do not state it. `unknown` is a GAP in OUR OWN
 * research. Collapsing either into the other is forbidden, and the two failures
 * are symmetrical:
 *
 *   - a gap rendered as a finding  → we accuse a named business of an omission
 *                                    we never established;
 *   - a finding rendered as a gap  → we disown research we did do and sourced,
 *                                    and contradict our own Prijs column.
 *
 * So these tests are written as a BICONDITIONAL. A one-sided test ("if the cell
 * says not_published, the record must too") is passed by an implementation that
 * returns "unknown" for everything — which is precisely how a regression once
 * shipped. Each direction below must be able to fail on its own.
 */

/** The blocking field, exactly as pphQuad must read it: no amount → the price is
 *  what's missing; otherwise the hours are. */
const blockerOf = (providerId: string, programId: string) => {
  const program = programOf(providerId, programId);
  return program.price.amount_eur == null
    ? program.price.published
    : program.hours_claimed.breakdown_published;
};

test("PPH: the state is a finding if and only if the record's blocking field says the provider does not publish it", () => {
  // Both blocking fields are called *published*. On such a field `not_published`
  // and `no` say the same thing about the provider — they do not publish it —
  // and both are researched, sourced findings. `yes` (the record says they DO
  // publish it, yet the value is missing anyway) and `unknown` (nobody looked)
  // are gaps in our record. This maps every row in the dataset, both ways.
  const rows = toListingRows(providers, NOW);
  let findings = 0;
  let gaps = 0;
  for (const r of rows) {
    if (r.pph != null) {
      assert.equal(r.pphState, "yes", `programme ${r.programId} has a value but does not say so`);
      // The presenter owns the money format (nl-NL: "€ 12,50"), not the component.
      assert.match(r.pphDisplay ?? "", /^€\s?\d[\d.]*,\d{2}$/,
        `programme ${r.programId} formats its €/contactuur as "${r.pphDisplay}"`);
      continue;
    }
    assert.equal(r.pphDisplay, null, `programme ${r.programId} renders a €/contactuur it does not have`);
    const blocker = blockerOf(r.providerId, r.programId);
    const expected = blocker === "not_published" || blocker === "no" ? "not_published" : "unknown";
    assert.equal(r.pphState, expected,
      `${r.providerId}/${r.programId}: the blocking field says "${blocker}", so the cell must be ` +
      `"${expected}", but it says "${r.pphState}" — ` +
      (expected === "not_published"
        ? `that disowns a sourced finding and calls our own research un-done (the Prijs column ` +
          `renders the same field as a fact in the very same row)`
        : `that publishes OUR gap as an accusation against a named business`));
    if (expected === "not_published") findings++;
    else gaps++;
  }
  // Neither direction may quietly become vacuous: if the data ever loses all of
  // one kind, the biconditional above would stop testing that direction at all.
  assert.ok(findings > 0, "no programme exercises the FINDING direction any more");
  assert.ok(gaps > 0, "no programme exercises the GAP direction any more");
});

test("PPH: a record whose blocking field says the provider does not publish it is a FINDING, never a gap", () => {
  // The converse direction, pinned to named records. Each of these carries a
  // sourced note to exactly this effect ("Geen prijs gepubliceerd op de
  // 300u-pagina", "Geen opleidingsprijs op de site"). Rendering them grey and
  // italic — "nog niet onderzocht" — states two falsehoods about our own
  // research: that we did not look, and that our record lacks what it plainly
  // holds. Both literal values that mean "they do not publish it" are covered
  // here, on both blocking fields.
  const doesNotPublish = [
    ["spark-of-light", "300-verdieping"],           // price.published: no
    ["yoga-centrum-oosterwold", "200-odaka"],       // price.published: no
    ["yoga-centrum-oosterwold", "200-yin"],         // price.published: no
    ["yoga-nature-studio", "300-advanced-vinyasa"], // price.published: no
    ["critical-alignment", "cay-lerarenopleiding"], // price.published: no
    ["adhouna", "200-multistyle"],                  // price.published: not_published
    ["7-yoga-academy", "200-ryt"],                  // hours_claimed.breakdown_published: not_published
  ] as const;
  const rows = toListingRows(providers, NOW);
  for (const [providerId, programId] of doesNotPublish) {
    const blocker = blockerOf(providerId, programId);
    // guard: if the data changes, this test must not quietly pass on a
    // programme that no longer has the shape it is here to pin.
    assert.ok(blocker === "no" || blocker === "not_published",
      `${providerId}/${programId} no longer blocks on a "does not publish" field (got "${blocker}")`);

    assert.equal(pphQuad(programOf(providerId, programId)), "not_published",
      `${providerId}/${programId}: the record says the provider does not publish it — that is a ` +
      `sourced finding about them, not a gap in our research`);
    const row = rows.find((r) => r.providerId === providerId && r.programId === programId)!;
    assert.equal(row.pphState, "not_published");
    assert.notEqual(row.pphState, "unknown");
  }
});

test("PPH: a record that says the provider DOES publish the hours is a gap in our data, never a finding", () => {
  // These three publish a price AND publish an hours breakdown — the contact
  // hours are simply missing from OUR record. Calling that "niet gepubliceerd"
  // would be a false statement about a named business, contradicted by the very
  // record the page is rendered from.
  const contradictory = [
    ["yogaeasy", "200-hatha-vinyasa"],
    ["yogic-life", "ryt200-multistyle"],
    ["yogic-life", "ryt300-multistyle"],
  ] as const;
  const rows = toListingRows(providers, NOW);
  for (const [providerId, programId] of contradictory) {
    const program = programOf(providerId, programId);
    // guard: if the data is fixed one day, this test must not quietly pass on a
    // programme that no longer has the shape it is here to pin.
    assert.equal(program.price.published, "yes");
    assert.equal(program.hours_claimed.breakdown_published, "yes");
    assert.equal(program.hours_claimed.contact, null);

    assert.equal(pphQuad(program), "unknown",
      `${providerId}/${programId}: the record says the provider publishes both — the missing value is ours`);
    const row = rows.find((r) => r.providerId === providerId && r.programId === programId)!;
    assert.equal(row.pphState, "unknown");
    assert.notEqual(row.pphState, "not_published");
  }
});

test("PPH: the €/contactuur cell never contradicts the Prijs cell in its own row", () => {
  // The visible symptom of the regression: the same row rendered the price as an
  // established fact in ink ("nee, zij publiceren geen prijs") while calling the
  // €/contactuur derived from it un-researched.
  const rows = toListingRows(providers, NOW);
  for (const r of rows) {
    if (r.pph != null || r.priceAmount != null) continue; // the price is the blocker
    if (r.pricePublished === "no" || r.pricePublished === "not_published") {
      assert.equal(r.pphState, "not_published",
        `${r.providerId}/${r.programId}: the Prijs cell states "${r.pricePublished}" as researched, ` +
        `but the €/contactuur cell calls the same fact "${r.pphState}"`);
    }
  }
});

test("PPH: the caveat never contradicts the quad it sits next to", () => {
  // Both directions. A gap must never assert the provider withheld anything; a
  // finding must say plainly that they did not publish it — a finding whose
  // tooltip blames our own record is the regression wearing the right colour.
  const rows = toListingRows(providers, NOW);
  for (const r of rows) {
    if (r.pph != null) continue;
    assert.ok(r.pphCaveat, `${r.providerId}/${r.programId}: no €/contactuur and no explanation why`);
    const caveat = r.pphCaveat!;
    if (r.pphState === "unknown") {
      assert.ok(!/publiceert geen|niet gepubliceerd/.test(caveat),
        `${r.providerId}/${r.programId}: the cell is a gap but its caveat "${caveat}" ` +
        `asserts the provider withheld something`);
      assert.match(caveat, /ons record/,
        `${r.providerId}/${r.programId}: the cell is a gap but its caveat "${caveat}" does not own it as ours`);
    }
    if (r.pphState === "not_published") {
      assert.match(caveat, /publiceert geen/,
        `${r.providerId}/${r.programId}: the cell is a finding but its caveat "${caveat}" does not say ` +
        `what the provider does not publish`);
      assert.ok(!/ontbreekt in ons record|ontbreken in ons record/.test(caveat),
        `${r.providerId}/${r.programId}: the cell is a finding but its caveat "${caveat}" blames our record`);
    }
  }
});

test("PPH: every caveat string in strings.ts is reachable", () => {
  // The four pph* strings are display copy that duplicates nothing; a dead one
  // is copy nobody maintains and nobody reads. Each must be produced by some row.
  const shown = new Set(toListingRows(providers, NOW).map((r) => r.pphCaveat).filter(Boolean));
  for (const key of ["pphPriceNotPublished", "pphHoursNotPublished", "pphPriceNotInRecord", "pphHoursNotInRecord"] as const) {
    assert.ok(shown.has(nl[key]), `nl.${key} is never rendered — it is dead copy`);
  }
});

test("a price that is not published never renders as a number", () => {
  // pricePublished is quad-state (yes | no | not_published | unknown, spec's
  // quad-state convention); an amount is only legitimate when it is "yes" —
  // "no", "not_published", and "unknown" must all carry neither a number nor
  // a rendered price string.
  const rows = toListingRows(providers, NOW);
  for (const r of rows) {
    if (r.pricePublished !== "yes") {
      assert.equal(r.priceAmount, null,
        `programme ${r.programId} has an amount despite pricePublished=${r.pricePublished}`);
      assert.equal(r.priceDisplay, null,
        `programme ${r.programId} renders a price despite pricePublished=${r.pricePublished}`);
    }
  }
});

test("the disclosure flag is set for every provider that has one", () => {
  // content/methodologie.md promises: "Zulke banden staan expliciet vermeld
  // bij de betreffende vermelding."
  const rows = toListingRows(providers, NOW);
  const withDisclosure = new Set(providers.filter((p) => p.disclosure).map((p) => p.id));
  for (const r of rows) {
    assert.equal(r.hasDisclosure, withDisclosure.has(r.providerId),
      `disclosure flag wrong for ${r.providerId}`);
  }
});

test("row hrefs deep-link to the programme on the provider record", () => {
  const rows = toListingRows(providers, NOW);
  for (const r of rows) {
    assert.equal(r.href, `/aanbieder/${r.providerId}#programma-${r.programId}`);
  }
});

test("stats are derived from the data, never hard-coded", () => {
  const stats = datasetStats(providers);
  assert.equal(stats.providers, providers.length);
  assert.equal(stats.programs, providers.reduce((n, p) => n + p.programs.length, 0));
  assert.ok(stats.pphComputable <= stats.programs);
  assert.match(stats.lastVerified ?? "", /^\d{4}-\d{2}/);
});

test("presenters are pure — they never mutate the dataset", () => {
  const before = JSON.stringify(providers);
  toListingRows(providers, NOW);
  datasetStats(providers);
  assert.equal(JSON.stringify(providers), before, "a presenter mutated its input");
});

test("every row carries its raw city names, for the distance filter to place", () => {
  const rows = toListingRows(providers, NOW);
  for (const r of rows) {
    const provider = providers.find((p) => p.id === r.providerId)!;
    const expected = [...new Set(provider.locations.map((l) => l.city).filter((c): c is string => c != null))];
    assert.deepEqual(r.cities, expected, `${r.providerId} lost or invented a city`);
  }
});

/* ---------- The provider record ---------- */

test("RECORD: a claim quote is reproduced verbatim, never altered", () => {
  // spec §3, the legal posture. Not truncated, not ellipsised, not re-cased.
  for (const p of providers) {
    const view = toProviderView(p);
    assert.equal(view.claims.length, p.claims.length);
    for (const [i, c] of p.claims.entries()) {
      assert.equal(view.claims[i].quote, c.quote, `claim ${c.id} was altered`);
    }
  }
});

test("RECORD: disclosure is always carried through when present", () => {
  for (const p of providers) {
    assert.equal(toProviderView(p).disclosure, p.disclosure ?? null);
  }
});

test("RECORD: a source with no public archive is marked, not hidden", () => {
  // The publication bar: records below it are marked, never dropped.
  for (const p of providers) {
    const view = toProviderView(p);
    assert.equal(view.sources.length, p.sources.length, `${p.id} dropped a source`);
    for (const [i, s] of p.sources.entries()) {
      assert.equal(view.sources[i].archivePublic, s.archived_url != null);
      assert.equal(view.sources[i].archiveLocal, s.local_snapshot != null);
    }
  }
});

test("RECORD: an absent coherence_signals object yields gaps, not findings", () => {
  // 52 of 77 programmes have no coherence_signals at all. Not investigated is
  // not investigated — it must not read as "the provider does not publish it".
  for (const p of providers) {
    for (const prog of toProviderView(p).programs) {
      for (const sig of prog.coherence) {
        assert.ok(["yes", "no", "not_published", "unknown"].includes(sig.state));
      }
    }
  }
  const bare = providers.find((p) => p.programs.some((pr) => pr.coherence_signals == null));
  assert.ok(bare, "expected at least one programme without coherence_signals");
  const prog = toProviderView(bare).programs.find((pr) => pr.coherence.every((s) => s.state === "unknown"));
  assert.ok(prog, "a programme with no coherence_signals did not render as all-unknown");
});

test("RECORD: every programme has a stable anchor id matching its listing href", () => {
  const rows = toListingRows(providers, NOW);
  for (const p of providers) {
    for (const prog of toProviderView(p).programs) {
      const row = rows.find((r) => r.providerId === p.id && r.programId === prog.id);
      assert.ok(row, `no listing row for ${p.id}/${prog.id}`);
      assert.equal(row.href, `/aanbieder/${p.id}#programma-${prog.id}`);
    }
  }
});
