/**
 * Methodology. Renders content/methodologie.md — the real, authored document,
 * not a summary. This page is the credibility anchor: everything the listing
 * does is justified here.
 */
import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";
import styles from "./page.module.css";

export const metadata = {
  title: "Methode — Yoga-docentenopleidingen",
  description: "Hoe dit onderzoek wordt gedaan: bronnen, vier noteringswaarden, diepteniveaus, wederhoor.",
};

export default function MethodologyPage() {
  const md = fs.readFileSync(path.join(process.cwd(), "content", "methodologie.md"), "utf8");
  const html = marked.parse(md, { async: false }) as string;
  return (
    <main className={styles.prose} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
