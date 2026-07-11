/**
 * Listing view (spec §1). A Server Component: it loads and validates the
 * dataset at build time and throws if it is invalid — the site refuses to
 * render invalid data. Only the filter/sort island below is client-side.
 */
import { loadDataset } from "@/lib/dataset";
import { toListingRows, datasetStats, formatMonth } from "@/lib/presenters";
import { ProgrammeTable } from "@/components/ProgrammeTable";
import { nl } from "@/lib/strings";
import styles from "./page.module.css";

export default function Home() {
  const { providers, errors } = loadDataset();
  if (errors.length > 0) throw new Error(`Dataset invalid:\n${errors.join("\n")}`);

  const rows = toListingRows(providers);
  const stats = datasetStats(providers);

  return (
    <main>
      <div className={styles.stats}>
        <span>{stats.providers} {nl.statProviders}</span>
        <span>{stats.programs} {nl.statPrograms}</span>
        <span>{nl.statRegisters}</span>
        {stats.lastVerified && <span>{nl.statVerified(formatMonth(stats.lastVerified.slice(0, 7)))}</span>}
      </div>

      <p className={styles.intro}>{nl.intro}</p>
      <p className={styles.legend}>{nl.legend}</p>

      <ProgrammeTable rows={rows} providerCount={stats.providers} />

      <p className={styles.footnote}>{nl.priceFootnote(stats.pphComputable, stats.programs)}</p>
    </main>
  );
}
