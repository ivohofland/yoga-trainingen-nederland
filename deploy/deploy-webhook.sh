#!/usr/bin/env bash
# Invoked by the webhook listener (adnanh/webhook) on a signature-verified request.
# Runs the real deploy DETACHED so the HTTP request returns 200 immediately — a build here
# takes minutes, and the listener would otherwise hold the connection open until it timed
# out and GitHub Actions called the deploy a failure. Progress lands in ~/deploy.log.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
nohup "$DIR/deploy.sh" >> "$HOME/deploy.log" 2>&1 &
echo "deploy started"
