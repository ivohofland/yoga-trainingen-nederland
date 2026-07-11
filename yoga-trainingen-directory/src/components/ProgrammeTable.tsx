"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { nl } from "@/lib/strings";
import { Quad } from "./Quad";
import { EMPTY_FILTERS, filterRows, sortRows, partitionByDistance, type Filters, type Row, type SortKey } from "@/lib/filters";
import { parsePostcode, pc4Centroid, type Centroid } from "@/lib/geo";
import type { ListingRow } from "@/lib/presenters";
import styles from "./ProgrammeTable.module.css";

interface Props {
  rows: ListingRow[];
  providerCount: number;
}

interface Chip {
  value: string;
  label: string;
}

type RadiusKm = 25 | 50 | 100 | null;

const DEFAULT_SORT: SortKey = "upcoming";

/** A postcode is only wrong once it is long enough to be wrong: "3", "35" and
 *  "351" are an unfinished postcode, not an invalid one. */
const PC4_LENGTH = 4;

export function ProgrammeTable({ rows, providerCount }: Props) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT);

  // Location. `origin` is resolved asynchronously because the 4,070-row PC4
  // table is lazy-imported — it costs nothing for visitors who never use this.
  const [postcode, setPostcode] = useState("");
  const [radius, setRadius] = useState<RadiusKm>(50);
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
    pc4Centroid(pc4)
      .then((c) => {
        if (cancelled) return;
        setOrigin(c);
        setGeoError(c ? null : nl.postcodeUnknown);
        // Distance is the useful default the moment we know where they are.
        if (c) setSort((s) => (s === DEFAULT_SORT ? "distance" : s));
      })
      .catch(() => {
        // The lazy chunk failed to load. Say so: a location filter that
        // silently does nothing — no origin, radius chips dead — is the worst
        // of the options, because the visitor cannot tell it is broken.
        if (cancelled) return;
        setOrigin(null);
        setGeoError(nl.postcodeLookupFailed);
      });
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

  // Without a location: one flat list. With one: four groups, and NOTHING is
  // dropped — see spec §6.4.
  const groups4 = useMemo(
    () => (origin ? partitionByDistance(filtered, origin, radius) : null),
    [filtered, origin, radius],
  );

  const flat = useMemo(() => sortRows(filtered, sort), [filtered, sort]);
  const shown = groups4 ? sortRows(groups4.near, sort) : flat;
  const shownCount = groups4
    ? groups4.near.length + groups4.online.length + groups4.unplaceable.length
    : flat.length;

  const toggle = (group: keyof Filters, value: string) =>
    setFilters((f) => ({ ...f, [group]: f[group] === value ? null : value }));

  const clearAll = () => {
    setFilters(EMPTY_FILTERS);
    setPostcode("");
    setSort(DEFAULT_SORT);
  };

  // Chip sets are derived from the data, not hard-coded: `online` exists in the
  // dataset and the design omitted it, which would have made those programmes
  // unreachable.
  const formats = [...new Set(rows.map((r) => r.formatLabel))].sort();
  const modes = [...new Set(rows.map((r) => r.mode))].sort();
  const languages = [...new Set(rows.map((r) => r.language).filter((l): l is NonNullable<typeof l> => l != null))].sort();

  const groups: { key: keyof Filters; label: string; chips: Chip[] }[] = [
    {
      key: "format",
      label: nl.filterFormat,
      chips: formats.map((f) => ({
        value: f,
        label: f === "other" || f === "none" ? nl.filterOwnFormat : f,
      })),
    },
    { key: "language", label: nl.filterLanguage, chips: languages.map((l) => ({ value: l, label: l.toUpperCase() })) },
    { key: "mode", label: nl.filterMode, chips: modes.map((m) => ({ value: m, label: nl.mode[m] })) },
    {
      key: "register",
      label: nl.filterRegister,
      chips: [
        { value: "ya", label: nl.filterYaVerified },
        { value: "crkbo", label: nl.filterCrkbo },
      ],
    },
    {
      key: "price",
      label: nl.filterPrice,
      chips: [
        { value: "under3000", label: nl.filterUnder3000 },
        { value: "from3000", label: nl.filterFrom3000 },
        { value: "not_published", label: nl.filterPriceNotPublished },
      ],
    },
  ];

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

  const provShown = new Set(
    (groups4 ? [...groups4.near, ...groups4.online, ...groups4.unplaceable] : flat).map((r) => r.providerId),
  ).size;

  const renderRow = (r: Row) => (
    <Link key={r.href} href={r.href} className={styles.row}>
      <div>
        <div className={styles.provider}>
          <span className={styles.providerName}>{r.providerName}</span> · {r.providerCityDisplay}
        </div>
        <div className={styles.programName}>{r.programName}</div>
        {r.styleClaimed && <div className={styles.style}>{r.styleClaimed}</div>}
        {r.nextCohort && <div className={styles.cohort}>{r.nextCohort.label}</div>}
        {r.hasDisclosure && <div className={styles.disclosure}>{nl.disclosureLabel}</div>}
      </div>
      <div className={styles.cell}>
        {r.formatDisplay}
        {r.distanceKm != null && <div className={styles.distance}>{nl.distanceAway(r.distanceKm)}</div>}
      </div>
      <div className={styles.cellSmall}>{r.deliveryDisplay}</div>
      <div className={styles.cell}>
        <Quad state={r.pricePublished}>{r.priceDisplay}</Quad>
      </div>
      {/* Both the string and the quad come from the presenter. The quad comes from
          the RECORD, never from the mere absence of a value: see pphQuad() in
          presenters.ts. Rendering `not_published` here for every null would
          publish OUR research gaps as accusations against named businesses. */}
      <div className={styles.cellSmall} title={r.pphCaveat ?? undefined}>
        {r.pphDisplay ?? <Quad state={r.pphState} />}
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
          {nl.resultLine(shownCount, rows.length, provShown, providerCount)}
          {groups4 && groups4.farCount > 0 && (
            // Excluded rows are COUNTED, never silently dropped.
            <div>{nl.farExcluded(groups4.farCount)}</div>
          )}
        </div>
      </div>

      {columnHead}
      {shown.map(renderRow)}

      {/* What distance cannot describe. Kept visible, under a heading that says
          why — spec §6.4. */}
      {groups4 && groups4.online.length > 0 && (
        <>
          <div className={styles.groupHeading}>{nl.groupOnline}</div>
          {sortRows(groups4.online, sort).map(renderRow)}
        </>
      )}

      {groups4 && groups4.unplaceable.length > 0 && (
        <>
          <div className={styles.groupHeading}>{nl.groupUnplaceable}</div>
          {sortRows(groups4.unplaceable, sort).map(renderRow)}
        </>
      )}

      {shownCount === 0 && (
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
