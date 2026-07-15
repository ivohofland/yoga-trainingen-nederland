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
# it the same way.
#
# THIS is why DOCROOT belongs in ~/deploy.env and not ~/webhook.env — NOT because webhook.env
# is confined to the systemd unit. It isn't: EnvironmentFile= in the unit puts everything in
# webhook.env into webhook's own process environment, which the goroutine running
# deploy-webhook.sh inherits, which `nohup … &` passes to deploy.sh, which passes it to
# `npm ci` / `npm run build` and every package's lifecycle script in between. A value placed
# in webhook.env reaches all the way here whether anyone intends it to or not — that makes it
# the WRONG place for deploy config (a manual `bash deploy.sh` run never reads it at all, so
# DOCROOT would diverge between the two paths), not a safe one. ~/deploy.env is right because
# deploy.sh sources it ITSELF, explicitly, on the line below — the one channel both paths
# share on purpose.
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
# Distinguish a TIMEOUT (exit 1: another deploy held the lock past the cap) from every other
# failure (missing flock binary, a bad file descriptor, ...): both are non-zero, but only the
# first is actually "another deploy ran for over an hour" — reporting the other causes as that
# would state, as fact, an hour-long deploy that never happened. Either way the lock was NOT
# taken, so both branches still refuse rather than proceeding to race a concurrent deploy.
# `rc=$?` has to sit in the `else` of an `if`, not after `! flock …`: `!` negates the exit
# status that `$?` reports, so capturing `$?` after `if ! flock …; then` would read the
# NEGATED status (always 0 on failure), not flock's real one — the `if …; then :; else` shape
# below is also what keeps this compatible with `set -e`, since a bare failing statement would
# abort the script before `rc=$?` ever ran.
if flock -w 3600 9; then
  :
else
  rc=$?
  if [ "$rc" -eq 1 ]; then
    echo "✗ another deploy held the lock for over an hour; refusing" >&2
  else
    echo "✗ flock failed (exit $rc) — the lock was NOT taken; refusing rather than racing a" >&2
    echo "  concurrent deploy" >&2
  fi
  exit 1
fi

