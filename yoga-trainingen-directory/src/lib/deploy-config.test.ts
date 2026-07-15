/**
 * Two silent-failure modes in the deploy chain that nothing else in this repo pins.
 *
 * 1. `deploy/hooks.json`'s 403. adnanh/webhook's OWN DEFAULT for a rule mismatch is 200 —
 *    an unsigned POST, or one signed with the wrong secret, would look exactly like an
 *    accepted deploy to anyone reading HTTP status codes. `trigger-rule-mismatch-http-
 *    response-code: 403` is the one line that makes a refusal look like a refusal, and it
 *    is operator-editable JSON with nothing in the type system holding it.
 * 2. `deploy.yml` watching a workflow name that no longer exists. `workflow_run` fails
 *    CLOSED but SILENT on a name mismatch (see deploy.yml's own comment: "the trigger
 *    simply never fires") — a rename of validate.yml's `name:` (or a typo here) ends every
 *    future deploy, green, with no error anywhere a human would look.
 *
 * Both are read as TEXT/JSON off disk, not exercised — there is no webhook listener or
 * GitHub Actions runner in a unit test. What is pinned is the CONFIGURATION that, if it
 * silently drifted, would turn every subsequent refusal or non-deploy into a false "✓".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "..");

test("DEPLOY: the webhook hook refuses a rule mismatch with 403, not webhook's default 200", () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(ROOT, "deploy", "hooks.json"), "utf8")) as Array<{
    id: string;
    "trigger-rule-mismatch-http-response-code"?: number;
    "trigger-rule"?: { match?: { type?: string } };
  }>;
  const hook = hooks.find((h) => h.id === "deploy-yoga-trainingen");
  assert.ok(hook, "deploy/hooks.json has no hook with id deploy-yoga-trainingen");

  assert.equal(
    hook!["trigger-rule-mismatch-http-response-code"],
    403,
    "without this, adnanh/webhook answers 200 to a rule mismatch — every rejected POST " +
      "(unsigned, wrongly signed) would read as an accepted deploy",
  );
  assert.equal(
    hook!["trigger-rule"]?.match?.type,
    "payload-hmac-sha256",
    "the hook must verify an HMAC signature, not merely accept any POST to the URL",
  );
});

test("DEPLOY: deploy.yml watches the exact workflow name validate.yml declares", () => {
  const validateYml = fs.readFileSync(path.join(ROOT, ".github", "workflows", "validate.yml"), "utf8");
  const deployYml = fs.readFileSync(path.join(ROOT, ".github", "workflows", "deploy.yml"), "utf8");

  const nameMatch = validateYml.match(/^name:\s*(\S+)/m);
  assert.ok(nameMatch, "validate.yml has no top-level `name:` — nothing to couple against");
  const workflowName = nameMatch![1];

  // `workflow_run` fires on an EXACT name match and no-ops otherwise (deploy.yml's own
  // header comment). A rename on either side that isn't mirrored on the other silently
  // stops every future deploy — no failed run, no red check, nothing.
  assert.match(
    deployYml,
    new RegExp(`workflows:\\s*\\[\\s*["']${workflowName}["']\\s*\\]`),
    `deploy.yml does not watch workflow "${workflowName}" (validate.yml's actual name) — ` +
      `a rename of either file would silently end all deploys`,
  );
});
