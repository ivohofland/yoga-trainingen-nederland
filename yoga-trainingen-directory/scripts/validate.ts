/**
 * Validates all provider records against the schema + integrity rules.
 * Build fails on invalid data: `npm run build` runs this first.
 *
 * It also runs the PROVENANCE check (src/lib/provenance.ts), which no schema can
 * express: it opens the archived artifacts of every cited source and asserts they
 * actually state the PRICE, the HOURS figure and the VAT treatment the record cites
 * them for. That one is a WARNING, not a failure — see the note above the block, and
 * provenance.ts on why the build stays green.
 *
 * It used to report those claims as "citeren een gearchiveerd artefact dat ze DRAAGT"
 * — that the artifact BEARS them. It does not: it is searched for the value, and a hit
 * means the page mentions it somewhere, not that the page attributes it to this
 * programme. The line says what the check does, no more.
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

// A CORPUS FLOOR, NOT A SCHEMA RULE. loadDataset() treats a MISSING data/providers/ as an
// error (see loader.ts) but an EMPTY one — or one accidentally emptied by a bad `mv`, a
// half-finished rebase, a wrong branch checkout — as a perfectly valid, zero-record result:
// `errors` stays empty, and without this check we would print "✓ 0 records valid" and exit
// 0. Downstream, deploy/deploy.sh's own gate treats that green exit as license to build and
// rsync --delete the live site down to nothing. 40 is well below the corpus size at the time
// this floor was written (~48 records) — generous headroom, not a count tuned to today's
// exact number; the point is to catch "the corpus is gone", not to police its growth.
const MIN_PROVIDERS = 40;
if (providers.length < MIN_PROVIDERS) {
  console.error(
    `\n✗ only ${providers.length} provider record(s) loaded (expected ≥${MIN_PROVIDERS}).\n` +
      `  Zero validation errors does not mean the corpus is intact — an EMPTY or near-empty\n` +
      `  data/providers/ passes schema validation trivially. Refusing rather than reporting\n` +
      `  a healthy build over a directory that lost its records.\n`,
  );
  process.exit(1);
}

console.log();
for (const p of providers) {
  console.log(`  ${p.name} [${p.depth}] — completeness ${completeness(p)}%`);
  for (const program of p.programs) {
    // The derived figures are DISCRIMINATED UNIONS (spec §6): `.value` is on every variant,
    // but the working — and the fact that the number is OURS — lives only on `computed`.
    // Even here, in a console line nobody publishes, the two are not interchangeable: this
    // script is where a researcher reads the numbers back, and a figure of ours printed as
    // though it were the school's is exactly the habit the model exists to break.
    const pph = pricePerContactHour(p, program);
    const ratio = contactRatio(program);
    const delta = bundleDelta(p, program);
    const parts = [
      `    · ${program.format_label}hr ${program.name}`,
      pph.value != null
        ? `€${pph.value}/contactuur (onze berekening)${pph.caveat ? ` (let op: ${pph.caveat})` : ""}`
        : `€/contactuur: ${pph.caveat}`,
      ratio.value != null ? `contactratio ${ratio.value} (onze berekening)` : null,
      delta != null ? `bundeldelta €${delta}` : null,
      `lespraktijk: ${program.hours_claimed.supervised_teaching_practice ?? program.hours_claimed.breakdown_published}`,
    ].filter(Boolean);
    console.log(parts.join(" | "));
  }
}
/* ---------- provenance: prijs, uren, btw (waarschuwing, geen build-gate) ----------
 *
 * WAARSCHUWING EN GEEN FOUT, met opzet: een vals-positief hier is een beschuldiging
 * aan het adres van ons eigen, wél gesourcete onderzoek. `npm run provenance` is
 * dezelfde check mét exit-code, voor na het aanraken van een prijs, een urental of een
 * bron — zie de kop van src/lib/provenance.ts.
 *
 * EN NOOIT EEN GROEN VINKJE OVER BEWIJS DAT WE NIET GEOPEND HEBBEN. De snapshot-bodies
 * zijn gitignored (data/archives/README.md), dus in CI of een verse clone staat 158 van
 * de 167 claims op OVERGESLAGEN — en dáár stond tot nu toe "✓ elk gedekt" boven. Dat is
 * geen samenvatting maar een onwaarheid: bij ook maar één overgeslagen claim is het
 * hoogste wat we mogen zeggen "⚠ x/y onderzocht".
 */
try {
  const { findings, examined, skipped, claims, granularity } = allProvenance(providers);
  if (findings.length > 0) {
    console.warn(`⚠ ${findings.length} claim(s) citeren een bron die het niet stelt:\n`);
    for (const f of findings) console.warn(`  - [${f.check}/${f.reason}] ${f.message}`);
    console.warn("");
  }
  // De dekkingsregel wordt ALTIJD geprint — ook (juist) als er bevindingen zijn. Wat de
  // check onderzocht heeft is een feit over de RUN, geen voetnoot bij een schone uitslag.
  const dekking = `${examined}/${claims} claim(s) (prijs/uren/btw/vooropleiding) onderzocht op ${granularity === "fact" ? "de waarde in het record" : "paginaniveau"}`;
  if (skipped > 0)
    console.log(
      `⚠ provenance: ${dekking} — ${skipped} niet doorzocht (snapshot-body niet in deze checkout; alleen de hash is publiek). ` +
        `Deze run zegt niets over die ${skipped}.`,
    );
  else if (findings.length > 0) console.log(`  provenance: ${dekking} — zie de ${findings.length} bevinding(en) hierboven`);
  else console.log(`✓ provenance: ${dekking} — elk gedekt door een gearchiveerd artefact dat de claim STELT`);
} catch (e) {
  // Ontbrekende pdftotext is een gat in de GEREEDSCHAPSKIST, geen bevinding over een
  // aanbieder: melden en doorgaan — nooit stilzwijgend "geen bevindingen" rapporteren.
  // Eén stukgelopen artefact is géén reden meer om de build te slopen: dat wordt per
  // artefact opgevangen in provenance.ts en komt terug als een `unreadable`-bevinding
  // mét bron- en aanbiedersnaam, i.p.v. als een stacktrace zonder naam.
  if (e instanceof PdftotextMissing) console.warn(`⚠ provenance overgeslagen — ${e.message}`);
  else throw e;
}

// Conclusie onderaan: bij een lange lijst blijft de uitkomst zo in beeld
// zonder terugscrollen.
console.log(`\n✓ ${providers.length} provider record(s) valid\n`);
