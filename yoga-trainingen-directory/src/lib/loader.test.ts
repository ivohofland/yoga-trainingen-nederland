import { test } from "node:test";
import assert from "node:assert/strict";
import { integrityErrors, loadDataset } from "./loader";
import { bundleDelta, contactRatio, pricePerContactHour, totalHours, totalPrice } from "./derive";
import { priceBand } from "./rules";
import { YearMonth, type Program } from "../schema";

const { providers } = loadDataset();

const providerOf = (id: string) => providers.find((p) => p.id === id)!;
const programOf = (providerId: string, programId: string) =>
  providerOf(providerId).programs.find((pr) => pr.id === programId)!;

test("the committed dataset is valid — zero schema or integrity errors", () => {
  const { providers, errors } = loadDataset();
  assert.deepEqual(errors, [], `dataset invalid:\n${errors.join("\n")}`);
  assert.ok(providers.length > 0, "expected at least one provider");
});

test("every provider id matches its filename slug", () => {
  const { providers } = loadDataset();
  for (const p of providers) {
    assert.match(p.id, /^[a-z0-9][a-z0-9-]*$/, `provider id '${p.id}' is not a kebab-case slug`);
  }
});

/* ---------- the derived NUMBERS, not merely their nullness (spec §6) ----------
 *
 * `pricePerContactHour` had no unit test at all. Everything around it was tested —
 * that a null carries a caveat, that the state beside it is a finding or a gap,
 * that the sort puts nulls last — and NOTHING asserted the figure itself. Multiply
 * it by 1.21 (a plausible "we should show incl. btw" slip) and all 78 tests passed:
 * the format regex still matched, `pph > 0` still held, the ranking was still
 * ascending. Read the denominator as `contact ?? self_study` — zelfstudie counted
 * as contact time — and the suite passed again.
 *
 * This number is published NEXT TO NAMED BUSINESSES, in a column readers use to
 * compare them. It is the one figure on the site we compute ourselves, so it is the
 * one figure no provider's own source can contradict. It gets golden values.
 */

test("DERIVED: €/contactuur is the whole-course price over the published CONTACT hours", () => {
  // The golden case, by name and by hand. De Yogaschool (Enschede) publishes NEITHER of
  // the two numbers this line divides — and publishes both of their parts:
  //   price  "per 1 januari 2026: €1530,00 per jaar" × "drie jaar"  → € 4.590 is OURS (v0.8)
  //   hours  "360 uren" + "minimale zelfstudie van 240 uur"         → 600 u   is OURS (v0.6)
  // € 4.590 / 360 contacturen = € 12,75. The numerator is `totalPrice`, the denominator
  // is `contact` — never an hours total, derived or stored, as asserted below.
  const provider = providerOf("de-yogaschool-enschede");
  const prog = programOf("de-yogaschool-enschede", "docentenopleiding-raja");
  // guards: if the record changes, this test must not quietly pass on other numbers
  assert.equal(prog.price.amount_eur, 1530, "the record stores the JAARPRIJS they print");
  assert.equal(prog.price.period, "per_year");
  assert.equal(prog.price.periods, 3);
  assert.equal(prog.hours_claimed.contact, 360);
  assert.equal(prog.hours_claimed.self_study, 240);

  const pph = pricePerContactHour(provider, prog);
  assert.equal(pph.value, 12.75,
    "€4.590 over 360 contacturen is €12,75 — any other figure is a number we invented about a named business");

  // The three mutations this pins, spelled out:
  assert.notEqual(pph.value, Math.round(12.75 * 1.21 * 100) / 100, "the price is not marked up with VAT here");
  assert.notEqual(pph.value, Math.round((4590 / 600) * 100) / 100,
    "self-study hours are not contact hours — dividing by the total flatters every provider that pads it");
  assert.notEqual(pph.value, Math.round((1530 / 360) * 100) / 100,
    "dividing the YEARLY fee by the hours of a three-year training understates the rate threefold (v0.5)");
});

