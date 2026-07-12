/**
 * Validates all provider records against the schema + integrity rules.
 * Build fails on invalid data: `npm run build` runs this first.
 *
 * It also runs the PROVENANCE check (src/lib/provenance.ts), which no schema can
 * express: it opens the archived artifacts of every cited source and asserts they
 * actually state the PRICE, the HOURS and the VAT treatment the record cites them
 * for. That one is a WARNING, not a failure — see the note above the block, and
 * provenance.ts on why the build stays green.
 */
import { loadDataset } from "../src/lib/loader";
import { pricePerContactHour, contactRatio, bundleDelta, completeness } from "../src/lib/derive";
import { allProvenance, PdftotextMissing } from "../src/lib/provenance";

const { providers, errors } = loadDataset();

if (errors.length > 0) {
  console.error(`\n✗ ${errors.length} validation error(s):\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log();
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
/* ---------- provenance: prijs, uren, btw (waarschuwing, geen build-gate) ----------
 *
 * WAARSCHUWING EN GEEN FOUT, met opzet: een vals-positief hier is een beschuldiging
 * aan het adres van ons eigen, wél gesourcete onderzoek, en de uren- en btw-regexen
 * hebben pas één corpus gezien. `npm run provenance` is dezelfde check mét exit-code,
 * voor na het aanraken van een prijs, een urental of een bron — zie de kop van
 * src/lib/provenance.ts.
 */
try {
  const { findings, examined, skipped } = allProvenance(providers);
  if (findings.length > 0) {
    console.warn(`⚠ ${findings.length} claim(s) citeren een pagina die het niet stelt:\n`);
    for (const f of findings) console.warn(`  - [${f.check}] ${f.message}`);
    console.warn("");
  } else {
    console.log(`✓ provenance: ${examined} claim(s) (prijs/uren/btw) citeren een gearchiveerd artefact dat ze draagt`);
  }
  // De bodies zijn gitignored (data/archives/README.md): in CI of een verse clone is
  // er niets te openen. Dat is geen bevinding over een aanbieder maar een grens aan
  // waar deze check draait — dus zeggen we het hardop i.p.v. het te verzwijgen.
  if (skipped > 0)
    console.log(`  (${skipped} claim(s) niet doorzocht: snapshot-body niet in deze checkout — hash wél)`);
} catch (e) {
  // Ontbrekende pdftotext is een gat in de GEREEDSCHAPSKIST, geen bevinding over een
  // aanbieder: melden en doorgaan — nooit stilzwijgend "geen bevindingen" rapporteren.
  if (e instanceof PdftotextMissing) console.warn(`⚠ provenance overgeslagen — ${e.message}`);
  else throw e;
}

// Conclusie onderaan: bij een lange lijst blijft de uitkomst zo in beeld
// zonder terugscrollen.
console.log(`\n✓ ${providers.length} provider record(s) valid\n`);
