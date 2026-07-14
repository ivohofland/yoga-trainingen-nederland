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
