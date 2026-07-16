# Notities (Field notes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/notities` writing section (listing, category filter, article pages, RSS, BlogPosting JSON-LD) to the static-export directory site, built from this repo's existing `marked`/`yaml` pipeline, shipped live with an honest empty state.

**Architecture:** Plain Markdown posts under `content/notities/`, filename = slug, frontmatter validated at build (fail-loud). A pure lib layer (`notes.ts`, `feed.ts`, `site.ts`) feeds two page routes (listing + article) and a build script that writes a static `feed.xml`. All new user-facing copy lives in `src/lib/strings.ts`; the article body reuses methodologie's `.prose`.

**Tech Stack:** Next.js 15 App Router, `output: "export"`, `trailingSlash: true`, `marked`, `yaml`, `react` `cache`, node:test via `tsx`, CSS Modules.

**Spec:** `docs/superpowers/specs/2026-07-16-notities-field-notes-design.md` — read it. Section references below (§N) point at it.

## Global Constraints

- **All `npm` commands run from `yoga-trainingen-directory/`.** Paths below are relative to it unless they start with `docs/` (repo root).
- **No new dependencies.** Use `marked` + `yaml` (already deps). No `gray-matter`, no `next-mdx-remote`.
- **NL-only.** Every user-facing string goes in `src/lib/strings.ts` (a nested `notes: {…}` group). No string inlined in a component.
- **Fail-loud on bad frontmatter; `[]` on a missing/empty directory.** Bad frontmatter throws and names the file; a missing/empty `content/notities/` returns `[]` (honest empty state — §4, §12).
- **RSS is a build script writing `public/notities/feed.xml`, NOT a route handler** (`next.config.ts` documents "No route handlers"; §5).
- **`git add` explicit paths only. NEVER `git add -A` or `git add -u`** — the tree may hold untracked files (e.g. `REVIEW-FINDINGS.md`) and a modified CSV that must not be swept into a commit.
- **Absolute URLs use trailing slashes** (`trailingSlash: true`): `https://research.ivohofland.nl/notities/<slug>/`.
- **The `@/*` path alias maps to `src/*`.** Scripts (`scripts/*.ts`) import via relative `../src/lib/...` (see `scripts/export-json.ts`).
- **Tests:** `import { test } from "node:test";` + `import assert from "node:assert/strict";`; locate files with `process.cwd()` (tests run with cwd = `yoga-trainingen-directory/`).
- Work happens on branch `feat/notities` (already created). Do not merge to `main` until the final review passes — the repo auto-deploys `main` to production.

## File Structure

**Create:**
- `src/lib/site.ts` — `SITE_URL`, `SITE_NAME`, `AUTHOR_NAME` constants (pure).
- `src/lib/notes.ts` — post loading + validation + `noteJsonLd` (impure fs; pure helpers exported for tests). Server-only.
- `src/lib/notes-view.ts` — `categories(posts)` (node-free; safe to import from the client filter island — notes.ts is not, it touches `node:fs`).
- `src/lib/notes.test.ts` — locks frontmatter validation, sort, empty-dir, categories, JSON-LD.
- `src/lib/feed.ts` — `renderFeed(notes)` pure RSS builder.
- `src/lib/feed.test.ts` — locks XML escaping + link/date shape.
- `src/lib/__fixtures__/notities/first-post.md`, `second-post.md` — test fixtures.
- `app/notities/page.tsx` — listing (Server Component).
- `app/notities/NotitiesIndex.tsx` — category filter + rows + empty state (client).
- `app/notities/page.module.css` — listing styles.
- `app/notities/[slug]/page.tsx` — article (Server Component).
- `app/notities/[slug]/page.module.css` — article back-link + meta styles.
- `src/components/JsonLd.tsx` — `<script type="application/ld+json">` primitive.
- `scripts/build-feed.ts` — writes `public/notities/feed.xml`.
- `content/notities/README.md` — authoring docs.

**Modify:**
- `src/lib/strings.ts` — add the `notes: {…}` group.
- `app/Nav.tsx` — add the Notities nav item.
- `package.json` — add `build-feed` script + wire it into `build`.
- `scripts/verify-export.ts` — assert `out/notities/index.html` + `out/notities/feed.xml`.
- `.gitignore` — ignore `public/notities/feed.xml`.
- `docs/superpowers/specs/2026-07-11-public-listing-design.md` — supersede the two cut lines.

---

### Task 1: `site.ts` + `notes.ts` — the content pipeline

**Files:**
- Create: `src/lib/site.ts`, `src/lib/notes.ts`, `src/lib/notes-view.ts`, `src/lib/notes.test.ts`
- Create: `src/lib/__fixtures__/notities/first-post.md`, `src/lib/__fixtures__/notities/second-post.md`

**Interfaces:**
- Produces: `SITE_URL`, `SITE_NAME`, `AUTHOR_NAME` (from `site.ts`); `NoteMeta` type, `buildMeta(slug, data)`, `readNotesFrom(dir)`, `readAllNotes()`, `getAllNotes` (cached), `getNote(slug)`, `noteJsonLd(meta)` (from `notes.ts`); `categories(posts)` (from node-free `notes-view.ts`, safe for the client island).

- [ ] **Step 1: Create the two fixture posts**

