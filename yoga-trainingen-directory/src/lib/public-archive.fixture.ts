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
 * of each state, and nothing else about the record touched.
 *
 * The ids are nobody's finding: the base is a real business, mutated only to hold this
 * shape for the test, and no assertion made against this fixture is a statement about
 * that business's actual archive coverage.
 */
import type { Provider } from "../schema";

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
      sources: [
        { ...a, public_archive: { kind: "archived" as const, url: "https://web.archive.org/web/2026/x" } },
        { ...b, public_archive: { kind: "impossible" as const, reason: "JS-shell (Salesforce)" } },
        { ...c, public_archive: { kind: "not_yet" as const } },
      ],
    },
  };
}
