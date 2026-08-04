/**
 * derive.ts — the computed values, pinned against the loaded corpus and the
 * public-archive fixture. See CLAUDE.md: derive.ts must import nothing from
 * `node:*`, so this file calls `providerQa(provider)` with no `provenance` argument
 * at all and relies on its `[]` default, rather than importing provenance.ts to build one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDataset } from "./loader";
import { providerQa } from "./derive";
import { threeStateProvider } from "./public-archive.fixture";

const { providers } = loadDataset();

test("QA: unarchivedSources counts a GAP, never a FINDING", () => {
  // The correction that matters: /qa paints a red ✗ for any provider with an unarchived
  // source, and 46 of 48 were red for archives that cannot exist.
  const { provider } = threeStateProvider(providers);
  assert.equal(providerQa(provider).unarchivedSources, 1, "only the not_yet is a gap");
});
