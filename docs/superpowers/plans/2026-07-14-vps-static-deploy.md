# research.ivohofland.nl static deploy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship this site at `research.ivohofland.nl` as a CloudPanel **static** site on the existing VPS — pull-based auto-deploy, its own webhook listener, no app process — and retire the personal correction address in favour of a role address before anything is published.

**Architecture:** The site has no server in it (zero route handlers, zero server actions, no middleware), so `next build` becomes a static export and nginx serves the bytes. `deploy/deploy.sh` runs on the VPS, pulls, runs `npm run build` — which *is* the editorial gate chain — and only then rsyncs `out/` into the docroot. A failed gate aborts before the swap, so the last good build stays live. GitHub only sends a signed HMAC ping after the `validate` workflow passes; no inbound SSH.

**Tech Stack:** Next.js 15 (App Router, `output: "export"`), Node 22, `node:test` via `tsx`, adnanh/webhook, systemd, nginx (CloudPanel), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-07-14-vps-static-deploy-design.md`

## Global Constraints

- **All `npm` commands run from `yoga-trainingen-directory/`.** Never from the repo root.
- **Node 22** (matches `.github/workflows/validate.yml` and the VPS).
- **Never move or delete the author's files.** Archive bodies (`data/archives/**/*.html|*.pdf`) are gitignored, live on one machine, and are unrecoverable. Nothing in this plan touches them.
- **`npm run build` is the gate chain** — gen-schema → validate → provenance → test → test:ci → export-json → next build. It must stay green at every commit.
- **The correction address is defined exactly once**, in `CORRECTION_EMAIL` (`src/lib/corrections.ts`). The new value is `research@ivohofland.nl`.
- **The retired personal address is never written out** — not in code, not in comments, not in this plan, not in the spec. Task 1 adds a test that enforces this. A file that spells it out fails that test, including this one.
- **Site facts** (used verbatim in several files): Linux user `ivohofland-research`; checkout `/home/ivohofland-research/src/yoga-trainingen`; docroot `/home/ivohofland-research/htdocs/research.ivohofland.nl`; webhook port `9001`; hook id `deploy-yoga-trainingen`; systemd unit `webhook-yoga-research.service`.

---

### Task 1: Retire the personal correction address

**Files:**
- Modify: `yoga-trainingen-directory/src/lib/corrections.ts:39`
- Modify: `yoga-trainingen-directory/src/lib/corrections.test.ts` (imports; lines ~127, ~130-152; new test)
- Modify: `.github/ISSUE_TEMPLATE/config.yml` (lines 7-14 comment, 17, 21)
- Modify: `.github/ISSUE_TEMPLATE/correctie.yml` (line 14)
- Modify: `docs/superpowers/specs/2026-07-14-vps-static-deploy-design.md` (§6.3 — it currently prints the address it is retiring)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `CORRECTION_EMAIL: string = "research@ivohofland.nl"` — the single definition. `emailCorrectionUrl()` and `generalEmailUrl` already derive from it and need no change.

**Why it is a test and not a find-and-replace:** the address lives in five places, and the two that matter most are in *another directory* (`.github/`, which the Next app never imports). The existing tests already guard "the code and the templates agree" — they just do it by matching a hardcoded literal, which cannot survive the address changing. Re-point them at the constant and add a guard that the retired address survives in no tracked file, and the invariant outlives this task.

- [ ] **Step 1: Write the failing test**

In `yoga-trainingen-directory/src/lib/corrections.test.ts`, add `execFileSync` to the imports:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
```

Append this test at the end of the file:

```ts
test("CORRECTION: the retired personal address survives in no tracked file", () => {
  // The confidential route is a ROLE address now, and this test is why it stays one.
  // The old address was a person's inbox, and it lived in five places — the constant,
  // three lines of the issue chooser, one line of the issue form — of which only one
  // is in this app's source tree at all. Any one of them left behind would have put a
  // personal inbox back on a public page, harvestable, the day the site went live.
  // Remembering is not a mechanism.
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
```

Then re-point the two existing assertions from the literal at the constant. Replace line ~127:

