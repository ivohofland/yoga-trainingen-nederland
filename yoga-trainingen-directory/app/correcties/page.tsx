/**
 * The correction route (methodology "Wederhoor en correcties"; decisions #3 and #7).
 *
 * The methodology has promised this page since the first record was published —
 * *"een formele klachten- en correctieprocedure is in ontwikkeling"* — and the site
 * shipped without it. A publication that invites correction and offers no channel is not
 * inviting correction; it is saying it does.
 *
 * NO FORM, AND THAT IS THE HONEST CHOICE. The imported design drew a real form whose
 * confirmation read *"Het verzoek is gelogd bij dit record … U hoort terug op het opgegeven
 * adres."* This is a static export: nothing logs, nothing replies. Shipping that button
 * would have been a promise made by a mechanism that does not exist — the same false
 * statement this project hunts in every record, aimed for once at the reader. The design's
 * FIELDS survive (they are what makes a report checkable); its promise does not. They are
 * pre-filled into a real GitHub issue or a real e-mail, and the page says a person reads it.
 */
import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";
import { generalGithubUrl, generalEmailUrl, CORRECTION_EMAIL } from "@/lib/corrections";
import { nl } from "@/lib/strings";
import prose from "../methodologie/page.module.css";
import styles from "./page.module.css";

export const metadata = {
  title: "Correcties — Yoga-docentenopleidingen",
  description:
    "Feitelijke fouten melden. Correcties worden beoordeeld aan de hand van bronnen, verwerkt in " +
    "de openbare versiegeschiedenis, en nooit stilzwijgend doorgevoerd.",
};

export default function CorrectionsPage() {
  const md = fs.readFileSync(path.join(process.cwd(), "content", "correcties.md"), "utf8");
  const html = marked.parse(md, { async: false }) as string;

  return (
    <main className={prose.prose}>
      {/* The two routes sit ABOVE the procedure, not below it: someone who arrives here has
          already found a mistake, and making them read a page about process before they can
          report it is a channel that would rather not be used. */}
      <h1>{nl.corr.heading}</h1>
      <p>{nl.corr.intro}</p>
      <p className={styles.scope}>{nl.corr.scope}</p>

      <div className={styles.routes}>
        <div className={styles.route}>
          <div className={styles.routeHead}>{nl.corr.publicHeading}</div>
          <p className={styles.routeBody}>{nl.corr.publicBody}</p>
          <a className={styles.routeCta} href={generalGithubUrl} target="_blank" rel="noopener">
            {nl.corr.publicCta} →
          </a>
        </div>

        {/* The confidential route is not a courtesy. If the only channel were public, a school
            that will not dispute a finding in the open would simply not use it — and its
            silence would then read as having nothing to say. That is a finding we would have
            manufactured with our own UI. */}
        <div className={styles.route}>
          <div className={styles.routeHead}>{nl.corr.privateHeading}</div>
          <p className={styles.routeBody}>{nl.corr.privateBody}</p>
          <a className={styles.routeCta} href={generalEmailUrl}>
            {CORRECTION_EMAIL} →
          </a>
        </div>
      </div>

      <div dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  );
}
