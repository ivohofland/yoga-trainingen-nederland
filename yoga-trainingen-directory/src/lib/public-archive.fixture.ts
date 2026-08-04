/**
 * THE SYNTHETIC CASE: one provider holding all three public-archive states at once.
 *
 * WHY THIS IS A FIXTURE, AND NOT A SWEEP OF data/
 *
 * Twelve sources are `not_yet` today — ordinary pages nobody has submitted to Wayback
 * yet. That is a gap the project intends to pay off, and when it does, a test that found
 * its case by sweeping the corpus would have nothing left to exercise: the build would go
 * red for having FIXED the data. That happened once already (see price-gap.fixture.ts).
 *
 * The rule being pinned is not "the corpus contains a gap". It is that a GAP and a
 * FINDING must never render identically — `not_yet` says we have not looked, `impossible`
 * says we looked and no public archive can evidence this page. Those are opposite claims
 * about our own diligence, and the quad rule (src/lib/quad.test.ts) exists because
 * collapsing them is this project's central failure mode.
 *
 * Built by SPREADING A REAL RECORD so it cannot drift from the schema: a real,
 * schema-valid provider with its first three sources' `public_archive` replaced by one
 * of each state, and nothing else about the record's SHAPE touched.
 *
 * The id and name are NOT inherited from the base (see below) — no assertion made
 * against this fixture, and no failure message it prints, may ever name a real business
 * for a state it is not in.
 */
import type { Provider } from "../schema";

export const THREE_STATE_PROVIDER_ID = "synthetisch-drie-archiefstaten";

/** Same on all three constructed sources — see the note on `local_snapshot` below. */
const FIXTURE_LOCAL_SNAPSHOT = "data/archives/synthetisch-drie-archiefstaten/bron-2026-01.pdf";

/**
 * The synthetic provider: a real record's first three sources set to `archived`,
 * `impossible`, and `not_yet` respectively — one of each public-archive state.
 *
 * Loud, never quiet, if the base record moves out from under it. A fixture that
 * silently degraded into some *other* shape would leave both tests passing while
 * pinning nothing — the precise failure mode this fixture exists to end (see
 * price-gap.fixture.ts).
 */
export function threeStateProvider(providers: readonly Provider[]): { provider: Provider } {
  const base = providers.find((p) => p.sources.length >= 3);
  if (!base) {
    throw new Error(
      "public-archive fixture: no provider in the corpus holds 3+ sources any more — " +
        "re-base threeStateProvider on one that does",
    );
  }
  const [a, b, c] = base.sources;
  return {
    provider: {
      ...base,
      // Not the base's own id/name: no failure message this fixture produces may ever
      // read as a finding about a real business (mirrors price-gap.fixture.ts).
      id: THREE_STATE_PROVIDER_ID,
      name: "Synthetisch — drie archiefstaten in één record",
      sources: [
        {
          ...a,
          public_archive: { kind: "archived" as const, url: "https://web.archive.org/web/2026/x" },
          // `local_snapshot` is forced to the SAME value on all three below, not inherited
          // from the base — the rendered string the PRESENT test compares depends on BOTH
          // halves of the bar, and the base's own sources hold whatever local-snapshot
          // presence they happen to hold. adhouna, third in load order, is
          // [true, true, false]: fed in unmodified, its `not_yet` source would carry no
          // local copy either, `archiveSlots()` would return `null` for it, and
          // `assert.notEqual(finding.archiveSlots, gap.archiveSlots)` would pass by
          // comparing a STRING to `null` — even under a total collapse of `impossible`
          // into `not_yet`, the exact failure this fixture exists to prevent. Forcing one
          // shared value makes `public_archive.kind` the ONLY variable between the three,
          // by construction, regardless of which provider ends up as the base. (Verified:
          // pointing the base at adhouna directly still builds and the PRESENT test still
          // passes — genuinely, not vacuously; see task-3-report.md, fix round 1.)
          local_snapshot: FIXTURE_LOCAL_SNAPSHOT,
        },
        {
          ...b,
          public_archive: { kind: "impossible" as const, reason: "JS-shell (Salesforce)" },
          local_snapshot: FIXTURE_LOCAL_SNAPSHOT,
        },
        { ...c, public_archive: { kind: "not_yet" as const }, local_snapshot: FIXTURE_LOCAL_SNAPSHOT },
      ],
    },
  };
}
