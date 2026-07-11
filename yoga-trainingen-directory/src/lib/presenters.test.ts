import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { loadDataset } from "./loader";
import { toListingRows, datasetStats, formatEuro, formatMonth, cohortLabel, nextCohortLabel, toProviderView } from "./presenters";
import { pphQuad, priceQuad } from "./rules";
import { quadClass, saysNotPublished } from "./quad";
import { nl } from "./strings";
// The SCHEMA, as a value — the contract test walks its shape rather than
// hard-coding the key list it is supposed to be guarding. See SCHEMA_CONTRACT_KEYS.
import { Program, Quad, type Cohort, type Provider } from "../schema";

const { providers } = loadDataset();
const NOW = new Date("2026-07-01T00:00:00Z"); // fixed — never let a test depend on the wall clock

const programOf = (providerId: string, programId: string) =>
  providers.find((p) => p.id === providerId)!.programs.find((p) => p.id === programId)!;

test("every programme in the dataset becomes exactly one row", () => {
  const rows = toListingRows(providers, NOW);
  const programCount = providers.reduce((n, p) => n + p.programs.length, 0);
  assert.equal(rows.length, programCount);
});

/* ---------- Cohorts: an announced cohort is not one that ran, and a cancelled one is neither ----------
 *
 * Two of the three statuses the listing can show do not occur in today's data:
 * NO cohort anywhere is `cancelled`, and every "next" cohort happens to be
 * `announced`. So both branches are invariants that pass only because the
 * triggering data is absent — and an invariant that holds because nothing tests it
 * is not an invariant. Both triggers are manufactured below.
 */

/** A cohort we choose the status of. Its `source` is borrowed from a real record:
 *  the schema requires one, and a cohort without a source is not a cohort (§8). */
const SOURCE = providers.flatMap((p) => p.programs).find((p) => p.cohorts?.length)!.cohorts![0].source;
const cohort = (id: string, start: string, status: Cohort["status"]): Cohort => ({
  id,
  start,
  status,
  source: SOURCE,
});

/** A real, valid provider with its cohorts replaced — everything else about the
 *  record stays exactly as the schema (and the loader) validated it. */
const withCohorts = (cohorts: Cohort[]): Provider => {
  const base = providers.find((p) => p.id === "balanzs")!;
  return {
    ...base,
    id: "synthetic",
    programs: [{ ...base.programs[0], id: "synthetic-program", cohorts }],
  };
};

const nextOf = (cohorts: Cohort[]) =>
  toListingRows([withCohorts(cohorts)], NOW).find((r) => r.providerId === "synthetic")!.nextCohort;

test("an announced cohort is never labelled as one that ran", () => {
  // spec §8: recording an announcement as if it happened is the central trap.
  // "confirmed_ran" cohorts really did run — their Dutch label legitimately
  // contains "gedraaid", regardless of whether the start date happens to be
  // in the future (a cohort can be confirmed as running before its own start
  // month has fully passed). The invariant this guards is narrower than "no
  // cohort ever mentions running": only an ANNOUNCED cohort must never be
  // presented as one that ran.
  //
  // Every "next" cohort in today's data is `announced`, so the confirmed_ran branch
  // below was DEAD CODE: it asserted nothing, and the anti-vacuity guard at the
  // bottom could not have noticed. A confirmed_ran cohort with a future start is
  // perfectly legal (see above) — so one is manufactured here, and BOTH directions
  // are now guarded.
  const rows = [
    ...toListingRows(providers, NOW),
    ...toListingRows([withCohorts([cohort("ran", "2026-09", "confirmed_ran")])], NOW),
  ];
  let announced = 0;
  let ran = 0;
  for (const r of rows) {
    if (!r.nextCohort) continue;
    const { status } = r.nextCohort;
    // DERIVED at render from {start, status} — the row no longer STORES a label, so
    // a label contradicting its own status ("start sep 2026 — gestart" on an
    // announced cohort) is not merely wrong now, it is unconstructible.
    const label = nextCohortLabel(r.nextCohort);
    // the status is never omitted from the label, whatever it is
    assert.ok(label.includes(nl.cohortStatus[status]),
      `programme ${r.programId} cohort label omits its status (${status})`);
    if (status === "announced") {
      assert.match(label, /aangekondigd/,
        `programme ${r.programId} shows an announced cohort without saying so`);
      assert.doesNotMatch(label, /gedraaid|gestart|liep/,
        `programme ${r.programId} implies an announced cohort ran`);
      announced++;
    }
    if (status === "confirmed_ran") {
      assert.match(label, /gedraaid/,
        `programme ${r.programId} confirms a cohort ran but the label doesn't say so`);
      assert.doesNotMatch(label, /aangekondigd/,
        `programme ${r.programId} presents a cohort that RAN as a mere announcement`);
      ran++;
    }
  }
  // ANTI-VACUITY, both ways. Either branch going quiet means this test has stopped
  // guarding the direction it names — which is exactly what had happened.
  assert.ok(announced > 0, "no announced cohort in the listing — the trap direction is untested");
  assert.ok(ran > 0, "no confirmed_ran cohort reaches the listing label — that branch is dead code again");
});

test("COHORT: a CANCELLED cohort is never offered as the eerstvolgende start", () => {
  // No cohort in the dataset is `cancelled`, so the `status !== "cancelled"` guard
  // in nextCohort() has no test: DELETE IT and 97/97 still pass. The day a
  // cancelled cohort is recorded — and recording one is the whole point of having
  // the status — the listing offers it as the next start, sorts it as upcoming, and
  // labels it "eerstvolgende start sep 2026 — geannuleerd": a training presented to
  // a reader as the one to sign up for, in the row that says it is not happening.
  //
  // A cancelled run is not an upcoming run. So: manufacture the trigger.
  const next = nextOf([
    cohort("dead", "2026-08", "cancelled"),   // sooner — and it is not happening
    cohort("alive", "2026-09", "announced"),  // the one a reader can actually attend
  ]);
  assert.ok(next, "the announced cohort was dropped along with the cancelled one");
  assert.equal(next.start, "2026-09",
    `the listing offers a CANCELLED cohort (2026-08) as the eerstvolgende start. It is not going to run.`);
  assert.equal(next.status, "announced");
  assert.doesNotMatch(nextCohortLabel(next), /geannuleerd/);

  // And with nothing but a cancelled run ahead, there is NO next start — the
  // programme must say so, not advertise a cohort that was called off.
  assert.equal(nextOf([cohort("dead", "2026-08", "cancelled")]), null,
    "a programme whose only upcoming cohort is CANCELLED is offered as one that starts in August");

  // A cancelled run in the past is equally not a next start (it is filtered by date
  // as well — belt and braces, and the belt is the one under test).
  assert.equal(nextOf([cohort("old", "2026-01", "cancelled")]), null);

  // The guard is on `cancelled` ALONE: an announced cohort in the same position is
  // still offered. (Without this, deleting the whole `.filter(...)` — rather than
  // just the status clause — would pass the assertions above.)
  assert.equal(nextOf([cohort("alive", "2026-08", "announced")])?.start, "2026-08");
});

test("COHORT: the cancelled status has its own word — it never borrows another's", () => {
  // If a cancelled cohort ever DOES reach a label (it does, on the record page,
  // where cancelled runs are part of the track record), it must read as cancelled.
  const label = cohortLabel({ start: "2026-08", status: "cancelled" });
  assert.match(label, /geannuleerd/, "a cancelled cohort is not described as cancelled");
  assert.doesNotMatch(label, /aangekondigd|gedraaid/,
    "a cancelled cohort is presented as one that is announced or that ran");
  assert.ok(label.includes(formatMonth("2026-08")), "the label lost its date");
});

