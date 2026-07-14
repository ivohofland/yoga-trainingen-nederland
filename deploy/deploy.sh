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

# GATE 2: REFUSE TO RUN ANYWHERE BUT THE SERVER, and refuse before touching anything.
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

# GATE 3: refuse an empty or missing export. `set -e` already aborts if `npm run build`
# itself exits non-zero — but it cannot catch a future regression that exits 0 while
# writing an empty or missing out/: rsync with --delete and an empty source does not
# error, it just deletes everything already in the docroot and copies nothing back. This
# checks for the one file that can only exist if the static export actually ran to
# completion, immediately before the rsync that would otherwise trust it blindly.
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
