/**
 * Methodology. Renders content/methodologie.md — the real, authored document,
 * not a summary. This page is the credibility anchor: everything the listing
 * does is justified here.
 */
import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";
import { CITATION_RE } from "@/lib/citations";
import styles from "./page.module.css";

export const metadata = {
  title: "Methode — Yoga-docentenopleidingen",
  description: "Hoe dit onderzoek wordt gedaan: bronnen, vier noteringswaarden, diepteniveaus, wederhoor.",
};

export default function MethodologyPage() {
  const md = fs.readFileSync(path.join(process.cwd(), "content", "methodologie.md"), "utf8");
  // Substituted BEFORE marked.parse, so the marker becomes a real markdown link rather
  // than surviving into the HTML as literal text a reader would see.
  const cited = md.replace(new RegExp(CITATION_RE.source, "g"), (_m, id) => `[${id}](/referenties#${id})`);
  const html = marked.parse(cited, { async: false }) as string;
  return (
    <main className={styles.prose} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