test("next cohort is never in the past", () => {
  // The bound is DERIVED from NOW, not hard-coded. `>= "2026-07"` had to be
  // hand-kept in step with the fixed clock above: move NOW to 2027 and the
  // assertion silently weakens to a tautology every row passes, while the test goes
  // on looking like it guards something. A test whose expectation is a copy of a
  // constant it is testing against guards that constant, not the code.
  const CURRENT_YM = NOW.toISOString().slice(0, 7);
  const rows = toListingRows(providers, NOW);
  let checked = 0;
  for (const r of rows) {
    if (r.nextCohort) {
      assert.ok(r.nextCohort.start >= CURRENT_YM,
        `programme ${r.programId} offers a next cohort of ${r.nextCohort.start}, which is before ${CURRENT_YM}`);
      checked++;
    }
  }
  assert.ok(checked > 0, "no programme has a next cohort at all — this test tests nothing");
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
 * THE rule (CLAUDE.md, spec §2.2). `not_published` is a FINDING about a NAMED
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
    // The blocker, read off the RECORD — the row carries no raw amount any more.
    if (r.pph != null || programOf(r.providerId, r.programId).price.amount_eur != null) continue;
    if (saysNotPublished(r.priceState)) {
      assert.equal(r.pphState, "not_published",
        `${r.providerId}/${r.programId}: the Prijs cell states "${r.priceState}" as researched, ` +
        `but the €/contactuur cell calls the same fact "${r.pphState}"`);
    }
    // And the other way: where the Prijs cell is OUR gap, the €/contactuur cell
    // derived from that same absent number must not accuse the provider either.
    if (r.priceState === "unknown") {
      assert.equal(r.pphState, "unknown",
        `${r.providerId}/${r.programId}: the Prijs cell admits the amount is a gap in OUR record, ` +
        `but the €/contactuur cell blames the provider for the same missing number ("${r.pphState}")`);
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
  // The record's `price.published` is quad-state; an amount is only legitimate
  // when it says "yes". "no", "not_published" and "unknown" must all carry
  // neither a number nor a rendered price string. (The invariant is on the
  // RECORD field, not on the rendered quad: the five gap rows render "unknown"
  // precisely BECAUSE they have no amount, so asserting it of the rendered quad
  // would be circular.)
  const rows = toListingRows(providers, NOW);
  for (const r of rows) {
    const program = programOf(r.providerId, r.programId);
    const published = program.price.published;
    if (published !== "yes") {
      assert.equal(program.price.amount_eur ?? null, null,
        `programme ${r.programId} has an amount despite price.published=${published}`);
      assert.equal(r.priceDisplay, null,
        `programme ${r.programId} renders a price despite price.published=${published}`);
      // …and so it is in no amount band. This is the invariant the two amount bands
      // lean on: `priceBand` may only say "under3000"/"from3000" of a programme whose
      // record actually holds a published amount.
      assert.ok(r.priceBand === "none_published" || r.priceBand === "amount_not_in_record",
        `programme ${r.programId} is banded "${r.priceBand}" with no published amount`);
    }
  }
});

/* ---------- Prijs: the listing and the record are ONE claim, or they are a lie ---------- */

test("PRICE: the listing row's price quad IS the record page's price quad — every programme", () => {
  // The test that would have caught it. The listing set `pricePublished` to the
  // raw `price.published` while the record page applied the finding-vs-gap rule,
  // so on five programmes the two pages of this one site stated OPPOSITE things
  // about the same named business: the listing a bare "ja" in fact ink, the
  // record "nog niet onderzocht" in grey. Nothing compared them, so nothing broke.
  //
  // They must now be the same value from the same function — for all 77, not for
  // the five we happen to know about.
  const rows = toListingRows(providers, NOW);
  for (const p of providers) {
    const view = toProviderView(p);
    for (const prog of p.programs) {
      const listing = rows.find((r) => r.providerId === p.id && r.programId === prog.id)!;
      const record = view.programs.find((v) => v.id === prog.id)!.rows.find((r) => r.label === nl.colPrice)!;
      assert.equal(listing.priceState, record.state,
        `${p.id}/${prog.id}: the listing says the price is "${listing.priceState}" and the record page ` +
        `says "${record.state}" — one site, one programme, two contradictory claims about a named business`);
      assert.equal(listing.priceState, priceQuad(prog),
        `${p.id}/${prog.id}: the listing re-derived the price quad instead of calling priceQuad()`);
      // and the same value, too — a matching quad over a differing number is no
      // better than a differing quad. (A non-fact row carries no `value` at all
      // now — the type forbids it — so "no price shown" is `undefined` here and
      // `null` on the listing; both mean the cell shows the state word.)
      assert.equal(listing.priceDisplay, record.value ?? null,
        `${p.id}/${prog.id}: the listing and the record render different prices`);
    }
  }
});

test("PRICE: a quad rendered as a FACT always has a value to show — never a bare “ja” or “nee”", () => {
  // <Quad> renders its children only for a fact WITH children, and falls through
  // to the state word otherwise. So a fact-class quad with nothing to show prints
  // a naked "ja" — an established fact, asserted, with no fact behind it. That is
  // what the five gap programmes printed on the listing.
  //
  // There is no longer any exemption for `no`. There used to be — "nee, zij
  // publiceren geen prijs, the value IS the word" — and it was wrong: `no` on a
  // *_published field is the SAME finding as `not_published` (saysNotPublished
  // says so, and the price filter selects on it), but it fell through <Quad> in
  // FACT ink. Five programmes printed a bare "nee" in ink inside a filter band
  // rendering fourteen others in amber. priceQuad() now normalises it, so no
  // price row can reach <Quad> as a value-less fact at all.
  const rows = toListingRows(providers, NOW);
  for (const r of rows) {
    if (quadClass(r.priceState) !== "fact") continue;
    assert.ok(r.priceDisplay != null,
      `${r.providerId}/${r.programId}: the Prijs cell is a fact ("${r.priceState}") with nothing to show — ` +
      `it renders a bare “${r.priceState === "no" ? "nee" : "ja"}”, asserting as established fact a price ` +
      `our record does not hold`);
  }
});

test("PRICE: every row in the “niet gepubliceerd” band renders the FINDING class — never fact ink", () => {
  // THE contradiction, visible on one screen. saysNotPublished() declares `no` and
  // `not_published` one finding, and the "niet gepubliceerd" price chip selects on
  // it — but quadClass("no") is "fact", and <Quad> renders children only for a fact
  // THAT HAS children, so `no` + no amount fell through to quadLabel("no") = "nee",
  // in fact ink. Clicking one chip returned 14 rows in amber "niet gepubliceerd"
  // and 5 in ink "nee": one filter, one asserted meaning, two renderings.
  //
  // This is the identical bug already fixed for "ja", left standing for "nee". It
  // fails against the pre-fix code on all five (critical-alignment,
  // spark-of-light, yoga-centrum-oosterwold ×2, yoga-nature-studio), each of whose
  // records carries a sourced note to exactly this effect ("Geen prijs
  // gepubliceerd op de 300u-pagina").
  //
  // quadClass itself is deliberately NOT changed: accreditation.verified: "no"
  // ("claimed, and not found in the register") is a genuine fact and stays ink.
  // Only priceQuad — a *_published field — normalises.
  const rows = toListingRows(providers, NOW);
  const band = rows.filter((r) => saysNotPublished(r.priceState));
  assert.ok(band.length > 0, "the 'niet gepubliceerd' band is empty — this test tests nothing");

  let fromNo = 0;
  for (const r of band) {
    assert.equal(quadClass(r.priceState), "finding",
      `${r.providerId}/${r.programId}: this row sits in the "niet gepubliceerd" band — an accusation ` +
      `about a named business — yet its Prijs cell renders in "${quadClass(r.priceState)}" ink, not amber. ` +
      `The chip and the cell state the same thing in two different colours.`);
    assert.equal(r.priceState, "not_published",
      `${r.providerId}/${r.programId}: the band's rows must all render as ONE finding, not two`);
    if (programOf(r.providerId, r.programId).price.published === "no") fromNo++;
  }
  // The `no` direction is the one that was broken; if the data ever loses it, this
  // test would keep passing while testing nothing.
  assert.ok(fromNo > 0, "no programme records price.published: no any more — the broken direction is untested");
});

test("PRICE: the five programmes that publish a price we do not hold are OUR gap, on BOTH pages", () => {
  // Named, because the accusation would be named. The record says each of these
  // DOES publish a price; the amount is missing from our record. Amber
  // ("niet gepubliceerd") on either page is a false statement about them.
  const ourGaps = [
    ["aalo-yoga-academie", "yin-yang-ryt200"],
    ["aalo-yoga-academie", "yin-ryt200"],
    ["de-blikopener", "hatha-raja-opleiding"],
    ["sanayou", "200-online"],
    ["yoga-academie-nederland", "300-hatha-verdieping"],
  ] as const;
  const rows = toListingRows(providers, NOW);
  for (const [providerId, programId] of ourGaps) {
    const prog = programOf(providerId, programId);
    // guard: if the data is completed one day, this test must not quietly pass on
    // a programme that no longer has the shape it is here to pin.
    assert.equal(prog.price.published, "yes", `${providerId}/${programId} no longer publishes a price`);
    assert.equal(prog.price.amount_eur ?? null, null, `${providerId}/${programId} now has an amount`);

    const listing = rows.find((r) => r.providerId === providerId && r.programId === programId)!;
    const record = toProviderView(providers.find((p) => p.id === providerId)!)
      .programs.find((v) => v.id === programId)!
      .rows.find((r) => r.label === nl.colPrice)!;

    assert.equal(listing.priceState, "unknown",
      `${providerId}/${programId}: the listing states "${listing.priceState}" — the record says they DO ` +
      `publish a price, so the missing amount is ours`);
    assert.equal(record.state, "unknown");
    assert.ok(!saysNotPublished(listing.priceState),
      `${providerId}/${programId}: our own gap, published as a finding about a named business`);
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
  assert.ok(stats.verified, "a non-empty corpus always has a verification window");
  assert.match(stats.verified.oldest, /^\d{4}-\d{2}/);
  assert.match(stats.verified.newest, /^\d{4}-\d{2}/);
});

test("STATS: the verification window is both ends or neither, and never inverted", () => {
  // It was two independent nullables (`verifiedOldest` / `verifiedNewest`), so half
  // a window was representable and app/page.tsx had to guard both ends to print one
  // line. One nullable object states "both or neither" in the type; this pins the
  // ordering the type cannot.
  const stats = datasetStats(providers);
  assert.ok(stats.verified, "the corpus is not empty, so it has a window");
  assert.ok(stats.verified.oldest <= stats.verified.newest,
    `the window runs backwards: ${stats.verified.oldest} … ${stats.verified.newest}`);
  // …and an empty corpus has no window at all, rather than half of one.
  assert.equal(datasetStats([]).verified, null);
});

test("STATS: the freshness line never dates the corpus by its freshest record", () => {
  // It printed the MAX: "records geverifieerd jul 2026", when 46 of 48 records
  // were jun 2026 and two were jul. One re-verification next year would have
  // re-dated all 48. The stat now carries BOTH ends, and the oldest — the floor
  // every record clears — is the one that anchors the line.
  const stats = datasetStats(providers);
  const all = providers.map((p) => p.last_verified).sort();
  assert.ok(stats.verified, "the corpus is not empty, so it has a window");
  assert.equal(stats.verified.oldest, all[0], "the oldest verification is not the oldest in the data");
  assert.equal(stats.verified.newest, all.at(-1), "the newest verification is not the newest in the data");
  assert.ok(new Set(all.map((d) => d.slice(0, 7))).size > 1,
    "every record shares one verification month — this test would prove nothing");

  const line = nl.statVerified(
    formatMonth(stats.verified.oldest.slice(0, 7)),
    formatMonth(stats.verified.newest.slice(0, 7)),
  );
  const oldest = formatMonth(all[0].slice(0, 7));
  assert.ok(line.includes(oldest),
    `the freshness line "${line}" omits the oldest record (${oldest}) — it overstates`);
  // A single month in the line, when the corpus spans two, IS the overstatement.
  assert.notEqual(line, nl.statVerified(formatMonth(all.at(-1)!.slice(0, 7)), formatMonth(all.at(-1)!.slice(0, 7))),
    "the freshness line reads as if every record were verified in the newest month");
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

/** Every claim the view renders anywhere: provider-level plus each programme's. */
const renderedClaims = (view: ReturnType<typeof toProviderView>) =>
  [...view.claims, ...view.programs.flatMap((prog) => prog.claims)];

test("RECORD: a claim quote is reproduced verbatim, never altered — and never dropped", () => {
  // spec §3, the legal posture. Not truncated, not ellipsised, not re-cased.
  // Claims now live under the thing their `scope` says they are about, so the
  // completeness check is over BOTH lists: every claim in the record is rendered
  // exactly once, and no claim is lost to the regrouping.
  for (const p of providers) {
    const view = toProviderView(p);
    const rendered = renderedClaims(view);
    assert.equal(rendered.length, p.claims.length, `${p.id}: a claim was dropped or duplicated`);
    assert.deepEqual(new Set(rendered.map((c) => c.id)).size, p.claims.length,
      `${p.id}: a claim is rendered twice`);
    for (const c of p.claims) {
      const shown = rendered.find((r) => r.id === c.id);
      assert.ok(shown, `${p.id}: claim ${c.id} reaches no part of the page`);
      assert.equal(shown.quote, c.quote, `claim ${c.id} was altered`);
    }
  }
});

/* ---------- Provenance: the site's own methodology, kept ----------
 *
 * /methodologie promises "Bij elk gegeven staat een bron en een datum", "Elk
 * gegeven heeft een bron" and "je kunt elke bron zelf naslaan"; the <meta
 * description> on every page says "Bronnen bij elk gegeven". The dataset holds 361
 * source refs. Not one of them reached the page: `toProviderView` read `.source`
 * only on the `sources[]` array itself. A reader met six verbatim quotes on
 * /aanbieder/yoga-moves and could look up not one of them.
 *
 * `claim.source` and `cohort.source` are REQUIRED by the schema — "the source makes
 * the difference between claim and fact". A null in either is a bug, not data.
 */

test("SOURCE: every claim carries its source — the schema requires it, so a null is a bug", () => {
  let checked = 0;
  for (const p of providers) {
    for (const c of renderedClaims(toProviderView(p))) {
      assert.ok(c.source != null && c.source.length > 0,
        `${p.id}: claim ${c.id} is published with NO source. The schema makes it required — "the source ` +
        `makes the difference between claim and fact" — and /methodologie promises the reader can look it up.`);
      checked++;
    }
  }
  assert.ok(checked > 0, "no claims in the dataset — this test tests nothing");
});

test("SOURCE: every cohort carries its source — an announced cohort is not one that ran (§8)", () => {
  let checked = 0;
  for (const p of providers) {
    for (const prog of toProviderView(p).programs) {
      for (const c of prog.cohorts) {
        assert.ok(c.source != null && c.source.length > 0,
          `${p.id}/${prog.id}: cohort ${c.id} is published with NO source. Recording an announcement as ` +
          `though it ran is the central trap (spec §8), and only the source lets a reader tell.`);
        checked++;
      }
    }
  }
  assert.ok(checked > 0, "no cohorts in the dataset — this test tests nothing");
});

test("SOURCE: every source a fact cites exists in that provider's sources[] — the link can never dangle", () => {
  // dataset.ts's referential-integrity check already guarantees this (a record
  // whose `source:` ref does not resolve does not load, and the build gate refuses
  // invalid data). This asserts that the VIEW does not invent, mangle or mis-key a
  // ref on the way to the page: every id the page renders as `#bron-<id>` must be
  // the id of a source row rendered on that same page.
  let cites = 0;
  for (const p of providers) {
    const view = toProviderView(p);
    const ids = new Set(view.sources.map((s) => s.id));
    const check = (source: string | null, what: string) => {
      if (source == null) return;
      assert.ok(ids.has(source),
        `${p.id}: ${what} cites source "${source}", which is not in this provider's sources[] — ` +
        `the citation links to #bron-${source}, an anchor that exists nowhere on the page`);
      cites++;
    };

    check(view.crkbo.source, "crkbo");
    view.registrations.forEach((r, i) => check(r.source, `registrations[${i}]`));
    for (const c of view.claims) check(c.source, `claim ${c.id}`);
    for (const prog of view.programs) {
      for (const row of prog.rows) check(row.source, `${prog.id} row "${row.label}"`);
      for (const row of [...prog.coherence, ...prog.transparency, ...prog.contract]) {
        check(row.source, `${prog.id} quad "${row.key}"`);
      }
      for (const a of prog.accreditation) check(a.source, `${prog.id} accreditation "${a.label}"`);
      for (const c of prog.cohorts) check(c.source, `${prog.id} cohort ${c.id}`);
      for (const c of prog.claims) check(c.source, `${prog.id} claim ${c.id}`);
    }
  }
  // The dataset holds 361 source refs. If the view carried none of them — the bug
  // this test exists for — every assertion above would vacuously pass.
  assert.ok(cites > 300,
    `only ${cites} facts carry a citation. The dataset holds 361 source refs, and the methodology ` +
    `promises "bij elk gegeven staat een bron".`);
});

test("SOURCE: the facts the schema sources are the facts the page cites", () => {
  // Field by field, against the record — so a `source` silently dropped from one
  // kind of fact (as all of them were) fails here, not just in aggregate.
  for (const p of providers) {
    const view = toProviderView(p);
    assert.equal(view.crkbo.source, p.crkbo.source ?? null, `${p.id}: crkbo lost its source`);
    p.registrations.forEach((r, i) =>
      assert.equal(view.registrations[i].source, r.source ?? null, `${p.id}: registration ${i} lost its source`));

    for (const prog of p.programs) {
      const rendered = view.programs.find((v) => v.id === prog.id)!;
      const row = (label: string) => rendered.rows.find((r) => r.label === label);
      assert.equal(row(nl.colPrice)!.source, prog.price.source ?? null,
        `${p.id}/${prog.id}: the Prijs row lost price.source`);
      assert.equal(row(nl.rowHours)!.source, prog.hours_claimed.source ?? null,
        `${p.id}/${prog.id}: the Urenuitsplitsing row lost hours_claimed.source`);
      assert.equal(row(nl.rowSupervised)!.source, prog.hours_claimed.source ?? null,
        `${p.id}/${prog.id}: the Begeleide lespraktijk row lost hours_claimed.source`);
      if (prog.group_size_claimed) {
        assert.equal(row(nl.rowGroupSize)!.source, prog.group_size_claimed.source ?? null,
          `${p.id}/${prog.id}: the Groepsgrootte row lost group_size_claimed.source`);
      }
      if (prog.track_record) {
        assert.equal(row(nl.rowTrackRecord)!.source, prog.track_record.source ?? null,
          `${p.id}/${prog.id}: the Track record row lost track_record.source`);
      }
      for (const r of rendered.coherence) {
        assert.equal(r.source, prog.coherence_signals?.source ?? null, `${p.id}/${prog.id}: coherence source`);
      }
      for (const r of rendered.transparency) {
        assert.equal(r.source, prog.transparency?.source ?? null, `${p.id}/${prog.id}: transparency source`);
      }
      for (const r of rendered.contract) {
        assert.equal(r.source, prog.contract?.source ?? null, `${p.id}/${prog.id}: contract source`);
      }
      prog.accreditation.forEach((a, i) =>
        assert.equal(rendered.accreditation[i].source, a.source ?? null,
          `${p.id}/${prog.id}: accreditation ${i} lost its source`));
      (prog.cohorts ?? []).forEach((c, i) =>
        assert.equal(rendered.cohorts[i].source, c.source, `${p.id}/${prog.id}: cohort ${c.id} lost its source`));
    }
  }
});

/* ---------- Claims stay anchored to what they were said about ---------- */

test("CLAIM: a programme-scoped claim is rendered under THAT programme, never another", () => {
  // `scope` was populated and never read: the page rendered every claim in one
  // flat provider-level list. yoga-moves has 3 programmes and 6 claims — a reader
  // comparing the 200-hour training met "ya-copycats-300", quoted from the 300-hour
  // page, and attributed it to the 200. dataset.ts validates that `scope` resolves
  // precisely so the claim stays anchored; the view discarded the anchor.
  let scoped = 0;
  let providerLevel = 0;
  for (const p of providers) {
    const view = toProviderView(p);
    for (const prog of view.programs) {
      for (const c of prog.claims) {
        assert.equal(c.scope, `program:${prog.id}`,
          `${p.id}: claim ${c.id} has scope "${c.scope}" but is rendered under programme ${prog.id} — ` +
          `a claim misattributed to a programme it was not made about`);
        scoped++;
      }
    }
    for (const c of view.claims) {
      assert.ok(!p.programs.some((prog) => c.scope === `program:${prog.id}`),
        `${p.id}: claim ${c.id} is scoped to a programme (${c.scope}) yet sits in the flat ` +
        `provider-level list, where a reader will attribute it to the wrong training`);
      providerLevel++;
    }
  }
  assert.ok(scoped > 0, "no programme-scoped claim any more — the misattribution direction is untested");
  assert.ok(providerLevel > 0, "no provider-level claim any more — that direction is untested");
});

test("CLAIM: yoga-moves' six claims land on the three programmes the record scopes them to", () => {
  // Named, because the misattribution would be named. This is the record from the
  // review, claim by claim.
  const view = toProviderView(providers.find((p) => p.id === "yoga-moves")!);
  const idsOf = (programId: string) =>
    view.programs.find((v) => v.id === programId)!.claims.map((c) => c.id).sort();

  assert.deepEqual(idsOf("200-vinyasa"), ["ya-international-200"]);
  assert.deepEqual(idsOf("300-advance"), ["ya-copycats-300"]);
  assert.deepEqual(idsOf("ashtanga-tt"), ["ashtanga-yai", "pranayama-cert-ashtanga"]);
  assert.deepEqual(view.claims.map((c) => c.id).sort(), ["vinyasa-intro-nl", "ya-first-school"]);

  // The 200-hour programme must not carry the claim quoted from the 300-hour page.
  assert.ok(!idsOf("200-vinyasa").includes("ya-copycats-300"));
  // Provider-level claims say so where they are shown.
  for (const c of view.claims) assert.equal(c.scopeLabel, nl.claimScopeProvider);
});

test("RECORD: an announced cohort is never labelled as one that ran — on the record page too", () => {
  // spec §8, the central trap: "an announced cohort is not a cohort that ran".
  //
  // The listing (nextCohort) and the record page (toProviderView) build this label
  // TWICE, independently, and only the listing's was tested. Drop the status from
  // the record's label and all 78 tests passed — while 58 announced cohorts across
  // 48 record pages rendered as bare dates under the heading "Cohorten", every one
  // of them reading as a training that runs.
  //
  // This is also the ONLY surface where `confirmed_ran` is real: all 44 cohorts the
  // listing shows are announced (a "next" cohort has not run yet), so that branch
  // is dead there. The nine that really did run are here.
  //
  // The label is now DERIVED from {start, status} by cohortLabel(), not stored on
  // the view: a CohortView whose label contradicts its own status is no longer
  // constructible at all, and this test pins the one function that writes it.
  let announced = 0;
  let ran = 0;
  let cancelled = 0;
  for (const p of providers) {
    for (const prog of toProviderView(p).programs) {
      for (const cohort of prog.cohorts) {
        const c = { ...cohort, label: cohortLabel(cohort) };
        const where = `${p.id}/${prog.id} cohort ${c.id}`;
        assert.ok(c.label.includes(nl.cohortStatus[c.status]),
          `${where}: the label "${c.label}" omits its status (${c.status}) — a bare date under the ` +
          `heading "Cohorten" reads as a training that runs`);
        if (c.status === "announced") {
          assert.match(c.label, /aangekondigd/, `${where}: announced, and the label does not say so`);
          assert.doesNotMatch(c.label, /gedraaid|gestart|liep/,
            `${where}: an ANNOUNCEMENT, presented as a cohort that ran — the central trap (spec §8)`);
          announced++;
        }
        if (c.status === "confirmed_ran") {
          assert.match(c.label, /gedraaid/, `${where}: confirmed to have run, and the label does not say so`);
          ran++;
        }
        if (c.status === "cancelled") cancelled++;
        // The date is still there — the status replaces nothing.
        assert.ok(c.label.includes(formatMonth(c.start.slice(0, 7))), `${where}: the label lost its date`);
      }
    }
  }
  // Neither direction may go quiet: an all-announced dataset would make the
  // "gedraaid" assertions vacuous, and an all-ran one the reverse.
  assert.ok(announced > 0, "no announced cohort on any record page — the trap direction is untested");
  assert.ok(ran > 0, "no confirmed_ran cohort any more — the branch that says 'this really happened' is dead");
  assert.ok(announced + ran + cancelled > 0);
});

test("RECORD: the bundle delta says which SIDE of the sum the package price is on", () => {
  // A derived comparison published about a named business. `delta < 0` decides
  // between "onder" and "boven"; flip it and Yogapoint's package is published as
  // €363 MORE expensive than its three modules when it is €363 CHEAPER — and the
  // whole 78-test suite stayed green, because nothing asserted the wording.
  // Exactly one programme in the dataset exercises this line.
  const view = toProviderView(providers.find((p) => p.id === "yogapoint")!);
  const row = view.programs.find((v) => v.id === "300-verdieping")!.rows.find((r) => r.label === nl.rowComposition)!;
  assert.equal(row.note, nl.bundleDelta(formatEuro(363), true),
    `Yogapoint's €3.993 package is €363 BELOW the €4.356 sum of its three €1.452 modules. The row says: ` +
    `"${row.note}"`);
  assert.match(row.note!, /onder/, "the package is cheaper than the sum, and the page must say so");
  assert.doesNotMatch(row.note!, /boven/,
    "the page tells the reader a cheaper package is more expensive than its parts");
});

test("RECORD: disclosure is always carried through when present", () => {
  for (const p of providers) {
    assert.equal(toProviderView(p).disclosure, p.disclosure ?? null);
  }
});

test("RECORD: a source with no public archive is marked, not hidden", () => {
  // The publication bar: records below it are marked, never dropped.
  //
  // Asserted against the RECORD, never against a mirror field on the view: the
  // view used to carry `archivePublic`/`archiveLocal` booleans that no page read,
  // and a test comparing the view's booleans to the view's own string would have
  // agreed with itself while both drifted away from the YAML.
  for (const p of providers) {
    const view = toProviderView(p);
    assert.equal(view.sources.length, p.sources.length, `${p.id} dropped a source`);
    for (const [i, s] of p.sources.entries()) {
      const archived = s.archived_url != null || s.local_snapshot != null;
      assert.equal(view.sources[i].archiveSlots != null, archived,
        `${p.id}/${s.id}: the archive slots do not match the record`);
    }
  }
});

test("RECORD: an absent coherence_signals object yields gaps, not findings", () => {
  // 52 of 77 programmes have no coherence_signals at all. Not investigated is
  // not investigated — it must not read as "the provider does not publish it".
  //
  // Every such programme, and every one of its six signals: a `?? "not_published"`
  // anywhere in coherenceRows must fail here. (An earlier version of this test
  // searched for SOME programme of SOME provider that happened to render
  // all-unknown, which a single well-populated record could satisfy while every
  // other programme lied.)
  let checked = 0;
  for (const p of providers) {
    const view = toProviderView(p);
    for (const prog of p.programs) {
      if (prog.coherence_signals != null) continue;
      const rendered = view.programs.find((v) => v.id === prog.id)!;
      assert.equal(rendered.coherence.length, Object.keys(nl.coherence).length,
        `${p.id}/${prog.id} does not render all six coherence signals`);
      for (const sig of rendered.coherence) {
        assert.equal(sig.state, "unknown",
          `${p.id}/${prog.id}: coherence_signals is absent — nobody looked — yet "${sig.key}" renders ` +
          `as "${sig.state}". A gap published as a finding is an accusation against a named business ` +
          `that we never researched.`);
      }
      checked++;
    }
  }
  assert.ok(checked > 0, "no programme lacks coherence_signals any more — this test tests nothing");
});

test("RECORD: an absent transparency object yields gaps, not findings", () => {
  // The identical rule, on the field where it is most likely to break: 73 of 77
  // programmes have no `transparency` object at all, so a `?? "not_published"`
  // in transparencyRows would print a five-line amber indictment on nearly every
  // programme on the site — of research nobody has done. That field had no test.
  let checked = 0;
  for (const p of providers) {
    const view = toProviderView(p);
    for (const prog of p.programs) {
      if (prog.transparency != null) continue;
      const rendered = view.programs.find((v) => v.id === prog.id)!;
      assert.equal(rendered.transparency.length, Object.keys(nl.transparency).length,
        `${p.id}/${prog.id} does not render all five transparency signals`);
      for (const sig of rendered.transparency) {
        assert.equal(sig.state, "unknown",
          `${p.id}/${prog.id}: transparency is absent — nobody looked — yet "${sig.key}" renders ` +
          `as "${sig.state}", which states as a finding that the provider publishes no ${sig.label}`);
      }
      checked++;
    }
  }
  assert.ok(checked > 0, "no programme lacks a transparency object any more — this test tests nothing");
});

/* ---------- Voorwaarden: the page renders the SCHEMA's keys, not a hand-kept list ----------
 *
 * The key list below is DERIVED FROM THE SCHEMA at runtime. The old test hard-coded
 * the same three keys the presenter hard-coded — `["cancellation_published",
 * "refund_published", "installments_published"]` — so it confirmed itself, and the
 * schema's FOURTH quad-bearing key went unrendered and untested for as long as it
 * existed. `min_participants` is the clause under which a training someone has
 * already paid for gets CANCELLED. Six records carry it; one (centre-body-mind)
 * carries `clause: not_published` — a sourced finding about a named business,
 * dropped on the floor. A reader was never told the clause exists.
 *
 * A guard test that reads its expectations from the thing it guards guards nothing.
 * So: walk the schema.
 */
const unwrapSchema = (s: z.ZodTypeAny): z.ZodTypeAny =>
  s instanceof z.ZodOptional || s instanceof z.ZodNullable ? unwrapSchema(s.unwrap()) : s;

/** A Quad, or an object wrapping one (`min_participants: { clause: Quad, … }`). */
const isQuadBearing = (s: z.ZodTypeAny): boolean => {
  const inner = unwrapSchema(s);
  if (inner instanceof z.ZodEnum) {
    const options = inner.options as string[];
    return Quad.options.every((o) => options.includes(o)) && options.length === Quad.options.length;
  }
  if (inner instanceof z.ZodObject) {
    const shape = inner.shape as Record<string, z.ZodTypeAny>;
    return shape.clause != null && isQuadBearing(shape.clause);
  }
  return false;
};

const CONTRACT_SHAPE = (unwrapSchema(Program.shape.contract) as z.ZodObject<z.ZodRawShape>).shape;
const SCHEMA_CONTRACT_KEYS = Object.keys(CONTRACT_SHAPE).filter((k) => isQuadBearing(CONTRACT_SHAPE[k]));

test("RECORD: every quad-bearing contract key IN THE SCHEMA reaches the page", () => {
  // Derived from the schema, so a new quad key added to `contract` fails here
  // until it is rendered — and TypeScript fails first, at CONTRACT_LABELS in
  // presenters.ts, which is keyed by the schema's own contract shape.
  assert.ok(SCHEMA_CONTRACT_KEYS.includes("min_participants"),
    "the schema no longer has min_participants — this test is pinned to the wrong thing");
  assert.equal(SCHEMA_CONTRACT_KEYS.length, 4,
    `the schema's contract has ${SCHEMA_CONTRACT_KEYS.length} quad keys: ${SCHEMA_CONTRACT_KEYS.join(", ")}`);

  for (const p of providers) {
    const view = toProviderView(p);
    for (const prog of p.programs) {
      const rendered = view.programs.find((v) => v.id === prog.id)!;
      assert.deepEqual(
        [...rendered.contract.map((r) => r.key)].sort(),
        [...SCHEMA_CONTRACT_KEYS].sort(),
        `${p.id}/${prog.id}: the rendered contract rows are not the schema's quad keys — a researched, ` +
        `sourced field the schema defines is invisible on the page`);
      for (const row of rendered.contract) {
        assert.ok(row.label && row.label.length > 0, `${p.id}/${prog.id}: contract.${row.key} has no label`);
      }
    }
  }
});

test("RECORD: the contract quads reach the page AS quads, never flattened into a sentence", () => {
  // They were once joined into one "Voorwaarden" string handed to the page as a
  // single `state: "yes"` — two real `not_published` findings rendered in fact
  // ink, and a future `unknown` would have rendered a gap as an established
  // fact. Each sub-quad must arrive with its own state, unaltered from the record.
  let facts = 0;
  let findings = 0;
  for (const p of providers) {
    const view = toProviderView(p);
    for (const prog of p.programs) {
      const rendered = view.programs.find((v) => v.id === prog.id)!;
      for (const key of SCHEMA_CONTRACT_KEYS) {
        const row = rendered.contract.find((r) => r.key === key)!;
        // min_participants holds its quad on `clause`; the others ARE the quad.
        const recorded = key === "min_participants"
          ? prog.contract?.min_participants?.clause
          : (prog.contract as Record<string, Quad | undefined> | undefined)?.[key];
        assert.equal(row.state, recorded ?? "unknown",
          `${p.id}/${prog.id}: contract.${key} is "${recorded ?? "absent"}" in the record ` +
          `but renders as "${row.state}"`);
        if (row.state === "not_published") findings++;
        if (row.state === "yes" || row.state === "no") facts++;
      }
    }
  }
  assert.ok(findings > 0, "no contract quad is a finding any more — the finding direction is untested");
  assert.ok(facts > 0, "no contract quad is a fact any more — the fact direction is untested");
});

test("RECORD: a minimum-participants clause shows its number, and a not_published one is a FINDING", () => {
  // The clause the training gets cancelled under. Six records carry it and none
  // of them reached a page. Pinned by name, because the finding is about a name.
  const view = (id: string) => toProviderView(providers.find((p) => p.id === id)!);
  const row = (providerId: string, programId: string) =>
    view(providerId).programs.find((v) => v.id === programId)!.contract
      .find((r) => r.key === "min_participants")!;

  // A sourced finding about a named business, silently dropped before this fix.
  const cbm = row("centre-body-mind", "200-yoga-docentenopleiding");
  assert.equal(cbm.state, "not_published");
  assert.equal(quadClass(cbm.state), "finding", "a sourced not_published finding must render as one");

  // The number rides with the clause where the record holds one.
  const yogapoint = row("yogapoint", "300-verdieping");
  assert.equal(yogapoint.state, "yes");
  assert.equal(yogapoint.value, nl.minParticipants(6), "Yogapoint's minimum of 6 never reaches the page");

  const ca = row("critical-alignment", "cay-lerarenopleiding");
  assert.equal(ca.state, "yes");
  assert.equal(ca.value, nl.minParticipants(12));

  // A clause with no number still says the clause exists — <Quad> prints "ja".
  const moves = row("yoga-moves", "300-advance");
  assert.equal(moves.state, "yes");
  assert.equal(moves.value, null);

  // And an un-investigated one stays a GAP — never an accusation.
  const yns = row("yoga-nature-studio", "200-living-vinyasa");
  assert.equal(yns.state, "unknown");
  assert.equal(quadClass(yns.state), "gap");
});

test("RECORD: the €/contactuur row obeys the same rule as the listing, from the same function", () => {
  // The Critical bug this project already shipped once and fixed — a gap
  // published as a finding — lived in the listing. Nothing pinned the RECORD's
  // €/contactuur row to pphQuad, so the identical bug could be reintroduced here
  // with zero test failures. It cannot now: the row's state must BE pphQuad's,
  // and a finding must be backed by a record field that literally says the
  // provider does not publish it.
  let findings = 0;
  let gaps = 0;
  for (const p of providers) {
    const view = toProviderView(p);
    for (const prog of p.programs) {
      const row = view.programs.find((v) => v.id === prog.id)!.rows.find((r) => r.label === nl.colPph);
      assert.ok(row, `${p.id}/${prog.id} has no €/contactuur row`);
      assert.equal(row.state, pphQuad(prog),
        `${p.id}/${prog.id}: the record's €/contactuur row says "${row.state}" where the one rule ` +
        `says "${pphQuad(prog)}" — the record must never say something the listing does not`);

      if (row.state !== "not_published") {
        if (row.state === "unknown") gaps++;
        continue;
      }
      const blocker = prog.price.amount_eur == null
        ? prog.price.published
        : prog.hours_claimed.breakdown_published;
      assert.ok(blocker === "not_published" || blocker === "no",
        `${p.id}/${prog.id}: the row accuses the provider of not publishing it, but the blocking ` +
        `record field says "${blocker}" — that is OUR gap, published as a finding about a named business`);
      findings++;
    }
  }
  assert.ok(findings > 0, "no programme exercises the FINDING direction any more");
  assert.ok(gaps > 0, "no programme exercises the GAP direction any more");
});

test("RECORD: a published price with no amount is OUR gap, never a bare “ja”", () => {
  // Five programmes: price.published is "yes" and amount_eur is null. A row
  // labelled "Prijs" promises a value; "ja" with no number asserts as an
  // established fact something our record does not hold. The record says they
  // DO publish it — so the missing number is ours. Same rule, same direction.
  let checked = 0;
  for (const p of providers) {
    const view = toProviderView(p);
    for (const prog of p.programs) {
      const row = view.programs.find((v) => v.id === prog.id)!.rows.find((r) => r.label === nl.colPrice)!;
      if (prog.price.published === "yes" && prog.price.amount_eur == null) {
        assert.equal(row.value ?? null, null);
        assert.equal(row.state, "unknown",
          `${p.id}/${prog.id}: "Prijs: ja" with no amount — a fact we do not hold`);
        assert.ok(row.note?.includes(nl.priceAmountNotInRecord),
          `${p.id}/${prog.id}: the Prijs row is a gap but does not disclose why`);
        checked++;
      } else {
        // Every other programme still says exactly what the record says — with the
        // one normalisation priceQuad makes on this *_published field: `no` and
        // `not_published` are one finding, so both render as the finding. (Before,
        // `no` rendered as a bare "nee" in fact ink; see the band test above.)
        assert.equal(row.state, priceQuad(prog));
        assert.equal(row.state,
          saysNotPublished(prog.price.published) ? "not_published" : prog.price.published,
          `${p.id}/${prog.id}: the Prijs row says "${row.state}" where the record says ` +
          `"${prog.price.published}"`);
      }
    }
  }
  assert.ok(checked > 0, "no programme publishes a price without an amount any more");
});

test("RECORD: a provider's verbatim assessment quote is never dropped", () => {
  // <Quad> renders children only for a fact, so on the six programmes where
  // `exists: not_published` AND a quote exists, the provider's own words were
  // vanishing — and that quote is the EVIDENCE for the finding. It must always
  // reach the page: as the row's value where the state is a fact, in the row's
  // note otherwise. Verbatim, either way (spec §3).
  let viaNote = 0;
  for (const p of providers) {
    const view = toProviderView(p);
    for (const prog of p.programs) {
      const quote = prog.assessment_described?.quote;
      if (!quote) continue;
      const row = view.programs.find((v) => v.id === prog.id)!.rows.find((r) => r.label === nl.rowAssessment)!;
      const rendered = `${row.value ?? ""}${row.note ?? ""}`;
      assert.ok(rendered.includes(quote),
        `${p.id}/${prog.id}: assessment quote never reaches the page (state "${row.state}")`);
      if (row.state === "not_published" || row.state === "unknown") {
        assert.ok(row.note?.includes(quote),
          `${p.id}/${prog.id}: the quote is the evidence for a "${row.state}" — it must be in the note, ` +
          `which always renders, not in the value, which a non-fact drops`);
        viaNote++;
      }
    }
  }
  assert.ok(viaNote > 0, "no non-fact assessment carries a quote any more");
});

test("RECORD: every source shows BOTH halves of the publication bar", () => {
  // The bar is a public archive AND a dated local copy. Rendering only the
  // halves that exist let a half-met bar read as a met one — the site claiming a
  // standard it does not meet, on the page whose job is to be honest about that.
  // Both slots, always; a missing half is a "—", never silence.
  //
  // Every assertion reads the RECORD (`archived_url`, `local_snapshot`) and holds
  // the rendered string to it. The view carries no second copy of those two facts
  // to check against — that is the point: one spelling, and the test compares it
  // to the YAML rather than to itself.
  const seen = new Set<string>();
  for (const p of providers) {
    const view = toProviderView(p);
    for (const [i, rec] of p.sources.entries()) {
      const s = view.sources[i];
      const hasPublic = rec.archived_url != null;
      const hasLocal = rec.local_snapshot != null;
      if (!hasPublic && !hasLocal) {
        assert.equal(s.archiveSlots, null, `${p.id}/${s.id}: nothing archived, yet it prints a slot line`);
        seen.add("neither");
        continue;
      }
      const slots = s.archiveSlots;
      assert.ok(slots, `${p.id}/${s.id} shows no archive slots`);
      // both halves are named, every time, whichever one is missing
      assert.ok(slots.includes(nl.archivePublic) && slots.includes(nl.archiveLocal),
        `${p.id}/${s.id}: "${slots}" hides a half of the bar`);
      assert.ok(
        slots.includes(`${nl.archivePublic} ${hasPublic ? nl.archivePresent : nl.archiveAbsent}`),
        `${p.id}/${s.id}: the public-archive slot misreports (archived_url ${hasPublic})`);
      assert.ok(
        slots.includes(`${nl.archiveLocal} ${hasLocal ? nl.archivePresent : nl.archiveAbsent}`),
        `${p.id}/${s.id}: the local-copy slot misreports (local_snapshot ${hasLocal})`);
      seen.add(`${hasPublic}/${hasLocal}`);
    }
  }
  // all four shapes exist in the dataset — none of the branches above is dead
  for (const shape of ["true/true", "false/true", "true/false", "neither"]) {
    assert.ok(seen.has(shape), `no source has archive shape ${shape} — that branch is untested`);
  }
});

test("RECORD: the source count never overstates what is archived", () => {
  // "N · M publiek gearchiveerd" invited the reader to take M as the bar. Both
  // counts are printed, and each is the literal count of the field it names.
  for (const p of providers) {
    const view = toProviderView(p);
    assert.equal(view.sourcesArchivedPublic, p.sources.filter((s) => s.archived_url != null).length);
    assert.equal(view.sourcesArchivedLocal, p.sources.filter((s) => s.local_snapshot != null).length);
    assert.ok(view.sourcesArchivedPublic <= view.sources.length);
    assert.ok(view.sourcesArchivedLocal <= view.sources.length);
    const heading = nl.sourcesHeading(view.sources.length, view.sourcesArchivedPublic, view.sourcesArchivedLocal);
    assert.ok(heading.includes(`${view.sourcesArchivedPublic}`) && heading.includes(`${view.sourcesArchivedLocal}`),
      `${p.id}: the sources heading drops one of the two counts`);
  }
});

/* ---------- THE rule, over EVERY row of EVERY programme — not three of them ----------
 *
 * `missingBecause()` is THE finding-vs-gap rule, and it had exactly one call site
 * under test (€/contactuur). Replace it with a literal "not_published" at the
 * SUPERVISED-PRACTICE row and all 78 tests passed — while 6 named businesses whose
 * record says `breakdown_published: yes` (de-yogaschool-enschede, dru-yoga,
 * jai-yoga, neo-yoga-delft, yoga-moves, yogic-life) were accused, on their own
 * pages, of not publishing the one figure this project calls "the finding". The
 * same hole sat on the hours row, and on `assessment_described` — the fourth
 * optional object, and the only one with no absent-object test (8 programmes).
 *
 * A test per call site would have missed the next call site. So this walks EVERY
 * KeyValueRow and EVERY QuadRow of EVERY programme of EVERY provider and asks the
 * only two questions there are:
 *
 *   1. If this cell accuses a named business, WHICH FIELD OF OUR RECORD says so?
 *   2. If nobody investigated the object behind it, does it say anything but
 *      "nog niet onderzocht"?
 */

/**
 * The record field that licenses a row to say "niet gepubliceerd".
 *
 *   a Quad    → that field governs the row; only `not_published`/`no` license it;
 *   undefined → the schema has the field, this record does not (nobody looked):
 *               the row may say nothing but "nog niet onderzocht";
 *   null      → NO *_published field governs this row at all ("Groepsgrootte",
 *               "Track record", "Stijl"…). It may hold a value or admit a gap. It
 *               may never make a finding — there is nothing to make one from.
 */
type Backing = Quad | undefined | null;

const rowBacking = (prog: Program, label: string): Backing => {
  switch (label) {
    case nl.colPrice:
      return prog.price.published;
    case nl.colPph:
      // The blocker: no amount → the price is what is missing; else the hours.
      return prog.price.amount_eur == null
        ? prog.price.published
        : prog.hours_claimed.breakdown_published;
    case nl.rowHours:
    case nl.rowSupervised:
      return prog.hours_claimed.breakdown_published;
    case nl.rowAssessment:
      // undefined exactly when `assessment_described` is absent — `exists` is
      // required by the schema, so it cannot be missing from an object that is there.
      return prog.assessment_described?.exists;
    default:
      return null;
  }
};

test("RECORD: every row's state is backed by the record — a finding needs a field that says so", () => {
  let findings = 0;
  let ungoverned = 0;
  let absentObject = 0;
  let supervisedOurGap = 0;
  let assessmentAbsent = 0;
  let rowsWalked = 0;

  for (const p of providers) {
    const view = toProviderView(p);
    for (const prog of p.programs) {
      const rendered = view.programs.find((v) => v.id === prog.id)!;
      for (const row of rendered.rows) {
        rowsWalked++;
        const backing = rowBacking(prog, row.label);
        const where = `${p.id}/${prog.id} · "${row.label}"`;

        // 1. An accusation must be backed by a record field that literally makes it.
        if (row.state === "not_published") {
          assert.ok(backing != null,
            `${where}: the row says the provider does not publish this, but ${backing === null
              ? "NO record field governs this row — the accusation is made from nothing"
              : "the object that would carry that field is absent from our record: nobody looked"}`);
          assert.ok(saysNotPublished(backing),
            `${where}: the row accuses a named business of not publishing it, but the record field that ` +
            `governs it says "${backing}". Our own record contradicts the page. That is a false statement ` +
            `about a named business — the worst failure this project can commit.`);
          findings++;
        }

        // 2. Nobody looked → the row says nothing but "nog niet onderzocht".
        if (backing === undefined) {
          assert.equal(row.state, "unknown",
            `${where}: the optional object behind this row is absent — un-investigated — yet the row ` +
            `renders "${row.state}". A gap published as a finding is an accusation we never earned.`);
          absentObject++;
        }
        if (backing === null) {
          assert.ok(row.state === "yes" || row.state === "unknown",
            `${where}: no *_published field governs this row, so it can only hold a value or admit a gap. ` +
            `It renders "${row.state}".`);
          ungoverned++;
        }

        // 3. And the value never disagrees with the state: a fact shows what it
        //    asserts, a non-fact carries nothing the page would silently drop.
        //    (The type forbids both; a cast could still get past it.)
        if (row.state === "yes") {
          assert.ok(row.value != null && row.value.length > 0,
            `${where}: a bare “ja” in fact ink, with nothing behind it`);
        } else {
          assert.equal(row.value ?? null, null,
            `${where}: state "${row.state}" is not a fact, so <Quad> drops this value on the floor: ` +
            `"${row.value}"`);
        }

        // Anti-vacuity: the two populations the mutations above would have lied about.
        if (row.label === nl.rowSupervised && backing === "yes" && row.value == null) supervisedOurGap++;
        if (row.label === nl.rowAssessment && backing === undefined) assessmentAbsent++;
      }

      // The quad blocks obey the identical rule: the state IS the record's quad,
      // and an absent (or un-set) field is a gap.
      const quadBacking = (section: "coherence" | "transparency" | "contract", key: string): Backing => {
        if (section === "coherence") {
          return prog.coherence_signals?.[key as keyof NonNullable<typeof prog.coherence_signals>] as Backing;
        }
        if (section === "transparency") {
          return prog.transparency?.[key as keyof NonNullable<typeof prog.transparency>] as Backing;
        }
        if (key === "min_participants") return prog.contract?.min_participants?.clause;
        return (prog.contract as Record<string, Quad | undefined> | undefined)?.[key];
      };

      for (const section of ["coherence", "transparency", "contract"] as const) {
        for (const row of rendered[section]) {
          rowsWalked++;
          const backing = quadBacking(section, row.key);
          const where = `${p.id}/${prog.id} · ${section}.${row.key}`;
          if (row.state === "not_published") {
            assert.ok(backing != null && saysNotPublished(backing),
              `${where}: renders the finding "niet gepubliceerd" while the record says ` +
              `"${backing ?? "nothing at all — the object is absent"}"`);
            findings++;
          }
          if (backing == null) {
            assert.equal(row.state, "unknown",
              `${where}: the record holds no such field — nobody looked — yet the page renders ` +
              `"${row.state}" about a named business`);
            absentObject++;
          }
        }
      }
    }
  }

  // None of the branches above may go quiet. Each of these counts is a population
  // that one of the mutations this test exists to kill would have lied about.
  assert.ok(rowsWalked > 1000, `only ${rowsWalked} rows walked — this test is not seeing the dataset`);
  assert.ok(findings > 0, "no row anywhere is a finding — the accusation direction is untested");
  assert.ok(absentObject > 0, "no optional object is absent any more — the gap direction is untested");
  assert.ok(ungoverned > 0, "no row is ungoverned any more — the fact() direction is untested");
  assert.ok(supervisedOurGap >= 6,
    `only ${supervisedOurGap} programmes publish an hours breakdown while OUR record lacks the ` +
    `supervised-practice figure. Six did (de-yogaschool-enschede, dru-yoga, jai-yoga, neo-yoga-delft, ` +
    `yoga-moves, yogic-life), and they are exactly the records a literal "not_published" on that row ` +
    `would libel. If the data no longer holds them, this test no longer guards the row.`);
  assert.ok(assessmentAbsent >= 8,
    `only ${assessmentAbsent} programmes have no assessment_described object (8 did) — the fourth ` +
    `optional object, and the one with no absent-object test`);
});

test("RECORD: the hours row applies the RULE, not a constant — proven on a record we build", () => {
  // The general test above cannot prove this one: all four programmes that publish
  // no hours at all happen to carry `breakdown_published: not_published` today, so
  // hard-coding "not_published" on the hours row is a silent no-op against THIS
  // data — a rule that only holds because the counter-example is absent is not a
  // rule. So: manufacture the counter-example, exactly as the supervised row
  // already has six of. A provider whose record says "they publish a breakdown"
  // and whose hours are missing from OUR record must never be accused of hiding them.
  const real = providers.find((p) => p.id === "de-yogaschool-enschede")!;
  const base = real.programs.find((pr) => pr.id === "docentenopleiding-raja")!;
  const hours = (breakdown_published: Quad): Program => ({
    ...base,
    hours_claimed: {
      ...base.hours_claimed,
      total: null,
      contact: null,
      self_study: null,
      breakdown_published,
    },
  });
  const hoursRow = (program: Program) =>
    toProviderView({ ...real, programs: [program] })
      .programs[0].rows.find((r) => r.label === nl.rowHours)!;

  // They publish it; we do not hold it. OUR gap.
  const ourGap = hoursRow(hours("yes"));
  assert.equal(ourGap.state, "unknown",
    `the record says the provider publishes an hours breakdown and our record lacks it — calling that ` +
    `"niet gepubliceerd" is a false statement about a named business`);
  assert.equal(ourGap.value ?? null, null);

  // Nobody looked. Also our gap — never an accusation.
  assert.equal(hoursRow(hours("unknown")).state, "unknown");

  // We looked; they do not publish it. Both literals that say so are the finding.
  assert.equal(hoursRow(hours("not_published")).state, "not_published");
  assert.equal(hoursRow(hours("no")).state, "not_published");

  // And the real record — which DOES hold the hours — still shows them.
  const real360 = hoursRow(base);
  assert.equal(real360.state, "yes");
  assert.ok(real360.value?.includes("360"), "the hours we do hold must still reach the page");
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

/* ---------- formatMonth: a date the reader cannot parse is a date we should not print ---------- */

test("formatMonth renders a Dutch month, and REFUSES a month that is not one", () => {
  // Untested, and its fallback returned the raw input: a malformed "2026-13"
  // printed ITSELF onto the page, under the heading "Cohorten", as the start date
  // of a training a reader might plan a year around. Every caller feeds it a
  // schema-validated YYYY-MM, so a value that does not parse is a bug in the
  // slicing above the call — not data — and it must fail where the build gate can
  // see it, not render quietly.
  assert.equal(formatMonth("2026-01"), "jan 2026");
  assert.equal(formatMonth("2026-09"), "sep 2026");
  assert.equal(formatMonth("2026-12"), "dec 2026");

  // The boundaries, which an off-by-one in the month index moves silently: a cohort
  // starting in January would be printed as December of the year before.
  assert.match(formatMonth("2027-01"), /jan 2027/);
  assert.notEqual(formatMonth("2026-01"), formatMonth("2026-12"));

  for (const bad of ["2026-13", "2026-00", "2026", "", "20261-01", "not-a-month", "2026-1x"]) {
    assert.throws(() => formatMonth(bad), /not a YYYY-MM month/,
      `formatMonth("${bad}") rendered something instead of failing — a malformed date, published`);
  }
});

/* ---------- Registerstatus: the listing column and the record page are ONE claim ---------- */

test("REGISTER: the listing's Registerstatus column and the record's accreditation block agree", () => {
  // The identical class of bug as the listing-vs-record PRICE bug that already
  // SHIPPED: two surfaces of one site, rendering the same fact about the same named
  // business from two independent derivations, and nothing comparing them. There
  // the listing printed a bare "ja" in fact ink while the record page said "nog
  // niet onderzocht" about the same programme.
  //
  // Registerstatus is the other column with exactly that shape — `registers` on the
  // listing row, `accreditation` on the provider view — and nothing pinned them
  // together. A register status is a claim about whether a named school is on a
  // public register; the two pages must not be able to answer it differently.
  let chips = 0;
  let verified = 0;
  let notVerified = 0;
  for (const p of providers) {
    const view = toProviderView(p);
    const rows = toListingRows([p], NOW);
    for (const prog of p.programs) {
      const listing = rows.find((r) => r.programId === prog.id)!;
      const record = view.programs.find((v) => v.id === prog.id)!;

      assert.equal(listing.registers.length, record.accreditation.length,
        `${p.id}/${prog.id}: the listing shows ${listing.registers.length} register(s) and the record ` +
        `page shows ${record.accreditation.length}`);

      listing.registers.forEach((chip, i) => {
        const acc = record.accreditation[i];
        assert.equal(chip.bodyKey, acc.bodyKey,
          `${p.id}/${prog.id}: the listing names register "${chip.bodyKey}" where the record names ` +
          `"${acc.bodyKey}"`);
        assert.equal(chip.body, acc.body, `${p.id}/${prog.id}: the two pages give the register two names`);
        // The claimed label is the provider's OWN words ("RYS 200") — verbatim on
        // both pages, or one of them is paraphrasing a named business (spec §3).
        assert.equal(chip.label, acc.label,
          `${p.id}/${prog.id}: the listing quotes the register claim as "${chip.label}" and the record ` +
          `page as "${acc.label}"`);
        // THE claim: is this school actually on the register?
        assert.equal(chip.verified, acc.verified,
          `${p.id}/${prog.id}: the listing's Registerstatus says "${chip.verified}" and the record page's ` +
          `accreditation block says "${acc.verified}" — one site, one programme, two contradictory claims ` +
          `about whether a named business is on a public register`);
        // …and both come from the RECORD, not from either page's own derivation.
        const raw = prog.accreditation[i];
        assert.equal(chip.verified, raw.verified,
          `${p.id}/${prog.id}: the listing re-derived a register status instead of rendering the record's`);
        assert.equal(chip.label, raw.label_claimed);

        chips++;
        if (chip.verified === "yes") verified++;
        if (chip.verified === "no" || chip.verified === "not_published") notVerified++;
      });
    }
  }
  assert.ok(chips > 0, "no programme shows a register status at all — this test tests nothing");
  assert.ok(verified > 0, "no register status is verified any more — that direction is untested");
  assert.ok(notVerified > 0,
    "no register claim is unverified any more — the direction where the two pages could libel a school " +
    "(claimed, not found in the register) is untested");
});

test("REGISTER: the YA state the filter uses is the state the row's own column shows", () => {
  // `yaVerified` is what the register CHIP filters on, and the Registerstatus column
  // is what the reader SEES. They are derived from the same chips by construction —
  // this pins that they cannot come apart, on every row, including the rows where
  // the school is on the YA register but THIS programme is not (the six that the
  // provider-level derivation wrongly swept in).
  let fromChips = 0;
  let noYaChip = 0;
  for (const r of toListingRows(providers, NOW)) {
    const ya = r.registers.filter((c) => c.bodyKey === "yoga_alliance");
    if (!ya.length) {
      // No YA chip in the column → we have not established that this programme is
      // registered. A GAP, never a finding, and never "verified".
      assert.equal(r.yaVerified, "unknown",
        `${r.providerId}/${r.programId}: the Registerstatus column shows no Yoga Alliance entry at all, ` +
        `yet the row's YA state is "${r.yaVerified}" — a claim made from nothing`);
      noYaChip++;
      continue;
    }
    if (r.yaVerified === "yes") {
      assert.ok(ya.some((c) => c.verified === "yes"),
        `${r.providerId}/${r.programId}: the row claims YA-verified while every YA entry in its own ` +
        `column says otherwise`);
    }
    fromChips++;
  }
  assert.ok(fromChips > 0 && noYaChip > 0, "one of the two directions is no longer exercised by the data");
});