```ts
  // And the no-GitHub route is offered right there in the form, for the school that has no
  // account and will not make one to complain. Asserted against CORRECTION_EMAIL, not a
  // literal: what must hold is that the code and the template name the SAME address.
  assert.ok(
    yml.includes(CORRECTION_EMAIL),
    `the issue form does not offer ${CORRECTION_EMAIL} — the no-GitHub route vanishes`,
  );
});
```

…and the second one (in the chooser test), replacing both its comment's reference to the old address and the literal assertion:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd yoga-trainingen-directory && npm test
```

Expected: FAIL. The guard reports exactly **four** offenders, in this order:

```
  .github/ISSUE_TEMPLATE/config.yml
  .github/ISSUE_TEMPLATE/correctie.yml
  docs/superpowers/specs/2026-07-14-vps-static-deploy-design.md
  yoga-trainingen-directory/src/lib/corrections.ts
```

(There were five before Step 1: `corrections.test.ts` itself held the address, in the two assertions you just re-pointed at the constant. Those two still *pass* here, because the constant still holds the old value — they go red only if you change the constant and forget a template, which is the drift they exist to catch.)

- [ ] **Step 3: Swap the address at its single definition**

`yoga-trainingen-directory/src/lib/corrections.ts:38-39` — replace those two lines:

```ts
/**
 * Not public. For anyone who will not dispute a finding in the open — usually the school.
 *
 * A ROLE ADDRESS, not a person's. It is published on a public page as a `mailto:`, which is
 * a harvester's dinner; a role address can be filtered, forwarded or retired without touching
 * anyone's inbox. It is NOT obfuscated, and that is deliberate: a channel that is awkward for
 * a school to use is a channel that manufactures the silence this one exists to prevent.
 *
 * It is also the ONLY definition. A test holds that the retired personal address appears in
 * no tracked file, and that this one appears in both issue templates.
 */
export const CORRECTION_EMAIL = "research@ivohofland.nl";
```

`.github/ISSUE_TEMPLATE/config.yml` — replace lines 7-21 (the comment block through the `about:` text):

```yaml
# NO `mailto:` IN A CONTACT LINK. The first version of this file offered "Vertrouwelijk
# melden (e-mail)" as `url: mailto:…`, and GITHUB SILENTLY DROPPED THE ROW — it renders
# contact links only for http(s) URLs, and says so nowhere. The result was a chooser that
# showed the public form and no private route at all: precisely the state we designed
# against, because a school unwilling to complain in public would have found no other door
# and its silence would then have read as having nothing to say. Caught by opening the page.
# The address now lives in the link's `about` text (which does render) and in the form's own
# intro. Do not "fix" this back into a mailto.
#
# The address here must match CORRECTION_EMAIL in yoga-trainingen-directory/src/lib/corrections.ts.
# A test asserts it, because this file is in a directory the app never imports and would
# otherwise drift in silence.
blank_issues_enabled: true
contact_links:
  - name: "Vertrouwelijk melden: e-mail naar research@ivohofland.nl"
    url: https://github.com/ivohofland/yoga-trainingen-nederland/blob/main/yoga-trainingen-directory/content/correcties.md
    about: >
      Geen GitHub-account? Of wilt u een bevinding niet in het openbaar aanvechten? Mail dan
      naar research@ivohofland.nl. Uw verzoek blijft privé. De correctie die eruit volgt niet.
      Deze pagina beschrijft de volledige correctie- en klachtenprocedure: wat binnen en
      buiten scope valt, en hoe een afwijzing wordt vastgelegd.
```

`.github/ISSUE_TEMPLATE/correctie.yml:13-14` — replace those two lines:

```yaml
        **Liever niet in het openbaar?** Vertegenwoordigt u een school, en wilt u een bevinding
        aanvechten zonder publiek debat, mail dan naar **research@ivohofland.nl**. Uw verzoek blijft
