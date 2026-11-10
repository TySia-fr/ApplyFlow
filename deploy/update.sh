#!/usr/bin/env bash
# Deploy a version: pull images, run migrations, swap the app, verify health.
# Rolls back to the previous version automatically if the new one is unhealthy.
#
#   ./update.sh              # latest commit on main that passed CI
#   ./update.sh sha-abc1234  # a specific build
set -euo pipefail
cd "$(dirname "$0")"

# `sudo` resets the environment, so APP_TAG must be passed after it.
dc() { local tag="$1"; shift; sudo APP_TAG="$tag" docker compose -f compose.prod.yaml "$@"; }
PORT=$(grep -E '^APP_PORT=' .env | cut -d= -f2); PORT=${PORT:-3003}
TAG="${1:-}"
if [ -z "$TAG" ] || [ "$TAG" = "main" ]; then
  # Latest commit on main whose CI run succeeded (tests passed AND images
  # were pushed), not merely the latest commit, whose images may still be building.
  # Output is captured first, then parsed: no `curl | …` pipe to break under pipefail.
  runs=$(curl -fsSL "https://api.github.com/repos/TySia-fr/ApplyFlow/actions/runs?branch=main&event=push&status=success&per_page=1")
  sha=$(python3 -c 'import json,sys; r=json.loads(sys.argv[1])["workflow_runs"]; print(r[0]["head_sha"] if r else "")' "$runs")
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "no successful CI run on main yet"; exit 1; }
  TAG="sha-${sha:0:7}"
fi
PREV=$(cat .deployed-tag 2>/dev/null || echo "")

healthy() {
  for _ in $(seq 1 40); do
    curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && return 0
    sleep 2
  done
  return 1
}

echo "deploying $TAG (previous: ${PREV:-none})"
dc "$TAG" pull migrate app \
  || { echo "image $TAG not found. Did CI finish? Is the package public (see deploy/README.md)?"; exit 1; }
# Migrations are additive, so the previous app version keeps working against the new schema.
dc "$TAG" up -d

if healthy; then
  echo "$TAG" > .deployed-tag
  echo "✓ $TAG is healthy"
  sudo docker image prune -f --filter "label=org.opencontainers.image.source=https://github.com/TySia-fr/ApplyFlow" >/dev/null || true
  exit 0
fi

echo "✗ $TAG failed its health check"
dc "$TAG" logs --tail 50 app || true
if [ -n "$PREV" ] && [ "$PREV" != "$TAG" ]; then
  echo "rolling back to $PREV"
  dc "$PREV" up -d app
  healthy && echo "✓ rolled back to $PREV" || echo "✗ rollback also unhealthy; check: sudo docker compose -f compose.prod.yaml logs app"
fi
exit 1
