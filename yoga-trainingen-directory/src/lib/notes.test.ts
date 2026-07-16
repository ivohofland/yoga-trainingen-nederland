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
