/**
 * The Notities RSS feed, as a PURE function of the posts. Kept out of the page
 * layer on purpose: next.config.ts documents that this site ships NO route
 * handlers, so the feed is written to public/notities/feed.xml by a build script
 * (scripts/build-feed.ts) the same way scripts/export-json.ts writes the JSON
 * API — `next build` copies public/ into out/. This function is that script's
 * whole payload, and it is unit-tested for XML-escaping in isolation.
 */
import { SITE_URL, SITE_NAME } from "./site";
import type { NoteMeta } from "./notes";

const XML_ENTITIES: Record<string, string> = {
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  "'": "&apos;",
  '"': "&quot;",
};

const escapeXml = (s: string): string => s.replace(/[<>&'"]/g, (c) => XML_ENTITIES[c]);

// RFC-822 date, derived deterministically from the ISO date. No Date.now() and
// no lastBuildDate: the static output must be reproducible build to build.
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function rfc822(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${DAYS[d.getUTCDay()]}, ${dd} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} 00:00:00 GMT`;
}

export function renderFeed(notes: NoteMeta[]): string {
  const items = notes
    .map((p) => {
      const link = `${SITE_URL}/notities/${p.slug}/`;
      return `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <category>${escapeXml(p.cat)}</category>
      <pubDate>${rfc822(p.publishedISO)}</pubDate>
      <description>${escapeXml(p.intro)}</description>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(SITE_NAME)} — Notities</title>
    <link>${SITE_URL}/notities/</link>
    <description>Veldnotities: bevindingen uit het onderzoek en achtergrond bij de sector.</description>
    <language>nl-NL</language>
${items}
  </channel>
</rss>
`;
}
