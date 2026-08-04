/**
 * WHERE A PUBLIC ARCHIVE PROVES NOTHING.
 *
 * The publication bar is two snapshots per source: a public one (Wayback, or
 * archive.today for excluded domains) and a dated local copy. They cover each other's
 * weakness — a public archive is independent but can be withdrawn by the site owner; a
 * local copy cannot be withdrawn but is less independent.
 *
 * For three kinds of page, the public half is not merely weak — it is EMPTY, and recording
 * it is worse than recording nothing, because the record then claims an evidentiary
 * backing it does not have and the site renders "publiek ✓" over it:
 *
 *   - **Yoga Alliance registers** (app.yogaalliance.org) are Salesforce-rendered. Wayback
 *     stores the JS shell: header, footer, and no register data at all. The registration
 *     we cite is not in the snapshot.
 *   - **The YA Help Center** (help.yogaalliance.org) is the same Salesforce shell as the
 *     register. Measured, not assumed — see the entry in the list below.
 *   - **The CRKBO register** (crkbo.nl/Register/…) is a SEARCH interface with no permalink
 *     per row. Wayback captures page 1 of the register; it never captures the searched
 *     row — and for a CRKBO check the finding is usually a NEGATIVE ("0 hits for this
 *     school"), which no snapshot of page 1 can evidence either way.
 *
 * In every case the browser-rendered local copy — filtered, if the page was a search — is
 * the evidence, and the public half is honestly absent (`public_archive: {kind: impossible}`).
 * The record then says "publiek n.v.t. (niet vast te leggen) · lokaal ✓" — NOT "publiek — · lokaal ✓",
 * which this comment claimed for a while. That distinction is the quad rule again: "—"
 * (`archiveAbsent`) means WE HAVE NOT DONE IT, a gap; "n.v.t." (`archiveNotApplicable`)
 * means IT CANNOT BE DONE, a finding. Printing the gap over a correct decision of ours
 * mis-reported twelve sources as holes in the research, which is why `strings.ts` has two
 * separate values for it.
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
  // The YA HELP CENTER is the same Salesforce shell as the register, and it was measured,
  // not assumed: the Wayback snapshot of the electives article (web.archive.org/web/
  // 20260731195006/, measured 2026-07-31 — recorded here because `public_archive` is
  // `{kind: impossible}` by design, so nothing else in the repo names the capture) is
  // 525.967 bytes of JavaScript containing 78 characters of visible text — "Yoga Alliance | Help Center --> Loading
  // × Sorry to interrupt CSS Error Refresh". Not a word of the article. The Playwright
  // local capture renders it in full, so the local copy is the evidence and the public half
  // is honestly absent. (WebFetch hit the same wall, which is what sent us to check.)
  /help\.yogaalliance\.org/i,
  /crkbo\.nl\/Register\//i,
];

/** Would a public (Wayback) snapshot of this URL be evidentially empty? See above. */
export function waybackIsPointless(url: string): boolean {
  return WAYBACK_POINTLESS.some((re) => re.test(url));
}

/** Why, in Dutch, for the record and the reader.
 *
 *  Per domain, not one catch-all: the Salesforce branch used to say "zonder registergegevens"
 *  for every non-CRKBO hit, which is true of the YA register and false of the YA Help Center —
 *  a help article has no register data to lose. A reason that misdescribes the page it explains
 *  is worse than none, because it is the sentence a reader is given for an absent archive. */
export function waybackPointlessReason(url: string): string {
  if (/crkbo/i.test(url))
    return "zoekregister zonder permalink: Wayback legt alleen pagina 1 vast, nooit de gezochte rij";
  if (/help\.yogaalliance\.org/i.test(url))
    return "JS-shell (Salesforce): Wayback bewaart alleen het omhulsel, geen letter van het artikel";
  return "JS-shell (Salesforce): Wayback bewaart header/footer zonder registergegevens";
}
