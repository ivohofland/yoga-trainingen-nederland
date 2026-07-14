/**
 * THE CORRECTION ROUTE (methodology "Wederhoor en correcties"; decision #3, #7).
 *
 * The methodology has promised this from day one — *"Iedereen kan fouten melden … Gegronde
 * meldingen worden verwerkt met bronvermelding … Stilzwijgende correcties bestaan hier
 * niet"* — and until now the site offered no way to do it. A publication that invites
 * correction and provides no channel is not inviting correction.
 *
 * WHY LINKS AND NOT A FORM. The imported design drew a real form, with a submit button and
 * a confirmation reading *"Het verzoek is gelogd bij dit record … U hoort terug op het
 * opgegeven adres."* This site is a static export. It has no endpoint, nothing is logged
 * automatically, and no reply is dispatched by anything. Shipping that form would have been
 * a promise made by a button that does nothing — the exact species of false statement the
 * whole project exists to prevent, aimed for once at the reader instead of at a school. So
 * the fields survive, the promise does not: they are pre-filled into a real GitHub issue or
 * a real e-mail, and the page says plainly that a person reads it.
 *
 * TWO CHANNELS, AND THE SECOND ONE IS NOT A CONVENIENCE. A public issue is dated, permanent
 * and visible to everyone — which is exactly right for "no silent corrections", and exactly
 * wrong for a school that wants to dispute a finding without doing it in public. If the only
 * route were public, some schools would simply not use it, and their silence would then read
 * as having nothing to say. That would be a finding we manufactured with our own UI.
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

/** A pre-filled PUBLIC correction request. Dated and permanent the moment it is opened. */
export function githubCorrectionUrl(providerName: string, providerId: string): string {
  const params = new URLSearchParams({
    title: nl.corr.issueTitle(providerName),
    body: correctionTemplate(providerName, providerId),
    labels: "correctie",
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
export const generalGithubUrl = `${REPO}/issues/new?labels=correctie`;
export const generalEmailUrl = `mailto:${CORRECTION_EMAIL}`;
