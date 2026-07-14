"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { nl } from "@/lib/strings";
import { Quad } from "./Quad";
import {
  EMPTY_FILTERS,
  chipGroups,
  filterRows,
  listingView,
  type Filters,
  type Row,
  type SortKey,
} from "@/lib/filters";
import { parsePostcode, pc4Centroid, type Centroid } from "@/lib/geo";
import { nextCohortLabel, type ListingRow } from "@/lib/presenters";
import styles from "./ProgrammeTable.module.css";

interface Props {
  rows: ListingRow[];
  providerCount: number;
}

type RadiusKm = 25 | 50 | 100 | null;

const DEFAULT_SORT: SortKey = "upcoming";
const DEFAULT_RADIUS: RadiusKm = 50;

/** A postcode is only wrong once it is long enough to be wrong: "3", "35" and
 *  "351" are an unfinished postcode, not an invalid one. */
const PC4_LENGTH = 4;

export function ProgrammeTable({ rows, providerCount }: Props) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT);

  // Location. `origin` is resolved asynchronously because the 4,070-row PC4
  // table is lazy-imported — it costs nothing for visitors who never use this.
  const [postcode, setPostcode] = useState("");
  const [radius, setRadius] = useState<RadiusKm>(DEFAULT_RADIUS);
  const [origin, setOrigin] = useState<Centroid | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    const raw = postcode.trim();
    if (!raw) {
      setOrigin(null);
      setGeoError(null);
      return;
    }
    const pc4 = parsePostcode(raw);
    if (!pc4) {
      setOrigin(null);
      // Don't shout at someone who is still typing.
      setGeoError(raw.length >= PC4_LENGTH ? nl.postcodeInvalid : null);
      return;
    }
    let cancelled = false;
    // TWO arguments, not `.then(…).catch(…)`. Chained, the catch also sees any
    // throw from inside the success body above — a React state-update error, a
    // future bug in this handler — and reports it to the visitor as "de
    // postcodetabel kon niet worden geladen": a specific, confident, false
    // diagnosis of a table that loaded perfectly well. The rejection handler must
    // only ever see the one thing it can honestly speak for: the import failing.
    pc4Centroid(pc4).then(
      (c) => {
        if (cancelled) return;
        setOrigin(c);
        setGeoError(c ? null : nl.postcodeUnknown);
        // Distance is the useful default the moment we know where they are.
        if (c) setSort((s) => (s === DEFAULT_SORT ? "distance" : s));
      },
      (err: unknown) => {
        // The lazy chunk failed to load. Say so: a location filter that
        // silently does nothing — no origin, radius chips dead — is the worst
        // of the options, because the visitor cannot tell it is broken. And log
        // the error itself: a message to the visitor is not a diagnostic trail,
        // and swallowing the cause leaves nothing to debug the next report with.
        console.error("postcode lookup failed", err);
        if (cancelled) return;
        setOrigin(null);
        setGeoError(nl.postcodeLookupFailed);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [postcode]);

  // Sort state must not outlive the chip that set it. When the origin goes away
  // (postcode cleared or invalidated), "afstand" leaves the chip list — leaving
  // `sort` on it would highlight no chip at all and silently fall back to name
  // order.
  useEffect(() => {
    if (!origin) setSort((s) => (s === "distance" ? DEFAULT_SORT : s));
  }, [origin]);

  const filtered = useMemo(() => filterRows(rows as Row[], filters), [rows, filters]);

  // The WHOLE listing, render-ready: without a location one flat list, with one a
  // group per reason, and NOTHING dropped. The component below renders exactly
  // what this returns and decides nothing itself — the "nothing is silently
  // dropped" guarantee used to live in partitionByDistance while the page showed
  // two of its groups from two conditional JSX blocks, so deleting a block deleted
  // the rows from the page with the guarantee still passing. See listingView.
  const view = useMemo(
    () => listingView(filtered, origin, radius, sort),
    [filtered, origin, radius, sort],
  );

  // The cast is confined to this one line, and it is safe by construction: `group()`
  // in filters.ts has already pinned every chip's value to its own filter's union,
  // so the only pairs that reach here are ones TypeScript has checked. (A computed
  // key widens the spread's type; nothing narrower is expressible without a cast.)
  const toggle = <K extends keyof Filters>(key: K, value: NonNullable<Filters[K]>) =>
    setFilters((f) => ({ ...f, [key]: f[key] === value ? null : value }) as Filters);

  // "Filters wissen" must clear EVERY filter — the radius included. It is a
  // filter (it decides which rows are `near` and which are merely counted as
  // "buiten deze straal"), and it survived a clear: narrow to 25 km, clear,
  // type a new postcode, and the list silently reapplied the 25 km the visitor
  // believes they just cleared — with no chip left highlighted to say so, because
  // the chips are disabled until an origin exists.
  const clearAll = () => {
    setFilters(EMPTY_FILTERS);
    setPostcode("");
    setRadius(DEFAULT_RADIUS);
    setSort(DEFAULT_SORT);
  };

  // DERIVED FROM THE DATA, in a pure function, under test: `online` exists in the
  // dataset and the original design hard-coded a chip list without it, which made
  // those five programmes unreachable through the UI. Derived here in the component
  // it was correct but unprovable — hard-code it back and all 97 tests passed.
  const groups = useMemo(() => chipGroups(rows), [rows]);

  // The distance sort only exists once we know where the visitor is.
  const sorts: { key: SortKey; label: string }[] = [
    ...(origin ? [{ key: "distance" as const, label: nl.sortDistance }] : []),
    { key: "upcoming", label: nl.sortUpcoming },
    { key: "alphabetical", label: nl.sortAlphabetical },
    { key: "pph", label: nl.sortPph },
    { key: "verified", label: nl.sortVerified },
  ];

  const radii: { value: RadiusKm; label: string }[] = [
    { value: 25, label: nl.radius25 },
    { value: 50, label: nl.radius50 },
    { value: 100, label: nl.radius100 },
    { value: null, label: nl.radiusAll },
  ];

  const renderRow = (r: Row) => (
    <Link key={r.href} href={r.href} className={styles.row}>
      <div>
        <div className={styles.provider}>
          <span className={styles.providerName}>{r.providerName}</span> · {r.providerCityDisplay}
        </div>
        <div className={styles.programName}>{r.programName}</div>
        {r.styleClaimed && <div className={styles.style}>{r.styleClaimed}</div>}
        {/* Derived from {start, status} at render — never a stored string that could
            say "gestart" beside status "announced" (spec §8). */}
        {r.nextCohort && <div className={styles.cohort}>{nextCohortLabel(r.nextCohort)}</div>}
        {r.hasDisclosure && <div className={styles.disclosure}>{nl.disclosureLabel}</div>}
      </div>
      <div className={styles.cell}>
        {r.formatDisplay}
        {r.distanceKm != null && <div className={styles.distance}>{nl.distanceAway(r.distanceKm)}</div>}
      </div>
      <div className={styles.cellSmall}>{r.deliveryDisplay}</div>
      {/* The quad comes from the presenter — priceQuad(), the SAME function the
          provider record's Prijs row calls. Handing the raw `price.published`
          here rendered a bare "ja" in fact ink on the five programmes that
          publish a price we do not hold, while their record pages rendered the
          gap correctly: two pages of one site, opposite claims, same programme. */}
      {/* TWO LINES, TWO INKS, and never one number (spec v0.5). The <Quad> holds what
          the PROVIDER publishes — "€ 1.290 / studiejaar", in fact ink, with the unit
          that makes it true. Beneath it, and only where the two differ, OUR arithmetic:
          "± € 5.160 totaal — onze berekening: 4 × € 1.290", in the muted, non-factual
          style. A yearly fee printed as a price is what put de Blikopener among the
          cheapest trainings in the corpus while their opleiding costs ≈ € 5.260; a
          derived total printed in the provider's ink would be the same lie, corrected. */}
      {/* And a THIRD line where the school makes you buy another course first (spec v0.9):
          "± € 6.180 om te kwalificeren — incl. verplichte Basisopleiding € 1.590". Same
          muted ink, because it is the same kind of number: ours. de Yogaschool's
          Docentenopleiding is € 4.590 and you may not start it without the Basisopleiding
          — a gate that sat in the record as prose, where the price comparison could not
          see it, while the listing ranked the training against courses you can simply
          enrol in. Rendered only where something must actually be bought first; elsewhere
          the path cost IS the total and a second line would invent a second figure. */}
      <div className={styles.cell}>
        <Quad state={r.priceState}>{r.priceDisplay}</Quad>
        {r.priceDerivedTotal && <div className={styles.derived}>{r.priceDerivedTotal}</div>}
        {r.priceDerivedPathCost && <div className={styles.derived}>{r.priceDerivedPathCost}</div>}
      </div>
      {/* Both the string and the quad come from the presenter. The quad comes from
          the RECORD, never from the mere absence of a value: see pphQuad() in
          presenters.ts. Rendering `not_published` here for every null would
          publish OUR research gaps as accusations against named businesses.

          The caveat is the difference between "zij publiceren het niet" and
          "wij weten het nog niet" — the distinction this whole project turns on.
          A `title` hands that only to a mouse. It is therefore ALSO in the
          accessible name of the row, visually hidden: same words, no pointer
          required, visual design untouched. (On a link, `title` is only a
          fallback name, so the two never double up.) */}
      <div className={styles.cellSmall} title={r.pphCaveat ?? undefined}>
        {r.pphDisplay ?? <Quad state={r.pphState} />}
        {r.pphCaveat && <span className={styles.srOnly}> — {r.pphCaveat}</span>}
      </div>
      <div className={styles.cellSmall}>
        {r.registers.length === 0 ? (
          <Quad state="unknown" />
        ) : (
          r.registers.map((reg, i) => (
            <div key={i}>
              {reg.body} <Quad state={reg.verified} />
            </div>
          ))
        )}
      </div>
    </Link>
  );

  const columnHead = (
    <div className={styles.head}>
      <div>{nl.colProgramme}</div>
      <div>{nl.colFormat}</div>
      <div>{nl.colDelivery}</div>
      <div>{nl.colPrice}</div>
      <div>{nl.colPph}</div>
      <div>{nl.colRegister}</div>
    </div>
  );

  return (
    <>
      <div className={styles.filters}>
        {/* Location — a training attended over nine months of weekends is chosen
            on travel distance, not on municipality. */}
        <div className={styles.group} role="group" aria-labelledby="filter-location-label">
          <div className={styles.groupLabel} id="filter-location-label">{nl.filterLocation}</div>
          <div className={styles.chips}>
            <input
              type="text"
              inputMode="numeric"
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              placeholder={nl.postcodePlaceholder}
              aria-label={nl.filterLocation}
              aria-invalid={geoError != null}
              aria-describedby={geoError ? "geo-error" : "geo-note"}
              className={styles.postcode}
            />
            {radii.map((r) => (
              <button
                key={String(r.value)}
                type="button"
                onClick={() => setRadius(r.value)}
                // A disabled chip is not "pressed": without an origin there is
                // no radius in effect, and claiming one would be a lie to a
                // screen reader.
                aria-pressed={origin != null && radius === r.value}
                disabled={!origin}
                className={radius === r.value && origin ? styles.chipActive : styles.chip}
              >
                {r.label}
              </button>
            ))}
          </div>
          {geoError ? (
            <div className={styles.geoError} id="geo-error" role="alert">{geoError}</div>
          ) : (
            <div className={styles.geoNote} id="geo-note">{nl.postcodeNote}</div>
          )}
        </div>

        {groups.map((g) => (
          <div key={g.key} className={styles.group} role="group" aria-labelledby={`filter-${g.key}-label`}>
            <div className={styles.groupLabel} id={`filter-${g.key}-label`}>{g.label}</div>
            <div className={styles.chips}>
              {g.chips.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => toggle(g.key, c.value)}
                  aria-pressed={filters[g.key] === c.value}
                  className={filters[g.key] === c.value ? styles.chipActive : styles.chip}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.sortBar}>
        <div className={styles.sortGroup} role="group" aria-labelledby="sort-label">
          <span className={styles.groupLabel} id="sort-label">{nl.sortLabel}</span>
          {sorts.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSort(s.key)}
              aria-pressed={sort === s.key}
              className={sort === s.key ? styles.chipActive : styles.chip}
            >
              {s.label}
            </button>
          ))}
        </div>
        {/* Every filter, sort and radius change rewrites the whole list below.
            Announce the new count — otherwise the change is invisible to anyone
            not looking at the list. */}
        <div className={styles.resultLine} aria-live="polite">
          {nl.resultLine(view.shownCount, rows.length, view.providerCount, providerCount)}
          {view.farCount > 0 && (
            // Excluded rows are COUNTED, never silently dropped.
            <div>{nl.farExcluded(view.farCount)}</div>
          )}
        </div>
      </div>

      {/* EVERY group listingView returns, and nothing else. The main list gets the
          column header (it has no heading of its own); every other group gets the
          heading that says why distance cannot describe it. This used to be three
          hand-written conditional blocks — delete one and its rows silently left
          the page while partitionByDistance went on returning them, with the whole
          suite green. There is now nothing here to delete: the groups are data. */}
      {view.groups.map((g) => (
        <Fragment key={g.key}>
          {g.heading == null ? columnHead : <div className={styles.groupHeading}>{g.heading}</div>}
          {g.rows.map(renderRow)}
        </Fragment>
      ))}

      {view.shownCount === 0 && (
        <div className={styles.empty}>
          {nl.noResults}{" "}
          <button type="button" className={styles.chip} onClick={clearAll}>
            {nl.clearFilters}
          </button>
        </div>
      )}
    </>
  );
}