```

`docs/superpowers/specs/2026-07-14-vps-static-deploy-design.md` §6.3 — the spec prints the address it retires, so it fails its own guard. Replace the first line of §6.3's body:

```markdown
The personal address is retired in favour of **`research@ivohofland.nl`**, on every tracked
line (8 lines, 4 files). The site is unpublished, so it goes before it is ever exposed to a
harvester; the role address that replaces it can be filtered, forwarded or retired without
touching a person's inbox. The old address is not written out here either — a guard test
(Task 1) holds that it appears in no tracked file, and a spec that printed it would fail the
project it specifies.
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd yoga-trainingen-directory && npm test
```
Expected: PASS, all tests — including `the retired personal address survives in no tracked file`, and the two that now hold the issue templates to `CORRECTION_EMAIL`.

The guard *is* the verification; there is no second grep to run, which is the point of writing it as a test rather than checking by hand once.

- [ ] **Step 5: Commit**

```bash
git add yoga-trainingen-directory/src/lib/corrections.ts \
        yoga-trainingen-directory/src/lib/corrections.test.ts \
        .github/ISSUE_TEMPLATE/config.yml \
        .github/ISSUE_TEMPLATE/correctie.yml \
        docs/superpowers/specs/2026-07-14-vps-static-deploy-design.md
git commit -m "A role address, and a test that keeps it one

The correction channel published a person's inbox as a mailto on a page we are
about to make public. It is a role address now — filterable, forwardable,
retirable — and the address is defined once, in CORRECTION_EMAIL. The old one
lived in five places, of which four are in a directory the app never imports; a
test now holds that it survives in no tracked file, because remembering is not a
mechanism."
```

---

### Task 2: Make the build a static export

**Files:**
- Modify: `yoga-trainingen-directory/next.config.ts`
- Modify: `yoga-trainingen-directory/package.json` (remove the `start` script)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `yoga-trainingen-directory/out/` — the deployable artifact. Task 3's `deploy.sh` rsyncs exactly this directory. Routes land as `out/<route>/index.html` (trailing-slash form).

- [ ] **Step 1: Add the export config**

In `yoga-trainingen-directory/next.config.ts`, add these two fields to `nextConfig`, above `staticPageGenerationTimeout`:

```ts
const nextConfig: NextConfig = {
  pageExtensions: [...(isProduction ? [] : ["dev.tsx"]), "tsx", "ts", "jsx", "js"],
  // A STATIC EXPORT, because there is no server in this site. No route handlers, no server
  // actions, no middleware, no next/image: every page is prerendered, and the correction
  // "form" is a GitHub issue form and a mailto (src/lib/corrections.ts). So `next build`
  // writes out/, nginx serves those bytes, and the deploy has no app process to restart —
  // which is also why deploy/deploy.sh needs no sudo at all.
  //
  // `next start` does not work under this and is not supposed to: the `start` script is
  // gone from package.json. Local preview is `npm run dev`.
  output: "export",
  // TRAILING SLASHES, so that a STOCK static vhost serves every route. The export then
  // writes `aanbieder/<id>/index.html` rather than `aanbieder/<id>.html`, and CloudPanel's
  // default `try_files $uri $uri/ =404` finds it. Without this, /aanbieder/<id> is a 404
  // until someone hand-edits `$uri.html` into the vhost — and the nginx config we never
  // have to write is the nginx config that can never drift from this repo.
  trailingSlash: true,
  // TEMPORARY, LOCAL, NOT COMMITTED — see the report. The default 60s per-page
  // guard trips on a machine whose CPU is saturated by unrelated processes; it is
  // a wall-clock guard, not a correctness one.
  staticPageGenerationTimeout: 1200,
};
```

- [ ] **Step 2: Remove the `start` script**

In `yoga-trainingen-directory/package.json`, delete the `"start": "next start",` line. `next start` refuses to run under `output: "export"`; leaving the script would leave one that lies about what it does. Nothing in `CLAUDE.md` or CI invokes it.

- [ ] **Step 3: Run the build**

```bash
cd yoga-trainingen-directory && npm run build
```
Expected: PASS — every gate (validate, provenance, test, test:ci, export-json) green, then `next build` printing `Exporting (…)` and writing `out/`.

- [ ] **Step 4: Verify the exported surface**

```bash
cd yoga-trainingen-directory
ID=$(ls data/providers | head -1 | sed 's/\.yaml$//')
ls out/index.html out/methodologie/index.html out/correcties/index.html "out/aanbieder/$ID/index.html" out/data/v1/providers.json
```
Expected: all six paths listed, no "No such file".

```bash
ls out/qa 2>/dev/null && echo "LEAKED" || echo "qa is absent, as it must be"
```
Expected: `qa is absent, as it must be`. The `pageExtensions` trick that keeps the researcher's work-list out of production must survive the export — if this ever prints `LEAKED`, stop and fix it before anything ships.

- [ ] **Step 5: Commit**

```bash
git add yoga-trainingen-directory/next.config.ts yoga-trainingen-directory/package.json
git commit -m "Export the site, because there is no server in it

