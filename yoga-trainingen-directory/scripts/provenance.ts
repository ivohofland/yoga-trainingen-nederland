/**
 * `npm run provenance` — the provenance check, run on its own, STRICTLY.
 *
 * Same check `npm run validate` runs (src/lib/provenance.ts): does the page we cite
 * for a price, an hours figure or a VAT treatment actually STATE it? The difference
 * is the exit code: validate WARNS (a false positive there would accuse our own
 * sourced research, and would block every build until someone silenced it), this one
 * FAILS. It is the gate-in-waiting: run it after touching a price, an hour count or a
 * source, and when the warning in validate has stayed at zero long enough to trust,
 * move that behaviour into validate itself and delete this file.
 *
 * AND IT NEVER PRINTS `✓` OVER EVIDENCE IT COULD NOT OPEN. The snapshot bodies are
 * gitignored, so on a fresh checkout this check can read almost nothing — 158 of 167
 * claims skipped — and it used to print `✓ … elk gedekt` and exit 0 over the other 9.
 * A green tick is a claim about the corpus. It is only earned at full coverage.
 */
import { loadDataset } from "../src/lib/loader";
import { allProvenance } from "../src/lib/provenance";

const { providers, errors } = loadDataset();
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const { findings, examined, skipped, claims, granularity } = allProvenance(providers);

if (findings.length > 0) {
  console.error(`\n✗ ${findings.length} claim(s) waarvan de geciteerde bron het niet stelt:\n`);
  for (const f of findings) console.error(`  - [${f.check}/${f.reason}/${f.granularity}] ${f.message}`);
  console.error("");
}

const niveau = granularity === "fact" ? "de waarde in het record" : "paginaniveau (zwakste vraag: staat er ÍETS van dien aard?)";

if (skipped > 0) {
  // Geen vinkje, geen groen, geen "gedekt": we hebben 5% van het bewijs in handen.
  console.log(
    `\n⚠ ${examined}/${claims} claim(s) onderzocht (${skipped} snapshot-body niet in deze checkout — gitignored; alleen de hash is publiek).`,
  );
  console.log(`  Getoetst op: ${niveau}. Over die ${skipped} zegt deze run NIETS.`);
} else if (findings.length === 0) {
  console.log(`\n✓ ${examined}/${claims} claim(s) (prijs/uren/btw/vooropleiding) — elk gedekt door een gearchiveerd artefact dat het STELT`);
  console.log(`  Getoetst op: ${niveau}.`);
}
console.log();

if (findings.length > 0) process.exit(1);
