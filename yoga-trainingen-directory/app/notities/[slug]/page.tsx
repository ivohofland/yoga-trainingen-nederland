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
