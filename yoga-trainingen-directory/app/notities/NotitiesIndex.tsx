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
  const [cat, setCat] = useState<string>(allLabel);

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
