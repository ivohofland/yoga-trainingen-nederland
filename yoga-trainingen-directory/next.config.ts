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
  // A STATIC EXPORT, because there is no server in this site. No route handlers, no server
  // actions, no middleware, no next/image: every page is prerendered, and the correction
  // "form" is a GitHub issue form and a mailto (src/lib/corrections.ts). So `next build`
  // writes out/, nginx serves those bytes, and the deploy has no app process to restart —
  // which is also why deploy/deploy.sh needs no sudo at all.
  //
  // `next start` does not work under this and is not supposed to: the `start` script is
  // gone from package.json. Local preview is `npm run dev`.
  output: "export",
  // TRAILING SLASHES, so that a STOCK static vhost serves every route. The export then
  // writes `aanbieder/<id>/index.html` rather than `aanbieder/<id>.html`, and CloudPanel's
  // default `try_files $uri $uri/ =404` finds it. Without this, /aanbieder/<id> is a 404
  // until someone hand-edits `$uri.html` into the vhost — and the nginx config we never
  // have to write is the nginx config that can never drift from this repo.
  trailingSlash: true,
  // The default 60s per-page guard is WALL-CLOCK, not correctness: it trips on a machine
  // whose CPU is busy with something else, and fails a build that was going to succeed.
  //
  // This line called itself "TEMPORARY, LOCAL, NOT COMMITTED" while sitting committed in
  // the repo for weeks — a comment stating a fact about itself that anyone could check and
  // nobody did. It stays, and it now says what it is: the build runs on a small VPS
  // (deploy/deploy.sh) as well as here, and that is exactly the machine a 60s wall-clock
  // guard would fail on.
  staticPageGenerationTimeout: 1200,
};

export default nextConfig;
