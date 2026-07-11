/**
 * Provider record. Server Component, zero client JS. Statically generated for
 * every provider at build time.
 *
 * Every editorial rule this project exists to keep is visible here:
 *   - a claim is rendered VERBATIM, never characterized (spec §3);
 *   - an absent optional object renders as a GAP ("nog niet onderzocht"), never
 *     as a finding — <Quad> is the only thing that colours a quad;
 *   - a note renders BESIDE the fact it annotates: provenance, not a findings list;
 *   - an unarchived source is MARKED, never hidden — and it is not a quad, so it
 *     gets its own words. See the comment above the source row.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { loadDataset } from "@/lib/dataset";
import { toProviderView, formatMonth } from "@/lib/presenters";
import { Quad } from "@/components/Quad";
import { nl } from "@/lib/strings";
import styles from "./page.module.css";

export function generateStaticParams() {
  const { providers } = loadDataset();
  return providers.map((p) => ({ id: p.id }));
}

export default async function ProviderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { providers, errors } = loadDataset();
  if (errors.length > 0) throw new Error(`Dataset invalid:\n${errors.join("\n")}`);

  const provider = providers.find((p) => p.id === id);
  if (!provider) notFound();
  const v = toProviderView(provider);

  return (
    <main>
      <div className={styles.back}>
        <Link href="/" className={styles.backLink}>{nl.backAll}</Link>
      </div>

      <div className={styles.head}>
        <div className={styles.headTop}>
          <h2 className={styles.name}>{v.name}</h2>
          {v.aka.length > 0 && <span className={styles.aka}>{v.aka.join(" / ")}</span>}
        </div>
        <div className={styles.meta}>
          <span>{v.cityDisplay}</span>
          <a href={v.website} target="_blank" rel="noopener">{v.domain}</a>
          <span>{nl.depthLabel}: {v.depth}</span>
          <span>{nl.lastVerifiedLabel}: {formatMonth(v.lastVerified.slice(0, 7))}</span>
        </div>
        {/*
         * A declared relationship between the researcher and this provider. The
         * published methodology promises it is shown, so it is shown — bordered,
         * above the record, never a footnote. It is NOT a quad: it says something
         * about US, not a finding about them, so it must not wear --finding.
         */}
        {v.disclosure && (
          <div className={styles.disclosure}>
            <div className={styles.disclosureLabel}>{nl.disclosureLabel}</div>
            <p className={styles.disclosureBody}>{v.disclosure}</p>
          </div>
        )}
      </div>

      {/* Registers */}
      <section className={styles.section}>
        <div className={styles.sectionLabel}>{nl.secRegisters}</div>
        <div className={styles.regRow}>
          <div className={styles.regBody}>{nl.body.crkbo}</div>
          <div><Quad state={v.crkbo.registered} /></div>
          <div className={styles.regNote}>
            {[v.crkbo.holder && `${nl.holderLabel}: ${v.crkbo.holder}`,
              v.crkbo.register && `${nl.registerLabel}: ${v.crkbo.register}`,
              v.crkbo.checked && `${nl.checkedLabel} ${formatMonth(v.crkbo.checked.slice(0, 7))}`]
              .filter(Boolean).join(" · ")}
            {v.crkbo.note && <div className={styles.note}>{v.crkbo.note}</div>}
          </div>
        </div>
        {v.registrations.map((r, i) => (
          <div key={i} className={styles.regRow}>
            <div className={styles.regBody}>{r.body}</div>
            <div><Quad state={r.verified} /></div>
            <div className={styles.regNote}>
              {[r.identifier, r.holder && `${nl.holderLabel}: ${r.holder}`,
                r.firstRegistered && `${nl.since} ${formatMonth(r.firstRegistered.slice(0, 7))}`]
                .filter(Boolean).join(" · ")}
              {r.note && <div className={styles.note}>{r.note}</div>}
            </div>
          </div>
        ))}
      </section>

      {/* Programmes */}
      <section className={styles.section}>
        <div className={styles.sectionLabel}>{nl.secProgrammes}</div>
        {v.programs.map((prog) => (
          <article key={prog.id} id={`programma-${prog.id}`} className={styles.programme}>
            <h3 className={styles.progName}>
              {prog.url
                ? <a href={prog.url} target="_blank" rel="noopener">{prog.name}</a>
                : prog.name}
            </h3>

            {prog.rows.map((row, i) => (
              <div key={i} className={styles.kv}>
                <div className={styles.k}>{row.label}</div>
                <div className={styles.v}>
                  <Quad state={row.state}>{row.value}</Quad>
                  {row.note && <div className={styles.note}>{row.note}</div>}
                </div>
              </div>
            ))}

            {prog.accreditation.length > 0 && (
              <div className={styles.kv}>
                <div className={styles.k}>{nl.rowAccreditation}</div>
                <div className={styles.v}>
                  {prog.accreditation.map((a, i) => (
                    <div key={i}>
                      {a.body} — “{a.label}” <Quad state={a.verified} />
                      {a.note && <div className={styles.note}>{a.note}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {prog.cohorts.length > 0 && (
              <div className={styles.kv}>
                <div className={styles.k}>{nl.rowCohorts}</div>
                <div className={styles.v}>
                  {prog.cohorts.map((c) => (
                    <div key={c.id}>
                      {c.label}
                      {c.note && <div className={styles.note}>{c.note}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Coherence — six signals, no verdict (spec §7). Six rows on EVERY
                programme: where the signals were never investigated, six gaps
                are the honest rendering, and the absence is visible. */}
            <div className={styles.subLabel}>{nl.secCoherence}</div>
            <p className={styles.subNote}>{nl.secCoherenceNote}</p>
            {prog.coherence.map((s) => (
              <div key={s.key} className={styles.kv}>
                <div className={styles.k}>{s.label}</div>
                <div className={styles.v}>
                  <Quad state={s.state} />
                  {s.note && <div className={styles.note}>{s.note}</div>}
                </div>
              </div>
            ))}

            <div className={styles.subLabel}>{nl.secTransparency}</div>
            {prog.transparency.map((s) => (
              <div key={s.key} className={styles.kv}>
                <div className={styles.k}>{s.label}</div>
                <div className={styles.v}><Quad state={s.state} /></div>
              </div>
            ))}

            {/* Voorwaarden — three quads, three rows, each one through <Quad>.
                They were once flattened into a single sentence rendered in fact
                ink: two real findings lost their colour, and a gap would have
                read as a fact. A quad only ever becomes pixels in <Quad>. */}
            <div className={styles.subLabel}>{nl.secContract}</div>
            {prog.contract.map((s) => (
              <div key={s.key} className={styles.kv}>
                <div className={styles.k}>{s.label}</div>
                <div className={styles.v}><Quad state={s.state} /></div>
              </div>
            ))}
            {prog.contractNote && <div className={styles.note}>{prog.contractNote}</div>}
          </article>
        ))}
      </section>

      {/* Claims — verbatim, in the source language. Never truncated, never tidied. */}
      {v.claims.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionLabel}>{nl.secClaims}</div>
          <p className={styles.subNote}>{nl.claimsNote}</p>
          {v.claims.map((c) => (
            <blockquote key={c.id} className={styles.claim}>
              <div className={styles.quote}>“{c.quote}”</div>
              <div className={styles.claimCat}>{c.category}</div>
              {/* Layer 3. Separated from the quote and stamped with the
                  methodology version it was made under. */}
              {c.analysis && (
                <div className={styles.analysis}>
                  <div className={styles.analysisLabel}>
                    {nl.analysisLabel(c.analysis.status, c.analysis.methodologyVersion)}
                  </div>
                  <p className={styles.analysisBody}>{c.analysis.note}</p>
                </div>
              )}
            </blockquote>
          ))}
        </section>
      )}

      {/* Sources */}
      <section className={styles.section}>
        <div className={styles.sectionLabel}>
          {nl.sourcesHeading(v.sources.length, v.sourcesArchivedPublic, v.sourcesArchivedLocal)}
        </div>
        {v.sources.map((s) => (
          <div key={s.id} className={styles.srcRow}>
            <div className={styles.srcKind}>
              {s.type}
              <div className={styles.srcCaptured}>{formatMonth(s.captured.slice(0, 7))}</div>
            </div>
            <div className={styles.srcUrl}>
              {s.url ? <a href={s.url} target="_blank" rel="noopener">{s.url}</a> : s.id}
              {s.note && <div className={styles.note}>{s.note}</div>}
            </div>
            {/*
             * NOT a quad. <Quad state="not_published"> would print "niet
             * gepubliceerd" — which says the PROVIDER failed to publish
             * something. This is the opposite: it is OUR record, measured
             * against OUR publication bar. Its own class, its own words.
             *
             * BOTH halves of the bar, always. Printing only the halves we have
             * let 108 sources with a single quiet ✓ read as if they met a bar
             * that asks for two — the page would have been claiming a standard
             * it does not meet, in the one place whose job is to be honest about
             * exactly that. A missing half is a "—", not an accusation: for the
             * JS-rendered and Wayback-excluded registers a local capture is the
             * only evidence that can exist.
             */}
            {s.archiveSlots
              ? <div className={styles.srcArchive}>{s.archiveSlots}</div>
              : <div className={styles.belowBar}>{nl.notArchived}</div>}
          </div>
        ))}
        <p className={styles.pubBar}>{nl.pubBar}</p>
        <p className={styles.pubBar}>{nl.pubBarSlots}</p>
      </section>
    </main>
  );
}
