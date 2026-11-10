#!/usr/bin/env bash
# Connects the Telegram bot and La Bonne Alternance. Run on the server:
#   cd ~/apps/applyflow && ./setup-integrations.sh
# Secrets are typed hidden (never echoed, never in shell history), written to
# .env (chmod 600), the app is restarted, and the Telegram webhook registered.
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] || { echo "Run install.sh first."; exit 1; }

ok()  { printf '\033[32m✓\033[0m %s\n' "$*"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

env_get() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- || true; }
env_set() { # replace or append KEY=VALUE without ever printing VALUE
  local key="$1" value="$2" tmp
  tmp=$(mktemp)
  grep -vE "^$key=" .env > "$tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  cat "$tmp" > .env && rm -f "$tmp"
}

DOMAIN=$(env_get APP_URL); DOMAIN=${DOMAIN#https://}
BOT_USERNAME="${BOT_USERNAME:-ApplyFlowAppBot}"

echo "── Telegram (@$BOT_USERNAME)"
current=$(env_get TELEGRAM_BOT_TOKEN)
if [ -n "$current" ]; then
  ok "token already set (press Enter to keep it)"
fi
read -rsp "Bot token from @BotFather (hidden; Enter to keep/skip): " token; echo
token=${token:-$current}
if [ -n "$token" ]; then
  [[ "$token" =~ ^[0-9]+:[A-Za-z0-9_-]{30,}$ ]] || die "that doesn't look like a bot token"
  me=$(curl -fsS "https://api.telegram.org/bot$token/getMe" || true)
  [[ "$me" == *"\"username\":\"$BOT_USERNAME\""* ]] || die "token is not for @$BOT_USERNAME (or Telegram unreachable)"
  secret=$(env_get TELEGRAM_WEBHOOK_SECRET); secret=${secret:-$(openssl rand -hex 32)}
  env_set TELEGRAM_BOT_TOKEN "$token"
  env_set TELEGRAM_BOT_USERNAME "$BOT_USERNAME"
  env_set TELEGRAM_WEBHOOK_SECRET "$secret"
  ok "token verified for @$BOT_USERNAME"
fi

echo "── La Bonne Alternance"
current=$(env_get LBA_API_KEY)
[ -n "$current" ] && ok "key already set (press Enter to keep it)"
read -rsp "API key from api.apprentissage.beta.gouv.fr (hidden; Enter to keep/skip): " lba; echo
lba=${lba:-$current}
[ -n "$lba" ] && env_set LBA_API_KEY "$lba" && ok "key saved"

[ -n "$(env_get CRON_SECRET)" ] || { env_set CRON_SECRET "$(openssl rand -hex 32)"; ok "cron secret created"; }
chmod 600 .env

echo "── Restart"
tag=$(cat .deployed-tag 2>/dev/null || true)
[ -n "$tag" ] || die "no deployed version found; run ./update.sh first"
./update.sh "$tag"

if [ -n "${token:-}" ]; then
  echo "── Webhook"
  secret=$(env_get TELEGRAM_WEBHOOK_SECRET)
  # Body via stdin so neither the token nor the secret shows up in `ps`.
  res=$(curl -fsS -X POST -H "Content-Type: application/json" --data @- "https://api.telegram.org/bot$token/setWebhook" <<JSON
{"url":"https://$DOMAIN/api/telegram/webhook","secret_token":"$secret","allowed_updates":["message","callback_query"],"drop_pending_updates":true}
JSON
)
  [[ "$res" == *'"ok":true'* ]] || die "setWebhook failed: $res"
  curl -fsS -X POST -H "Content-Type: application/json" --data @- "https://api.telegram.org/bot$token/setMyCommands" >/dev/null <<'JSON'
{"commands":[{"command":"today","description":"What's due today"},{"command":"help","description":"What this bot can do"},{"command":"unlink","description":"Disconnect this chat"}]}
JSON
  ok "webhook registered: https://$DOMAIN/api/telegram/webhook"
fi
echo
ok "done. In ApplyFlow: Settings → Telegram → Connect."
