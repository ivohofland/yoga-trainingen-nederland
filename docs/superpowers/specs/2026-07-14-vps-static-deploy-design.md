# Deploying to research.ivohofland.nl — design

**Status:** draft for review
**Date:** 2026-07-14
**Source pattern:** `ivohofland.dev/DEPLOY.md` Part 5, "running another site on this VPS".
**Relates to:** `CLAUDE.md` (the build gates), `src/lib/corrections.ts` (the correction channel).

---

## 1. Purpose

Publish this site at **`research.ivohofland.nl`** on the existing VPS, as a second
site alongside `ivohofland.dev`: its own repo, its own CloudPanel site, its own
Linux user, its own webhook listener. Shared binaries, zero changes to any other
site's repo.

Deploys stay **pull-based**, exactly as Part 5 prescribes: the server pulls
itself; GitHub only sends a signed HTTPS ping after CI passes. No inbound SSH,
nothing to IP-whitelist.

```
push to main → validate (CI) → Deploy workflow
   → signed HTTPS POST to /hooks/deploy-yoga-trainingen (HMAC-SHA256)
   → webhook (:9001) → deploy.sh → build → swap out/ into the docroot
```

## 2. The governing fact: this site needs no server

`ivohofland.dev` runs `next start` because it **has** to — it has `/api/contact`.
This site has nothing of the kind. It has **zero route handlers, zero server
actions, no `next/image`, no middleware, no `dynamic`/`revalidate`**; every page is
prerendered at build time. The correction "form" is a GitHub issue form and a
`mailto:`, and `app/correcties/page.tsx` says so in its own docblock: *"This is a
static export: nothing logs, nothing replies."*

So Part 5's per-site **app port is not allocated at all**. nginx serves the bytes.

| | app port | webhook listener | GoatCounter |
| --- | --- | --- | --- |
| ivohofland.dev | 3100 | 9000 | 8081 |
| **research.ivohofland.nl** | **— (none)** | **9001** | — (see §8) |

Three properties follow, and each is better than the Node-service variant:

1. **No sudo anywhere in the deploy path.** Part 1 §6's `sudoers.d` rule exists
   solely so `deploy.sh` can restart the app service. There is no service to
   restart, so the rule is never created and `webhook-yoga-research.service` runs
   with `NoNewPrivileges=true`.
2. **The editorial gates become the deploy gates.** `deploy.sh` runs
   `npm run build`, which is gen-schema → validate → **provenance** → test →
   test:ci → export-json → next build, under `set -euo pipefail`. A failed gate
   aborts the deploy **before** the swap. A record citing a page that does not
   state its fact cannot reach the docroot, and the previous build stays live.
   (The Node variant restarts a service over a possibly half-written `.next`.)
3. **Nothing to crash at 3am.** No resident process, no `Restart=on-failure`, no
   memory sitting idle to serve files nginx serves anyway.

## 3. The deviation from Part 5: the repo does not live in the docroot

`ivohofland.dev` clones **into** `htdocs` safely, because nothing in `htdocs` is
served — nginx only proxies to `:3100`. For a static site the docroot **is** the
thing nginx serves, so cloning the repo into it would publish `.git/`, `data/`,
`node_modules/` and every YAML record over HTTP.

Therefore:

| | path |
| --- | --- |
| checkout | `/home/ivohofland-research/src/yoga-trainingen` |
| build output | `…/src/yoga-trainingen/yoga-trainingen-directory/out/` |
| served docroot | `/home/ivohofland-research/htdocs/research.ivohofland.nl/` |

The swap is:

```bash
rsync -a --delete --chmod=D755,F644 --exclude '.well-known/' out/ "$DOCROOT/"
```

`--exclude '.well-known/'` is **not decoration**: Let's Encrypt writes its ACME
challenge into the docroot, and a `--delete` racing a renewal would eat it.

`DOCROOT` is a variable in `deploy.sh` with the path above as its default, and the
runbook's first step is to confirm it against the docroot CloudPanel actually
reports for the site. A wrong `DOCROOT` here is an `rsync --delete` into the wrong
directory, which is the one mistake in this design that is not self-correcting.

## 4. What the deploy gate can and cannot prove

The archive bodies are gitignored (`data/archives/**`), so the server's clone —
like CI's, like any clone — **cannot open them**. `npm run provenance` therefore
runs its **structural tier only** (`no_source` / `no_snapshot` / `no_artifact`,
provable from the record plus the committed `.sha256` sidecars) and **skips** the
content tier, printing `INHOUD NIET GETOETST` rather than a green tick.