`src/lib/__fixtures__/notities/first-post.md`:

```markdown
---
title: "Het eerste stuk"
cat: "Achtergrond"
date: 2026-07-10
readTime: "4 min"
intro: "Een korte samenvatting van het eerste stuk."
---

## Een kop

Wat tekst met een <tag> & een ampersand, om escaping te toetsen.
```

`src/lib/__fixtures__/notities/second-post.md`:

```markdown
---
title: "Het tweede stuk"
cat: "Bevinding"
date: 2026-07-20
readTime: "6 min"
intro: "Een korte samenvatting van het tweede stuk."
---

## Nog een kop

Meer tekst.
```

- [ ] **Step 2: Write the failing test**

`src/lib/notes.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { buildMeta, noteJsonLd, readNotesFrom, type NoteMeta } from "./notes";
import { categories } from "./notes-view";
import { SITE_URL } from "./site";

const FIX = path.join(process.cwd(), "src", "lib", "__fixtures__", "notities");

const good = {
  title: "Titel",
  cat: "Achtergrond",
  date: "2026-07-20",
  readTime: "5 min",
  intro: "Intro.",
};

test("buildMeta accepts a good record and derives date + publishedISO", () => {
  const { meta } = buildMeta("een-stuk", good);
  assert.equal(meta.slug, "een-stuk");
  assert.equal(meta.publishedISO, "2026-07-20");
  assert.equal(meta.date, "juli 2026");
});

test("buildMeta rejects a bad slug", () => {
  assert.throws(() => buildMeta("Niet Geldig", good), /invalid slug/);
});

for (const key of ["title", "cat", "readTime", "intro"]) {
  test(`buildMeta rejects a missing ${key}`, () => {
    const bad = { ...good, [key]: "" };
    assert.throws(() => buildMeta("een-stuk", bad), new RegExp(key));
  });
}

test("buildMeta rejects a non-YYYY-MM-DD / rolled-over date", () => {
  assert.throws(() => buildMeta("een-stuk", { ...good, date: "20 juli" }), /date/);
  assert.throws(() => buildMeta("een-stuk", { ...good, date: "2026-02-30" }), /date/);
});

test("readNotesFrom sorts newest-first", () => {
  const posts = readNotesFrom(FIX);
  assert.deepEqual(
    posts.map((p) => p.slug),
    ["second-post", "first-post"],
  );
});

test("readNotesFrom returns [] for a missing directory", () => {
  assert.deepEqual(readNotesFrom(path.join(FIX, "does-not-exist")), []);
});

test("categories returns distinct cats in first-seen order (no 'Alle')", () => {
  const posts: NoteMeta[] = readNotesFrom(FIX);
  assert.deepEqual(categories(posts), ["Bevinding", "Achtergrond"]);
});

test("noteJsonLd builds a BlogPosting with trailing-slash URLs", () => {
  const { meta } = buildMeta("een-stuk", good);
  const ld = noteJsonLd(meta) as Record<string, unknown>;
  assert.equal(ld["@type"], "BlogPosting");
  assert.equal(ld.headline, "Titel");
  assert.equal(ld.datePublished, "2026-07-20");
  assert.equal(ld.url, `${SITE_URL}/notities/een-stuk/`);
  assert.equal(ld.mainEntityOfPage, `${SITE_URL}/notities/een-stuk/`);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './notes'` (or `./site`).

- [ ] **Step 4: Create `src/lib/site.ts`**

```ts
/**
 * The site's own origin and identity, in one place. Absolute URLs in the RSS
 * feed and the BlogPosting JSON-LD, and the article byline, all need these —
 * and there was no such constant before Notities, so it lives here rather than
 * being spelled out (and drifting) across files.
 */
export const SITE_URL = "https://research.ivohofland.nl";
export const SITE_NAME = "Yoga-docentenopleidingen";
export const AUTHOR_NAME = "Ivo Hofland";
```

- [ ] **Step 5: Create `src/lib/notes.ts`**

