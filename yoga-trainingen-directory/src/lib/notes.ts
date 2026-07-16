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
  // This repo's `yaml` parses `date: 2026-07-10` to a STRING, not a Date, so we
  // require a strict YYYY-MM-DD string and validate it by round-trip: parse it as
  // UTC midnight, then reject anything the round-trip does not reproduce exactly
  // (e.g. calendar rollovers like 2026-02-30, which Date silently rolls to March).
  const raw = data.date;
  if (typeof raw === "string" && ISO_DATE_RE.test(raw)) {
    const d = new Date(`${raw}T00:00:00Z`);
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
        // name the ACTUAL offending file so a bad post is findable — this reader
        // runs against the fixtures dir too, so a hardcoded path would lie.
        throw new Error(
          `${path.relative(process.cwd(), path.join(dir, file))}: ${(e as Error).message}`,
        );
      }
    })
    .sort((a, b) => b.published.getTime() - a.published.getTime())
    .map((p) => p.meta);
}

/** All posts, newest first. Missing/empty content/notities/ → []. */
export const readAllNotes = (): NoteMeta[] => readNotesFrom(NOTES_DIR);

/** The React-cached variant Server Components call (one read per render). */
export const getAllNotes = cache(readAllNotes);

/**
 * Exported for tests: one post's metadata + raw Markdown body from `dir`, or null
 * if the slug is bad or the file is absent. Bad frontmatter throws, naming the
 * real path (parallel to readNotesFrom).
 */
export function readNoteFrom(
  dir: string,
  slug: string,
): { meta: NoteMeta; content: string } | null {
  if (!SLUG_RE.test(slug)) return null;
  const full = path.join(dir, `${slug}.md`);
  if (!fs.existsSync(full)) return null;
  try {
    const { data, body } = splitFrontmatter(fs.readFileSync(full, "utf8"));
    return { meta: buildMeta(slug, data).meta, content: body };
  } catch (e) {
    throw new Error(`${path.relative(process.cwd(), full)}: ${(e as Error).message}`);
  }
}

/** The React-cached variant the article page calls (one read per render). */
export const getNote = cache((slug: string) => readNoteFrom(NOTES_DIR, slug));

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