This is exactly what `.github/workflows/validate.yml` already does, so the deploy
gate is no weaker than CI. But **`DEPLOY.md` must say it in as many words**, because
a green deploy that is read as "the artifacts were checked" is the same false
reassurance the provenance tiers exist to refuse. Content-tier provenance is verified
on the researcher's machine, where the archives are. Nowhere else.

## 5. Repo artifacts (new)

| File | Contents |
| --- | --- |
| `deploy/deploy.sh` | Self-locating (`APP_DIR` = this script's parent). `git fetch && git reset --hard origin/main`; `cd yoga-trainingen-directory`; `npm ci`; `npm run build`; rsync `out/` → `$DOCROOT`. `set -euo pipefail`. `DOCROOT` overridable by env, defaulting to the path in §3. No sudo. |
| `deploy/deploy-webhook.sh` | Unchanged from `ivohofland.dev`: `nohup deploy.sh >> ~/deploy.log 2>&1 &`, so the HTTP request returns 200 immediately. |
| `deploy/hooks.json` | Hook id **`deploy-yoga-trainingen`**. HMAC-SHA256 over the payload, secret via `{{ getenv "DEPLOY_WEBHOOK_SECRET" }}` so `git reset` never touches it. `trigger-rule-mismatch-http-response-code: 403`. Paths under `/home/ivohofland-research/src/yoga-trainingen`. |
| `deploy/webhook-yoga-research.service` | `User=ivohofland-research`, `EnvironmentFile=/home/ivohofland-research/webhook.env`, `-port 9001`, `-hooks …/deploy/hooks.json`, **`NoNewPrivileges=true`** (allowed here — no sudo in the chain). Named for the site **in the repo**, so `cp` installs it under the right unit name with no rename step (§7). |
| `.github/workflows/deploy.yml` | `workflow_run` on **`["validate"]`** (this repo's CI workflow is named `validate`, not `CI`), `branches: [main]`, `if: conclusion == 'success'`. Signs `{"ref":"refs/heads/main"}` with `DEPLOY_WEBHOOK_SECRET`, POSTs to `DEPLOY_WEBHOOK_URL`, asserts HTTP 200. Skips green while the secrets are unset. |
| `DEPLOY.md` | The server runbook (§7), including §4's honesty note. |

GitHub repo secrets: `DEPLOY_WEBHOOK_URL` =
`https://research.ivohofland.nl/hooks/deploy-yoga-trainingen`,
`DEPLOY_WEBHOOK_SECRET` = the same value as `~/webhook.env`.

## 6. Code changes

### 6.1 `next.config.ts`

```ts
output: "export",
trailingSlash: true,
```

- **`output: "export"`** writes the prerendered site to `out/` (already gitignored).
- **`trailingSlash: true`** makes the export write `aanbieder/<id>/index.html`
  instead of `aanbieder/<id>.html`. A stock CloudPanel static vhost
  (`index index.html; try_files $uri $uri/ =404;`) then serves every route with
  **no nginx customization at all**; without it, `/aanbieder/<id>` 404s unless
  `try_files … $uri.html` is hand-edited into the vhost. Cost: every URL gains a
  trailing slash. The site is unpublished, so that is free now and permanent later.

The `pageExtensions` trick that keeps `/qa` out of production is untouched and
still works: `dev.tsx` is a page extension only outside a production build, so the
export emits no `/qa` route.

### 6.2 `package.json`

Remove the `start` script. `next start` is **not supported** under
`output: "export"` — it exits with an error pointing you at a static server.
Nothing in `CLAUDE.md` or CI invokes it; leaving it would leave a script that lies.

### 6.3 The correction address

The personal address is retired in favour of **`research@ivohofland.nl`**, on every tracked
line that held it: the constant, both issue templates, the tests, and this spec — which
became one of them the moment it was written. No count is given here on purpose: a count
in prose goes stale silently, and the guard test (below) is the one that cannot. The site
is unpublished, so the address goes before it is ever exposed to a
harvester; the role address that replaces it can be filtered, forwarded or retired without
touching a person's inbox. The old address is not written out here either — a guard test
(Task 1) holds that it appears in no tracked file, and a spec that printed it would fail the
project it specifies.

| File | Change |
| --- | --- |
| `src/lib/corrections.ts:39` | `CORRECTION_EMAIL = "research@ivohofland.nl"` — the single definition. |
| `.github/ISSUE_TEMPLATE/config.yml` | 3 lines (chooser `name`, `about`, and the explanatory comment). |
| `.github/ISSUE_TEMPLATE/correctie.yml` | 1 line (the confidential-route note in the form body). |
| `src/lib/corrections.test.ts` | The two assertions stop matching a hardcoded literal and match **`CORRECTION_EMAIL`**. |

The test change is the point, not a chore. What those assertions are *for* is
"the address in the code and the address in the issue templates agree" — a drift
the chooser bug (`cd2eb94`) proved is real. Matching the constant keeps that
invariant tested while leaving the address itself written in the repo exactly once.

**The address must receive mail before this ships.** The confidential route is the
door for a school that will not dispute a finding in public; a bounce there
manufactures the silence `corrections.ts` was written to prevent.

**No mailto obfuscation.** A channel that is hard for a school to use is a channel
that manufactures the same silence. The role address is the spam answer.

**History is not rewritten.** The old address remains in three public commits
(`365ebfd`, `7db48c8`, `cd2eb94`). Scrubbing it would mean force-pushing every hash,
and in this project git dating is load-bearing evidence. Live surfaces — the site's
`mailto:`, the issue form, the issue chooser — are what harvesters scrape, and all
three switch. Accepted, explicitly.

## 7. Server runbook (goes into `DEPLOY.md`)

1. **CloudPanel → Sites → Add Site → Create a *Static* Site**, domain
   `research.ivohofland.nl`, site user `ivohofland-research`. Not a Node.js site:
   there is no app port to give it. DNS `A` → the VPS IP; issue Let's Encrypt.
2. **Clone outside the docroot**, as the site user. The repo is **public**, so
   HTTPS clone — Part 1 §2's read-only deploy key is unnecessary:
   ```bash
   mkdir -p ~/src && git clone https://github.com/ivohofland/yoga-trainingen-nederland.git ~/src/yoga-trainingen
   ```
3. **Node 22**, then a first manual deploy: `bash ~/src/yoga-trainingen/deploy/deploy.sh`.
   Builds run on the server (~1 GB RAM; add swap on a small VPS).
4. **Webhook**: `openssl rand -hex 32` → `~/webhook.env` (chmod 600); then
   ```bash
   sudo cp ~/src/yoga-trainingen/deploy/webhook-yoga-research.service /etc/systemd/system/
   sudo systemctl daemon-reload && sudo systemctl enable --now webhook-yoga-research
   ```
   Listens on `127.0.0.1:9001`. The `webhook` binary is already installed (shared).
5. **One vhost edit** (CloudPanel → Site → Vhost), above `location / {`:
   ```nginx
   location /hooks/ {
       proxy_pass http://127.0.0.1:9001;
   }
   ```
6. **GitHub secrets** (§5). Until they exist, the Deploy workflow runs green and skips.

The unit is **`webhook-yoga-research.service`**, and it carries that name **in the
repo** — not `webhook.service` renamed on the way in. `ivohofland.dev`'s listener
already owns `webhook.service` on this box, so Part 5's instruction as written
(*"copy `deploy/webhook.service`, change `User`, the `-hooks` path, and `-port`"*)
is one forgotten `mv` away from overwriting the other site's unit and silently
taking its auto-deploy down. Naming the file for the site removes the rename step,
and with it the chance to skip it. `daemon-reload` after installing.

## 8. Out of scope

- **GoatCounter.** This app has no tracking snippet at all, and adding one is a code
  change (`layout.tsx` + a `NEXT_PUBLIC_` var inlined at build time), a DNS record and
  a cert — not deploy config. The site ships with zero tracking, which is also the
  cleanest posture for a publication that argues about transparency. If it is wanted
  later it is self-contained: `goatcounter db create site -vhost=stats.…` against the
  shared `:8081` instance, a reverse-proxy subdomain, and the gated snippet.
- **Rate limiting** (Part 3). It protects `/api/contact`. There is no API.
- **Changes to `ivohofland.dev`.** None. That is the property Part 5 exists to have.

## 9. Verification

| Claim | How it is checked |
| --- | --- |
| The export builds | `npm run build` locally, with `output: "export"` — all gates green, `out/` written. |
| Every route survives export | `out/index.html`, `out/aanbieder/<id>/index.html` for a known id, `out/methodologie/index.html`, `out/correcties/index.html`, `out/data/v1/providers.json`. |
| `/qa` does **not** ship | No `out/qa/` directory exists. |
| The address is retired | `git grep ivo@ivohofland` returns nothing; `npm test` green (the assertions now track `CORRECTION_EMAIL`). |
| The site is live | `curl -I https://research.ivohofland.nl/` → 200; a record URL → 200; `/qa/` → 404. |
| The hook rejects a forgery | POST with a bad signature → **403**; with a good one → 200 and a new line in `~/deploy.log`. |
| Auto-deploy works end to end | Push a trivial commit to main; `validate` passes; the change appears on the live site. |
