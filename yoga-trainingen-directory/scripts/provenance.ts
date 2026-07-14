/**
 * `npm run provenance` — THE PROVENANCE GATE. It runs inside `npm run build`, and it
 * fails it.
 *
 * The question (src/lib/provenance.ts): does the page we cite for a price, an hours
 * figure, a VAT treatment or a prerequisite actually STATE it? That answered in a
 * warning for as long as it was young, because a false positive here is an accusation
 * against our own sourced research and nobody wanted that stopping a build. It has
 * sat at zero findings across 163 claims — the condition this file set for itself —
 * so it is now the gate it always said it would become.
 *
 * IT ENFORCES TWO TIERS, AND THEY DO NOT NEED THE SAME EVIDENCE. Keeping them apart
 * is the whole reason the gate is safe to turn on; collapsing them re-creates the bug
 * this project keeps finding — a green tick over evidence nobody could open.
 *
 *   STRUCTURAL (no_source, no_snapshot, no_artifact) — "you cited a page that is in
 *   no archive." Provable from the record plus the committed `.sha256` sidecars
 *   ALONE. The snapshot bodies are gitignored (they are other people's copyrighted
 *   pages — see data/archives/README.md), but the hash beside each one IS committed
 *   and names an artifact that was captured. So this tier runs ANYWHERE: a fresh
 *   clone, CI, a tarball. And it catches the failure that actually recurs here — a
 *   fact cited to the page that LINKS to it instead of the page that STATES it.
 *
 *   CONTENT (no_evidence) — "we opened the artifact and the fact is not in it."
 *   Needs the body. On a machine that has the archives (the author's; the private
 *   archive repo) this is the real check. Without them it is not weakened, it is
 *   ABSENT — and absent is what it has to report.
 *
 * SO A CLAIM WHOSE BODY IS MISSING IS SKIPPED, NEVER PASSED. `skipped` and `claims`
 * print on every run and no `✓` is printed while `skipped > 0`. A CI build is
 * structurally gated and says so in as many words, rather than implying it verified a
 * corpus it could not read. If you ever find yourself deleting that banner to tidy
 * the output, you are removing the one sentence that keeps the tick honest.
 */
import { loadDataset } from "../src/lib/loader";
import { allProvenance, FINDING_TIER, type ProvenanceFinding } from "../src/lib/provenance";

/** The heading each tier is reported under. The tier itself is FINDING_TIER's call —
 *  this file only prints it, so the gate and the message can never disagree. */
const HEADING: Record<(typeof FINDING_TIER)[keyof typeof FINDING_TIER], string> = {
  structural: "geciteerd, maar niet gearchiveerd",
  content: "gearchiveerd, maar het artefact stelt het niet",
  tooling: "vastgelegd, maar onleesbaar — een gat in ONS gereedschap, geen bevinding over de aanbieder",
};

const { providers, errors } = loadDataset();
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const { findings, examined, skipped, claims, granularity } = allProvenance(providers);

const inTier = (tier: keyof typeof HEADING) => findings.filter((f: ProvenanceFinding) => FINDING_TIER[f.reason] === tier);

for (const tier of ["structural", "content", "tooling"] as const) {
  const group = inTier(tier);
  if (group.length === 0) continue;
  console.error(`\n✗ ${HEADING[tier]} (${group.length}):\n`);
  for (const f of group) console.error(`  - [${f.check}/${f.reason}/${f.granularity}] ${f.message}`);
}

const niveau =
  granularity === "fact"
    ? "de waarde in het record"
    : "paginaniveau (zwakste vraag: staat er ÍETS van dien aard?)";

if (skipped > 0) {
  // Geen vinkje, geen groen, geen "gedekt". De bodies zijn hier niet, dus de
  // INHOUDELIJKE toets is niet uitgevoerd — niet "geslaagd". Dat verschil is de enige
  // reden dat deze regels bestaan.
  console.log(
    `\n⚠ INHOUD NIET GETOETST — van ${skipped} van de ${claims} claim(s) zit de snapshot-body niet in deze ` +
      `checkout (gitignored; alleen de hash is publiek).`,
  );
  console.log("  Wél afgedwongen: de structurele toets — elk geciteerd feit verwijst naar een vastgelegd artefact.");
  console.log(`  Inhoudelijk onderzocht: ${examined}/${claims}. Over de overige ${skipped} zegt deze run NIETS.`);
  console.log("  Draai dit lokaal, mét de archieven, voor de volledige toets.");
} else if (findings.length === 0) {
  console.log(
    `\n✓ ${examined}/${claims} claim(s) (prijs/uren/btw/vooropleiding) — elk gedekt door een gearchiveerd artefact dat het STELT`,
  );
  console.log(`  Getoetst op: ${niveau}.`);
}
console.log();

if (findings.length > 0) {
  console.error(
    `provenance: ${findings.length} bevinding(en) — de build stopt hier.\n` +
      "  Zoek de pagina die het feit STELT, zet 'm in sources[], archiveer 'm, en lees de waarde uit het artefact.\n" +
      "  Nooit uit een zoeksamenvatting, nooit uit het geheugen.",
  );
  process.exit(1);
}