```ts
/**
 * Notities (field notes) — loading + validation. One Markdown file per post
 * under content/notities/, filename = slug. The ONE impure module of the feature
 * (node:fs, yaml); buildMeta / categories / noteJsonLd are pure and exported for
 * tests. Mirrors ivohofland.dev's lib/blog.ts, in this repo's materials: `yaml`
 * (already a dep) not gray-matter, and `marked` renders the body in the page.
 *
 * A missing OR empty content/notities/ is a legitimate day-one state, so the
 * readers return [] rather than throwing — the ONLY place this feature does not
 * fail loud (contrast loader.ts, which refuses an empty corpus). Bad FRONTMATTER
 * does throw, and names the file.
 */
import fs from "node:fs";
import path from "node:path";
import { cache } from "react";
import { parse as parseYaml } from "yaml";
import { SITE_URL, AUTHOR_NAME } from "./site";

const NOTES_DIR = path.join(process.cwd(), "content", "notities");

export type NoteMeta = {
  slug: string;
  title: string;
  cat: string;
  /** display label, e.g. "juli 2026" */
  date: string;
  /** ISO date, e.g. "2026-07-20" — for the RSS feed and JSON-LD */
  publishedISO: string;
  readTime: string;
  intro: string;
};

const monthYear = new Intl.DateTimeFormat("nl-NL", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function requireString(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`frontmatter "${key}" is missing or empty`);
  }
  return value;
}

function requireDate(data: Record<string, unknown>): Date {
  // YAML parses an unquoted ISO date to a Date; also accept a strict YYYY-MM-DD string.
  const raw = data.date;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  if (typeof raw === "string" && ISO_DATE_RE.test(raw)) {
    const d = new Date(`${raw}T00:00:00Z`);
    // reject calendar rollovers like 2026-02-30
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw) return d;
  }
  throw new Error(`frontmatter "date" must be a valid YYYY-MM-DD (got ${JSON.stringify(raw)})`);
}

/** Exported for tests: validate + shape one post's frontmatter. Throws on bad input. */
export function buildMeta(
  slug: string,
  data: Record<string, unknown>,
): { published: Date; meta: NoteMeta } {
  if (!SLUG_RE.test(slug)) {
    throw new Error(`invalid slug "${slug}" (use lowercase letters, digits and hyphens)`);
  }
  const published = requireDate(data);
  const meta: NoteMeta = {
    slug,
    title: requireString(data, "title"),
    cat: requireString(data, "cat"),
    date: monthYear.format(published),
    publishedISO: published.toISOString().slice(0, 10),
    readTime: requireString(data, "readTime"),
    intro: requireString(data, "intro"),
  };
  return { published, meta };
}

/**
 * Split a `---`-delimited frontmatter block off the top of a Markdown file —
 * gray-matter's job, done with the `yaml` dep this repo already has. Returns the
 * parsed frontmatter and the remaining Markdown body.
 */
function splitFrontmatter(raw: string): { data: Record<string, unknown>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error(`missing "---" frontmatter block`);
  const data = (parseYaml(m[1]) ?? {}) as Record<string, unknown>;
  return { data, body: m[2] };
}

/** Exported for tests: read every post in `dir`, newest first. Missing/empty dir → []. */
export function readNotesFrom(dir: string): NoteMeta[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((file) => {
      try {
        const { data } = splitFrontmatter(fs.readFileSync(path.join(dir, file), "utf8"));
        return buildMeta(file.replace(/\.md$/, ""), data);
      } catch (e) {
        // name the offending file so a bad post is findable, not a bare stack trace
        throw new Error(`content/notities/${file}: ${(e as Error).message}`);
      }
    })
    .sort((a, b) => b.published.getTime() - a.published.getTime())
    .map((p) => p.meta);
}

/** All posts, newest first. Missing/empty content/notities/ → []. */
export const readAllNotes = (): NoteMeta[] => readNotesFrom(NOTES_DIR);

/** The React-cached variant Server Components call (one read per render). */
export const getAllNotes = cache(readAllNotes);

/** One post's metadata + raw Markdown body, or null if the slug is bad or absent. */
export const getNote = cache((slug: string): { meta: NoteMeta; content: string } | null => {
  if (!SLUG_RE.test(slug)) return null;
  const full = path.join(NOTES_DIR, `${slug}.md`);
  if (!fs.existsSync(full)) return null;
  const { data, body } = splitFrontmatter(fs.readFileSync(full, "utf8"));
  return { meta: buildMeta(slug, data).meta, content: body };
});

/** Exported for tests: the BlogPosting JSON-LD for one post (spec §8). */
export function noteJsonLd(meta: NoteMeta): Record<string, unknown> {
  const url = `${SITE_URL}/notities/${meta.slug}/`;
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: meta.title,
    description: meta.intro,
    datePublished: meta.publishedISO,
    inLanguage: "nl-NL",
    author: { "@type": "Person", name: AUTHOR_NAME },
    url,
    mainEntityOfPage: url,
  };
}
```

- [ ] **Step 6: Create `src/lib/notes-view.ts`**

`categories` lives here, NOT in `notes.ts`, because the listing's category filter
is a **client** component. `notes.ts` imports `node:fs`; importing any *value*
from it into a client component drags `node:fs` into the browser bundle and
breaks the build (the same rule that keeps `derive`/`rules`/`quad`/`presenters`
node-free — see CLAUDE.md). A type-only re-export of `NoteMeta` is erased at
compile, so the client can get both from this one node-free module.

```ts
/**
 * Node-free view helpers for the Notities listing. Kept out of notes.ts because
 * that module imports node:fs, and the category filter is a CLIENT island —
 * importing a value from an fs-touching module would pull node:fs into the
 * browser bundle. Mirrors the derive/rules/quad/presenters node-free rule in
 * CLAUDE.md. The NoteMeta re-export is type-only (erased at compile).
 */
import type { NoteMeta } from "./notes";
export type { NoteMeta };

/**
 * The distinct categories, first-seen order. "Alle" is NOT included — the
 * component prepends nl.notes.allCategories, so that label lives only in strings.
 */
export function categories(posts: NoteMeta[]): string[] {
  return Array.from(new Set(posts.map((p) => p.cat)));
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — all `notes.test.ts` cases green (existing suite still green).

- [ ] **Step 8: Commit**

```bash
git add src/lib/site.ts src/lib/notes.ts src/lib/notes-view.ts src/lib/notes.test.ts "src/lib/__fixtures__/notities/first-post.md" "src/lib/__fixtures__/notities/second-post.md"
git commit -m "Load and validate Notities posts, fail-loud on bad frontmatter"
```

---

### Task 2: `feed.ts` — the pure RSS builder

**Files:**
- Create: `src/lib/feed.ts`, `src/lib/feed.test.ts`

**Interfaces:**
- Consumes: `NoteMeta` (Task 1), `SITE_URL`/`SITE_NAME` (Task 1).
- Produces: `renderFeed(notes: NoteMeta[]): string`.

- [ ] **Step 1: Write the failing test**

`src/lib/feed.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderFeed } from "./feed";
import { SITE_URL } from "./site";
import type { NoteMeta } from "./notes";