Zero route handlers, zero server actions, no middleware: every page is already
prerendered. So next build writes out/ and nginx serves it — no Node process, no
port, and no sudo anywhere in the deploy path. trailingSlash so a stock static
vhost finds every route without an nginx edit we would have to maintain. next
start does not work under export; the script that claimed it did is gone."
```

---

### Task 3: The deploy script and this site's webhook listener

**Files:**
- Create: `deploy/deploy.sh`
- Create: `deploy/deploy-webhook.sh`
- Create: `deploy/hooks.json`
- Create: `deploy/webhook-yoga-research.service`

**Interfaces:**
- Consumes: `yoga-trainingen-directory/out/` (Task 2).
- Produces: hook id `deploy-yoga-trainingen` on `127.0.0.1:9001`, verifying `X-Hub-Signature-256` (HMAC-SHA256) against `$DEPLOY_WEBHOOK_SECRET`. Task 4's workflow POSTs to it.

- [ ] **Step 1: Write `deploy/deploy.sh`**

```bash
#!/usr/bin/env bash
# Deploy research.ivohofland.nl on the VPS.
#
# THE SITE IS A STATIC EXPORT. `npm run build` writes yoga-trainingen-directory/out/ and
# nginx serves that directory. There is no app process and nothing to restart — so, unlike
# ivohofland.dev's deploy, this script needs no sudo at all.
#
# THE GATES ARE THE DEPLOY. `npm run build` is gen-schema → validate → provenance → test →
# test:ci → export-json → next build. Under `set -e` a failed gate aborts BEFORE the swap:
# the previous build stays live, and a record citing a page that does not state its fact
# cannot reach the docroot.
#
# WHAT THIS MACHINE CANNOT CHECK: the archive bodies are gitignored, so this clone cannot
# open them. `provenance` runs its structural tier only and prints INHOUD NIET GETOETST for
# the rest. A green deploy does NOT mean the artifacts were read. That happens on the
# researcher's machine, where the archives are, and nowhere else.
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
APP_DIR="$REPO_DIR/yoga-trainingen-directory"
DOCROOT="${DOCROOT:-/home/ivohofland-research/htdocs/research.ivohofland.nl}"

# REFUSE TO RUN ANYWHERE BUT THE SERVER, and refuse before touching anything.
# Below this line are a `git reset --hard`, which destroys uncommitted work, and an
# `rsync --delete`, which empties whatever directory it is aimed at. The docroot exists
# only on the VPS (CloudPanel creates it), so its absence means either "you are not on the
# server" or "DOCROOT is wrong" — and both of those must stop here, not halfway through.
if [ ! -d "$DOCROOT" ]; then
  echo "✗ docroot does not exist: $DOCROOT" >&2
  echo "  This script deploys on the VPS, and will not run against a docroot it cannot find." >&2
  echo "  (Set DOCROOT if CloudPanel reports a different path for the site.)" >&2
  exit 1
fi

echo "→ deploying $REPO_DIR → $DOCROOT"
cd "$REPO_DIR"
git fetch --all --prune
git reset --hard origin/main

cd "$APP_DIR"
npm ci
npm run build   # the gates. A failure exits here, before the swap.

# THE SWAP. --delete because a page removed from the site must disappear from the site.
# --exclude '.well-known/' because Let's Encrypt writes its ACME challenge INTO the docroot,
# and a --delete racing a certificate renewal would eat it. --chmod so nginx can read what
# we just wrote regardless of the builder's umask.
rsync -a --delete --chmod=D755,F644 --exclude '.well-known/' "$APP_DIR/out/" "$DOCROOT/"

echo "✓ deployed $(git -C "$REPO_DIR" rev-parse --short HEAD) → $DOCROOT"
```

- [ ] **Step 2: Test the guard — the one behaviour that must hold on THIS machine**

```bash
chmod +x deploy/deploy.sh
bash -n deploy/deploy.sh && echo "syntax ok"
git stash list > /tmp/stash-before.txt
bash deploy/deploy.sh; echo "exit=$?"
```
Expected: `syntax ok`, then

```
✗ docroot does not exist: /home/ivohofland-research/htdocs/research.ivohofland.nl
  This script deploys on the VPS, and will not run against a docroot it cannot find.
  (Set DOCROOT if CloudPanel reports a different path for the site.)
