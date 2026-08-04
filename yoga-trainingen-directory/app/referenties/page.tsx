/**
 * Referenties (spec §4.1b, v0.13) — the shared normative documents: a registry's
 * standards, its glossary, its help-centre pages. Stored once in `data/references/`,
 * archived once under `data/archives/_references/`, and cited from provider notes as
 * `[[ref:<id>]]` — never as a `source:` (a reference states a RULE, not a fact about a
 * named school). This is the page those citations land on: every entry is anchored by
 * `id={ref.id}` so `/referenties#<id>` resolves.
 *
 * A Server Component: it loads and validates the reference store at build time and
 * throws if it is invalid, the same posture `app/page.tsx` takes toward the dataset.
 */
import { loadReferences } from "@/lib/loader";
import { formatMonth } from "@/lib/presenters";
import { nl } from "@/lib/strings";
import { Cite } from "@/components/Cite";
import type { PublicArchive, Reference } from "@/schema";
import styles from "./page.module.css";

export const metadata = {
  title: "Referenties — Yoga-docentenopleidingen",
  description:
    "De normatieve documenten achter de citaten in de notities: standaarden en regels " +
    "van Yoga Alliance, elk één keer bewaard, gearchiveerd en van bron voorzien.",
};

/**
 * The three `public_archive` states, rendered distinctly. `impossible` MUST show its
 * `reason` — two of the five references are exactly that case (a Salesforce help-centre
 * article no public archive can capture), and a bare "n.v.t." would discard the finding
 * the union exists to carry. The judgement is read off the record, never re-derived from
 * whether `url` happens to be set.
 */
function ArchiveState({ archive }: { archive: PublicArchive }) {
  if (archive.kind === "archived") {
    return (
      <p className={styles.archiveArchived}>
        {nl.references.archiveArchived}{" "}
        <a href={archive.url} target="_blank" rel="noopener">
          {archive.url}
        </a>
      </p>
    );
  }
  if (archive.kind === "impossible") {
    return (
      <p className={styles.archiveImpossible}>
        {nl.references.archiveImpossible} {archive.reason}
      </p>
    );
  }
  return <p className={styles.archiveNotYet}>{nl.references.archiveNotYet}</p>;
}

// `data`, not `ref`, as the JSX attribute name: React treats a prop literally
// named `ref` specially (ref-forwarding), even on a plain function component in
// React 19. Renamed on destructure so the body below still reads `ref.<field>` —
// which is also what the source-level test in references-page.test.ts greps for.
function ReferenceEntry({ data: ref }: { data: Reference }) {
  return (
    <section id={ref.id} className={styles.item}>
      <h2 className={styles.itemTitle}>{ref.title}</h2>
      <div className={styles.meta}>
        {ref.publisher} · {nl.sourceType[ref.type]} · {formatMonth(ref.captured)}
      </div>

      {ref.url && (
        <p className={styles.url}>
          <a href={ref.url} target="_blank" rel="noopener">
            {ref.url}
          </a>
        </p>
      )}

      <ArchiveState archive={ref.public_archive} />
      <p className={styles.localSnapshot}>{nl.references.localSnapshotLabel(ref.local_snapshot)}</p>

      {ref.applies_to && ref.applies_to.length > 0 && (
        <p className={styles.appliesTo}>
          {nl.references.appliesToLabel}: {ref.applies_to.join(", ")}
        </p>
      )}

      {(ref.supersedes || ref.superseded_by) && (
        <p className={styles.lineage}>
          {ref.supersedes && (
            <>
              {nl.references.supersedesLabel}{" "}
              <a href={`#${ref.supersedes}`}>{ref.supersedes}</a>
            </>
          )}
          {ref.supersedes && ref.superseded_by && " · "}
          {ref.superseded_by && (
            <>
              {nl.references.supersededByLabel}{" "}
              <a href={`#${ref.superseded_by}`}>{ref.superseded_by}</a>
            </>
          )}
        </p>
      )}

      {/* A reference's own note cross-references other references by BARE id today
          (e.g. "zie ya-electives-2026-07" inside ya-educational-categories-2026-07's
          note) — not the marked `[[ref:<id>]]` form, so nothing here resolves to a
          link yet. Still routed through <Cite>, same as every other dataset-prose
          field on this site: if a marker is ever added to a reference's own note,
          it must not render raw, and this is the one place that guarantees it. */}
      {ref.note && <p className={styles.note}><Cite text={ref.note} /></p>}
    </section>
  );
}

export default function ReferentiesPage() {
  const { references, errors } = loadReferences();
  if (errors.length > 0) throw new Error(`References invalid:\n${errors.join("\n")}`);

  return (
    <main>
      <div className={styles.head}>
        <div className={styles.eyebrow}>{nl.references.eyebrow}</div>
        <h1 className={styles.title}>{nl.references.title}</h1>
        <p className={styles.lead}>{nl.references.lead}</p>
      </div>

      {references.length === 0 ? (
        <p className={styles.empty}>{nl.references.empty}</p>
      ) : (
        <div className={styles.list}>
          {references.map((ref) => (
            <ReferenceEntry key={ref.id} data={ref} />
          ))}
        </div>
      )}
    </main>
  );
}
