# Notities (Field notes) — Design

**Goal:** Add a writing section, `/notities`, to the research directory: a place
for research dispatches (findings across the corpus, methodology in plain
language) and general sector explainers (first: how to read a Yoga Alliance
registration). Modelled on the ivohofland.dev blog, built from *this* repo's
materials.

**Architecture:** Plain Markdown files under `content/notities/`, one per post,
filename = URL slug; frontmatter validated at build (fail-loud); body rendered
with the existing `marked`; frontmatter parsed with the existing `yaml`. Two
page routes (listing, article), a build-time RSS file, and a nav item, in the
existing static-export + CSS-Modules design system. **No new dependencies.**

**Tech stack:** Next.js 15 App Router, `output: "export"`, `trailingSlash:
true`, `marked`, `yaml`, `react` `cache`, node:test via `tsx`.

---

## 1. Relationship to the listing spec (this lifts a documented cut)

The listing spec, `docs/superpowers/specs/2026-07-11-public-listing-design.md`,
cut this feature in two places:

- **§3.2 "Cut, and why":** *"Field notes / blog (list + article views) — No
  posts, no schema, no content directory. Pure invention."*
- **§10 "Out of scope / deferred":** *"Field notes / blog."*

That was not a ban on writing. It was the same rule that gave `/correcties` no
form: **do not ship chrome for content that does not exist.** The imported
mockup *drew* a blog with zero posts and no content pipeline behind it, so
rendering it would have been an empty invented section.

This spec removes that objection by building the missing half: a real content
directory, a validated schema, a documented authoring pipeline, and posts
authored by the researcher. The cut is therefore **superseded, not violated**.
As part of shipping, the two listing-spec lines above are edited to point here
(a "superseded by" note), so the specs do not quietly contradict each other.

**One conscious exception to the no-empty-chrome rule:** Phase 1 goes live with
**zero posts and an honest empty state** ("nog geen notities"), and the nav link
ships live. This differs from the original cut: there is now a real, documented,
tested pipeline behind the section — an empty *shelf*, not an empty *drawing*.
The empty state states plainly that nothing is published yet; it promises
nothing. The first post (the Yoga Alliance explainer) follows.

## 2. Scope

### 2.1 In (Phase 1)

| Area | Detail |
|---|---|
| Content pipeline | `content/notities/*.md`, filename = slug, `yaml` frontmatter + `marked` body |
| Listing view | `/notities` — post rows, newest first |
| Category filter | Client-side `cat` filter on the listing ("Alle" + derived categories) |
| Article view | `/notities/<slug>` — header + rendered body, statically prerendered |
| RSS feed | `/notities/feed.xml` — static file, XML-escaped |
| BlogPosting JSON-LD | Per-article structured data (first JSON-LD in the repo) |
| Nav item | "Notities" in the masthead nav, lit on the section and its articles |
| Honest empty state | Truthful "nog geen notities" when the directory is empty |
| Build-time validation | Bad frontmatter fails the build, naming the file |
| Unit tests | Lock the frontmatter, sort, RSS, and JSON-LD invariants |

### 2.2 Deferred (additive later — no rework)

| Element | Why deferred |
|---|---|
| Per-article OG / social images | More work, low urgency; the `cat`/date schema already ships, so this is purely additive |
| Auto-computed read time | `readTime` is author-supplied in Phase 1 (matches the reference); computing it from word count is a later nicety |
| EN locale | The whole site is NL-only (listing spec cut the toggle); `notes` strings live in the strings module, so EN stays a data change |

## 3. Content model

- **Location:** `content/notities/<slug>.md`. **The filename is the URL slug.**
- **Slug rule:** lowercase `a-z0-9` and hyphens (`^[a-z0-9]+(?:-[a-z0-9]+)*$`).
- **Body:** plain Markdown, rendered with `marked.parse(md, { async: false })` —
  the exact pipeline `app/methodologie/page.tsx` and `app/correcties/page.tsx`
  already use. **No MDX, no embedded React components.** (The reference uses MDX
  because it embeds `Melding`/`Checklist`; this repo has no such need, and adding
  `next-mdx-remote` would be a new dependency for nothing.)