exit=1
```

Then confirm it touched nothing:

```bash
git status --short   # your working tree, exactly as it was — no reset happened
```
Expected: whatever you had before, unchanged. **If the script got past the guard on a laptop, it would have run `git reset --hard origin/main` on the author's working tree.** That is the failure this step exists to catch.

- [ ] **Step 3: Write the remaining three files**

`deploy/deploy-webhook.sh`:

```bash
#!/usr/bin/env bash
# Invoked by the webhook listener (adnanh/webhook) on a signature-verified request.
# Runs the real deploy DETACHED so the HTTP request returns 200 immediately — a build here
# takes minutes, and the listener would otherwise hold the connection open until it timed
# out and GitHub Actions called the deploy a failure. Progress lands in ~/deploy.log.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
nohup "$DIR/deploy.sh" >> "$HOME/deploy.log" 2>&1 &
echo "deploy started"
```

`deploy/hooks.json`:

```json
[
  {
    "id": "deploy-yoga-trainingen",
    "execute-command": "/home/ivohofland-research/src/yoga-trainingen/deploy/deploy-webhook.sh",
    "command-working-directory": "/home/ivohofland-research/src/yoga-trainingen",
    "response-message": "deploy started",
    "trigger-rule-mismatch-http-response-code": 403,
    "trigger-rule": {
      "match": {
        "type": "payload-hmac-sha256",
        "secret": "{{ getenv `DEPLOY_WEBHOOK_SECRET` }}",
        "parameter": { "source": "header", "name": "X-Hub-Signature-256" }
      }
    }
  }
]
```

The secret is read from the environment (`-template` + `{{ getenv }}`), never stored here — which is what lets `deploy.sh`'s `git reset --hard` run over this file without destroying it.

`deploy/webhook-yoga-research.service`:

```ini
# systemd unit for THIS SITE'S webhook deploy listener (adnanh/webhook).
#
# The BINARY is shared with ivohofland.dev; the INSTANCE is not. A listener runs as one
# Linux user and must not be able to touch another site's repo or service — so each site
# runs its own, on its own port, as its own user.
#
# THE FILENAME IS NOT GENERIC, ON PURPOSE. ivohofland.dev already installs
# /etc/systemd/system/webhook.service, and its DEPLOY.md Part 5 says "copy
# deploy/webhook.service" — one forgotten rename and this site's unit silently overwrites
# that one, taking the other site's auto-deploy down without a word. Naming the repo file
# for the site removes the step you could forget:
#
#   sudo cp deploy/webhook-yoga-research.service /etc/systemd/system/
#   sudo systemctl daemon-reload && sudo systemctl enable --now webhook-yoga-research

[Unit]
Description=webhook — deploy listener for research.ivohofland.nl
After=network.target

[Service]
Type=simple
User=ivohofland-research
EnvironmentFile=/home/ivohofland-research/webhook.env
ExecStart=/usr/local/bin/webhook -template -hooks /home/ivohofland-research/src/yoga-trainingen/deploy/hooks.json -ip 127.0.0.1 -port 9001 -hotreload
Restart=on-failure
RestartSec=5
# ivohofland.dev's listener cannot set this: its deploy.sh must `sudo systemctl restart` the
# app service. This site is static and restarts nothing, so the privilege that unit had to
# keep, this one drops.
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 4: Verify all four files**

```bash
chmod +x deploy/deploy-webhook.sh
bash -n deploy/deploy.sh && bash -n deploy/deploy-webhook.sh && echo "shell syntax ok"
node -e "const h=require('./deploy/hooks.json'); if(h[0].id!=='deploy-yoga-trainingen') throw new Error('wrong hook id'); if(h[0]['trigger-rule-mismatch-http-response-code']!==403) throw new Error('a forged signature must be refused with 403'); console.log('hooks.json ok:', h[0].id)"
grep -q "port 9001" deploy/webhook-yoga-research.service && grep -q "User=ivohofland-research" deploy/webhook-yoga-research.service && echo "unit ok"
```
Expected: `shell syntax ok`, `hooks.json ok: deploy-yoga-trainingen`, `unit ok`.

