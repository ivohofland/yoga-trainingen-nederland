/**
 * Validates all provider records against the schema + integrity rules.
 * Build fails on invalid data: `npm run build` runs this first.
 *
 * It also runs the PRICE-PROVENANCE check (src/lib/provenance.ts), which no
 * schema can express: it opens the archived artifacts of every cited price source
 * and asserts they actually show an amount. That one is a WARNING, not yet a
 * failure — see the note above the block, and provenance.ts on when to promote it.
 */
import { loadDataset } from "../src/lib/loader";
import { pricePerContactHour, contactRatio, bundleDelta, completeness } from "../src/lib/derive";
import { allPriceProvenance, PdftotextMissing } from "../src/lib/provenance";

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
/* ---------- prijs-provenance (waarschuwing, nog geen build-gate) ----------
 *
 * WAARSCHUWING EN GEEN FOUT, met opzet: een vals-positief hier is een beschuldiging
 * aan het adres van ons eigen, wél gesourcete onderzoek, en de regex heeft pas één
 * corpus gezien. Zodra de teller een tijd op 0 blijft staan: promoveer tot harde
 * gate (process.exit(1) hieronder, net als bij een integriteitsfout) — zie de kop
 * van src/lib/provenance.ts.
 */
try {
  const { findings, examined, skipped } = allPriceProvenance(providers);
  if (findings.length > 0) {
    console.warn(`⚠ ${findings.length} record(s) citeren voor de prijs een pagina zonder bedrag:\n`);
    for (const f of findings) console.warn(`  - ${f.message}`);
    console.warn("");
  } else {
    console.log(`✓ prijs-provenance: ${examined} gepubliceerde prijs(zen) citeren een gearchiveerd artefact dat een bedrag toont`);
  }
  // De bodies zijn gitignored (data/archives/README.md): in CI of een verse clone is
  // er niets te openen. Dat is geen bevinding over een aanbieder maar een grens aan
  // waar deze check draait — dus zeggen we het hardop i.p.v. het te verzwijgen.
  if (skipped > 0)
    console.log(`  (${skipped} bron(nen) niet doorzocht: snapshot-body niet in deze checkout — hash wél)`);
} catch (e) {
  // Ontbrekende pdftotext is een gat in de GEREEDSCHAPSKIST, geen bevinding over een
  // aanbieder: melden en doorgaan — nooit stilzwijgend "geen bevindingen" rapporteren.
  if (e instanceof PdftotextMissing) console.warn(`⚠ prijs-provenance overgeslagen — ${e.message}`);
  else throw e;
}

// Conclusie onderaan: bij een lange lijst blijft de uitkomst zo in beeld
// zonder terugscrollen.
console.log(`\n✓ ${providers.length} provider record(s) valid\n`);
