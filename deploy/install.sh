#!/usr/bin/env bash
# First-time setup of ApplyFlow on the VPS. Safe to re-run: every step checks
# before it changes anything, and existing secrets/config are never overwritten.
#
#   curl -fsSLO https://raw.githubusercontent.com/TySia-fr/ApplyFlow/main/deploy/install.sh
#   less install.sh          # read it first
#   bash install.sh
set -euo pipefail

DOMAIN="${DOMAIN:-applyflow.siavashizadi.com}"
APEX="${APEX:-siavashizadi.com}"
PORT="${APP_PORT:-3003}"
DIR="${APP_DIR:-$HOME/apps/applyflow}"
RAW="https://raw.githubusercontent.com/TySia-fr/ApplyFlow/main/deploy"

ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

echo "── Preflight"
for bin in docker nginx certbot curl openssl dig; do command -v "$bin" >/dev/null || die "missing: $bin"; done
sudo docker compose version >/dev/null || die "docker compose plugin missing"
ok "tools present"

want=$(dig +short "$APEX" | tail -1); got=$(dig +short "$DOMAIN" | tail -1)
[ -n "$got" ] || die "DNS: $DOMAIN does not resolve yet. Add an A record → $want, wait a few minutes, re-run."
[ "$got" = "$want" ] || die "DNS: $DOMAIN → $got, but this server ($APEX) is $want"
ok "DNS $DOMAIN → $got"

# Outputs captured first: `cmd | grep -q` can fail under pipefail when grep exits early.
listeners=$(sudo ss -ltnH "sport = :$PORT"); containers=$(sudo docker ps --format '{{.Names}}')
if [ -n "$listeners" ] && [[ "$containers" != *applyflow-app* ]]; then
  die "port $PORT is already used by something else; re-run with APP_PORT=<free port>"
fi
ok "port $PORT available"

avail_gb=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
[ "$avail_gb" -ge 3 ] || die "only ${avail_gb}G free on /; free space first (e.g. sudo docker system prune)"
[ "$avail_gb" -ge 6 ] || warn "only ${avail_gb}G free on /; consider: sudo docker image prune -a (unused images)"
ok "disk: ${avail_gb}G free"

echo "── Files"
mkdir -p "$DIR" && cd "$DIR"
for f in compose.prod.yaml update.sh backup.sh nginx.conf cron.sh setup-integrations.sh; do curl -fsSL "$RAW/$f" -o "$f"; done
chmod +x update.sh backup.sh cron.sh setup-integrations.sh
ok "downloaded deploy files to $DIR"

if [ ! -f .env ]; then
  umask 077
  cat > .env <<ENV
NODE_ENV=production
APP_URL=https://$DOMAIN
APP_PORT=$PORT
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
POSTGRES_PASSWORD=$(openssl rand -hex 24)
DEMO_RATE_LIMIT_PER_HOUR=5
CRON_SECRET=$(openssl rand -hex 32)
# Optional: enables email verification and password reset
RESEND_API_KEY=
EMAIL_FROM=
ENV
  ok "created .env with fresh secrets (chmod 600)"
else
  ok ".env exists; left unchanged"
fi
# Added in later versions: create missing secrets without touching existing values.
if ! grep -qE '^CRON_SECRET=.+' .env; then
  { grep -vE '^CRON_SECRET=' .env || true; echo "CRON_SECRET=$(openssl rand -hex 32)"; } > .env.tmp && cat .env.tmp > .env && rm -f .env.tmp
  ok "added CRON_SECRET to .env"
fi

echo "── Containers"
./update.sh            # resolves the latest commit on main to an exact image tag

echo "── Nginx"
SITE=/etc/nginx/sites-available/applyflow
if [ ! -f "$SITE" ]; then
  sed -e "s/__DOMAIN__/$DOMAIN/g" -e "s/__PORT__/$PORT/g" nginx.conf | sudo tee "$SITE" >/dev/null
  sudo ln -sf "$SITE" /etc/nginx/sites-enabled/applyflow
  sudo nginx -t || { sudo rm -f /etc/nginx/sites-enabled/applyflow "$SITE"; die "nginx config invalid; removed it, other sites untouched"; }
  sudo systemctl reload nginx
  ok "nginx site enabled"
else
  ok "nginx site exists; left unchanged"
fi
# Scheduled-job endpoints are for the server's own cron only: hide them from the internet.
if ! sudo grep -q "location /api/cron/" "$SITE"; then
  sudo cp "$SITE" "$SITE.bak"
  sudo sed -i 's#^\(\s*\)location /api/auth/ {#\1location /api/cron/ { return 404; }\n\n\1location /api/auth/ {#' "$SITE"
  if sudo nginx -t 2>/dev/null; then sudo systemctl reload nginx; ok "blocked /api/cron/ from outside"
  else sudo mv "$SITE.bak" "$SITE"; warn "could not add the /api/cron/ block; nginx config restored"; fi
fi

if ! sudo test -d "/etc/letsencrypt/live/$DOMAIN"; then
  sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect \
    || die "certbot failed (the site still works over http; fix and re-run)"
  ok "TLS certificate issued"
else
  ok "TLS certificate exists"
fi

echo "── Backups"
sudo install -m 755 backup.sh /usr/local/bin/applyflow-backup.sh
line="41 3 * * * APP_DIR=$DIR /usr/local/bin/applyflow-backup.sh >> /var/log/applyflow-backup.log 2>&1"
# `crontab -l` exits 1 when root has no crontab yet, and grep -v exits 1 when
# nothing is left: both are normal here, so neither may abort the script.
existing=$(sudo crontab -l 2>/dev/null || true)
kept=$(grep -vE 'applyflow-(backup|cron)' <<<"$existing" || true)
daily="50 6 * * * APP_DIR=$DIR $DIR/cron.sh daily >> /var/log/applyflow-cron.log 2>&1"
reminders="*/15 * * * * APP_DIR=$DIR $DIR/cron.sh reminders >> /var/log/applyflow-cron.log 2>&1"
printf '%s\n' "$kept" "$line" "$daily" "$reminders" | sed '/^$/d' | sudo crontab -
ok "nightly backup at 03:41, 14 days kept"
ok "scheduled jobs: offers daily at 06:50 UTC, reminders every 15 min"

echo "── Check"
sleep 2
code=$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/api/health" || true)
[ "$code" = 200 ] && ok "https://$DOMAIN is live" || warn "https://$DOMAIN/api/health returned $code"
