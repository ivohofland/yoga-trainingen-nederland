/**
 * THE CORRECTION ROUTE (methodology "Wederhoor en correcties"; decision #3, #7).
 *
 * The methodology has promised this from day one — *"Iedereen kan fouten melden … Gegronde
 * meldingen worden verwerkt met bronvermelding … Stilzwijgende correcties bestaan hier
 * niet"* — and until now the site offered no way to do it. A publication that invites
 * correction and provides no channel is not inviting correction.
 *
 * THERE IS A REAL FORM, AND IT IS NOT ON THIS SITE — which is the whole trick.
 * `.github/ISSUE_TEMPLATE/correctie.yml` is a GitHub **issue form**: typed fields, dropdowns,
 * required answers, a Bewijs-URL that cannot be left blank. Submitting it CREATES the issue —
 * public, dated, permanent — and GitHub mails the owner. A form, a submission, and a
 * notification, with **no endpoint, no server and no secret** anywhere near a static site.
 *
 * The first cut of this shipped a pre-filled free-text issue instead, and that was under-built:
 * a text box is not a form, it validates nothing, and it lets a report arrive with no evidence
 * at all — the one thing that cannot change a record. The fields are the point.
 *
 * WHAT WE STILL DO NOT DO is post to the GitHub API from our own form. That needs a token with
 * issue-write scope, and a token in a static site is a token anyone can lift. GitHub hosts the
 * form; we hand it the record.
 *
 * TWO CHANNELS, AND THE SECOND ONE IS NOT A CONVENIENCE. A public issue is dated, permanent
 * and visible to everyone — exactly right for "no silent corrections", and exactly wrong for a
 * school that wants to dispute a finding without doing it in public. It also requires a GitHub
 * account, which most yoga-school owners do not have and will not create in order to complain.
 * If the only route were public, those schools simply would not use it — and their silence
 * would then read as having nothing to say. That is a finding we would have manufactured with
 * our own UI.
 *
 * PURE — no node:*, no fetch. The record page and the corrections page both build these, and
 * a test holds the URLs to what they claim to contain.
 */
import { nl } from "./strings";

/** Public, dated, permanent. The audit trail the methodology promises readers. */
const REPO = "https://github.com/ivohofland/yoga-trainingen-nederland";
/** Not public. For anyone who will not dispute a finding in the open — usually the school. */
export const CORRECTION_EMAIL = "ivo@ivohofland.nl";

/**
 * The template both channels carry. It is the design's field list, and the fields are the
 * point: "this is wrong" cannot change a record, and a form that does not ask for evidence
 * is a form that invites exactly that. The reporter is asked what we would have to check.
 *
 * `providerName`/`providerId` are filled in; everything else is left blank ON PURPOSE. We
 * never pre-fill an opinion into someone's mouth, and we never put a person's own details
 * into a URL — the blanks are theirs to fill, in their own client.
 */
export function correctionTemplate(providerName: string, providerId: string): string {
  return [
    `${nl.corr.tplRecord}: ${providerName} (${providerId})`,
    `${nl.corr.tplUrl}: ${REPO}/blob/main/yoga-trainingen-directory/data/providers/${providerId}.yaml`,
    "",
    `${nl.corr.tplField}: `,
    `  (${nl.corr.fieldOptions.join(" / ")})`,
    "",
    `${nl.corr.tplWrong}:`,
    "",
    "",
    `${nl.corr.tplRight}:`,
    "",
    "",
    `${nl.corr.tplEvidence}:`,
    `  (${nl.corr.tplEvidenceHint})`,
    "",
    "",
    `${nl.corr.tplRole}: `,
    `  (${nl.corr.roleOptions.join(" / ")})`,
    "",
  ].join("\n");
}

/**
 * A pre-filled PUBLIC correction request — and A REAL FORM, not a text box.
 *
 * `.github/ISSUE_TEMPLATE/correctie.yml` is a GitHub **issue form**: typed fields, dropdowns,
 * required answers, and a Bewijs-URL that cannot be left blank. Submitting it creates the
 * issue — dated, public, permanent — and GitHub mails the repo owner, who is the person who
 * has to act on it. A form, an issue, and a notification, with **no endpoint, no server and
 * no token** anywhere near a static site. That last part is why it is this and not a form of
 * our own posting to the GitHub API: a browser-side token with issue-write scope is a token
 * anyone can lift and abuse.
 *
 * WHAT IT CANNOT DO is serve someone without a GitHub account — which is most yoga-school
 * owners, and precisely the people most likely to want to dispute a finding. That is not a
 * gap in the form; it is the reason the confidential e-mail route exists and is not optional.
 *
 * We pre-fill only `record`, keyed by the field's `id` in the template. Everything the
 * reporter asserts, they type.
 */
export function githubCorrectionUrl(providerName: string, providerId: string): string {
  const params = new URLSearchParams({
    template: "correctie.yml",
    title: nl.corr.issueTitle(providerName),
    record: `${providerName} (${providerId})`,
  });
  return `${REPO}/issues/new?${params.toString()}`;
}

/**
 * A pre-filled CONFIDENTIAL correction request. Nothing about it is published but its outcome.
 *
 * PERCENT-ENCODED BY HAND, and not with URLSearchParams — which is what the http route uses,
 * and which would be a bug here. URLSearchParams is `application/x-www-form-urlencoded`: it
 * writes a space as `+`. A mail client follows RFC 6068 and reads `+` as a literal plus, so
 * the school would have received a correction request about "Yoga+Den+Amsterdam". The two
 * encodings look interchangeable and are not.
 */
export function emailCorrectionUrl(providerName: string, providerId: string): string {
  const subject = encodeURIComponent(nl.corr.issueTitle(providerName));
  const body = encodeURIComponent(correctionTemplate(providerName, providerId));
  return `mailto:${CORRECTION_EMAIL}?subject=${subject}&body=${body}`;
}

/** The general routes, for a reader who is not looking at one particular record. */
export const generalGithubUrl = `${REPO}/issues/new?template=correctie.yml`;
export const generalEmailUrl = `mailto:${CORRECTION_EMAIL}`;
