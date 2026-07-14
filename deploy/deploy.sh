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

# Config that must survive `git reset --hard` cannot live in this repo (see GATE 2 below for
# why DOCROOT is the example that taught us this). This file is OPTIONAL and lives outside
# the repo entirely, so both deploy paths — a manual `bash deploy.sh` and the webhook — read
# it the same way; a value in `~/webhook.env` would only ever reach the systemd unit.
[ -f "$HOME/deploy.env" ] && . "$HOME/deploy.env"

DOCROOT="${DOCROOT:-/home/ivohofland-research/htdocs/research.ivohofland.nl}"
DEPLOY_USER="ivohofland-research"

# GATE 1: IDENTITY, not path — and this one runs first, before the docroot check, before
# anything else. `${DOCROOT:-default}` only substitutes the default when DOCROOT is unset
# or empty: an EXPORTED DOCROOT survives that substitution untouched, and `[ -d "$DOCROOT" ]`
# then happily approves it, as long as it points at any directory that exists — /tmp, $HOME,
# a leftover export from an unrelated shell session on a developer's own laptop. Below this
# line are a `git reset --hard`, which destroys uncommitted work AND unpushed commits, and
# an `rsync --delete`, which empties whatever directory it is aimed at — including $HOME, if
# an exported DOCROOT ever pointed there. A path check cannot defend against that, because
# ANY exported variable can name a directory that happens to exist. An identity check can:
# no exported variable can make a laptop's `id -un` answer `ivohofland-research`, because
# that identity is who is running the shell, not what it is pointed at. This is why identity
# comes first — the docroot check below is a second, independent gate (it also catches a
# CloudPanel docroot path that differs from our default), not a substitute for this one.
# NO ESCAPE HATCH: there is deliberately no DEPLOY_USER override via the environment. An
# escape hatch here is exactly the hole this gate exists to close — an exported override is
# the same shape of bug as the exported DOCROOT that motivated it.
if [ "$(id -un)" != "$DEPLOY_USER" ]; then
  echo "✗ refusing: running as $(id -un), not $DEPLOY_USER" >&2
  echo "  This script runs a git reset --hard and an rsync --delete. It only runs as the" >&2
  echo "  deploy user, on the server — never on a developer machine, no exceptions." >&2
  exit 1
fi

# SERIALISE DEPLOYS — right after identity, before anything below that touches disk.
# `next build` (under `output: "export"`) does `rm -rf out/` at the START of its export
# phase, and nothing before this point stops two `deploy.sh` runs from overlapping: deploy A
# can pass GATE 3 below, then deploy B's build wipe `out/` out from under it between that
# check and the rsync, and A's `rsync --delete` then scans an EMPTY source — which empties
# the live docroot, copies nothing back, and still exits 0. Both runs print "✓ deployed" and
# CI stays green on both. This is not exotic: two pushes minutes apart, GitHub's "Re-run all
# jobs", or a manual run of this script while a webhook deploy is already in flight all start
# a second `deploy.sh` — and `deploy-webhook.sh` backgrounds the build and answers the HTTP
# request before the build even starts, so GitHub's `concurrency: group: deploy-main` only
# ever queues the PING, never the deploy it triggers.
#
# BLOCKING, not `flock -n` (skip-if-busy), ON PURPOSE. A skipped deploy would silently drop
# the commit that woke it: the deploy already holding the lock has already done its own
# `git reset --hard`, so by the time it finishes that commit is behind HEAD and nothing will
# ever come back for it — the site goes quietly stale under a green tick. Waiting instead
# means the queued run wakes up, resets to whatever `origin/main` is by then (at least as new
# as the commit that woke it), and ships that. The 1-hour cap is not "forever" for the same
# reason a skip is wrong: a deploy still holding the lock after an hour is stuck, not slow,
# and queuing runs behind a stuck one forever is worse than one loud, visible failure.
exec 9>"$HOME/.deploy.lock"
flock -w 3600 9 || { echo "✗ another deploy held the lock for over an hour; refusing" >&2; exit 1; }

# GATE 2: REFUSE TO RUN ANYWHERE BUT THE SERVER, and refuse before touching anything.
# Below this line are a `git reset --hard`, which destroys uncommitted work, and an
# `rsync --delete`, which empties whatever directory it is aimed at. The docroot exists
# only on the VPS (CloudPanel creates it), so its absence means either "you are not on the
# server" or "DOCROOT is wrong" — and both of those must stop here, not halfway through.
if [ ! -d "$DOCROOT" ]; then
  echo "✗ docroot does not exist: $DOCROOT" >&2
  echo "  This script deploys on the VPS, and will not run against a docroot it cannot find." >&2
  echo "  (If CloudPanel reports a different path for the site, set DOCROOT=... in" >&2
  echo "  ~/deploy.env — never in this script: git reset --hard overwrites deploy.sh itself" >&2
  echo "  on every run, so an edit here survives exactly one deploy.)" >&2
  exit 1
fi

echo "→ deploying $REPO_DIR → $DOCROOT"
cd "$REPO_DIR"
git fetch --all --prune
git reset --hard origin/main

cd "$APP_DIR"
npm ci
npm run build   # the gates. A failure exits here, before the swap.

# GATE 3: refuse an empty or missing export. `set -e` already aborts if `npm run build`
# itself exits non-zero — but it cannot catch a future regression that exits 0 while
# writing an empty or missing out/: rsync with --delete and an empty source does not
# error, it just deletes everything already in the docroot and copies nothing back. This
# checks for the one file that can only exist if the static export actually ran to
# completion, immediately before the rsync that would otherwise trust it blindly.
#
# THIS IS NOT THE DEFENSE AGAINST A CONCURRENT DEPLOY WIPING out/ FROM UNDER THIS ONE — it
# used to have to be, and a file check cannot do that job: `next build` deletes `out/` at
# the START of its own export phase, so a second build finishing between this check and the
# rsync below would make this check bless a directory that is gone a moment later. That is a
# check-then-act race, not a missing-file case, and no `[ -f ... ]` closes it. The LOCK taken
# near the top of this script is what closes it, by guaranteeing no second `npm run build` is
# running at all while this process holds it. What this check still catches on its own: a
# build that reports success (exit 0) while producing no export — a failure `set -e` cannot
# see, because nothing here failed.
if [ ! -f "$APP_DIR/out/index.html" ]; then
  echo "✗ refusing: $APP_DIR/out/index.html is missing" >&2
  echo "  The build reported success but produced no export. Deploying this would wipe" >&2
  echo "  the live docroot (rsync --delete) and replace it with nothing." >&2
  exit 1
fi

# THE SWAP. --delete because a page removed from the site must disappear from the site.
# --exclude '.well-known/' because Let's Encrypt writes its ACME challenge INTO the docroot,
# and a --delete racing a certificate renewal would eat it. --chmod so nginx can read what
# we just wrote regardless of the builder's umask.
rsync -a --delete --chmod=D755,F644 --exclude '.well-known/' "$APP_DIR/out/" "$DOCROOT/"

# Capture the sha into a variable on its own line so `set -e` sees a `git` failure directly:
# `echo "✓ ... $(git ...) ..."` puts the substitution inside echo's argument list, so if git
# fails, it is echo's own exit status (0) that `set -e` observes — and it prints a cheerful
# "✓ deployed" with a blank hash instead of aborting.
DEPLOY_SHA="$(git -C "$REPO_DIR" rev-parse --short HEAD)"
echo "✓ deployed $DEPLOY_SHA → $DOCROOT"
