import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDataset } from "./loader";
import { bundleDelta, pricePerContactHour } from "./derive";
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

test("DERIVED: every computable €/contactuur equals price ÷ contact hours, to the cent", () => {
  // The golden case above proves one row. This proves all of them, from the record
  // itself — so a scale factor, a swapped denominator or a rounding change cannot
  // hide in the rows the golden case does not name.
  let checked = 0;
  for (const p of providers) {
    for (const prog of p.programs) {
      const { value } = pricePerContactHour(prog);
      const amount = prog.price.amount_eur;
      const contact = prog.hours_claimed.contact;
      if (amount == null || contact == null) {
        assert.equal(value, null, `${p.id}/${prog.id}: a €/contactuur computed from a number we do not hold`);
        continue;
      }
      assert.equal(value, Math.round((amount / contact) * 100) / 100,
        `${p.id}/${prog.id}: €${amount} over ${contact} contacturen is not what the page shows (${value})`);
      checked++;
    }
  }
  assert.ok(checked > 0, "no programme has a computable €/contactuur — this test tests nothing");
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
