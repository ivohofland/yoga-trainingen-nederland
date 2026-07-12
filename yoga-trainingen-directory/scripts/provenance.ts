/**
 * `npm run provenance` — the price-provenance check, run on its own, STRICTLY.
 *
 * Same check `npm run validate` runs (src/lib/provenance.ts). The difference is the
 * exit code: validate WARNS (a false positive there would accuse our own sourced
 * research, and would block every build until someone silenced it), this one FAILS.
 * It is the gate-in-waiting: run it after touching a price or a source, and when the
 * warning in validate has stayed at zero long enough to trust, move that behaviour
 * into validate itself and delete this file.
 */
import { loadDataset } from "../src/lib/loader";
import { allPriceProvenance } from "../src/lib/provenance";

const { providers, errors } = loadDataset();
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const { findings, examined, skipped } = allPriceProvenance(providers);
if (findings.length > 0) {
  console.error(`\n✗ ${findings.length} prijsclaim(s) zonder bedrag in de geciteerde bron:\n`);
  for (const f of findings) console.error(`  - [${f.reason}] ${f.message}`);
  console.error("");
  process.exit(1);
}

console.log(`\n✓ ${examined} gepubliceerde prijs(zen) — elk gedekt door een gearchiveerd artefact met een bedrag`);
if (skipped > 0)
  console.log(`  ${skipped} overgeslagen: snapshot-body niet in deze checkout (gitignored; alleen de hash is publiek)`);
console.log();
