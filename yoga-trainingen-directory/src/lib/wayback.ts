/**
 * WHERE A PUBLIC ARCHIVE PROVES NOTHING.
 *
 * The publication bar is two snapshots per source: a public one (Wayback, or
 * archive.today for excluded domains) and a dated local copy. They cover each other's
 * weakness — a public archive is independent but can be withdrawn by the site owner; a
 * local copy cannot be withdrawn but is less independent.
 *
 * For two kinds of page, the public half is not merely weak — it is EMPTY, and recording
 * it is worse than recording nothing, because the record then claims an evidentiary
 * backing it does not have and the site renders "publiek ✓" over it:
 *
 *   - **Yoga Alliance registers** (app.yogaalliance.org) are Salesforce-rendered. Wayback
 *     stores the JS shell: header, footer, and no register data at all. The registration
 *     we cite is not in the snapshot.
 *   - **The CRKBO register** (crkbo.nl/Register/…) is a SEARCH interface with no permalink
 *     per row. Wayback captures page 1 of the register; it never captures the searched
 *     row — and for a CRKBO check the finding is usually a NEGATIVE ("0 hits for this
 *     school"), which no snapshot of page 1 can evidence either way.
 *
 * In both cases the browser-rendered local copy — filtered, if the page was a search — is
 * the evidence, and the public half is honestly absent (`archived_url: null`). The record
 * then says "publiek — · lokaal ✓", which is true, instead of "publiek ✓", which is not.
 *
 * THE ARCHIVER HAS SKIPPED THESE DOMAINS FOR A WHILE; NOTHING STOPPED A RECORD FROM
 * CARRYING THE URL ANYWAY. Twelve did — captured before the rule existed, and left behind
 * when it arrived, because the rule lived in the archive SCRIPT and the data was never
 * held to it. One of the twelve (namaste-studios' YA profile) had been 404ing for weeks:
 * a public archive that does not exist, cited as though it did. So the list lives HERE,
 * pure and importable, and `integrityErrors` enforces it on every load — the archiver and
 * the validator now read the same rule, and a record cannot disagree with the script that
 * wrote it.
 */

/** Domains where a Wayback snapshot cannot evidence the thing we cite the page for. */
export const WAYBACK_POINTLESS: readonly RegExp[] = [
  /app\.yogaalliance\.org/i,
  /crkbo\.nl\/Register\//i,
];

/** Would a public (Wayback) snapshot of this URL be evidentially empty? See above. */
export function waybackIsPointless(url: string): boolean {
  return WAYBACK_POINTLESS.some((re) => re.test(url));
}

/** Why, in Dutch, for the record and the reader. */
export function waybackPointlessReason(url: string): string {
  return /crkbo/i.test(url)
    ? "zoekregister zonder permalink: Wayback legt alleen pagina 1 vast, nooit de gezochte rij"
    : "JS-shell (Salesforce): Wayback bewaart header/footer zonder registergegevens";
}