- **Frontmatter (all required, validated at build):**

  ```yaml
  ---
  title: "Hoe je een Yoga Alliance-registratie leest"
  cat: "Achtergrond"        # free-text category — becomes a filter button
  date: 2026-07-20          # YYYY-MM-DD; controls order (newest first)
  readTime: "6 min"
  intro: "Eén of twee zinnen — de samenvatting op de indexpagina en in de RSS-feed."
  ---
  ```

- A missing/empty field, a non-`YYYY-MM-DD` date, or a bad slug **throws at
  build**, naming the offending file — never ships the word "undefined". This
  matches the repo's fail-loud gates (`validate`, `provenance`, tests).
- The post body must **not** start with a level-1 `#` heading — the title comes
  from frontmatter and is rendered by the page. Sections use `##`.

## 4. Modules (purity split preserved)

- **`src/lib/site.ts`** — the single origin/identity source. Pure.
  - `export const SITE_URL = "https://research.ivohofland.nl";`
  - `export const SITE_NAME = "Yoga-docentenopleidingen";`
  - `export const AUTHOR_NAME = "Ivo Hofland";`
  - Used by the RSS feed and the JSON-LD for absolute, trailing-slash URLs and
    the byline. One place to change origin, site name, or attribution.

- **`src/lib/notes.ts`** — the feature's one impure module (`node:fs`, `yaml`).
  - `type NoteMeta = { slug; title; cat; date; publishedISO; readTime; intro }`
    (`date` = display, e.g. `"juli 2026"`, via `Intl.DateTimeFormat("nl-NL", {
    month: "long", year: "numeric", timeZone: "UTC" })`; `publishedISO` =
    `YYYY-MM-DD` for the feed/JSON-LD).
  - `buildMeta(slug, data): { published: Date; meta: NoteMeta }` — **pure**,
    validates + shapes one post, throws on bad input. Exported for tests.
  - `readNotesFrom(dir): NoteMeta[]` — the impure read, parameterised by
    directory so tests can point it at a fixture. Reads `*.md`, splits
    frontmatter (a small `---`-block regex + `yaml.parse`, no `gray-matter`),
    validates each (wrapping errors with the filename), sorts newest-first.
    **A missing or empty directory → `[]` (never throws).**
  - `readAllNotes = () => readNotesFrom(<content/notities>)` — plain, impure.
  - `getAllNotes = cache(readAllNotes)` — the React-cached variant Server
    Components call. (The plain `readAllNotes` exists so the RSS build script can
    run outside a render.)
  - `getNote(slug): { meta; content } | null` — null for a bad or absent slug.
  - `noteJsonLd(meta): object` — **pure**, builds the BlogPosting object (§8).
    Exported for tests.
  - **Server-only** (imports `node:fs`); the client never imports a value from it.

- **`src/lib/notes-view.ts`** — **node-free** view helpers, so the client filter
  island can import them (the same rule that keeps `derive`/`rules`/`quad`/
  `presenters` free of `node:*` — CLAUDE.md). Exports `categories(posts):
  string[]` (**pure**, the distinct categories in first-seen order; the "Alle"
  label is prepended by the component from `nl.notes.allCategories`, so it lives
  only in strings) and a **type-only** re-export of `NoteMeta` (erased at
  compile). Tested.

- **`src/lib/feed.ts`** — `renderFeed(notes: NoteMeta[]): string`, **pure**,
  XML-escaped RSS 2.0 (§7). Type-only import of `NoteMeta`. Tested.
  `scripts/build-feed.ts` (§5) is its only caller — a thin wrapper.

- **`scripts/build-feed.ts`** — writes `renderFeed(readAllNotes())` to
  `public/notities/feed.xml`, run in the `build` chain **before** `next build`,
  which copies `public/` into `out/`. The exact static-artifact pattern
  `scripts/export-json.ts` uses for `providers.json`. This is why the feed needs
  **no route handler** — `next.config.ts` documents that this site ships none.

- **`src/components/JsonLd.tsx`** — a server component rendering
  `<script type="application/ld+json" dangerouslySetInnerHTML=…>` with `<`
  escaped to `<` (so a value can never close the script tag). Takes
  `data: object`. The repo's first JSON-LD primitive; deliberately minimal.

