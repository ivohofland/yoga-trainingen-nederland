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

test("renderFeed escapes XML entities in category", () => {
  const xml = renderFeed([{ ...post, cat: "R&D" }]);
  assert.ok(xml.includes("<category>R&amp;D</category>"));
});
