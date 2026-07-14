/**
 * The correction route — and the promise it must never make again.
 *
 * There IS a form, and it is not on this site: GitHub's issue form hosts it
 * (.github/ISSUE_TEMPLATE/correctie.yml). Submitting it creates a public, dated issue and
 * mails the owner — a form, a submission and a notification, with no endpoint, no server and
 * no secret anywhere near a static site.
 *
 * What the imported design drew was a form on OUR page, whose confirmation read "Het verzoek
 * is gelogd bij dit record … U hoort terug op het opgegeven adres." Nothing here logs and
 * nothing replies; that button would have promised a machine that does not exist — the exact
 * false statement this project hunts in every record, aimed for once at the reader. So the
 * form is real and the promise is not made: nothing is auto-assessed, no reply is dispatched,
 * a person reads it. These tests hold both halves of that line.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
  const url = new URL(githubCorrectionUrl("Yoga Den Amsterdam", "yoga-den"));
  assert.equal(url.pathname, "/ivohofland/yoga-trainingen-nederland/issues/new");
  // It opens THE FORM, not a blank text box. A text box validates nothing and lets a report
  // arrive with no evidence at all — the one thing that cannot change a record.
  assert.equal(url.searchParams.get("template"), "correctie.yml");
  // …with the record already filled in, keyed by the field's `id` in the template.
  assert.equal(url.searchParams.get("record"), "Yoga Den Amsterdam (yoga-den)");
  assert.match(url.searchParams.get("title") ?? "", /Yoga Den Amsterdam/);
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
  assert.ok(generalGithubUrl.includes("template=correctie.yml"), "the general route opens the form too");
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
  // And it must SAY so, positively — not merely avoid lying by omission. There IS a form now
  // (GitHub hosts it, and submitting really does create the issue and notify the owner), so
  // the honest sentence is no longer "there is no form" — it is what the form does NOT do:
  // nothing is auto-assessed and no reply is dispatched. A person reads it.
  // Newline-tolerant: the prose is hard-wrapped, so a literal phrase can straddle a line break.
  const flat = md.replace(/\s+/g, " ");
  assert.match(flat, /geen automatisch antwoord verstuurd/i);
  assert.match(flat, /niets automatisch beoordeeld/i);
  assert.match(flat, /komt bij een mens terecht/i);
});

test("CORRECTION: the public route is a FORM that submits — and it cannot be sent without evidence", () => {
  // The first cut of this shipped a pre-filled free-text issue, which was under-built: a text
  // box validates nothing, and it lets a correction request arrive with no evidence at all —
  // the one thing that cannot change a record. GitHub's issue form is a real form (typed
  // fields, dropdowns, required answers), submitting it creates the issue, and GitHub mails
  // the owner. A form, a submission and a notification, with no endpoint and no secret.
  const yml = fs.readFileSync(
    path.join(process.cwd(), "..", ".github", "ISSUE_TEMPLATE", "correctie.yml"),
    "utf8",
  );

  // The evidence field exists AND is required. This is the load-bearing one: every fact on the
  // site has a source a reader can check, and a correction without one would be the only thing
  // that doesn't.
  const bewijs = yml.slice(yml.indexOf("id: bewijs"));
  assert.match(bewijs.slice(0, 600), /required:\s*true/, "the Bewijs-URL must be required, not merely asked for");

  for (const id of ["id: record", "id: veld", "id: onjuist", "id: bewijs", "id: relatie"]) {
    assert.ok(yml.includes(id), `the issue form is missing ${id} — the design's fields are what make a report checkable`);
  }
  // A public issue is permanent. The reporter is told so before they send it, not after.
  assert.match(yml, /openbaar en gedateerd is, en blijft staan/);
  // And the no-GitHub route is offered right there in the form, for the school that has no
  // account and will not make one to complain. Asserted against CORRECTION_EMAIL, not a
  // literal: what must hold is that the code and the template name the SAME address.
  assert.ok(
    yml.includes(CORRECTION_EMAIL),
    `the issue form does not offer ${CORRECTION_EMAIL} — the no-GitHub route vanishes`,
  );
});

test("CORRECTION: the chooser offers the private route — and never as a mailto, which GitHub eats", () => {
  // FOUND BY OPENING THE PAGE, not by reading the docs. The chooser's contact link was a
  // `url: mailto:` to the correction address, and GitHub SILENTLY DROPPED THE ROW: it renders
  // contact links only for http(s) URLs, and documents this nowhere. The chooser then showed
  // the public form and NO private route at all — exactly the state the two-channel design
  // exists to prevent, because a school unwilling to complain in public would have found no
  // other door, and its silence would then have read as having nothing to say.
  const cfg = fs.readFileSync(
    path.join(process.cwd(), "..", ".github", "ISSUE_TEMPLATE", "config.yml"),
    "utf8",
  );
  const urls = [...cfg.matchAll(/^\s*url:\s*(\S+)/gm)].map((m) => m[1]);
  assert.ok(urls.length > 0, "the chooser offers no contact link at all");
  for (const u of urls) {
    assert.ok(
      u.startsWith("https://"),
      `contact_links url "${u}" is not http(s) — GitHub will drop the row without a word, and the ` +
        `private route will vanish from the chooser. Put the address in the link's \`about\` text.`,
    );
  }
  // The address must still be REACHABLE from the chooser — in the text, since it cannot be the href.
  assert.ok(
    cfg.includes(CORRECTION_EMAIL),
    "the confidential route must be discoverable in the chooser",
  );
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

test("CORRECTION: the retired personal address survives in no tracked file", () => {
  // The confidential route is a ROLE address now, and this test is why it stays one.
  // The old address was a person's inbox. Leaving it behind in even one tracked file
  // would have put a personal inbox back on a public page, harvestable, the day the
  // site went live. Remembering is not a mechanism.
  //
  // Built with join() and never written out: a test that spells the string it forbids
  // is a test that fails itself.
  const RETIRED = ["ivo", "ivohofland.nl"].join("@");
  const root = path.join(process.cwd(), "..");

  // TRACKED files, not every file on disk: what is committed is what is published.
  // (It also keeps a scratch note in the working tree from failing a suite about the
  // published surface.)
  const tracked = execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);

  const offenders = tracked.filter((f) => {
    const abs = path.join(root, f);
    return fs.existsSync(abs) && fs.readFileSync(abs, "utf8").includes(RETIRED);
  });

  assert.deepEqual(
    offenders,
    [],
    `the retired address is still in: ${offenders.join(", ")} — the address is defined ONCE, in CORRECTION_EMAIL`,
  );
});
