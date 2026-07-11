/**
 * Pure filter, sort and distance-partition over ListingRow[]. Kept out of the
 * React component so the editorial ordering rules can be tested without
 * rendering anything:
 *
 *   - a programme that publishes no hours must not top a price ranking;
 *   - a radius filter must never silently delete a row it cannot place.
 */
// TYPE-only from presenters: presenters.ts reaches dataset.ts (node:fs) and this
// module is bundled into the client filter island, so a value import from it
// breaks the build. The rule the price band needs therefore lives in quad.ts,
// which imports nothing but a type — see saysNotPublished.
import type { ListingRow } from "./presenters";
import { saysNotPublished } from "./quad";
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
    // Yoga Alliance is per-programme (per RYS). `yaVerified` is derived from the
    // row's OWN register chips — the ones the Registerstatus column renders — so
    // the chip cannot return a row whose visible cell contradicts it. Reading
    // `provider.registrations` here instead returned six programmes whose own
    // cell said "nog niet onderzocht" from a filter asserting the opposite.
    if (f.register === "ya" && r.yaVerified !== "yes") return false;
    // CRKBO registers institutions, not programmes: a property of the school, and
    // the chip says so in as many words ("CRKBO-geregistreerd").
    if (f.register === "crkbo" && r.crkboRegistered !== "yes") return false;
    // The two amount bands operate on published amounts only.
    if (f.price === "under3000" && !(r.priceAmount != null && r.priceAmount < 3000)) return false;
    if (f.price === "from3000" && !(r.priceAmount != null && r.priceAmount >= 3000)) return false;
    // "niet gepubliceerd" selects the FINDING — what our record says about the
    // provider — and never "we hold no amount", which is a fact about OUR record.
    // The two are not the same set: five programmes publish a price we simply do
    // not have. Selecting on `priceAmount == null` swept them in and told the
    // reader that four named businesses publish no price, while our own record —
    // and their own record page — said they do. `priceState` is priceQuad(): the
    // same value the row renders in its own Prijs cell.
    if (f.price === "not_published" && !saysNotPublished(r.priceState)) return false;
    return true;
  });
}

const byName = (a: Row, b: Row) =>
  a.providerName.localeCompare(b.providerName, "nl") ||
  a.programName.localeCompare(b.programName, "nl");

/**
 * NOTE on the numeric sorts below (`pph`, `distance`): when BOTH rows lack a
 * value, `Infinity - Infinity` is NaN, and NaN is falsy — so the `||` falls
 * through to the `byName` tiebreak. That is intentional, not an accident: two
 * rows with nothing to compare are ordered by name, which is stable and total.
 * (Returning NaN from a comparator is undefined behaviour; this never does.)
 */
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

  // Unsorted, deliberately: every caller sorts the group it renders (by the
  // visitor's chosen key, which is not always distance), so sorting here was work
  // that was always thrown away — and it quietly implied a guarantee callers must
  // not lean on. `near` carries each row's distanceKm; ordering is the caller's.
  return { near, farCount, online, unplaceable };
}