# GATE 2: REFUSE TO RUN ANYWHERE BUT THE SERVER, and refuse before touching anything.
# Below this line are a `git reset --hard`, which destroys uncommitted work, and an
# `rsync --delete`, which empties whatever directory it is aimed at. The docroot exists
# only on the VPS (CloudPanel creates it), so its absence means either "you are not on the
# server" or "DOCROOT is wrong" — and both of those must stop here, not halfway through.
#
# GATE 2 also checks the SHAPE of DOCROOT, not merely that it names a directory that exists.
# DOCROOT comes from ~/deploy.env — operator-edited, outside this repo's own review — and a
# typo there (e.g. `DOCROOT=/home/ivohofland-research`, missing the
# `/htdocs/research.ivohofland.nl` tail) names $HOME: a directory that exists, so a bare
# `-d` check approves it, and the `rsync --delete` below then empties it — ~/src,
# ~/deploy.env, ~/webhook.env, ~/.ssh, all gone. The site keeps looking healthy (nginx still
# serves the REAL, untouched docroot); the damage only surfaces at the NEXT deploy, when the
# checkout it needs is no longer there. A CloudPanel docroot always has the shape
# /home/<user>/htdocs/<site> — requiring that shape catches the typo here, before rsync ever
# runs, instead of one deploy later.
case "$DOCROOT" in
  /home/*/htdocs/*) ;;
  *)
    echo "✗ refusing: DOCROOT=$DOCROOT is not under a CloudPanel htdocs/ path." >&2
    echo "  Below this line is an rsync --delete; it aims at exactly one kind of directory." >&2
    exit 1
    ;;
esac
[ "$DOCROOT" != "$HOME" ] || {
  echo "✗ refusing: DOCROOT is \$HOME ($HOME) — rsync --delete would empty it." >&2
  exit 1
}
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

# out/ is GITIGNORED, so `git reset --hard` above never touches it — it survives across runs
# untouched. `next build`'s own export phase deletes it at the START of a successful export,
# but the hazard GATE 3 below guards against is a build that never REACHES that phase (fails
# at an earlier gate: validate, provenance, test, test:ci). `set -e` aborts the script on that
# failure, before the rsync — but without this line, a PREVIOUS successful run's out/ would
# still be sitting here for GATE 3 to find and bless as if it were THIS run's, and the rsync
# would then ship a stale build under the new commit's "✓ deployed <sha>". Deleting it here,
# unconditionally, before the build even starts, means everything GATE 3 checks below can only
# ever be this run's export, or nothing at all.
rm -rf "$APP_DIR/out"

npm run build   # the gates. A failure exits here, before the swap.

# GATE 3: refuse an export that leaks the internal work-list, or that is empty or missing.
# `set -e` already aborts if `npm run build` itself exits non-zero — these two checks catch
# the failure modes that don't: a future regression that exits 0 while writing a broken
# export. Both run immediately before the rsync that would otherwise trust `out/` blindly.
#
# THIS IS NOT THE DEFENSE AGAINST A CONCURRENT DEPLOY WIPING out/ FROM UNDER THIS ONE — it
# used to have to be, and a file check cannot do that job: `next build` deletes `out/` at
# the START of its own export phase, so a second build finishing between this check and the
# rsync below would make this check bless a directory that is gone a moment later. That is a
# check-then-act race, not a missing-file case, and no file check closes it. The LOCK taken
# near the top of this script is what closes it, by guaranteeing no second `npm run build` is
# running at all while this process holds it.

# GATE 3a — THE INTERNAL WORK-LIST MUST NOT REACH THE DOCROOT. `out/qa` can only exist if the
# build ran with an effective NODE_ENV other than "production" — the SAME predicate that
# gates both next.config.ts's `pageExtensions` and page.dev.tsx's own `notFound()` guard (see
# that file's docblock: those two are one lock written twice, not two independent ones, and
# they fail together). ~/deploy.env is sourced UNFILTERED above; one stray
# `NODE_ENV=development` line in it opens both of those at once. THIS check is the genuine
# second, independent lock: it inspects the built OUTPUT, not the env var either of the
# in-app checks read, so it still catches the leak even when both of them already failed open.
if [ -e "$APP_DIR/out/qa" ]; then
  echo "✗ refusing: the export contains /qa — the internal work-list would be published." >&2
  echo "  NODE_ENV was '${NODE_ENV:-unset}', not 'production', so pageExtensions admitted" >&2
  echo "  page.dev.tsx AND its notFound() guard opened. They are the same predicate; they" >&2
  echo "  fail together. Do not deploy this." >&2
  exit 1
fi

# GATE 3b — AN EMPTY (OR NEAR-EMPTY) CORPUS MUST NOT DEPLOY AS AN EMPTY SITE. loader.ts
# treats a MISSING data/providers/ as an error, but an EMPTY one as a valid, zero-record
# dataset — validate prints "✓ 0 records valid", out/index.html still exists, and a bare
# `[ -f out/index.html ]` check would pass while the rsync below removes every provider page
# from the live site and replaces them with nothing. The floor is a fact about the corpus
# (~48 records at the time this gate was written) with generous headroom below it — it is a
# guard against catastrophe, not a tripwire tuned to today's exact count.
# `|| true` on the assignment, not just `2>/dev/null` on find: this script runs under
# `set -o pipefail`, so if out/aanbieder/ does not exist at all, find's own non-zero exit
# becomes the PIPELINE's exit status (wc and tr both still succeed, but pipefail reports the
# last command that failed, not the last command that ran) — and `set -e` would abort the
# script right here, on a bash internal error, before the friendlier refusal message below
# ever runs. `|| true` only discards that exit status; PAGES is still assigned correctly (0,
# for a missing directory) either way, because command substitution assigns before `set -e`
# ever inspects the exit code.
PAGES=$(find "$APP_DIR/out/aanbieder" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ') || true
if [ ! -f "$APP_DIR/out/index.html" ] || [ "$PAGES" -lt 40 ]; then
  echo "✗ refusing: export has $PAGES provider pages (expected ≥40) — deploying this would" >&2
  echo "  rsync --delete the live records away and replace them with nothing." >&2
  exit 1
fi

# THE SWAP. --delete because a page removed from the site must disappear from the site.
#
# --delete-after (rsync's default is delete-DURING) + --delay-updates: rsync stages new and
# changed files in a hidden temp dir alongside the destination and moves them into place, and
# only removes stale files, ALL at the very end of the transfer. An OOM kill, a reboot, or a
# power loss mid-rsync therefore leaves the docroot exactly as it was before this run — old
# content, possibly missing the newest page — never half-deleted. (KillMode=process in
# webhook-yoga-research.service already stops a LISTENER restart from SIGTERMing a deploy
# mid-rsync; this guards the causes systemd cannot prevent — the process dying outright.)
#
# --exclude '.well-known/' because Let's Encrypt writes its ACME challenge INTO the docroot,
# and a --delete racing a certificate renewal would eat it. --chmod so nginx can read what
# we just wrote regardless of the builder's umask.
rsync -a --delete-after --delay-updates --chmod=D755,F644 --exclude '.well-known/' \
  "$APP_DIR/out/" "$DOCROOT/"

# Capture the sha into a variable on its own line so `set -e` sees a `git` failure directly:
# `echo "✓ ... $(git ...) ..."` puts the substitution inside echo's argument list, so if git
# fails, it is echo's own exit status (0) that `set -e` observes — and it prints a cheerful
# "✓ deployed" with a blank hash instead of aborting.
DEPLOY_SHA="$(git -C "$REPO_DIR" rev-parse --short HEAD)"
echo "✓ deployed $DEPLOY_SHA → $DOCROOT"