test("DERIVED: self-study hours are NEVER counted as contact hours", () => {
  // No record in the dataset today publishes self-study hours WITHOUT contact
  // hours, so `contact ?? self_study` is invisible against this data — it is a
  // rule that holds only because its counter-example is absent. Manufacture it: a
  // programme that publishes a price and 200 hours of zelfstudie and no contact
  // hours has NO price per contact hour. Deriving one from self-study would invent
  // a comparison figure out of homework.
  const base = programOf("de-yogaschool-enschede", "docentenopleiding-raja");
  const selfStudyOnly: Program = {
    ...base,
    hours_claimed: { ...base.hours_claimed, total: 200, contact: null, self_study: 200 },
  };
  const pph = pricePerContactHour(providerOf("de-yogaschool-enschede"), selfStudyOnly);
  assert.equal(pph.value, null,
    "a programme that publishes no CONTACT hours has no €/contactuur — self-study is not contact time");
  assert.match(pph.caveat ?? "", /contacturen/);
});

test("DERIVED: every computable €/contactuur equals the WHOLE-COURSE price ÷ contact hours", () => {
  // The golden case above proves one row. This proves all of them, from the record
  // itself — so a scale factor, a swapped denominator or a rounding change cannot
  // hide in the rows the golden case does not name.
  //
  // The numerator is `totalPrice`, NOT `amount_eur` (spec v0.5, §6). On 53 of 54 priced
  // programmes they are the same number, which is exactly why the 54th went unnoticed:
  // divide de Blikopener's € 1.290 PER STUDIEJAAR by the hours of a four-year training
  // and the rate comes out four times too low — published, in a comparison column, next
  // to a named business.
  let checked = 0;
  for (const p of providers) {
    for (const prog of p.programs) {
      const { value } = pricePerContactHour(p, prog);
      const total = totalPrice(p, prog).value;
      const contact = prog.hours_claimed.contact;
      if (total == null || contact == null) {
        assert.equal(value, null, `${p.id}/${prog.id}: a €/contactuur computed from a number we do not hold`);
        continue;
      }
      assert.equal(value, Math.round((total / contact) * 100) / 100,
        `${p.id}/${prog.id}: €${total} over ${contact} contacturen is not what the page shows (${value})`);
      checked++;
    }
  }
  assert.ok(checked > 0, "no programme has a computable €/contactuur — this test tests nothing");
});

/* ---------- total_price: the figure the provider does not publish (spec v0.5, §6) ---------- */

test("TOTAL: a whole-course price IS the provider's own figure — derived: false", () => {
  // The common case, and the schema's default. `derived: false` is the licence to print
  // the number in the provider's own ink — and printing THEIR figure as OURS is the same
  // falsehood pointing the other way, no smaller. Wahé publishes € 2.495 for its 200-hour
  // opleiding, in as many words, on the page we cite.
  const provider = providerOf("wahe");
  const prog = programOf("wahe", "200-vinyasa-ayurveda");
  assert.equal(prog.price.period, "total", "guard: the default period is a whole-course total");
  assert.deepEqual(totalPrice(provider, prog), { value: 2495, derived: false },
    "Wahé PUBLISHES this figure — flagging it `derived: true` would tell every surface and every " +
    "API consumer that we made up a price the school states itself");
});

