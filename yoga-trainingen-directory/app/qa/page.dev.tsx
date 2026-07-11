/**
 * Internal QA / review dashboard — a read-only authoring aid, and one that the
 * build CANNOT emit: the file is `page.dev.tsx`, and `pageExtensions` admits
 * `.dev.tsx` in development only. Not published is a fact about the build here,
 * not a promise in a comment (see PUBLISHED_BUILD below, which is the belt to
 * that brace).
 *
 * Surfaces, per record, what still needs work: open `unknown` gaps, unarchived
 * sources (below the publication bar), completeness, depth, and how stale
 * last_verified is. Also lists every relevant link per record — website,
 * program/module URLs, and each source's live / archive / local copy — so a
 * review pass can click straight through. It never writes — by design there is no
 * edit UI (see technical-todo.md at the REPO ROOT, "Decisions"); records stay
 * files-in-git.
 */
import { notFound } from "next/navigation";
import { loadDataset } from "@/lib/loader";
import { providerQa } from "@/lib/derive";

export const metadata = { title: "QA / review — interne werklijst" };

/**
 * "NOT published" was a comment, not a fact: this is an App Router page, so
 * `next build` prerendered it and it would have shipped — the researcher's
 * internal work-list (every open `unknown` gap, per-provider completeness,
 * unarchived-source counts, staleness flags) served on the public site.
 *
 * It stays a first-class page in development and does not exist in production.
 * There is no secret here worth protecting with an env var or a header check;
 * the requirement is simply that the build cannot emit it.
 */
const PUBLISHED_BUILD = process.env.NODE_ENV === "production";

const STALE_MONTHS = 6;

/** A link, or a muted/red placeholder when the URL is absent. */
function Lnk({
  href,
  label,
  missing = "—",
  missingColor = "#999",
}: {
  href?: string | null;
  label: string;
  missing?: string;
  missingColor?: string;
}) {
  return href ? (
    <a href={href} target="_blank" rel="noreferrer">
      {label}
    </a>
  ) : (
    <span style={{ color: missingColor }}>{missing}</span>
  );
}

export default function Qa() {
  if (PUBLISHED_BUILD) notFound();

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

            <div style={{ fontSize: "0.85rem", margin: "0.4rem 0" }}>
              <div>
                <span style={{ color: "#777" }}>website: </span>
                <Lnk href={p.website} label={p.website.replace(/^https?:\/\/(www\.)?/, "")} />
              </div>
              {p.programs.length > 0 && (
                <div>
                  <span style={{ color: "#777" }}>opleidingen: </span>
                  {p.programs.map((pr, i) => (
                    <span key={pr.id}>
                      {i > 0 ? " · " : ""}
                      <Lnk href={pr.url} label={pr.name} missing={`${pr.name} (geen url)`} />
                    </span>
                  ))}
                </div>
              )}
              {p.modules.length > 0 && (
                <div>
                  <span style={{ color: "#777" }}>modules: </span>
                  {p.modules.map((m, i) => (
                    <span key={m.id}>
                      {i > 0 ? " · " : ""}
                      <Lnk href={m.url} label={m.name} missing={`${m.name} (geen url)`} />
                    </span>
                  ))}
                </div>
              )}
              <table style={{ borderCollapse: "collapse", marginTop: "0.3rem" }}>
                <tbody>
                  {p.sources.map((s) => (
                    <tr key={s.id}>
                      <td style={{ paddingRight: 12, color: "#777", verticalAlign: "top" }}>
                        <code>{s.id}</code>{" "}
                        <span style={{ color: "#999" }}>
                          ({s.type}, {s.captured})
                        </span>
                      </td>
                      <td style={{ paddingRight: 12, verticalAlign: "top" }}>
                        <Lnk href={s.url} label="live" missing="geen url" />
                      </td>
                      <td style={{ paddingRight: 12, verticalAlign: "top" }}>
                        {s.archived_url ? (
                          <Lnk href={s.archived_url} label="archief" />
                        ) : s.url ? (
                          <span style={{ color: "#b00" }}>niet gearchiveerd</span>
                        ) : (
                          <span style={{ color: "#999" }}>n.v.t.</span>
                        )}
                      </td>
                      <td style={{ color: "#555", verticalAlign: "top" }}>
                        {s.local_snapshot ? (
                          <code>{s.local_snapshot}</code>
                        ) : (
                          <span style={{ color: "#999" }}>geen lokale kopie</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </main>
  );
}
