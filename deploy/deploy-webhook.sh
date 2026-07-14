#!/usr/bin/env bash
# Invoked by the webhook listener (adnanh/webhook) on a signature-verified request.
# Runs the real deploy DETACHED, via nohup: a build takes minutes, and this script's own
# process is what adnanh/webhook waits on, so without nohup the deploy would die with it.
# `nohup … &` lets deploy.sh outlive this script and routes its output to ~/deploy.log
# instead of nowhere. This is NOT what keeps the HTTP request itself fast: hooks.json sets
# no `include-command-output-in-response`, so webhook already runs this script in its own
# goroutine and answers with hooks.json's `response-message` ("deploy started")
# immediately, regardless of what this script does. nohup only decides whether the deploy
# survives past that response, not how fast the response arrives.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
nohup "$DIR/deploy.sh" >> "$HOME/deploy.log" 2>&1 &