test("TOTAL: a per-year price is MULTIPLIED, flagged as ours, and shows its working", () => {
  // The record that motivated v0.5. de Blikopener publishes € 1.290 per studiejaar over
  // four years and NO total; the bare amount ranked them among the cheapest trainings in
  // the corpus while the opleiding costs ≈ € 5.260 (our € 5.160 + the € 100 inschrijfgeld
  // their page lists separately, which we never add in — see below).
  const provider = providerOf("de-blikopener");
  const prog = programOf("de-blikopener", "hatha-raja-opleiding");
  assert.equal(prog.price.amount_eur, 1290);
  assert.equal(prog.price.period, "per_year");
  assert.equal(prog.price.periods, 4);

  const total = totalPrice(provider, prog);
  assert.equal(total.value, 5160, "4 × € 1.290 is € 5.160");
  assert.equal(total.derived, true,
    "the total must be flagged as OURS — de Blikopener has never published this figure");
  assert.match(total.caveat ?? "", /4 × /, "the working must travel with the number, so a reader can check it");

  // And the three-year variant is its own programme, with its own total.
  const short = programOf("de-blikopener", "hatha-raja-opleiding-3-jarig");
  assert.equal(totalPrice(provider, short).value, 3870, "3 × € 1.290 is € 3.870");
});

test("TOTAL: `excludes` is NEVER added in — it is free text, not an addend", () => {
  // The tarievenpagina lists a one-off € 100 inschrijf-/boekengeld and € 335 for the
  // yogaweekend. Summing either into the total would produce a number that is neither
  // theirs nor reproducibly ours, out of a prose sentence. It renders ALONGSIDE.
  const prog = programOf("de-blikopener", "hatha-raja-opleiding");
  assert.match(prog.price.excludes ?? "", /100/, "guard: the excluded costs are in the record");
  assert.equal(totalPrice(providerOf("de-blikopener"), prog).value, 5160,
    "the derived total is 4 × 1290 and nothing else");
});

test("TOTAL: a per-period price with no period count has NO total — and is banded nowhere", () => {
  // No record is in this state today (both de Blikopener programmes publish their year
  // count), so the rule holds only because its counter-example is absent. Manufacture
  // it: a school that prices per year and never says how many years. Guessing a count
  // to produce a comparable figure is the exact fabrication v0.5 exists to prevent —
  // and ranking the yearly fee AS a total is the bug it exists to correct. Neither is
  // allowed, so the programme belongs in no band at all.
  const provider = providerOf("de-blikopener");
  const base = programOf("de-blikopener", "hatha-raja-opleiding");
  const noCount: Program = { ...base, price: { ...base.price, periods: null } };

  const total = totalPrice(provider, noCount);
  assert.equal(total.value, null, "no period count, no total — never the bare yearly fee");
  assert.match(total.caveat ?? "", /totaalprijs/i);
  assert.equal(priceBand(provider, noCount), "no_comparable_total");
  for (const band of ["under3000", "from3000"] as const) {
    assert.notEqual(priceBand(provider, noCount), band,
      "a yearly fee banded against whole-course totals is the v0.5 inversion, restored");
  }
});

test("TOTAL: the price bands read the TOTAL, never the bare amount", () => {
  // € 1.290 < € 3.000 and ≈ € 5.160 is not: the same record, banded on the raw field,
  // lands under "onder €3.000" beside whole-course totals. This is the published
  // symptom of the whole spec change.
  const provider = providerOf("de-blikopener");
  const prog = programOf("de-blikopener", "hatha-raja-opleiding");
  assert.ok(prog.price.amount_eur! < 3000, "guard: the bare amount would have banded as cheap");
  assert.equal(priceBand(provider, prog), "from3000",
    "a four-year opleiding costing ≈ € 5.160 must never sit in the under-€3.000 band");
  assert.equal(priceBand(provider, programOf("de-blikopener", "hatha-raja-opleiding-3-jarig")), "from3000");
});

/* ---------- total_price derivation 3: the SUM of UNEQUAL parts (spec v0.8, §6) ----------
 *
 * `periods` can only MULTIPLY. A training sold as Deel I € 1.420 + Deel II € 1.305 has no
 * equal repeating unit — 2 × 1.420 is not 2.725 — so the sum had no honest home, and so it
 * ended up STORED in `amount_eur`: € 2.725 rendered in Adhouna's own ink, cited to a page
 * that prints only the two parts. "2725" appears in none of their artifacts. Third costume,
 * same disease as v0.5 and v0.6.
 */

