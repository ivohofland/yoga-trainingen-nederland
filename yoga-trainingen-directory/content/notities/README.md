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

**`cat` must never be `"Alle"`.** That word is reserved for the listing's
show-all filter button (`categories()` returns the real cats, and the button is
prepended in front of them) — a post categorised `"Alle"` would collide with it
and become unreachable as its own filter.

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
