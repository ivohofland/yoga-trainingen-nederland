/**
 * The unit-level half of "/qa cannot ship". next.config.ts's own docblock (and
 * app/qa/page.dev.tsx's) explains why `pageExtensions` and the in-page `notFound()` guard
 * are ONE lock read from `NODE_ENV === "production"`, not two independent ones — this test
 * proves that OUR predicate reads the env var correctly. It is deliberately narrow: it
 * cannot prove `next build` actually excludes the route, because `npm test` runs BEFORE
 * `next build` in the gate chain (package.json's `build` script) — nothing in the unit
 * suite can open `out/`, which does not exist yet at this point in the chain. That proof —
 * that the exported BYTES contain no `/qa` — is scripts/verify-export.ts, wired as a
 * `postbuild` hook; see its own header for why that half cannot be a plain unit test either.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

test("next.config: pageExtensions excludes .dev.tsx under NODE_ENV=production", async () => {
  // `NODE_ENV` is typed `readonly` on `NodeJS.ProcessEnv` (next/types/global.d.ts augments
  // it, precisely to stop application code from writing it) — an escape hatch this test
  // needs and application code should never take, so it goes through an explicit `env`
  // alias typed as mutable rather than a blanket `as any` on `process.env` itself.
  const env: { NODE_ENV?: string } = process.env;
  const original = env.NODE_ENV;
  env.NODE_ENV = "production";
  try {
    // next.config.ts computes `isProduction` from NODE_ENV at MODULE-LOAD time, so this
    // only proves anything because it is the FIRST (and, under Node's test runner, only —
    // each test file gets its own process) import of the module in this run. A second
    // import anywhere else in this file would hit the module cache and read whatever
    // NODE_ENV was set to on the first one, silently.
    const config = (await import("../../next.config")).default;
    assert.ok(
      Array.isArray(config.pageExtensions) && !config.pageExtensions.includes("dev.tsx"),
      `pageExtensions is ${JSON.stringify(config.pageExtensions)} under NODE_ENV=production — ` +
        `.dev.tsx must not be a page extension in a production build, or /qa ships`,
    );
  } finally {
    env.NODE_ENV = original;
  }
});