test("TOTAL: unequal composed parts are SUMMED, flagged as ours, and show their working", () => {
  // The record that motivated v0.8. The page states, verbatim: "Deel I van deze Yin Yoga
  // Opleiding kost € 1.420,00 incl. BTW" and "Deel II ... kost € 1.305,00 incl. BTW". It
  // states no total, anywhere.
  const provider = providerOf("adhouna");
  const prog = programOf("adhouna", "200-yin-xl");
  assert.equal(prog.price.amount_eur, null,
    "guard: the stored 2725 is GONE from the record — a derived value is never stored (§6)");
  assert.equal(prog.price.period, "per_module");
  assert.deepEqual(prog.composition?.modules, ["deel-1", "deel-2"]);
  assert.equal(provider.modules.find((m) => m.id === "deel-1")?.price?.amount_eur, 1420);
  assert.equal(provider.modules.find((m) => m.id === "deel-2")?.price?.amount_eur, 1305);

  const total = totalPrice(provider, prog);
  assert.equal(total.value, 2725, "€ 1.420 + € 1.305 is € 2.725");
  assert.equal(total.derived, true,
    "a surface told `derived: false` would print € 2.725 as Adhouna's own published price — the exact " +
    "bug v0.8 removed, restored");
  assert.match(total.caveat ?? "", /onze optelling/,
    "the working must travel with the number, so a reader can check it");
  assert.match(total.caveat ?? "", /1\.420/);
  assert.match(total.caveat ?? "", /1\.305/);

  // And it is BANDED on that total, like any other comparable price.
  assert.equal(priceBand(provider, prog), "under3000", "€ 2.725 < € 3.000");
});

test("TOTAL: multiplication CANNOT express it — the parts are unequal, and that is the point", () => {
  // Stated as an assertion rather than a comment, because "just use periods: 2" is the
  // shortcut that would quietly re-fabricate the number: 2 × € 1.420 = € 2.840, which is
  // € 115 more than the training costs, published about a named business.
  const provider = providerOf("adhouna");
  const prog = programOf("adhouna", "200-yin-xl");
  const parts = (prog.composition?.modules ?? [])
    .map((id) => provider.modules.find((m) => m.id === id)!.price!.amount_eur!);
  assert.notEqual(parts[0], parts[1], "the parts are UNEQUAL — no `periods` count can reach their sum");
  assert.notEqual(totalPrice(provider, prog).value, parts[0] * parts.length);
});

test("TOTAL: a missing part price yields NULL — an incomplete sum is a guess", () => {
  // The same rule bundleDelta has always applied, and now the same code path. Drop one
  // part's price and the total must VANISH, not shrink: a total of € 1.420 for a training
  // that costs € 2.725 is not a smaller claim, it is a false one — and a guessed total is
  // a published comparison with a hole in it.
  const base = providerOf("adhouna");
  const prog = programOf("adhouna", "200-yin-xl");
  const provider = {
    ...base,
    modules: base.modules.map((m) => (m.id === "deel-2" ? { ...m, price: undefined } : m)),
  };
  const total = totalPrice(provider, prog);
  assert.equal(total.value, null, "one part unpriced → no sum, never a partial one");
  assert.equal(total.derived, false, "we derived nothing, so nothing is flagged as ours");
  assert.equal(bundleDelta(provider, prog), null, "and the bundle delta dies with it, from the same rule");
});

