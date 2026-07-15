"use client";

/**
 * The masthead nav, as a client island — the ONE reason it isn't part of the
 * server-rendered layout. A static export prerenders each page separately, and
 * the shared `RootLayout` cannot know which page it wraps; `usePathname()` can.
 * It resolves to the route being prerendered (so the active state ships in the
 * static HTML, not just after hydration) and updates on client navigation.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { nl } from "@/lib/strings";
import styles from "./layout.module.css";

// `correcties` sits IN the nav, not buried in a footer: the methodology tells
// readers they can correct this site, and a channel they have to go looking for
// is a channel that would rather not be found.
const items = [
  { href: "/", label: nl.navDirectory },
  { href: "/methodologie", label: nl.navMethod },
  { href: "/correcties", label: nl.corr.navLabel },
] as const;

// A provider record (`/aanbieder/<id>`) is a drill-down from the overview, so
// "Overzicht" stays lit there — otherwise those pages would show no active item
// at all. Every other link matches its own path or a nested path beneath it.
function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/aanbieder");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className={styles.nav}>
      {items.map(({ href, label }) => {
        const active = isActive(href, pathname);
        return (
          <Link
            key={href}
            href={href}
            className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
            // The accessible half of the active state: a screen reader announces
            // the current page, not just its colour.
            aria-current={active ? "page" : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