const post: NoteMeta = {
  slug: "eerste-stuk",
  title: "R&D over <yoga> & 'meer'",
  cat: "Achtergrond",
  date: "juli 2026",
  publishedISO: "2026-07-20",
  readTime: "5 min",
  intro: "Intro met < & > tekens.",
};

test("renderFeed escapes XML entities in title and intro", () => {
  const xml = renderFeed([post]);
  assert.ok(!xml.includes("<yoga>"), "raw <yoga> must not appear");
  assert.ok(xml.includes("R&amp;D over &lt;yoga&gt; &amp; &apos;meer&apos;"));
  assert.ok(xml.includes("Intro met &lt; &amp; &gt; tekens."));
});

test("renderFeed emits an absolute trailing-slash link and guid", () => {
  const xml = renderFeed([post]);
  assert.ok(xml.includes(`<link>${SITE_URL}/notities/eerste-stuk/</link>`));
  assert.ok(xml.includes(`<guid isPermaLink="true">${SITE_URL}/notities/eerste-stuk/</guid>`));
});

test("renderFeed emits a well-formed RFC-822 pubDate", () => {
  const xml = renderFeed([post]);
  assert.ok(xml.includes("<pubDate>Mon, 20 Jul 2026 00:00:00 GMT</pubDate>"));
});

test("renderFeed on an empty list is still valid channel XML", () => {
  const xml = renderFeed([]);
  assert.ok(xml.includes("<rss") && xml.includes("</channel>"));
  assert.ok(!xml.includes("<item>"));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './feed'`.

- [ ] **Step 3: Create `src/lib/feed.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — `feed.test.ts` green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/feed.ts src/lib/feed.test.ts
git commit -m "Render the Notities RSS feed as a pure, escaped function"
```

---

### Task 3: `nl.notes` strings

**Files:**
- Modify: `src/lib/strings.ts` (add the `notes` group after the `corr` group, which closes at the line `roleOptions: [...]` followed by `},`)

**Interfaces:**
- Produces: `nl.notes.{navLabel, eyebrow, title, lead, empty, filterLabel, allCategories, rssLabel, backLink, byPrefix, readTimeSuffix}`.

- [ ] **Step 1: Add the `notes` group**

In `src/lib/strings.ts`, find the end of the `corr:` group — it ends with:

```ts
    roleOptions: ["vertegenwoordiger aanbieder", "(oud-)student", "particulier", "anders"],
  },
```

Immediately after that closing `},`, insert:

```ts

  /* ---------- Notities (veldnotities) — spec 2026-07-16 ----------
   * A writing section: research dispatches + sector explainers. NL-only, in the
   * project's voice. The author NAME is AUTHOR_NAME in src/lib/site.ts (shared
   * with the JSON-LD); byPrefix here is just the word "door". */
  notes: {
    navLabel: "Notities",
    eyebrow: "Veldnotities",
    title: "Notities",
    lead:
      "Bevindingen uit het onderzoek en achtergrond bij de sector — bijvoorbeeld hoe je " +
      "een registervermelding leest. Elk stuk noemt zijn bron.",
    empty:
      "Nog geen notities. Ze verschijnen hier zodra er iets te melden valt — met bron, " +
      "zoals de rest van deze site.",
    filterLabel: "Filter op categorie",
    allCategories: "Alle",
    rssLabel: "RSS",
    backLink: "← Alle notities",
    byPrefix: "door",
    readTimeSuffix: "leestijd",
  },
```

- [ ] **Step 2: Verify it type-checks and the suite is still green**

Run: `npm test`
Expected: PASS — no test references `nl.notes` yet, but the file must still parse/type-check (existing `strings`-consuming tests pass).

- [ ] **Step 3: Commit**

```bash
git add src/lib/strings.ts
git commit -m "Add the Notities UI strings, NL-only, in one place"
```

---

### Task 4: The listing route

**Files:**
- Create: `app/notities/page.tsx`, `app/notities/NotitiesIndex.tsx`, `app/notities/page.module.css`

**Interfaces:**
- Consumes: `getAllNotes`, `categories`, `NoteMeta` (Task 1); `nl.notes` (Task 3).
- Produces: the `/notities` route; renders `<NotitiesIndex>` with the honest empty state.

- [ ] **Step 1: Create `app/notities/page.module.css`**

```css
.head {
  padding: 40px 0 8px;
}
.eyebrow {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 12px;
}
.title {
  font-size: 34px;
  font-weight: 600;
  line-height: 1.15;
  margin: 0 0 12px;
}
.lead {
  font-size: 17px;
  line-height: 1.65;
  color: var(--ink-2);
  max-width: 620px;
  margin: 0;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 26px 0 6px;
}
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.chip {
  font-family: var(--mono);
  font-size: 11.5px;
  padding: 4px 10px;
  cursor: pointer;
  background: var(--paper);
  color: var(--ink);
  border: 1px solid var(--rule-2);
}
.chipOn {
  composes: chip;
  background: var(--ink);
  color: var(--paper);
  border-color: var(--ink);
}
.rss {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--muted);
  text-decoration: none;
}
.rss:hover {
  color: var(--ink);
}