- [ ] **Step 5: Commit**

```bash
git add deploy/
git commit -m "The deploy refuses to run anywhere but the server

deploy.sh is a git reset --hard followed by an rsync --delete. On a laptop that
is a loaded gun pointed at the author's uncommitted research, so it checks for
the docroot — which only CloudPanel creates — and exits 1 before touching a
thing. The listener is this site's own instance on 9001, as this site's user,
named for this site: copying it into /etc/systemd/system cannot clobber
ivohofland.dev's webhook.service, because there is no rename step to forget."
```

---

### Task 4: The deploy trigger and the runbook

**Files:**
- Create: `.github/workflows/deploy.yml`
- Create: `DEPLOY.md`

**Interfaces:**
- Consumes: hook id `deploy-yoga-trainingen` on `:9001` (Task 3); the existing CI workflow, whose `name:` is **`validate`** (`.github/workflows/validate.yml:1`).
- Produces: repo secrets contract — `DEPLOY_WEBHOOK_URL` = `https://research.ivohofland.nl/hooks/deploy-yoga-trainingen`, `DEPLOY_WEBHOOK_SECRET` = the value in `~/webhook.env`.

- [ ] **Step 1: Write `.github/workflows/deploy.yml`**

```yaml
name: Deploy

# Runs ONLY after the `validate` workflow succeeds on main.
#
# The workflow name here must match `name:` in validate.yml exactly. ivohofland.dev's copy
# of this file watches a workflow called "CI"; ours is called "validate", and a typo here
# does not error — the trigger simply never fires, and the site quietly stops deploying.
on:
  workflow_run:
    workflows: ["validate"]
    types: [completed]
    branches: [main]

concurrency:
  group: deploy-main
  cancel-in-progress: false

jobs:
  deploy:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    steps:
      # Stays green and no-ops until the DEPLOY_WEBHOOK_* secrets are configured, so this
      # file can land before the server exists.
      - name: Check deploy config
        id: cfg
        env:
          URL: ${{ secrets.DEPLOY_WEBHOOK_URL }}
        run: |
          if [ -z "${URL:-}" ]; then
            echo "DEPLOY_WEBHOOK_URL not set — skipping (add the webhook secrets to enable)."
            echo "ready=false" >> "$GITHUB_OUTPUT"
          else
            echo "ready=true" >> "$GITHUB_OUTPUT"
          fi

      # A signed HTTPS ping, and nothing else. The server pulls itself; there is no inbound
      # SSH and no IP to whitelist. The only inbound is this POST on 443, authenticated by
      # an HMAC-SHA256 signature the listener verifies before it runs anything.
      - name: Trigger deploy webhook
        if: ${{ steps.cfg.outputs.ready == 'true' }}
        env:
          URL: ${{ secrets.DEPLOY_WEBHOOK_URL }}
          SECRET: ${{ secrets.DEPLOY_WEBHOOK_SECRET }}
        run: |
          body='{"ref":"refs/heads/main"}'
          sig="sha256=$(printf '%s' "$body" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $NF}')"
          code=$(curl -sS -X POST "$URL" \
            --max-time 30 \
            -H 'Content-Type: application/json' \
            -H "X-Hub-Signature-256: $sig" \
            --data "$body" \
            -o /dev/null -w '%{http_code}')
          echo "webhook responded: HTTP $code"
          test "$code" = "200"
```

- [ ] **Step 2: Write `DEPLOY.md`**

```markdown
# Deploying research.ivohofland.nl (VPS + CloudPanel)

The site is a **static export**: `npm run build` writes `yoga-trainingen-directory/out/`
and nginx serves those files. There is **no app process, no app port, and no sudo in the
deploy path**. Deploys are **pull-based**: the server pulls itself; GitHub only sends a
**signed HTTPS ping** after CI passes.

```
push to main → validate (CI) → Deploy workflow
   → signed HTTPS POST to /hooks/deploy-yoga-trainingen (HMAC-SHA256)
   → webhook (:9001) → deploy.sh → npm run build → rsync out/ → docroot