**Empty-directory decision (documented divergence):** the dataset loader
*refuses* an empty corpus (a directory with no providers is a bug). `notes.ts`
does the opposite — a missing or empty `content/notities` is a legitimate
day-one state, so the readers return `[]`. This is the honest-empty-state choice
from §1, encoded in the one place it lives.

## 5. Routes, script, and build wiring (static-export safe)

- **`app/notities/page.tsx`** (Server Component): `const posts = getAllNotes();`
  → renders the section header (eyebrow/title/lead from `nl.notes`) then
  `<NotitiesIndex posts={posts} />`. Exports `metadata` (title + description).

- **`app/notities/NotitiesIndex.tsx`** (`"use client"`): uses `categories(posts)`
  for the filter buttons; `useState` selected category; filters rows; renders
  each as a `<Link href={/notities/${slug}}>` (category · date · title · intro).
  Shows the RSS link (`/notities/feed.xml`). When `posts` is empty it renders
  only the honest empty-state line (`nl.notes.empty`) — with zero posts there are
  no category buttons, so it degrades gracefully.

- **`app/notities/[slug]/page.tsx`** (Server Component):
  - `export const dynamicParams = false;`
  - `export function generateStaticParams()` → `getAllNotes().map(p => ({ slug: p.slug }))`.
  - `generateMetadata` → title = post title, description = intro; unknown slug →
    `notFound()`.
  - Renders, inside methodologie's shared `.prose` (imported like `correcties`
    does — one prose treatment, never a second copy): a back-link
    (`nl.notes.backLink`), `<h1>`, a meta line
    (`CAT · date · readTime <readTimeSuffix> · door <AUTHOR_NAME>`), then
    `dangerouslySetInnerHTML={{ __html: marked.parse(content, { async: false }) }}`.
    Emits `<JsonLd data={noteJsonLd(meta)} />`.

