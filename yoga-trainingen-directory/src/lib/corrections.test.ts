/**
 * The correction route — and the promise it must never make again.
 *
 * The imported design drew a real form with a real submit button and a confirmation that
 * read "Het verzoek is gelogd bij dit record … U hoort terug op het opgegeven adres." This
 * site is a static export: nothing logs, nothing replies, and no endpoint exists to receive
 * it. Shipping that button would have made a promise no mechanism could keep — the exact
 * false statement this project hunts in every record, aimed for once at the reader.
 *
 * So the fields survived and the promise did not, and these tests hold the line.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  CORRECTION_EMAIL,
  correctionTemplate,
  emailCorrectionUrl,
  generalGithubUrl,
  githubCorrectionUrl,
} from "./corrections";
import { nl } from "./strings";

test("CORRECTION: a report arrives pre-filled with the record it is about", () => {
  // A reader who has found a mistake is looking at the mistake, not at a form. Both routes
  // carry the record's identity so the report costs them the FIELDS and nothing else.
  const url = githubCorrectionUrl("Yoga Den Amsterdam", "yoga-den");
  assert.ok(url.startsWith("https://github.com/ivohofland/yoga-trainingen-nederland/issues/new?"));

  const body = decodeURIComponent(new URL(url).searchParams.get("body") ?? "");
  assert.match(body, /Yoga Den Amsterdam \(yoga-den\)/, "the record must identify itself");
  assert.match(body, /data\/providers\/yoga-den\.yaml/, "and point at the data the claim lives in");
  assert.match(body, /Bewijs-URL/, "a report we cannot check cannot change a record — so it is asked for");

  const title = new URL(url).searchParams.get("title") ?? "";
  assert.match(title, /Yoga Den Amsterdam/);
});

test("CORRECTION: the template asks for evidence and leaves the reporter's words to them", () => {
  const body = correctionTemplate("Yoga Den Amsterdam", "yoga-den");
  for (const field of [nl.corr.tplWrong, nl.corr.tplRight, nl.corr.tplEvidence, nl.corr.tplRole]) {
    assert.ok(body.includes(field), `the template drops "${field}" — the design asked for it, and it is what makes a report checkable`);
  }
  // We fill in the RECORD and nothing else. Pre-filling an opinion into someone's mouth, or
  // their own details into a URL, are both things this project does not do.
  assert.ok(!/naam:\s*\S/i.test(body), "no personal data is pre-filled into a URL");
  assert.ok(!body.includes("onjuist omdat"), "no opinion is put in the reporter's mouth");
});

test("CORRECTION: both routes exist, and the confidential one is not optional", () => {
  // If the ONLY channel were public, a school unwilling to dispute a finding in the open
  // would simply not use it — and its silence would then read as having nothing to say.
  // That is a finding we would have manufactured with our own UI, on a site whose entire
  // point is not doing that.
  const mail = emailCorrectionUrl("Yoga Den Amsterdam", "yoga-den");
  assert.ok(mail.startsWith(`mailto:${CORRECTION_EMAIL}?`));
  assert.match(decodeURIComponent(mail), /Yoga Den Amsterdam \(yoga-den\)/);
  assert.ok(generalGithubUrl.includes("/issues/new"));
});

test("CORRECTION: the page never promises a mechanism that does not exist", () => {
  // THE LOAD-BEARING TEST. The design's confirmation screen promised automatic logging and a
  // guaranteed reply. There is no endpoint, no database and no mailer in a static export. If
  // someone reinstates that copy, this fails.
  // COMMENTS ARE STRIPPED, and the first run of this test is why: the page's own header
  // quotes the design's rejected promise in order to explain why it is rejected. A guard that
  // cannot tell a rule from its documentation would force us to stop writing down the reason —
  // which is the one thing that keeps the rule from being reinstated by someone who never knew
  // it existed. It reads what a READER sees: the rendered strings and the prose.
  const source = fs.readFileSync(path.join(process.cwd(), "app", "correcties", "page.tsx"), "utf8");
  const page = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const md = fs.readFileSync(path.join(process.cwd(), "content", "correcties.md"), "utf8");
  const copy = page + md + JSON.stringify(nl.corr);

  const promisesAMachine = [
    /gelogd bij dit record/i, // nothing logs automatically
    /u hoort terug/i, // nothing replies automatically
    /automatisch (verwerkt|geregistreerd|bevestigd)/i,
    /verzoek is geregistreerd/i,
  ];
  for (const re of promisesAMachine) {
    assert.doesNotMatch(
      copy,
      re,
      `the correction page promises something no mechanism here performs (${re}). A static export ` +
        `has no endpoint: a person reads these. Say that instead.`,
    );
  }
  // And it must SAY so, positively — not merely avoid lying by omission.
  assert.match(md, /geen formulier dat iets automatisch registreert/i);
  assert.match(md, /geen automatisch\s*\n?antwoord/i);
});

test("CORRECTION: the procedure refuses what a correction channel must refuse", () => {
  const md = fs.readFileSync(path.join(process.cwd(), "content", "correcties.md"), "utf8");
  // A channel that entertains "please delete that verbatim quote" is not a correction
  // channel, it is a takedown queue — and this site's entire evidentiary basis is verbatim
  // quotation with a source (§3, citaatrecht).
  assert.match(md, /een letterlijk citaat met bronvermelding is geen fout/i);
  assert.match(md, /Buiten scope/i);
  // And it commits to publishing its own rejections.
  assert.match(md, /Stilzwijgende correcties bestaan hier niet/i);
  assert.match(md, /Afwijzing/i);
});

test("CORRECTION: the methodology's promised channel actually exists and is linked", () => {
  // The methodology told readers for weeks that a correction channel was open. It was not.
  // A publication that invites correction and offers no route is not inviting correction.
  const method = fs.readFileSync(path.join(process.cwd(), "content", "methodologie.md"), "utf8");
  assert.match(method, /\/correcties/, "the methodology must link the channel it promises");
  assert.ok(
    fs.existsSync(path.join(process.cwd(), "app", "correcties", "page.tsx")),
    "…and the channel must exist",
  );
  // The response window was left as a draft decision ("de definitieve termijn wordt vastgelegd
  // vóór de eerste ronde"). The first round is imminent, so it is fixed: four weeks.
  assert.doesNotMatch(method, /conceptbeslissing/, "the response window is no longer provisional");
  assert.match(method, /vier weken/);
  // And the silence rule from v0.11 is stated to readers, not just enforced in code.
  assert.match(method, /nooit vóórdat die termijn is verstreken/i);
});