```

**No inbound SSH, nothing to IP-whitelist.** The only inbound is the webhook POST on 443
(already open), authenticated by an HMAC signature.

This is the pattern of `ivohofland.dev/DEPLOY.md` Part 5, minus the app port — that site
runs `next start` because it has `/api/contact`. This one has no server routes at all.

| | app port | webhook | GoatCounter |
| --- | --- | --- | --- |
| ivohofland.dev | 3100 | 9000 | 8081 |
| research.ivohofland.nl | — none — | **9001** | not used |

## What a green deploy does and does not prove

`deploy.sh` runs `npm run build`, and that IS the editorial gate chain — validate,
provenance, the invariant tests. A failed gate aborts the deploy **before** the swap, so the
previous build stays live and a record citing a page that does not state its fact cannot
reach the docroot.

But **the archive bodies are gitignored**, so the server's clone cannot open them. Provenance
runs its **structural tier only** ("you cited a page that is in no archive") and **skips** the
content tier ("we opened the artifact and the fact is not in it"), printing `INHOUD NIET
GETOETST`. This is exactly what CI does, so the deploy gate is no weaker — but a green deploy
**does not mean the artifacts were read**. That check runs on the researcher's machine, where
the archives live, and nowhere else.

## Part 1 — one-time server setup

### 1. CloudPanel site
- **Sites → Add Site → Create a Static Site**, domain `research.ivohofland.nl`.
  Not a Node.js site: there is no app port to give it.
- Site user: `ivohofland-research`.
- **Confirm the docroot** CloudPanel reports. It should be
  `/home/ivohofland-research/htdocs/research.ivohofland.nl`. If it differs, set `DOCROOT` in
  `deploy/deploy.sh` — a wrong docroot is an `rsync --delete` into the wrong directory, and it
  is the one mistake here that is not self-correcting.
- DNS `A` → the VPS IP; issue the **Let's Encrypt** cert.

### 2. Clone — OUTSIDE the docroot
The docroot is served. A repo cloned into it would publish `.git/`, `data/` and
`node_modules/` over HTTP. So the checkout lives beside it, and only `out/` is ever copied in.

The repo is **public**, so no deploy key is needed. As the site user:
```bash
mkdir -p ~/src
git clone https://github.com/ivohofland/yoga-trainingen-nederland.git ~/src/yoga-trainingen
node -v   # must be 22 (CloudPanel's Node selector, or nvm)
```

### 3. First deploy
```bash
bash ~/src/yoga-trainingen/deploy/deploy.sh
```
Builds run **on the server** (~1 GB free RAM; add swap on a small VPS). The site should now be
live over HTTPS. That same command is a manual deploy, any time.

## Part 2 — auto-deploy webhook

### 1. The binary (shared, already installed for ivohofland.dev)
```bash
command -v webhook   # /usr/local/bin/webhook — if absent, install adnanh/webhook
```

### 2. This site's secret
```bash
openssl rand -hex 32
printf 'DEPLOY_WEBHOOK_SECRET=%s\n' "<that secret>" > ~/webhook.env
chmod 600 ~/webhook.env
```
`deploy/hooks.json` reads it via `{{ getenv }}`, so `deploy.sh`'s `git reset` never
overwrites it.

### 3. This site's listener
```bash
sudo cp ~/src/yoga-trainingen/deploy/webhook-yoga-research.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now webhook-yoga-research
sudo systemctl status webhook-yoga-research   # active, on 127.0.0.1:9001
```
**Do not rename it to `webhook.service`.** That unit belongs to ivohofland.dev, and
overwriting it takes that site's auto-deploy down silently.

### 4. Expose it (the only nginx edit this site needs)
CloudPanel → Site → Vhost, above `location / {`:
```nginx
location /hooks/ {
    proxy_pass http://127.0.0.1:9001;
}
```

### 5. GitHub repo secrets
Settings → Secrets and variables → Actions:

| Secret | Value |
| --- | --- |
| `DEPLOY_WEBHOOK_URL` | `https://research.ivohofland.nl/hooks/deploy-yoga-trainingen` |
| `DEPLOY_WEBHOOK_SECRET` | the same secret as in `~/webhook.env` |

Until they exist, the Deploy workflow runs green and skips.

## Verify

```bash
# The site is live, and the researcher's work-list is not.
curl -sS -o /dev/null -w '%{http_code}\n' https://research.ivohofland.nl/            # 200
curl -sS -o /dev/null -w '%{http_code}\n' https://research.ivohofland.nl/qa/         # 404
curl -sS -o /dev/null -w '%{http_code}\n' https://research.ivohofland.nl/data/v1/providers.json  # 200

# A forged signature is refused.
curl -sS -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'X-Hub-Signature-256: sha256=deadbeef' -d '{}' \
  https://research.ivohofland.nl/hooks/deploy-yoga-trainingen                        # 403
```
Then push a trivial commit to `main`: `validate` passes, the Deploy workflow POSTs, and
`~/deploy.log` on the server shows the build. The change appears on the live site.

## Notes
- **Rotate the secret** by updating `~/webhook.env` (+ `systemctl restart webhook-yoga-research`)
  and the `DEPLOY_WEBHOOK_SECRET` GitHub secret together.
- **Analytics**: none. This site ships no tracking snippet. If GoatCounter is ever wanted, the
  `:8081` instance on this box is multi-site — see `ivohofland.dev/DEPLOY.md` Part 4/5.
- **Rate limiting** (that DEPLOY.md's Part 3) protects `/api/contact`. There is no API here.
```

- [ ] **Step 3: Verify the workflow parses and names the right upstream**

```bash
cd yoga-trainingen-directory
node -e "
const YAML=require('yaml'), fs=require('fs');
const wf=YAML.parse(fs.readFileSync('../.github/workflows/deploy.yml','utf8'));
const ci=YAML.parse(fs.readFileSync('../.github/workflows/validate.yml','utf8'));
const watched=wf[true]?.workflow_run?.workflows ?? wf.on?.workflow_run?.workflows;
if(!watched.includes(ci.name)) throw new Error('deploy.yml watches '+watched+' but CI is named '+ci.name);
console.log('deploy.yml waits on the workflow actually named:', ci.name);
"
```
Expected: `deploy.yml waits on the workflow actually named: validate`.
(`wf[true]` is not a typo: YAML 1.1 parses the key `on` as the boolean `true`. That quirk is precisely why this check exists rather than a read-through.)

- [ ] **Step 4: Confirm the full gate chain still passes**

```bash
cd yoga-trainingen-directory && npm run build
```
Expected: PASS, `out/` rewritten.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy.yml DEPLOY.md
git commit -m "Deploy on a signed ping, and say what a green deploy does not prove

The trigger waits on the workflow this repo actually has — validate, not CI —
because a wrong name there does not error, it just quietly stops deploying.
DEPLOY.md states in plain words that the server's clone has no archive bodies, so
the deploy gate is structural-only: a green deploy does not mean the artifacts
were read. Reading a green tick as more than it says is the failure this project
exists to refuse."
```

---

### Task 5 (operator, not agent): bring the server up

I have no SSH access to the VPS; these are yours to run. `DEPLOY.md` (Task 4) is the runbook — follow it top to bottom. In order:

- [ ] CloudPanel: **Static** site `research.ivohofland.nl`, user `ivohofland-research`; confirm the docroot matches `deploy/deploy.sh`'s `DOCROOT`.
- [ ] DNS `A` → VPS; issue the Let's Encrypt cert.
- [ ] Confirm `research@ivohofland.nl` receives mail **before** the site is reachable. It is the confidential correction route; a bounce there manufactures the silence the two-channel design exists to prevent.
- [ ] Clone to `~/src/yoga-trainingen`, Node 22, run `bash deploy/deploy.sh` once by hand.
- [ ] `~/webhook.env` + install `webhook-yoga-research.service` + the `/hooks/` vhost block.
- [ ] Add the two GitHub secrets, push a trivial commit, watch it land.
- [ ] Run the four `curl` checks in DEPLOY.md's **Verify** section — including the forged-signature 403 and the `/qa/` 404.

---

## Notes for the implementer

- **Task 1 and Task 2 are independent.** Either order. Task 3 needs Task 2 (it rsyncs `out/`); Task 4 needs Task 3 (it POSTs to the hook).
- **`npm run build` is slow** — it runs the full test suite twice (once as CI sees it) plus the provenance gate plus ~60 static pages. That is the design, not a fault.
- **If `npm run provenance` fails during Task 2's build, stop.** It is not a deploy problem: it means a record cites a page that does not state its fact, and shipping it is the exact thing this project exists not to do.