test("TOTAL: a free-assembly MENU is not summed — its modules are choices, not parts", () => {
  // The guard on the gate. QUENO's CYT trajects are `free_assembly` compositions with a
  // module list, and adding those modules up would invent a whole-course price for a
  // training nobody buys that way. Only `period: per_module` licenses the sum. (The
  // predicate is corpus-derived rather than hard-coded to QUENO: a record parked outside
  // the repo must not fail the build.)
  let checked = 0;
  for (const p of providers) {
    for (const prog of p.programs) {
      // A programme with NO amount of its own and a composition it does not price per
      // module: there is nothing to sum, and summing anyway is the fabrication.
      if (prog.price.amount_eur != null) continue;
      if (prog.price.period === "per_module") continue;
      if (!prog.composition?.modules?.length) continue;
      assert.equal(totalPrice(p, prog).value, null,
        `${p.id}/${prog.id}: a composition that is not priced per module was summed into a total ` +
        `the provider never publishes`);
      checked++;
    }
  }
  // Not asserted > 0: the corpus's free-assembly cases (QUENO) may be parked outside the
  // repo, and a WIP record must never be able to fail the build. The rule stands either way.
  assert.ok(checked >= 0);
});

/* ---------- total_hours: the same rule, the other unit (spec v0.6, §6) ----------
 *
 * The disease v0.5 caught in the price field had a twin in the hours field, and the
 * twin had already shipped: `hours_claimed.total: 600` on de Yogaschool Enschede, in a
 * field the site renders as the school's own claimed total, on a number the school has
 * never printed. The `total` is now null in the record and the sum is computed here.
 *
 * The two directions are NOT symmetric, and both are pinned below, because getting
 * either one wrong publishes a falsehood about a named business:
 *
 *   - de Yogaschool: publishing OUR sum as THEIR total → invents a claim.
 *   - Wahé:          publishing THEIR total as OUR sum → strips a school of a figure it
 *                    does publish, and quietly implies we made it up.
 */

test("HOURS: a published total IS the school's own figure — derived: false", () => {
  // Wahé publishes the 500 in as many words, on a page we captured and cite:
  // "Samen vormen de 200-uurs basisopleiding en de 300 uur aan verdiepingsmodules een
  // totaal van 500 uur opleiding". It is THEIR claim. Relabelling it "onze optelling"
  // would be v0.6's error running backwards — no smaller, just pointing the other way.
  const prog = programOf("wahe", "500-pathway");
  assert.equal(prog.hours_claimed.total, 500, "guard: the record holds their published total");
  assert.equal(prog.hours_claimed.contact, null, "guard: they publish no contact-hour figure");

  const hours = totalHours(prog);
  assert.equal(hours.value, 500);
  assert.equal(hours.derived, false,
    "Wahé PUBLISHES its 500 — flagging it `derived: true` would tell every surface and every " +
    "API consumer that we made up a figure the school states on its own page");
  assert.equal(hours.caveat, undefined, "their figure needs no working: it is not a sum of ours");
});

test("HOURS: parts without a total are ADDED, flagged as ours, and show their working", () => {
  // The record that motivated v0.6. The page states "De opleiding neemt drie jaar of 360
  // uren in beslag. Daarnaast is er minimale zelfstudie van 240 uur." — two numbers,
  // published separately, and never their sum.
  const prog = programOf("de-yogaschool-enschede", "docentenopleiding-raja");
  assert.equal(prog.hours_claimed.total, null,
    "guard: the stored 600 is GONE from the record — a derived value is never stored (§6)");
  assert.equal(prog.hours_claimed.contact, 360);
  assert.equal(prog.hours_claimed.self_study, 240);

  const hours = totalHours(prog);
  assert.equal(hours.value, 600, "360 + 240 is 600");
  assert.equal(hours.derived, true,
    "a surface told `derived: false` would print 600 as de Yogaschool's claimed total — the exact " +
    "bug v0.6 removed, restored");
  assert.match(hours.caveat ?? "", /onze optelling/,
    "the working must travel with the number, so a reader can check it");
  assert.match(hours.caveat ?? "", /360/);
  assert.match(hours.caveat ?? "", /240/);
});

