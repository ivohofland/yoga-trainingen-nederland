/**
 * Internal QA / review dashboard — a read-only authoring aid, and one that the
 * build CANNOT emit: the file is `page.dev.tsx`, and `pageExtensions` admits
 * `.dev.tsx` in development only. Not published is a fact about the build here,
 * not a promise in a comment (see PUBLISHED_BUILD below — it re-checks the SAME
 * fact `pageExtensions` already acted on, not an independent one; see its own
 * docblock, and next.config.ts, for where the genuinely independent check lives).
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
import { providerProvenance, type ProvenanceFinding } from "@/lib/provenance";

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
 *
 * THIS GUARD AND next.config.ts's `pageExtensions` GATE ARE ONE LOCK, WRITTEN TWICE — not
 * two independent ones. Both read `NODE_ENV === "production"`, so both fail together: an
 * externally-set `NODE_ENV=development` (Next.js only warns about that, never corrects it)
 * admits `.dev.tsx` into the build AND leaves this `notFound()` open, for the same reason,
 * at the same time. It stays, as a harmless second check within that one family — if
 * `pageExtensions` is ever edited without this context, the page still refuses to render in
 * production — but it is not what catches a `NODE_ENV` mistake; nothing in this file can,
 * because this file is exactly what a wrong `NODE_ENV` fails to exclude. The check that
 * actually catches that failure mode is `deploy/deploy.sh`'s artifact gate, immediately
 * before the rsync (`[ -e out/qa ]`): it inspects the EXPORTED BYTES, a different thing than
 * this env var, so it still refuses when this guard has already opened.
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

  // Most-incomplete first: the work list, prioritised. The provenance findings —
  // prijs, uren én btw (spec v0.5) — are read off the ARCHIVED ARTIFACTS (node:fs +
  // pdftotext) and injected, because derive.ts is pure by construction — see
  // providerQa's header. They arrive TYPED: the `reason` is the difference between a
  // gap in our archive and a defect in our citation, and it must survive to the screen.
  const rows = providers
    .map((p) => ({ p, qa: providerQa(p, new Date(), providerProvenance(p).findings) }))
    .sort((a, b) => a.qa.completeness - b.qa.completeness);

  const totalGaps = rows.reduce((n, r) => n + r.qa.gaps.length, 0);
  const totalUnarchived = rows.reduce((n, r) => n + r.qa.unarchivedSources, 0);
  // TWO COUNTS, NEVER ONE. `no_evidence` = the archived page states nothing of the kind:
  // a DEFECT in a citation about a named business, and the most serious thing on this
  // page. Everything else (no source, no snapshot, never captured, unreadable capture) is
  // OUR ARCHIVE DEBT — real work, but nobody has claimed anything false about anybody.
  // Adding them up would bury the first in the second.
  const isDefect = (f: ProvenanceFinding) => f.reason === "no_evidence";
  const totalDefects = rows.reduce((n, r) => n + r.qa.provenance.filter(isDefect).length, 0);
  const totalDebt = rows.reduce((n, r) => n + r.qa.provenance.filter((f) => !isDefect(f)).length, 0);

  return (
    <main>
      <h1>QA / review — interne werklijst</h1>
      <p style={{ color: "#555" }}>
        Alleen-lezen overzicht (niet gepubliceerd). {providers.length} records ·{" "}
        {totalGaps} open punten · {totalUnarchived} bronnen zonder publiek archief ·{" "}
        <span style={{ color: totalDefects > 0 ? "#b00" : "#070" }}>
          {totalDefects} claim(s) (prijs/uren/btw) die de geciteerde bron NIET stelt
        </span>{" "}
        · <span style={{ color: "#777" }}>{totalDebt} bron(nen) niet uitleesbaar/niet vastgelegd</span>
        . “Open punten” zijn uitsluitend <em>nog niet onderzocht</em> (quad-state{" "}
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

            {/* TWEE LIJSTEN, want het zijn twee verschillende dingen — en juist dát
                onderscheid ging verloren toen deze bevindingen als platte strings
                aankwamen. ROOD: de gearchiveerde pagina STELT de claim niet (prijs,
                urental of btw-behandeling) — een defect in ONZE bronverwijzing over een
                MET NAAM GENOEMD BEDRIJF; het record oogt compleet en het archief draagt
                er niets van. GRIJS: we konden het bewijs niet openen (nooit gearchiveerd,
                geen bron, onleesbaar artefact) — ons eigen archiefwerk, geen bewering
                over wie dan ook. Ze optellen zou het eerste in het tweede begraven. */}
            {qa.provenance.filter(isDefect).length > 0 && (
              <ul style={{ margin: "0.4rem 0", color: "#b00" }}>
                {qa.provenance.filter(isDefect).map((f, i) => (
                  <li key={i}>
                    [{f.check}/{f.granularity}] {f.message}
                  </li>
                ))}
              </ul>
            )}
            {qa.provenance.filter((f) => !isDefect(f)).length > 0 && (
              <ul style={{ margin: "0.4rem 0", color: "#777" }}>
                {qa.provenance
                  .filter((f) => !isDefect(f))
                  .map((f, i) => (
                    <li key={i}>
                      [{f.check}/{f.reason}] {f.message}
                    </li>
                  ))}
              </ul>
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
