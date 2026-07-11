/**
 * Pure filter, sort and distance-partition over ListingRow[]. Kept out of the
 * React component so the editorial ordering rules can be tested without
 * rendering anything:
 *
 *   - a programme that publishes no hours must not top a price ranking;
 *   - a radius filter must never silently delete a row it cannot place.
 */
import { formatChipLabel, type ListingRow } from "./presenters";
import type { PriceBand } from "./rules";
import { placeCities, type Centroid } from "./geo";
import { nl } from "./strings";

/**
 * A row we PLACED: it is `distanceKm` from the visitor, and the component prints
 * that number under its format cell.
 */
export type NearRow = ListingRow & { distanceKm: number };

/**
 * A row with no distance, and — this is the part the optional `?` could not say —
 * no distance is POSSIBLE for it: it is online (distance does not apply) or we
 * cannot place its city (a gap in our record).
 *
 * `distanceKm?: number` conflated three different things: "not computed yet" (no
 * origin), "not placeable", and "online, n/a". partitionByDistance pushed `{ ...r }`
 * into `online` and `unplaceable` WITHOUT stripping the field, so a row that
 * arrived carrying a distance — from a previous pass, a memo, a re-partition after
 * the radius changed — kept it, and the component renders `distanceKm != null`
 * unconditionally: "12 km" printed under a programme with no location at all.
 * `?: never` makes that state unrepresentable, and the partition strips the field
 * rather than trusting the input not to have it.
 */
export type UnplacedRow = ListingRow & { distanceKm?: never };

export type Row = NearRow | UnplacedRow;

/** The two registers a chip may select on. Not a Quad, and not a body key: CRKBO
 *  is a fact about the SCHOOL, Yoga Alliance a fact about the PROGRAMME. */
export type RegisterFilter = "ya" | "crkbo";

/**
 * No `city`: the design's chip list is replaced by location + radius — see
 * docs/superpowers/plans/2026-07-11-public-listing.md.
 *
 * EVERY FIELD IS NARROWED TO ITS ROW'S UNION. `null` means "this filter is off",
 * and it is the ONLY string-ish value any of them may take besides a value the
 * corresponding row actually holds.
 *
 * All five were `string | null`, while their counterparts on ListingRow are unions:
 * `{ mode: "hybrid" }` compiled and matched nothing at all. An empty result is not
 * a neutral outcome on this site — an empty "niet gepubliceerd" band READS AS AN
 * EDITORIAL CLAIM ("no provider withholds a price"), stated to the visitor by a
 * typo the compiler was happy with.
 */