test("HOURS: a total with no parts is still the total; neither total nor parts is null", () => {
  const base = programOf("wahe", "500-pathway");
  // A total and no breakdown at all — the majority shape in the corpus, and it must not
  // be nulled by the absence of the addends.
  const totalOnly: Program = {
    ...base,
    hours_claimed: { ...base.hours_claimed, total: 200, contact: null, self_study: null },
  };
  assert.deepEqual(totalHours(totalOnly), { value: 200, derived: false });

  // Neither a total nor both parts: there is nothing to add, and a guess would fabricate
  // the very number this field exists to stop.
  const nothing: Program = {
    ...base,
    hours_claimed: { ...base.hours_claimed, total: null, contact: null, self_study: null },
  };
  assert.equal(totalHours(nothing).value, null, "no total and no parts — no figure, not a zero");

  // HALF the parts is not a total either. Publishing contact hours alone and calling them
  // the whole training would understate it by every hour of homework they set.
  const contactOnly: Program = {
    ...base,
    hours_claimed: { ...base.hours_claimed, total: null, contact: 360, self_study: null },
  };
  assert.equal(totalHours(contactOnly).value, null,
    "contacturen alone are not a course total — one addend is not a sum");
  assert.equal(totalHours(contactOnly).derived, false, "we derived nothing, so nothing is flagged as ours");
});

test("HOURS: what consumes an hours total consumes the DERIVED one — contactRatio does", () => {
  // The point of the field, and the thing a `total`-reading consumer gets wrong: de
  // Yogaschool publishes the most complete hours breakdown in the corpus, and reading the
  // raw `hours_claimed.total` gives them NO contact ratio at all — because the one number
  // they don't print is the sum of the two they do.
  const prog = programOf("de-yogaschool-enschede", "docentenopleiding-raja");
  assert.equal(prog.hours_claimed.total, null, "guard: the raw field is null");
  assert.equal(contactRatio(prog), 0.6, "360 contact of a 600-hour course is 0,6 — not null");

  // And €/contactuur is UNAFFECTED, because it divides by `contact` and never by a total.
  // Pinned rather than assumed: routing it through totalHours would quietly turn €12,75
  // (4590/360) into €7,65 (4590/600) — a third off the published rate of a named business.
  const pph = pricePerContactHour(providerOf("de-yogaschool-enschede"), prog);
  assert.equal(pph.value, 12.75, "€/contactuur divides by CONTACT hours, never by the total");
  assert.notEqual(pph.value, Math.round((4590 / 600) * 100) / 100);
});

test("HOURS: a stored total that equals contact + zelfstudie must be one the SCHOOL prints", () => {
  // §6, principle 9, guarded where it can actually be broken. A `total` that is
  // arithmetically the sum of the parts beside it is EXACTLY what a stored sum looks like
  // — de Yogaschool's 600 was 360 + 240 — and nothing in the YAML tells the two apart:
  // the record looks complete and perfectly sourced either way. Only the archive can say
  // whether the school prints that number, and the check that opens the archive is
  // `provenance.ts` (hoursFigureRe), whose findings are pinned in provenance.test.ts.
  //
  // Two records are in this shape today, and BOTH are legitimate — each school prints its
  // own total, in as many words:
  //
  //   jai-yoga/pranayama-tt      "So number of hours amounts to 350."   (200 + 150)
  //   neo-yoga-delft/200-hatha   "200 uur"                              (180 + 20)
  //
  // They are NAMED here so that a third cannot quietly join them. This test guards the
  // list, not the arithmetic: a new record whose total is the sum of its parts has to be
  // held against the archive — and either it is their published figure (add it here, with
  // the sentence that proves it) or it is our addition (drop `total` to null and let
  // totalHours() do it, visibly as ours).
  const PUBLISHED_SUMS = ["jai-yoga/pranayama-tt", "neo-yoga-delft/200-hatha"];
  const sumShaped = providers.flatMap((p) =>
    p.programs
      .filter((prog) => {
        const { total, contact, self_study: selfStudy } = prog.hours_claimed;
        return total != null && contact != null && selfStudy != null && total === contact + selfStudy;
      })
      .map((prog) => `${p.id}/${prog.id}`),
  );
  assert.deepEqual(sumShaped.sort(), PUBLISHED_SUMS,
    "a programme's stored hours total is exactly contact + zelfstudie. That is the shape of a STORED " +
    "SUM (spec v0.6): our own arithmetic sitting in a field the site renders as the school's claimed " +
    "total. Open the archive: if the school prints the figure it is theirs — add it to PUBLISHED_SUMS " +
    "with the sentence that proves it. If it does not appear, set `total: null` and let totalHours() " +
    "add the parts up, labelled as ours.");
});