.list {
  margin-top: 8px;
  border-top: 1px solid var(--ink);
}
.row {
  display: grid;
  grid-template-columns: 150px 1fr auto;
  gap: 24px;
  align-items: baseline;
  padding: 22px 16px;
  margin: 0 -16px;
  border-bottom: 1px solid var(--rule);
  text-decoration: none;
  color: inherit;
}
.row:hover {
  background: var(--hover);
}
.rowMeta {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  line-height: 1.5;
}
.rowTitle {
  font-size: 18px;
  font-weight: 500;
  line-height: 1.35;
  margin: 0 0 6px;
}
.rowIntro {
  font-size: 14.5px;
  line-height: 1.55;
  color: var(--ink-2);
  margin: 0;
}
.arrow {
  font-family: var(--mono);
  color: var(--muted);
}

/* Honest empty state (spec §1): a plain statement, not chrome dressed up as
   content. Shown when there are no posts. */
.empty {
  padding: 40px 0;
  border-top: 1px solid var(--ink);
  font-family: var(--mono);
  font-size: 13px;
  color: var(--muted);
  line-height: 1.65;
  max-width: 560px;
}

@media (max-width: 720px) {
  .row {
    grid-template-columns: 1fr;
    gap: 6px;
  }
  .arrow {
    display: none;
  }
}
```

- [ ] **Step 2: Create `app/notities/NotitiesIndex.tsx`**

```tsx
"use client";

/**
 * The Notities listing's one client island: the category filter. Everything else
 * on the page is server-rendered. With zero posts it renders only the honest
 * empty state (spec §1) — and since the categories then come from an empty list,
 * no filter buttons appear.
 */
import { useState } from "react";
import Link from "next/link";
// notes-view.ts is node-free; importing `categories` from notes.ts (which touches
// node:fs) into this CLIENT component would break the browser bundle.
import { categories, type NoteMeta } from "@/lib/notes-view";
import { nl } from "@/lib/strings";
import styles from "./page.module.css";