- **RSS is a build script, not a route** (`next.config.ts` documents "No route
  handlers"): `scripts/build-feed.ts` writes `public/notities/feed.xml`. Wired
  into `package.json`'s `build` before `next build`:
  `… && npm run export-json && npm run build-feed && next build`, with
  `"build-feed": "tsx scripts/build-feed.ts"`. The file is **gitignored** (a
  generated artifact, like `public/build-info.json`) and regenerated every build;
  `verify-export.ts` asserts it landed in `out/` (§9). *Consequence:* the feed
  does not exist under `npm run dev` (which does not run the build chain); the
  listing's RSS link resolves in the built/deployed site only. Acceptable — RSS
  is a build artifact.

## 6. Nav, strings, styling

- **`app/Nav.tsx`:** add `{ href: "/notities", label: nl.notes.navLabel }` to
  `items`. The existing `isActive` (`pathname.startsWith(\`${href}/\`)`) already
  lights the nav on `/notities` and every `/notities/<slug>`. No logic change.
- **`src/lib/strings.ts`:** add a nested `notes: { … }` group (mirrors `corr`),
  placed after the `corr` group: `navLabel: "Notities"`, `eyebrow`, `title`,
  `lead`, `empty`, `allCategories: "Alle"`, `rssLabel`, `backLink`, `byPrefix:
  "door"`, `readTimeSuffix: "leestijd"`. NL-only; no user-facing string inlined
  in a component. (The author *name* is `AUTHOR_NAME` in `site.ts`, shared with
  the JSON-LD; `byPrefix` is just the word "door".)
- **Styling:** `app/notities/page.module.css` (section header + listing rows +
  filter chips reuse the existing chip look and `--ink/--paper/--mono/--muted/
  --rule` tokens) and `app/notities/[slug]/page.module.css` (article back-link +
  meta line only). The article body uses the shared `.prose`, so post typography
  matches methodologie exactly.

## 7. RSS (`renderFeed`)

RSS 2.0, `nl-NL`, all text XML-escaped (`< > & ' "`). Channel: title
(`${SITE_NAME} — Notities`), link (`${SITE_URL}/notities/`), description,
language. Per item: `<title>`, `<link>` and `<guid isPermaLink="true">`
(`${SITE_URL}/notities/<slug>/`), `<category>`, `<pubDate>` (RFC-822, derived
deterministically from `publishedISO`), `<description>` (intro). **No
`lastBuildDate`** — it would change every build and make the static output
non-reproducible.

## 8. JSON-LD (`noteJsonLd`)

Minimal valid `BlogPosting`:

```json
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "<title>",
  "description": "<intro>",
  "datePublished": "<publishedISO>",
  "inLanguage": "nl-NL",
  "author": { "@type": "Person", "name": "<AUTHOR_NAME>" },
  "url": "<SITE_URL>/notities/<slug>/",
  "mainEntityOfPage": "<SITE_URL>/notities/<slug>/"
}
```

Trailing slashes match `trailingSlash: true`. `AUTHOR_NAME` comes from `site.ts`,
shared with the article byline, so attribution is one string to change.

## 9. Validation, tests, build gates

- **`src/lib/notes.test.ts`** (node:test): `buildMeta` rejects a bad slug, each
  missing/empty required field, and a non-`YYYY-MM-DD` / rolled-over date
  (e.g. `2026-02-30`); accepts a good record and derives `date`/`publishedISO`
  correctly. `readNotesFrom` on a fixture directory sorts newest-first; on a
  missing directory returns `[]`. `categories` returns the distinct categories,
  first-seen order, without "Alle". `noteJsonLd` produces the §8 shape with
  correct trailing-slash URLs.
- **`src/lib/feed.test.ts`** (node:test): `renderFeed` escapes `< > & ' "` in
  title/intro; emits absolute trailing-slash links; a `&` in a title does not
  produce invalid XML; a `<pubDate>` is a well-formed RFC-822 string.
- **`verify-export.ts`** (existing postbuild): assert `out/notities/index.html`
  and `out/notities/feed.xml` exist and the feed contains `<rss` and
  `</channel>`. Turns a static-export regression into a red build.
- All of the above run inside `npm test` → `npm run build`. Bad frontmatter also
  fails `next build` directly (the listing page calls `getAllNotes`).

## 10. Deploy fit

Nothing in the deploy path changes. New routes only raise the page count, so
`deploy.sh`'s ≥40-page floor still holds. `rsync` ships `out/notities/**` like
any other route. Static export means no server, no new port — consistent with
the rest of the site.

## 11. Editorial invariants respected

- **NL-only:** nav label and every string Dutch; `notes` strings isolated for a
  future EN.
- **No invented data:** the empty state is honest; posts are real authored files.
- **No new dependencies:** `marked` + `yaml` reuse.
- **One prose treatment:** the article body reuses methodologie's `.prose`.
- **Fail-loud:** bad frontmatter breaks the build, naming the file.
- **Content ethos carries to authored posts:** the content README states that a
  post making claims about a named organisation (Yoga Alliance, a school) quotes
  verbatim and links its source — the project's standard, applied to prose.

## 12. Error handling

| Condition | Behaviour |
|---|---|
| Missing/empty frontmatter field, bad date, bad slug | `buildMeta` throws, filename attached → build fails |
| No `---` frontmatter block | `readNotesFrom`/`getNote` throw, filename attached → build fails |
| Unknown `/notities/<slug>` | `dynamicParams = false` → 404 at the routing layer, never hits fs |
| Missing or empty `content/notities/` | readers → `[]` → honest empty state (not an error) |
| `build-feed` fails, or `feed.xml` missing from `out/` | `build-feed` throws → red build; `verify-export.ts` also asserts `out/notities/feed.xml` |

## 13. Content README

`content/notities/README.md` documents: filename = slug, the required
frontmatter with the validation rules, that the body must not open with an `#`
h1 (the title comes from frontmatter), that adding a post = drop a `.md` file and
commit (index/article/feed pick it up on the next build), and the verbatim +
source expectation for claims about named organisations. Mirrors the reference's
`content/blog/README.md`, adapted to this repo's Markdown-not-MDX pipeline and
editorial standard.

## 14. Open questions

None. `readTime` is author-supplied and OG images are deferred by decision (§2.2);
the nav link ships live per the honest-empty-state choice (§1); RSS is a build
script, not a route, per `next.config.ts`'s documented stance (§5).
