/**
 * Internal QA / review dashboard — a read-only authoring aid (NOT published).
 * Surfaces, per record, what still needs work: open `unknown` gaps,
 * unarchived sources (below the publication bar), completeness, depth, and
 * how stale last_verified is. It never writes — by design there is no edit UI
 * (see ../../technical-todo.md, "Decisions"); records stay files-in-git.
 */
import { loadDataset, providerQa } from "@/lib/dataset";

export const metadata = { title: "QA / review — interne werklijst" };

const STALE_MONTHS = 6;

export default function Qa() {
  const { providers, errors } = loadDataset();
  if (errors.length > 0) throw new Error(`Dataset invalid:\n${errors.join("\n")}`);

  // Most-incomplete first: the work list, prioritised.
  const rows = providers
    .map((p) => ({ p, qa: providerQa(p) }))
    .sort((a, b) => a.qa.completeness - b.qa.completeness);

  const totalGaps = rows.reduce((n, r) => n + r.qa.gaps.length, 0);
  const totalUnarchived = rows.reduce((n, r) => n + r.qa.unarchivedSources, 0);

  return (
    <main>
      <h1>QA / review — interne werklijst</h1>
      <p style={{ color: "#555" }}>
        Alleen-lezen overzicht (niet gepubliceerd). {providers.length} records ·{" "}
        {totalGaps} open punten · {totalUnarchived} bronnen zonder publiek archief.
        “Open punten” zijn uitsluitend <em>nog niet onderzocht</em> (quad-state{" "}
        <code>unknown</code>) — “niet gepubliceerd” is een bevinding, geen gat.
      </p>
      {rows.map(({ p, qa }) => {
        const stale = qa.ageMonths != null && qa.ageMonths >= STALE_MONTHS;
        return (
          <section key={p.id} style={{ borderTop: "1px solid #ddd", padding: "0.75rem 0" }}>
            <h2 style={{ margin: 0, fontSize: "1.1rem" }}>
              {p.name}{" "}
              <span style={{ fontWeight: 400, color: "#777", fontSize: "0.9rem" }}>
                · diepte: {p.depth} · compleetheid: {qa.completeness}% · archief:{" "}
                {qa.totalSources - qa.unarchivedSources}/{qa.totalSources}{" "}
                <span style={{ color: qa.unarchivedSources > 0 ? "#b00" : "#070" }}>
                  {qa.unarchivedSources > 0 ? "✗" : "✓"}
                </span>{" "}
                · geverifieerd: {p.last_verified}
                {stale ? (
                  <span style={{ color: "#b00" }}> (≥{STALE_MONTHS} mnd oud)</span>
                ) : null}
              </span>
            </h2>
            {qa.gaps.length > 0 ? (
              <ul style={{ margin: "0.4rem 0", color: "#555" }}>
                {qa.gaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: "0.4rem 0", color: "#070" }}>geen open gaten</p>
            )}
          </section>
        );
      })}
    </main>
  );
}