export interface Filters {
  format: ListingRow["formatLabel"] | null;
  language: ListingRow["language"];
  mode: ListingRow["mode"] | null;
  register: RegisterFilter | null;
  price: PriceBand | null;
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
    // ONE equality, and no re-derivation is possible here — that is the point.
    //
    // This was three checks, two of them reading `r.priceAmount` (a fact about OUR
    // record) to decide what to say about a PROVIDER. The band that selects the
    // finding is not equal to any single quad value — it is saysNotPublished(), i.e.
    // `not_published` OR `no` — and while it was NAMED "not_published", any
    // contributor "simplifying" it to `r.priceState !== f.price` type-checked fine
    // and silently dropped five sourced `no` findings out of the band.
    //
    // The band now IS the row's own `priceBand`, computed once by rules.ts, and it
    // is named so it cannot be mistaken for a quad. The filter can only agree with
    // the cell beside it.
    if (f.price && r.priceBand !== f.price) return false;
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
/**
 * Generic in the row type, so a group's type SURVIVES the sort: sorting
 * `DistanceGroups["online"]` must not turn `UnplacedRow[]` back into `Row[]` and
 * hand the component a distance it might print.
 */
export function sortRows<T extends Row>(rows: T[], key: SortKey): T[] {
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
  /** Within the radius. Each row carries its distanceKm — the type says so. */
  near: NearRow[];
  /** Outside it. COUNTED, and shown in the result line — never silently dropped. */
  farCount: number;
  /** delivery.mode === "online": distance does not apply to them, so they cannot carry one. */
  online: UnplacedRow[];
  /**
   * The record holds no city. What the row's own city cell already says.
   *
   * This and `noCentroid` were ONE group, `unplaceable`, under one heading:
   * "Locatie niet vermeld — wij kunnen deze niet plaatsen". See Placement in
   * geo.ts — over a provider who DID state a city, that heading is a false
   * statement about a named business.
   */
  noCity: UnplacedRow[];
  /** The record holds a city; our centroid table does not. OUR gap, and the
   *  heading over it must say so — never "locatie niet vermeld". */
  noCentroid: UnplacedRow[];
}

/**
 * Drops any distance the row arrived with. A row in `online` or `unplaceable` has
 * no distance BY DEFINITION — carrying one over from a previous pass is how a
 * stale "12 km" ends up under a programme with no location.
 */
function unplaced(r: Row): UnplacedRow {
  const { distanceKm: _stale, ...rest } = r;
  return rest;
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
  const near: NearRow[] = [];
  const online: UnplacedRow[] = [];
  const noCity: UnplacedRow[] = [];
  const noCentroid: UnplacedRow[] = [];
  let farCount = 0;

  for (const r of rows) {
    if (r.mode === "online") {
      online.push(unplaced(r));
      continue;
    }
    // placeCities(), not nearestKm(): a row with no distance must say WHICH kind
    // of nothing it is, because the two get different headings and only one of
    // them is a statement about the provider. See Placement in geo.ts.
    const p = placeCities(r.cities, origin);
    if (p.kind === "no_city") {
      noCity.push(unplaced(r));
      continue;
    }
    if (p.kind === "no_centroid") {
      noCentroid.push(unplaced(r));
      continue;
    }
    if (radiusKm == null || p.km <= radiusKm) near.push({ ...r, distanceKm: p.km });
    else farCount++;
  }

  // Unsorted, deliberately: every caller sorts the group it renders (by the
  // visitor's chosen key, which is not always distance), so sorting here was work
  // that was always thrown away — and it quietly implied a guarantee callers must
  // not lean on. `near` carries each row's distanceKm; ordering is the caller's.
  return { near, farCount, online, noCity, noCentroid };
}

/* ---------- The chip list, and the group list. Both DERIVED, both TESTED ----------
 *
 * These two lived in ProgrammeTable.tsx, where nothing could test them, and both
 * are load-bearing in the same way: they decide WHAT THE READER CAN SEE AND REACH.
 * filterRows and partitionByDistance were tested to death — and neither test could
 * see that a programme the filter matches perfectly is unreachable because no chip
 * offers it, or that a row the partition faithfully keeps is never rendered because
 * a JSX block does not exist.
 */

/**
 * A chip's `value` is a value of THE FILTER IT BELONGS TO — never a bare string.
 *
 * `Chip { value: string }` let a typo compile and return zero rows, and on this
 * site an empty band is not a neutral outcome: an empty "niet gepubliceerd" price
 * band READS AS AN EDITORIAL CLAIM — "no provider withholds a price" — asserted to
 * the visitor by a misspelling nobody could see. The chip lists are pinned to
 * `Filters` at construction (see `group()`), so a value no row can ever hold is a
 * compile error.
 */
export interface Chip<K extends keyof Filters> {
  value: NonNullable<Filters[K]>;
  label: string;
}

export interface FilterGroup<K extends keyof Filters = keyof Filters> {
  key: K;
  label: string;
  chips: Chip<K>[];
}

/** Pins each group's chips to ITS filter's union — this is where a typo fails. */
const group = <K extends keyof Filters>(key: K, label: string, chips: Chip<K>[]): FilterGroup<K> => ({
  key,
  label,
  chips,
});

const distinct = <T,>(xs: T[]): T[] => [...new Set(xs)];

/**
 * THE CHIP LIST — derived from the rows, never hard-coded.
 *
 * This is the original design bug of this project, and it was still one edit away:
 * the chip list read `const modes = ["in_person", "hybrid"]`, the dataset holds
 * five `online` programmes, and those five were unreachable through the UI —
 * present in the data, matched by the filter, offered to nobody. filterRows is
 * tested against every mode in the data (it passes), but REACHABILITY needs a
 * CHIP, and the chips were derived inside the component where no test could look.
 * Hard-code them back and all 97 tests still pass.
 *
 * So it is pure, it is here, and it is tested both ways: every distinct value in
 * the data has a chip, and every chip matches at least one row (a chip that
 * matches nothing is the other half of the same bug — an empty result the reader
 * reads as an editorial claim).
 *
 * `register` and `price` are deliberately NOT derived from the rows: they are
 * editorial statements, not values the data enumerates. See the price note below.
 */
export function chipGroups(rows: ListingRow[]): FilterGroup[] {
  const formats = distinct(rows.map((r) => r.formatLabel)).sort();
  const modes = distinct(rows.map((r) => r.mode)).sort();
  const languages = distinct(rows.map((r) => r.language).filter((l): l is NonNullable<typeof l> => l != null)).sort();

  return [
    // formatChipLabel, not a ternary on `other`: `other` and `none` both rendered
    // "eigen vorm", so two chips over DISJOINT sets looked identical in one row.
    group("format", nl.filterFormat, formats.map((f) => ({ value: f, label: formatChipLabel(f) }))),
    group("language", nl.filterLanguage, languages.map((l) => ({ value: l, label: l.toUpperCase() }))),
    group("mode", nl.filterMode, modes.map((m) => ({ value: m, label: nl.mode[m] }))),
    group("register", nl.filterRegister, [
      { value: "ya", label: nl.filterYaVerified },
      { value: "crkbo", label: nl.filterCrkbo },
    ]),
    // Three chips, not four. `amount_not_in_record` — the five programmes that
    // publish a price we have not captured — is deliberately NOT offered: a price
    // band is a statement ("it costs this much", "they publish no price"), and
    // about those five we can honestly make neither. They are OUR gap, and they are
    // visible in the unfiltered list, where a reader meets them as "nog niet
    // onderzocht". See PriceBand in rules.ts.
    group("price", nl.filterPrice, [
      { value: "under3000", label: nl.filterUnder3000 },
      { value: "from3000", label: nl.filterFrom3000 },
      { value: "none_published", label: nl.filterPriceNotPublished },
    ]),
  ];
}

/** A section of the listing: a heading (null for the main list, which has the
 *  column header instead) and the rows under it, sorted and ready to render. */
export interface ListingGroup {
  key: "main" | "online" | "no_city" | "no_centroid";
  heading: string | null;
  rows: Row[];
}

export interface ListingView {
  /** Every group with rows in it, in render order. Empty groups are omitted. */
  groups: ListingGroup[];
  /** Rows outside the radius: COUNTED, never silently dropped. */
  farCount: number;
  /** Rows the reader can actually see — the sum of the groups above. */
  shownCount: number;
  /** Distinct providers among them. */
  providerCount: number;
}

/**
 * THE GROUP LIST — the whole listing, render-ready, so that "nothing is silently
 * dropped" is a property of what the PAGE SHOWS and not merely of what a function
 * returns.
 *
 * partitionByDistance provably keeps every row, and it was tested that way. But the
 * page rendered `online` and `noCity` only from two conditional JSX blocks, and the
 * excluded count from a third: delete any one of them and those rows vanish from the
 * page while the function still faithfully returns them, with no test failing. The
 * guarantee was proven one layer below the layer that could break it.
 *
 * Now the component maps over this and renders nothing of its own. Every row in →
 * exactly one group out, or counted in farCount. There is no third possibility, and
 * the test asserts the arithmetic.
 */
export function listingView(
  rows: Row[],
  origin: Centroid | null,
  radiusKm: number | null,
  sort: SortKey,
): ListingView {
  // No location: one flat list, no headings, nothing excluded.
  if (!origin) {
    const groups: ListingGroup[] = rows.length
      ? [{ key: "main", heading: null, rows: sortRows(rows, sort) }]
      : [];
    return { groups, farCount: 0, shownCount: rows.length, providerCount: providersIn(rows) };
  }

  const p = partitionByDistance(rows, origin, radiusKm);
  const sections: ListingGroup[] = [
    { key: "main", heading: null, rows: sortRows(p.near, sort) },
    // What distance cannot describe. Kept VISIBLE, each under a heading that says
    // why — and the two "no distance" reasons are two headings, because only one of
    // them is a statement about the provider (see Placement in geo.ts).
    { key: "online", heading: nl.groupOnline, rows: sortRows(p.online, sort) },
    { key: "no_city", heading: nl.groupNoCity, rows: sortRows(p.noCity, sort) },
    { key: "no_centroid", heading: nl.groupNoCentroid, rows: sortRows(p.noCentroid, sort) },
  ];
  const groups = sections.filter((g) => g.rows.length > 0);
  const shown = groups.reduce((n, g) => n + g.rows.length, 0);
  return {
    groups,
    farCount: p.farCount,
    shownCount: shown,
    providerCount: providersIn(groups.flatMap((g) => g.rows)),
  };
}

const providersIn = (rows: Row[]): number => new Set(rows.map((r) => r.providerId)).size;
