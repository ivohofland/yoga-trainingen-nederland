#!/usr/bin/env bash
# Invoked by the webhook listener (adnanh/webhook) on a signature-verified request.
# Runs the real deploy DETACHED: a build takes minutes, and webhook's own goroutine would
# otherwise wait on this script's exit before it can respond.
#
# `&` IS WHAT DETACHES deploy.sh. Backgrounding it from THIS script — itself invoked by
# webhook, a non-interactive process with no controlling terminal — means bash never has a
# SIGHUP to deliver to it when this script exits; `&` alone already lets deploy.sh outlive the
# wrapper. `nohup` adds nothing on that path. It matters only for the OTHER way this script
# can run: by hand, from an interactive terminal. Closing that terminal DOES send SIGHUP to
# its background jobs, and `nohup` is what stops deploy.sh dying with it — belt-and-braces for
# a manual invocation, not the mechanism the webhook path depends on.
#
# THE LOAD-BEARING PART, for both paths, is the `>> deploy.log 2>&1` redirect. hooks.json sets
# no `include-command-output-in-response`, so webhook answers the HTTP request with hooks.json's
# own `response-message` as soon as this script's process exits — but that exit is gated on
# deploy.sh's stdout/stderr reaching EOF, because `nohup … &` inherits this script's file
# descriptors unless something else is done first. Without the redirect, deploy.sh's
# minutes-long build output stays connected to the same pipe webhook is reading from, and
# webhook's own Wait() blocks on that pipe for the whole build. The redirect moves those
# descriptors to the log file BEFORE backgrounding, so this script (and webhook's read on it)
# returns immediately, and the build proceeds unobserved into ~/deploy.log.
#
# What survives a LISTENER RESTART mid-deploy is neither of these — it is `KillMode=process`
# in webhook-yoga-research.service, which stops systemd from SIGTERMing the whole process
# group (deploy.sh included) when the unit itself restarts. That is a property of the service
# file, not of anything in this script.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$HOME/deploy.log"

# Fail LOUD, before backgrounding — not after. Once `nohup … &` returns, this script's own
# exit code no longer says anything about whether the deploy runs: webhook has already sent
# its response either way. If the log cannot be written or deploy.sh is not executable, that
# has to surface HERE, synchronously, or it is lost — webhook logs only that this script ran,
# not that the thing it launched did.
: >>"$LOG" || { echo "FATAL: cannot write $LOG — deploy NOT started" >&2; exit 1; }
[ -x "$DIR/deploy.sh" ] || {
  echo "FATAL: $DIR/deploy.sh not executable — deploy NOT started" | tee -a "$LOG" >&2
  exit 1
}

# `env -u DEPLOY_WEBHOOK_SECRET`: this script's own environment carries the secret (systemd's
# EnvironmentFile= in webhook-yoga-research.service puts it there for webhook's own HMAC
# check, and this script inherits webhook's environment wholesale — see deploy.sh's comment
# on ~/deploy.env for why that inheritance is NOT confined to the unit). deploy.sh has no use
# for the secret, and everything IT runs — npm ci, npm run build, and every package's
# lifecycle script along the way — would otherwise inherit it too. Strip it here, at the one
# hop that knows it is a secret and has no further reason to pass it on.
nohup env -u DEPLOY_WEBHOOK_SECRET "$DIR/deploy.sh" >>"$LOG" 2>&1 &
