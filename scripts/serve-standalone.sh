#!/usr/bin/env bash
# Runs the production standalone build locally (used for E2E tests).
# Usage: scripts/serve-standalone.sh [port]
set -euo pipefail
PORT="${1:-3100}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
cp -r "$ROOT/.next/static" "$ROOT/.next/standalone/.next/"
[ -d "$ROOT/public" ] && cp -r "$ROOT/public" "$ROOT/.next/standalone/"
cd "$ROOT/.next/standalone"
set -a; [ -f "$ROOT/.env" ] && . "$ROOT/.env"; set +a
export PORT HOSTNAME=127.0.0.1 STORAGE_DIR="${STORAGE_DIR:-$ROOT/storage}"
nohup node server.js > "${LOG_FILE:-/tmp/applyflow.log}" 2>&1 &
for _ in $(seq 1 30); do curl -sf "http://127.0.0.1:${PORT}/api/health" >/dev/null && { echo "ready on :${PORT}"; exit 0; }; sleep 0.5; done
echo "server failed to start"; tail -20 "${LOG_FILE:-/tmp/applyflow.log}"; exit 1
