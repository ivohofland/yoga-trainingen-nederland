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