test("DERIVED: the bundle delta is negative when the package is CHEAPER than its parts", () => {
  // Yogapoint's 300-hour package is €3.993; its three modules are €1.452 each
  // (€4.356). The package is €363 CHEAPER, and the sign is the whole meaning: the
  // record page turns it into "onder de som" or "boven de som" — a comparison
  // published about a named business, and one they would rightly dispute if we got
  // it backwards. Exactly one programme in the dataset exercises this.
  const provider = providerOf("yogapoint");
  const prog = programOf("yogapoint", "300-verdieping");
  // guards, so the golden number cannot drift out from under the assertion
  assert.equal(prog.price.amount_eur, 3993);
  assert.deepEqual(prog.composition?.modules?.length, 3);
  const sum = (prog.composition?.modules ?? [])
    .map((id) => provider.modules.find((m) => m.id === id)!.price!.amount_eur!)
    .reduce((a, b) => a + b, 0);
  assert.equal(sum, 4356);

  assert.equal(bundleDelta(provider, prog), -363,
    "€3.993 minus the €4.356 sum of the modules is −€363: the package is cheaper, and the sign says so");
  assert.ok(bundleDelta(provider, prog)! < 0, "a cheaper package must never be published as the dearer one");
});

test("DERIVED: no bundle delta is invented from a module price we do not hold", () => {
  // An incomplete module price makes the sum a guess, and a guessed delta is a
  // published comparison with a hole in it. Every programme with a composition
  // either has all its module prices, or no delta at all.
  for (const p of providers) {
    for (const prog of p.programs) {
      const moduleIds = prog.composition?.modules ?? [];
      if (!moduleIds.length || prog.price.amount_eur == null) {
        assert.equal(bundleDelta(p, prog), null, `${p.id}/${prog.id}: a delta from nothing`);
        continue;
      }
      const complete = moduleIds.every(
        (id) => p.modules.find((m) => m.id === id)?.price?.amount_eur != null,
      );
      if (!complete) {
        assert.equal(bundleDelta(p, prog), null,
          `${p.id}/${prog.id}: a bundle delta derived from a module price our record does not hold`);
      }
    }
  }
});

/* ---------- claim quotes carry no delimiters of their own ----------
 *
 * The record page wraps every quote in curly quotes — the renderer owns the
 * punctuation. One of 34 claims (de-yogaschool-enschede/meester-lineage) was stored
 * with the researcher's own `"…"` around it, so the page printed “"Het eerste
 * jaar…"” — doubled. The text inside was never wrong; the delimiters were never the
 * school's words.
 *
 * The fix is in the DATA, and it must stay fixed. Stripping quotes at render time
 * would put an editor of verbatim text inside the renderer, which §3 forbids
 * outright: the one thing that may never happen to a quote is that we change it.
 */

test("INTEGRITY: no claim quote is stored wrapped in its own quote marks", () => {
  const marks = ['"', "“", "”", "'", "‘", "’"];
  let checked = 0;
  for (const p of providers) {
    for (const claim of p.claims) {
      const text = claim.quote.trim();
      checked++;
      assert.ok(
        !(marks.includes(text[0]) && marks.includes(text[text.length - 1])),
        `${p.id}/${claim.id}: the quote is stored inside quote marks (${text.slice(0, 20)}…). The record page ` +
        `supplies the quotation marks, so this renders doubled — “"…"”. Store the provider's words only.`,
      );
    }
  }
  assert.ok(checked > 30, `only ${checked} claims walked — the corpus held 34`);
});

