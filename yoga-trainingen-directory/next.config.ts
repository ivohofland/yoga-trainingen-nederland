import type { NextConfig } from "next";

/**
 * The QA dashboard is a development-only page, and `pageExtensions` is what makes
 * that true rather than merely intended.
 *
 * `app/qa/page.tsx` carried the docblock "NOT published" — but it was an App
 * Router page, so `next build` prerendered it and it would have shipped: the
 * researcher's internal work-list (every open `unknown` gap, per-provider
 * completeness, unarchived-source counts, staleness flags) served on the public
 * site, at a guessable URL.
 *
 * Calling `notFound()` inside it is not enough. The page still exists, still
 * prerenders, and still appears in the build's route list as `/qa` — a 404 shell,
 * but a route we ship and must keep thinking about. The honest state is that the
 * page does not exist in production at all.
 *
 * So the file is named `page.dev.tsx`, and `dev.tsx` is a page extension ONLY
 * outside a production build. In `next dev` it is a first-class page; in
 * `next build` it is not a page, so no route is emitted and nothing is rendered.
 * (The `notFound()` guard inside it stays as a second lock: if this list is ever
 * edited without that context, the page still refuses to render in production.)
 *
 * Order matters only in that the standard extensions must remain — everything
 * else in the app is a plain `.tsx`.
 */
const isProduction = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  pageExtensions: [...(isProduction ? [] : ["dev.tsx"]), "tsx", "ts", "jsx", "js"],
  // TEMPORARY, LOCAL, NOT COMMITTED — see the report. The default 60s per-page
  // guard trips on a machine whose CPU is saturated by unrelated processes; it is
  // a wall-clock guard, not a correctness one.
  staticPageGenerationTimeout: 1200,
};

export default nextConfig;
