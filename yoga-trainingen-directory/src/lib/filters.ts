/**
 * Pure filter, sort and distance-partition over ListingRow[]. Kept out of the
 * React component so the editorial ordering rules can be tested without
 * rendering anything:
 *
 *   - a programme that publishes no hours must not top a price ranking;
 *   - a radius filter must never silently delete a row it cannot place.
 */
import type { ListingRow } from "./presenters";
import { nearestKm, type Centroid } from "./geo";

export type Row = ListingRow & { distanceKm?: number };

/** No `city`: the design's chip list is replaced by location + radius (spec §6.3). */
export interface Filters {
  format: string | null;
  language: string | null;
  mode: string | null;
  register: string | null;
  price: string | null;
}

export const EMPTY_FILTERS: Filters = {
  format: null,
  language: null,
  mode: null,
  register: null,
  price: null,
};

export type SortKey = "upcoming" | "alphabetical" | "pph" | "verified" | "distance";

export function filterRows(rows: Row[], f: Filters): Row[] {
  return rows.filter((r) => {
    if (f.format && r.formatLabel !== f.format) return false;
    if (f.language && r.language !== f.language) return false;
    if (f.mode && r.mode !== f.mode) return false;
    if (f.register === "ya" && r.yaVerified !== "yes") return false;
    if (f.register === "crkbo" && r.crkboRegistered !== "yes") return false;
    // Price bands operate on published amounts only. "not_published" is its own
    // band — it is a finding, and it is filterable as one.
    if (f.price === "under3000" && !(r.priceAmount != null && r.priceAmount < 3000)) return false;
    if (f.price === "from3000" && !(r.priceAmount != null && r.priceAmount >= 3000)) return false;
    if (f.price === "not_published" && r.priceAmount != null) return false;
    return true;
  });
}

const byName = (a: Row, b: Row) =>
  a.providerName.localeCompare(b.providerName, "nl") ||
  a.programName.localeCompare(b.programName, "nl");

export function sortRows(rows: Row[], key: SortKey): Row[] {
  const out = [...rows]; // never mutate the caller's array
  switch (key) {
    case "alphabetical":
      return out.sort(byName);
    case "upcoming":
      // No announced start sorts LAST: "9999" is beyond any real YYYY-MM.
      return out.sort(
        (a, b) =>
          (a.nextCohort?.start ?? "9999").localeCompare(b.nextCohort?.start ?? "9999") || byName(a, b),
      );
    case "pph":
      // Nulls LAST. A programme that publishes no hours must not top a price
      // ranking — that would reward not publishing.
      return out.sort((a, b) => (a.pph ?? Infinity) - (b.pph ?? Infinity) || byName(a, b));
    case "verified":
      // Most recently verified first.
      return out.sort((a, b) => b.lastVerified.localeCompare(a.lastVerified) || byName(a, b));
    case "distance":
      // No distance sorts LAST — never first, which would imply "right here".
      return out.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || byName(a, b));
  }
}

export interface DistanceGroups {
  /** Within the radius. Each row carries its distanceKm. */
  near: Row[];
  /** Outside it. COUNTED, and shown in the result line — never silently dropped. */
  farCount: number;
  /** delivery.mode === "online": distance does not apply to them. */
  online: Row[];
  /** No city we can place. A gap in our record, not a reason to hide them. */
  unplaceable: Row[];
}

/**
 * Splits rows against a visitor's location.
 *
 * A radius filter that deletes what it cannot describe is the same failure as
 * the design's missing `online` chip: the rows are gone and the reader never
 * learns they existed. So nothing is dropped — everything lands in exactly one
 * group, and the caller renders each group with a heading that says why.
 *
 * There is deliberately NO "residential" group. It would mean inferring
 * residency from `delivery.structure: "intensive"`, and the schema has no such
 * field — that is the invention the spec forbids.
 *
 * radiusKm === null means "heel NL": everything placeable is near.
 */
export function partitionByDistance(
  rows: Row[],
  origin: Centroid,
  radiusKm: number | null,
): DistanceGroups {
  const near: Row[] = [];
  const online: Row[] = [];
  const unplaceable: Row[] = [];
  let farCount = 0;

  for (const r of rows) {
    if (r.mode === "online") {
      online.push({ ...r });
      continue;
    }
    const km = nearestKm(r.cities, origin);
    if (km == null) {
      unplaceable.push({ ...r });
      continue;
    }
    if (radiusKm == null || km <= radiusKm) near.push({ ...r, distanceKm: km });
    else farCount++;
  }

  return { near: sortRows(near, "distance"), farCount, online, unplaceable };
}
