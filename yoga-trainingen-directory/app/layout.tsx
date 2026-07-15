import type { ReactNode } from "react";
import Link from "next/link";
import { Newsreader, IBM_Plex_Mono } from "next/font/google";
import { nl } from "@/lib/strings";
import { Nav } from "./Nav";
import "./globals.css";
import styles from "./layout.module.css";

// Self-hosted at build time by next/font — no runtime request to
// fonts.googleapis.com (faster, and no third-party font call from a Dutch
// public site).
const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});

export const metadata = {
  title: "Yoga-docentenopleidingen — onafhankelijk onderzoek",
  description:
    "Onafhankelijk, feitelijk overzicht van yoga-docentenopleidingen in Nederland. " +
    "Bronnen bij elk gegeven, beweringen letterlijk geciteerd, geen scores of ranglijsten.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl" className={`${newsreader.variable} ${plexMono.variable}`}>
      <body>
        <div className={styles.shell}>
          <header className={styles.masthead}>
            <Link href="/" className={styles.brand}>
              <div className={styles.overline}>{nl.overline}</div>
              <h1 className={styles.title}>{nl.title}</h1>
            </Link>
            <Nav />
          </header>

          {children}

          <footer className={styles.footer}>
            <span>{nl.footLeft}</span>
            <span>
              {nl.footRight} ·{" "}
              <a href={nl.githubUrl} target="_blank" rel="noopener">
                {nl.footGithub}
              </a>
            </span>
          </footer>
        </div>
      </body>
    </html>
  );
}
