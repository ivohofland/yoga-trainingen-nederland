/**
 * Validates all provider records against the schema + integrity rules.
 * Build fails on invalid data: `npm run build` runs this first.
 */
import { loadDataset, pricePerContactHour, contactRatio, bundleDelta, completeness } from "../src/lib/dataset";

const { providers, errors } = loadDataset();

if (errors.length > 0) {
  console.error(`\n✗ ${errors.length} validation error(s):\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`\n✓ ${providers.length} provider record(s) valid\n`);
for (const p of providers) {
  console.log(`  ${p.name} [${p.depth}] — completeness ${completeness(p)}%`);
  for (const program of p.programs) {
    const pph = pricePerContactHour(program);
    const ratio = contactRatio(program);
    const delta = bundleDelta(p, program);
    const parts = [
      `    · ${program.format_label}hr ${program.name}`,
      pph.value != null ? `€${pph.value}/contactuur${pph.caveat ? ` (let op: ${pph.caveat})` : ""}` : `€/contactuur: ${pph.caveat}`,
      ratio != null ? `contactratio ${ratio}` : null,
      delta != null ? `bundeldelta €${delta}` : null,
      `lespraktijk: ${program.hours_claimed.supervised_teaching_practice ?? program.hours_claimed.breakdown_published}`,
    ].filter(Boolean);
    console.log(parts.join(" | "));
  }
}
console.log();
