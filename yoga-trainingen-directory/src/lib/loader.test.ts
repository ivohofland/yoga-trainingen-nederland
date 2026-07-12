import { test } from "node:test";
import assert from "node:assert/strict";
import { integrityErrors, loadDataset } from "./loader";
import { bundleDelta, pricePerContactHour, totalPrice } from "./derive";
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

test("DERIVED: €/contactuur is the published price over the published CONTACT hours", () => {
  // The golden case, by name and by hand: De Yogaschool (Enschede) publishes
  // €4.590 for the three-year Docentenopleiding Raja Yoga and a breakdown of 600
  // hours — 360 contact + 240 self-study. €4590 / 360 = €12,75 per contactuur.
  const prog = programOf("de-yogaschool-enschede", "docentenopleiding-raja");
  // guards: if the record changes, this test must not quietly pass on other numbers
  assert.equal(prog.price.amount_eur, 4590);
  assert.equal(prog.hours_claimed.contact, 360);
  assert.equal(prog.hours_claimed.self_study, 240);

  const pph = pricePerContactHour(prog);
  assert.equal(pph.value, 12.75,
    "€4.590 over 360 contacturen is €12,75 — any other figure is a number we invented about a named business");

  // The two mutations this pins, spelled out:
  assert.notEqual(pph.value, Math.round(12.75 * 1.21 * 100) / 100, "the price is not marked up with VAT here");
  assert.notEqual(pph.value, Math.round((4590 / 600) * 100) / 100,
    "self-study hours are not contact hours — dividing by the total flatters every provider that pads it");
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
  const pph = pricePerContactHour(selfStudyOnly);
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
      const { value } = pricePerContactHour(prog);
      const total = totalPrice(prog).value;
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
  // The common case, and the schema's default. 53 of 54 priced programmes are this, and
  // `derived: false` is the licence to print the number in the provider's own ink.
  const prog = programOf("de-yogaschool-enschede", "docentenopleiding-raja");
  assert.equal(prog.price.period, "total", "guard: the default period is a whole-course total");
  assert.deepEqual(totalPrice(prog), { value: 4590, derived: false });
});

test("TOTAL: a per-year price is MULTIPLIED, flagged as ours, and shows its working", () => {
  // The record that motivated v0.5. de Blikopener publishes € 1.290 per studiejaar over
  // four years and NO total; the bare amount ranked them among the cheapest trainings in
  // the corpus while the opleiding costs ≈ € 5.260 (our € 5.160 + the € 100 inschrijfgeld
  // their page lists separately, which we never add in — see below).
  const prog = programOf("de-blikopener", "hatha-raja-opleiding");
  assert.equal(prog.price.amount_eur, 1290);
  assert.equal(prog.price.period, "per_year");
  assert.equal(prog.price.periods, 4);

  const total = totalPrice(prog);
  assert.equal(total.value, 5160, "4 × € 1.290 is € 5.160");
  assert.equal(total.derived, true,
    "the total must be flagged as OURS — de Blikopener has never published this figure");
  assert.match(total.caveat ?? "", /4 × /, "the working must travel with the number, so a reader can check it");

  // And the three-year variant is its own programme, with its own total.
  const short = programOf("de-blikopener", "hatha-raja-opleiding-3-jarig");
  assert.equal(totalPrice(short).value, 3870, "3 × € 1.290 is € 3.870");
});

test("TOTAL: `excludes` is NEVER added in — it is free text, not an addend", () => {
  // The tarievenpagina lists a one-off € 100 inschrijf-/boekengeld and € 335 for the
  // yogaweekend. Summing either into the total would produce a number that is neither
  // theirs nor reproducibly ours, out of a prose sentence. It renders ALONGSIDE.
  const prog = programOf("de-blikopener", "hatha-raja-opleiding");
  assert.match(prog.price.excludes ?? "", /100/, "guard: the excluded costs are in the record");
  assert.equal(totalPrice(prog).value, 5160, "the derived total is 4 × 1290 and nothing else");
});

test("TOTAL: a per-period price with no period count has NO total — and is banded nowhere", () => {
  // No record is in this state today (both de Blikopener programmes publish their year
  // count), so the rule holds only because its counter-example is absent. Manufacture
  // it: a school that prices per year and never says how many years. Guessing a count
  // to produce a comparable figure is the exact fabrication v0.5 exists to prevent —
  // and ranking the yearly fee AS a total is the bug it exists to correct. Neither is
  // allowed, so the programme belongs in no band at all.
  const base = programOf("de-blikopener", "hatha-raja-opleiding");
  const noCount: Program = { ...base, price: { ...base.price, periods: null } };

  const total = totalPrice(noCount);
  assert.equal(total.value, null, "no period count, no total — never the bare yearly fee");
  assert.match(total.caveat ?? "", /totaalprijs/i);
  assert.equal(priceBand(noCount), "no_comparable_total");
  for (const band of ["under3000", "from3000"] as const) {
    assert.notEqual(priceBand(noCount), band,
      "a yearly fee banded against whole-course totals is the v0.5 inversion, restored");
  }
});

test("TOTAL: the price bands read the TOTAL, never the bare amount", () => {
  // € 1.290 < € 3.000 and ≈ € 5.160 is not: the same record, banded on the raw field,
  // lands under "onder €3.000" beside whole-course totals. This is the published
  // symptom of the whole spec change.
  const prog = programOf("de-blikopener", "hatha-raja-opleiding");
  assert.ok(prog.price.amount_eur! < 3000, "guard: the bare amount would have banded as cheap");
  assert.equal(priceBand(prog), "from3000",
    "a four-year opleiding costing ≈ € 5.160 must never sit in the under-€3.000 band");
  assert.equal(priceBand(programOf("de-blikopener", "hatha-raja-opleiding-3-jarig")), "from3000");
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
