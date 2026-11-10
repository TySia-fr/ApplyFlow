#!/usr/bin/env bash
# Triggers a scheduled job inside the app. Installed by install.sh; run by root's cron.
#   cron.sh daily       # run saved searches + send Telegram digests
#   cron.sh reminders   # interview and follow-up reminders
set -euo pipefail
JOB="${1:?usage: cron.sh daily|reminders}"
DIR="${APP_DIR:-$HOME/apps/applyflow}"
env_get() { grep -E "^$1=" "$DIR/.env" | tail -1 | cut -d= -f2-; }
PORT=$(env_get APP_PORT); PORT=${PORT:-3003}
SECRET=$(env_get CRON_SECRET)
[ -n "$SECRET" ] || { echo "CRON_SECRET missing in $DIR/.env"; exit 1; }
# The secret goes in a header read from stdin, so it never appears in `ps` output.
curl -fsS -m 300 -X POST -H @- "http://127.0.0.1:$PORT/api/cron/$JOB" <<<"Authorization: Bearer $SECRET"
echo
