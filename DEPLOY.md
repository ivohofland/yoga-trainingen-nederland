# Deploying research.ivohofland.nl (VPS + CloudPanel)

The site is a **static export**: `npm run build` writes `yoga-trainingen-directory/out/`
and nginx serves those files. There is **no app process, no app port, and no sudo in the
deploy path**. Deploys are **pull-based**: the server pulls itself; GitHub only sends a
**signed HTTPS ping** after CI passes.

```
push to main → validate (CI) → Deploy workflow
   → signed HTTPS POST to /hooks/deploy-yoga-trainingen (HMAC-SHA256)
   → webhook (:9001) → deploy-webhook.sh (returns 200, backgrounds via nohup)
   → deploy.sh → npm run build → rsync out/ → docroot          (~/deploy.log)
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

One more gate sits outside that chain, after the build has already succeeded. Immediately
before the `rsync -a --delete`, `deploy.sh` refuses to run unless `out/index.html` exists.
`set -e` already aborts if `npm run build` itself fails — this catches the other failure
mode: a future regression where the build exits 0 but writes an empty or missing `out/`.
`rsync --delete` against an empty source does not error; it empties the docroot and copies
nothing back. Read the check for exactly what it is, not what it sounds like: it proves the
export produced *an* `index.html` in *this* run — nothing more. It does not prove the export
is complete or every page correct. It also cannot be satisfied by a stale `index.html` left
over from an earlier build: `next build` deletes `out/` at the start of its own export phase,
and `set -e` aborts before this line if the current build failed, so there is never an old
file sitting there for this check to be fooled by — only ever this run's, or none.

Deploys are also serialised: `deploy.sh` takes an exclusive, blocking lock (`flock`) right
after the identity gate, so a second deploy started while one is already running (two pushes
minutes apart, a "Re-run all jobs", a manual run during a webhook deploy) waits for the first
to finish rather than racing it. Before that lock existed, the `out/index.html` check above
could pass in one process while a second process's build deleted `out/` out from under it —
a real bug in the shape of the one this paragraph rules out, closed at a different layer.

A green **Deploy** run in GitHub Actions proves less than any of the above: it goes green the
moment the webhook accepts the signed ping — before the build has even started. Every failure
after that (a failed gate, a failed build, the lock timing out) is invisible to GitHub Actions
entirely; it shows up only in `~/deploy.log` on the server.

## Part 1 — one-time server setup

### 1. CloudPanel site
- **Sites → Add Site → Create a Static Site**, domain `research.ivohofland.nl`.
  Not a Node.js site: there is no app port to give it.
- Site user: `ivohofland-research`.
- **Confirm the docroot** CloudPanel reports. It should be
  `/home/ivohofland-research/htdocs/research.ivohofland.nl`. If it differs, put
  `DOCROOT=<the path CloudPanel actually reports>` in `~/deploy.env` (create the file if it
  doesn't exist yet; `deploy.sh` sources it, if present, before computing DOCROOT's default).
  **Do not** set it in `deploy/deploy.sh` itself — that file is inside the repo, and every deploy runs
  `git reset --hard origin/main` against it, so an edit there survives exactly one deploy
  before the next one silently reverts it back to the wrong-for-this-site default. This is
  the same reason the webhook secret lives in `~/webhook.env` and not in `hooks.json`'s
  literal text (Part 2 below) — anything that must outlive a reset has to live outside the
  repo the reset resets. A wrong docroot is an `rsync --delete` into the wrong directory, and
  it is the one mistake here that is not self-correcting.
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
Run this **as the site user** (`ivohofland-research`). `deploy.sh`'s first gate checks
`id -un` before it checks anything else — including the docroot — and refuses to run under
any other identity, with no environment override possible:
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

### 4. Expose it (the nginx edit this site needs)
CloudPanel → Site → Vhost, above `location / {`:
```nginx
location /hooks/ {
    proxy_pass http://127.0.0.1:9001;
}

# Optional, and purely cosmetic. The static export writes out/404.html, but a stock
# CloudPanel static vhost never wires it to nginx's error_page, so an unknown URL falls
# through to nginx's own default 404 page instead of the site's. Without this line the
# HTTP status code is still a correct 404 either way — only which page renders it differs.
error_page 404 /404.html;
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
  and the `DEPLOY_WEBHOOK_SECRET` GitHub secret together. First check `~/deploy.log` and let
  any in-progress build finish before restarting. The unit's `KillMode=process` means a
  restart no longer SIGTERMs a deploy that's mid-`rsync` — it only replaces the listener — but
  there's still no reason to restart into an active deploy when waiting for the log to go
  quiet costs nothing.
- **`hooks.json` changes need a manual restart.** The listener does not watch the file for
  changes (`-hotreload` was removed — see `deploy/webhook-yoga-research.service` for why: the
  file lives inside the repo this unit's own deploy resets, and a reset replaces its inode
  from under an inotify watch). After editing `hooks.json`, run
  `sudo systemctl restart webhook-yoga-research`.
- **Analytics**: none. This site ships no tracking snippet. If GoatCounter is ever wanted, the
  `:8081` instance on this box is multi-site — see `ivohofland.dev/DEPLOY.md` Part 4/5.
- **Rate limiting** (that DEPLOY.md's Part 3) protects `/api/contact`. There is no API here.