export function NotitiesIndex({ posts }: { posts: NoteMeta[] }) {
  const allLabel = nl.notes.allCategories;
  const [cat, setCat] = useState(allLabel);

  if (posts.length === 0) {
    return <div className={styles.empty}>{nl.notes.empty}</div>;
  }

  const cats = [allLabel, ...categories(posts)];
  const shown = posts.filter((p) => cat === allLabel || p.cat === cat);

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.filters} role="group" aria-label={nl.notes.filterLabel}>
          {cats.map((c) => (
            <button
              key={c}
              type="button"
              className={c === cat ? styles.chipOn : styles.chip}
              aria-pressed={c === cat}
              onClick={() => setCat(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <a className={styles.rss} href="/notities/feed.xml">
          {nl.notes.rssLabel}
        </a>
      </div>

      <div className={styles.list}>
        {shown.map((p) => (
          <Link key={p.slug} className={styles.row} href={`/notities/${p.slug}`}>
            <div className={styles.rowMeta}>
              {p.cat.toUpperCase()}
              <br />
              {p.date}
            </div>
            <div>
              <h2 className={styles.rowTitle}>{p.title}</h2>
              <p className={styles.rowIntro}>{p.intro}</p>
            </div>
            <span className={styles.arrow} aria-hidden>
              →
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Create `app/notities/page.tsx`**

```tsx
/**
 * Notities (field notes) — the listing (spec §5). A Server Component: it reads
 * and validates the posts at build time (bad frontmatter throws, per notes.ts).
 * The category filter is the one client island below.
 */
import { getAllNotes } from "@/lib/notes";
import { nl } from "@/lib/strings";
import { NotitiesIndex } from "./NotitiesIndex";
import styles from "./page.module.css";

export const metadata = {
  title: "Notities — Yoga-docentenopleidingen",
  description:
    "Bevindingen uit het onderzoek naar yoga-docentenopleidingen en achtergrond bij de sector. " +
    "Elk stuk noemt zijn bron.",
};

export default function NotitiesPage() {
  const posts = getAllNotes();
  return (
    <main>
      <div className={styles.head}>
        <div className={styles.eyebrow}>{nl.notes.eyebrow}</div>
        <h1 className={styles.title}>{nl.notes.title}</h1>
        <p className={styles.lead}>{nl.notes.lead}</p>
      </div>
      <NotitiesIndex posts={posts} />
    </main>
  );
}
```

- [ ] **Step 4: Build and verify the empty state ships**

Run: `npm run build`
Expected: build succeeds; then:

Run: `grep -q "Nog geen notities" out/notities/index.html && echo OK`
Expected: `OK` (the honest empty state is in the exported HTML — there are no posts in `content/notities/` yet).

- [ ] **Step 5: Commit**

```bash
git add app/notities/page.tsx app/notities/NotitiesIndex.tsx app/notities/page.module.css
git commit -m "Add the Notities listing with category filter and honest empty state"
```

---

### Task 5: The article route + `JsonLd`

**Files:**
- Create: `app/notities/[slug]/page.tsx`, `app/notities/[slug]/page.module.css`, `src/components/JsonLd.tsx`

**Interfaces:**
- Consumes: `getAllNotes`, `getNote`, `noteJsonLd` (Task 1); `AUTHOR_NAME` (Task 1); `nl.notes` (Task 3); methodologie's `.prose`.
- Produces: the `/notities/<slug>` route; the reusable `<JsonLd>` primitive.

- [ ] **Step 1: Create `src/components/JsonLd.tsx`**

```tsx
/**
 * The repo's one JSON-LD primitive: a <script type="application/ld+json">. React
 * escapes text children, which would corrupt the JSON, so the payload goes in via
 * dangerouslySetInnerHTML — with "<" hardened to < so no string value can
 * close the <script> tag. First used by Notities (spec §8).
 */
export function JsonLd({ data }: { data: object }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
```

- [ ] **Step 2: Create `app/notities/[slug]/page.module.css`**

```css
/* The back-link is navigation chrome, NOT a quad: it must not borrow --finding
   or --gap (those say something about a provider). Mono, muted, underline on
   hover — a plain "up one level" affordance. */
.backLink {
  display: inline-block;
  font-family: var(--mono);
  font-size: 11.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  text-decoration: none;
  margin-bottom: 20px;
}
.backLink:hover {
  color: var(--ink);
  text-decoration: underline;
}

.meta {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
  margin: 0 0 28px;
}
```

- [ ] **Step 3: Create `app/notities/[slug]/page.tsx`**

```tsx
/**
 * Notities article (spec §5). Server Component, statically prerendered: only the
 * slugs from generateStaticParams exist (dynamicParams = false), so an unknown
 * slug 404s at the routing layer and the route stays fully static-exportable.
 * The body is this repo's Markdown-via-marked, rendered into methodologie's
 * shared .prose — one prose treatment across the site (as /correcties does).
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { marked } from "marked";
import { getAllNotes, getNote, noteJsonLd } from "@/lib/notes";
import { AUTHOR_NAME } from "@/lib/site";
import { JsonLd } from "@/components/JsonLd";
import { nl } from "@/lib/strings";
import prose from "../../methodologie/page.module.css";
import styles from "./page.module.css";

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllNotes().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const note = getNote(slug);
  if (!note) return { title: "Niet gevonden", robots: { index: false } };
  return { title: `${note.meta.title} — Notities`, description: note.meta.intro };
}

export default async function NoteArticle({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const note = getNote(slug);
  if (!note) notFound();
  const { meta, content } = note;
  const html = marked.parse(content, { async: false }) as string;

  return (
    <main className={prose.prose}>
      <JsonLd data={noteJsonLd(meta)} />
      <Link className={styles.backLink} href="/notities">
        {nl.notes.backLink}
      </Link>
      <h1>{meta.title}</h1>
      <div className={styles.meta}>
        {meta.cat.toUpperCase()} · {meta.date} · {meta.readTime} {nl.notes.readTimeSuffix} ·{" "}
        {nl.notes.byPrefix} {AUTHOR_NAME}
      </div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  );
}
```

- [ ] **Step 4: Build to confirm the empty-corpus case exports cleanly**

Run: `npm run build`
Expected: build succeeds. With no posts, `generateStaticParams` returns `[]`, so no article pages are emitted and no `out/notities/<slug>/` directory exists — that is correct. (`grep -q "Nog geen notities" out/notities/index.html && echo OK` still prints `OK`.)

- [ ] **Step 5: Temporarily add a real post and confirm an article + JSON-LD render**

Create `content/notities/proef.md` (a throwaway, deleted at the end of this step):

```markdown
---
title: "Proefstuk"
cat: "Achtergrond"
date: 2026-07-16
readTime: "2 min"
intro: "Een tijdelijk stuk om de artikelpagina te toetsen."
---

## Een kop

Wat proza, met een [link](https://example.com) en *nadruk*.
```

Run: `npm run build`
Then:

Run: `grep -q "application/ld+json" out/notities/proef/index.html && grep -q "BlogPosting" out/notities/proef/index.html && grep -q "Proefstuk" out/notities/index.html && echo OK`
Expected: `OK` (the article exists in the trailing-slash shape, carries JSON-LD, and appears on the listing).

Then remove the throwaway post so the section ships empty (spec §1):

Run: `git status --porcelain content/notities/` → should show only `proef.md` as untracked; then `rm content/notities/proef.md`

- [ ] **Step 6: Commit**

```bash
git add app/notities/[slug]/page.tsx app/notities/[slug]/page.module.css src/components/JsonLd.tsx
git commit -m "Render Notities articles into the shared prose, with BlogPosting JSON-LD"
```

---

### Task 6: The nav item

**Files:**
- Modify: `app/Nav.tsx`

**Interfaces:**
- Consumes: `nl.notes.navLabel` (Task 3).

- [ ] **Step 1: Add the nav item**

In `app/Nav.tsx`, change the `items` array from:

```tsx
const items = [
  { href: "/", label: nl.navDirectory },
  { href: "/methodologie", label: nl.navMethod },
  { href: "/correcties", label: nl.corr.navLabel },
] as const;
```

to:

```tsx
const items = [
  { href: "/", label: nl.navDirectory },
  { href: "/methodologie", label: nl.navMethod },
  { href: "/notities", label: nl.notes.navLabel },
  { href: "/correcties", label: nl.corr.navLabel },
] as const;
```

(The existing `isActive` already lights `/notities` and every `/notities/<slug>` via its `pathname.startsWith(\`${href}/\`)` branch — no logic change.)

- [ ] **Step 2: Build and confirm the nav link ships on every page**

Run: `npm run build`
Then:

Run: `grep -q 'href="/notities' out/index.html && grep -q 'Notities' out/index.html && echo OK`
Expected: `OK` (the nav link is in the static HTML, not only after hydration).

- [ ] **Step 3: Commit**

```bash
git add app/Nav.tsx
git commit -m "Put Notities in the masthead nav"
```

---

### Task 7: RSS build script + build wiring + export verification

**Files:**
- Create: `scripts/build-feed.ts`
- Modify: `package.json`, `scripts/verify-export.ts`, `.gitignore`

**Interfaces:**
- Consumes: `readAllNotes` (Task 1), `renderFeed` (Task 2).
- Produces: `public/notities/feed.xml` at build; `out/notities/feed.xml` after export; verify-export asserts both listing + feed.

- [ ] **Step 1: Create `scripts/build-feed.ts`**

```ts
/**
 * Writes public/notities/feed.xml from the posts, in the build chain BEFORE
 * next build (which then copies public/ into out/). The same static-artifact
 * pattern as scripts/export-json.ts — and the reason the feed needs no route
 * handler, which next.config.ts documents this site does not ship.
 */
import fs from "node:fs";
import path from "node:path";
import { readAllNotes } from "../src/lib/notes";
import { renderFeed } from "../src/lib/feed";

const notes = readAllNotes();
const outDir = path.join(process.cwd(), "public", "notities");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "feed.xml"), renderFeed(notes), "utf8");
console.log(`✓ build-feed: wrote public/notities/feed.xml (${notes.length} note(s))`);
```

- [ ] **Step 2: Add the `build-feed` script and wire it into `build`**

In `package.json`, add to `"scripts"` (next to `export-json`):

```json
    "build-feed": "tsx scripts/build-feed.ts",
```

And change the `build` script from:

```json
    "build": "npm run gen-schema && npm run validate && npm run provenance && npm test && npm run test:ci && npm run export-json && next build",
```

to (insert `&& npm run build-feed` before `&& next build`):

```json
    "build": "npm run gen-schema && npm run validate && npm run provenance && npm test && npm run test:ci && npm run export-json && npm run build-feed && next build",
```

- [ ] **Step 3: Gitignore the generated feed**

Append to `.gitignore`:

```
# Generated at build from content/notities/*.md by scripts/build-feed.ts, then
# copied into out/ by next build. Like public/build-info.json, a committed copy
# could go stale against the posts; it is regenerated every build.
public/notities/feed.xml
```

- [ ] **Step 4: Extend `scripts/verify-export.ts`**

In `scripts/verify-export.ts`, find:

```ts
// 2. THE SITE ITSELF MUST EXIST.
if (!fs.existsSync(path.join(OUT, "index.html"))) fail(`out/index.html is missing`);
```

Immediately after it, insert:

```ts
// 2b. THE NOTITIES SECTION AND ITS FEED MUST SHIP. The listing is a route; the
// feed is a build artifact (scripts/build-feed.ts writes public/notities/feed.xml,
// next build copies it into out/). If build-feed did not run, or the export did not
// copy public/, this catches it — loudly — rather than shipping a dead RSS link.
if (!fs.existsSync(path.join(OUT, "notities", "index.html"))) {
  fail(`out/notities/index.html is missing — the Notities listing did not export`);
}
const feedPath = path.join(OUT, "notities", "feed.xml");
if (!fs.existsSync(feedPath)) {
  fail(`out/notities/feed.xml is missing — build-feed did not run, or next build did not copy public/ into out/`);
}
const feed = fs.readFileSync(feedPath, "utf8");
if (!feed.includes("<rss") || !feed.includes("</channel>")) {
  fail(`out/notities/feed.xml is not well-formed RSS (missing <rss or </channel>)`);
}
```

- [ ] **Step 5: Full build to confirm the whole chain, feed included**

Run: `npm run build`
Expected: build succeeds; `build-feed` prints `✓ build-feed: wrote public/notities/feed.xml (0 note(s))`; `verify-export` prints its success line without error.

Run: `grep -q "<rss" out/notities/feed.xml && grep -q "</channel>" out/notities/feed.xml && echo OK`
Expected: `OK`.

Confirm the generated feed is not tracked:

Run: `git status --porcelain public/notities/feed.xml`
Expected: empty output (gitignored).

- [ ] **Step 6: Commit**

```bash
git add scripts/build-feed.ts package.json scripts/verify-export.ts .gitignore
git commit -m "Emit and verify the Notities RSS feed as a static build artifact"
```

---

### Task 8: Content README + supersede the listing spec's cut

**Files:**
- Create: `content/notities/README.md`
- Modify: `docs/superpowers/specs/2026-07-11-public-listing-design.md`

**Interfaces:** none (documentation).

- [ ] **Step 1: Create `content/notities/README.md`**

````markdown
# Notities (veldnotities)

Each post is one `.md` file in this directory. The **filename is the URL slug**
(`hoe-je-yoga-alliance-leest.md` → `/notities/hoe-je-yoga-alliance-leest`).
Adding a post = drop a file here and commit — the listing, the article page, and
the RSS feed (`/notities/feed.xml`) pick it up on the next build. No CMS, no
database; the content is yours, in the repo.

## Frontmatter (required)

```yaml
---
title: "De titel van het stuk"
cat: "Achtergrond"       # vrije categorie — wordt een filterknop op /notities
date: 2026-07-20         # ISO-datum; bepaalt de volgorde (nieuwste eerst), toont als "juli 2026"
readTime: "6 min"
intro: "Eén of twee zinnen — de samenvatting op de indexpagina en in de RSS-feed."
---
```

All five are validated at build (`src/lib/notes.ts`): a missing/empty field or a
non-`YYYY-MM-DD` date **fails the build** (naming the offending file) rather than
shipping the word "undefined". The slug (= filename) must be lowercase `a-z0-9`
and hyphens.

## Body

Plain Markdown (`##` for section headings, `_..._` for emphasis, `—` for em
dashes). **Do not open the body with a level-1 `#` heading** — the title comes
from the frontmatter and is rendered by the page; a `#` in the body would double
it. There are no embedded components: this is the same `marked` pipeline as
`/methodologie` and `/correcties`.

## The editorial standard applies to prose too

This is a research publication. A post that makes a claim about a named
organisation (Yoga Alliance, a school) **quotes it verbatim and links the source**
— the same bar every record on this site meets. A characterisation without a
source does not belong in a note any more than in a record.
````

- [ ] **Step 2: Supersede the two cut lines in the listing spec**

In `docs/superpowers/specs/2026-07-11-public-listing-design.md`, change (in §3.2):

```
| **Field notes / blog** (list + article views) | No posts, no schema, no content directory. Pure invention. |
```

to:

```
| **Field notes / blog** (list + article views) | Cut when no content existed. **Superseded 2026-07-16** by `docs/superpowers/specs/2026-07-16-notities-field-notes-design.md` — built as `/notities` once real posts and a content pipeline existed. |
```

And change (in §10):

```
- Field notes / blog.
```

to:

```
- Field notes / blog. **Superseded 2026-07-16** — now `/notities`; see `docs/superpowers/specs/2026-07-16-notities-field-notes-design.md`.
```

- [ ] **Step 3: Confirm the docs are consistent**

Run: `grep -rn "Superseded 2026-07-16" docs/superpowers/specs/2026-07-11-public-listing-design.md`
Expected: two matching lines.

- [ ] **Step 4: Commit**

```bash
git add content/notities/README.md docs/superpowers/specs/2026-07-11-public-listing-design.md
git commit -m "Document how to write a note, and retire the cut that forbade it"
```

---

## Self-Review

**Spec coverage (§ → task):**
- §2.1 content pipeline → T1; listing → T4; category filter → T4; article → T5; RSS → T2+T7; JSON-LD → T1(noteJsonLd)+T5(JsonLd); nav → T6; empty state → T4; build validation → T1; unit tests → T1,T2.
- §3 content model → T1 (slug/date rules, frontmatter split) + T8 (README, no-`#`-h1 rule).
- §4 modules → site.ts/notes.ts T1, feed.ts T2, build-feed.ts T7, JsonLd T5.
- §5 routes/script/wiring → T4 (listing), T5 (article), T7 (build-feed + package.json + gitignore).
- §6 nav/strings/styling → T6 (nav), T3 (strings), T4/T5 (CSS).
- §7 RSS shape → T2. §8 JSON-LD shape → T1. §9 tests/gates → T1,T2,T7. §10 deploy fit → unchanged (no task needed). §11 invariants → upheld across tasks. §12 error handling → T1 (throws/[]), T5 (404), T7 (feed assert). §13 README → T8. §14 open questions → none.
- §1 supersede → T8. **No gaps.**

**Placeholder scan:** none — every code/CSS/test block is complete; every command has an expected result.

**Type consistency:** `NoteMeta` shape identical in T1 (definition), T2 (`renderFeed`), T4/T5 (consumers). `categories(posts)` lives in the node-free `notes-view.ts` (T1 Step 6) — NOT in `notes.ts` — because the client filter island (T4) imports it as a value; `notes.ts` touches `node:fs`. It returns distinct cats WITHOUT "Alle", and the component prepends `nl.notes.allCategories` (T4) — the one deliberate refinement over the spec's prose (which said `["Alle", ...]`); "Alle" thus lives only in strings. `getAllNotes`/`getNote`/`readAllNotes`/`noteJsonLd`/`AUTHOR_NAME` names match between T1 and their T4/T5/T7 consumers. `nl.notes.*` keys defined in T3 match every use in T4/T5/T6.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-16-notities-field-notes.md`. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, a task review after each, a broad review at the end.
2. **Inline Execution** — execute the tasks in this session with checkpoints.

Which approach?