test("INTEGRITY: a quote wrapped in quote marks FAILS the load — the check has a failure branch", () => {
  // The data assertion above passes vacuously against a check that does nothing.
  // Put the defect back — the exact one that shipped — and require the loader to
  // refuse it, by name, saying whose the delimiters are.
  const real = providerOf("de-yogaschool-enschede");
  const claim = real.claims.find((c) => c.id === "meester-lineage")!;
  assert.ok(claim.quote.startsWith("Het eerste jaar"), "the fixed quote must start with the school's own words");

  const wrapped = {
    ...real,
    claims: real.claims.map((c) => (c.id === "meester-lineage" ? { ...c, quote: `"${c.quote}"` } : c)),
  };
  const errors = integrityErrors(wrapped, "de-yogaschool-enschede.yaml");
  assert.equal(errors.length, 1, `expected exactly the quote error, got:\n${errors.join("\n")}`);
  assert.match(errors[0], /meester-lineage/);
  assert.match(errors[0], /renderer supplies the quotation marks/);

  // Every mark a keyboard or a stylesheet produces, and both halves required: a
  // quote that merely CONTAINS quote marks (a school quoting someone else) is
  // untouched, and so is one that only opens or only closes with one.
  const withQuote = (quote: string) => integrityErrors({ ...real, claims: [{ ...claim, quote }] }, "f.yaml");
  for (const [open, close] of [['"', '"'], ["“", "”"], ["'", "’"], ["‘", "’"], ["”", "“"]]) {
    assert.equal(withQuote(`${open}Wij leiden op tot docent.${close}`).length, 1, `${open}…${close} not caught`);
  }
  assert.deepEqual(withQuote('Wij noemen dit "de innerlijke leraar" in onze opleiding.'), [],
    "quote marks INSIDE the provider's words are the provider's — never strip or reject those");
  assert.deepEqual(withQuote('"De innerlijke leraar" is ons uitgangspunt.'), [],
    "an opening mark alone is not a delimiter pair");
  assert.deepEqual(withQuote(""), [], "an empty quote is not delimited (the schema is what requires the text)");
});

/* ---------- YearMonth: the month range is validated in the SCHEMA, not a renderer ---------- */

test("SCHEMA: a typo'd month is rejected by validation, not left to a renderer", () => {
  // spec v0.3. The old regex was /^\d{4}-\d{2}(-\d{2})?$/, which accepts "2026-13".
  // So a typo'd month was schema-VALID data: `npm run validate` waved it through and
  // it detonated inside formatMonth, deep in `next build`, as a stack trace instead of
  // a named record and field. A validation job landing in a formatter. Catch it where
  // it can be reported usefully — and formatMonth's throw becomes a true assertion.
  for (const bad of ["2026-13", "2026-00", "2026-99", "2026-1", "2026-6"]) {
    assert.equal(YearMonth.safeParse(bad).success, false, `"${bad}" must be rejected by YearMonth`);
  }
  for (const good of ["2026-01", "2026-12", "2026-06", "2026-06-20"]) {
    assert.equal(YearMonth.safeParse(good).success, true, `"${good}" must be accepted by YearMonth`);
  }
});

test("SCHEMA: every month in the committed dataset is in range", () => {
  // Guards the v0.3 migration: tightening YearMonth was a no-op on every month
  // value in the corpus. If this fails, a record carries a month outside 01-12.
  const seen = new Set<string>();
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o && typeof o === "object") return Object.values(o).forEach(walk);
    if (typeof o === "string" && /^\d{4}-\d{2}(-\d{2})?$/.test(o)) seen.add(o);
  };
  providers.forEach(walk);
  assert.ok(seen.size > 50, `expected many YYYY-MM values in the data, saw ${seen.size}`);
  for (const ym of seen) {
    assert.equal(YearMonth.safeParse(ym).success, true, `"${ym}" is in the data but fails YearMonth`);
  }
});
