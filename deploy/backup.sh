#!/usr/bin/env bash
# Nightly backup: database dump + documents volume, kept 14 days.
# Restore steps: deploy/README.md
set -euo pipefail
DIR="${APP_DIR:-$HOME/apps/applyflow}"
OUT=/var/backups/applyflow
STAMP=$(date +%F)
mkdir -p "$OUT"
cd "$DIR"
docker compose -f compose.prod.yaml exec -T db pg_dump -U applyflow -Fc applyflow > "$OUT/db-$STAMP.dump"
docker run --rm -v applyflow_documents:/d:ro -v "$OUT":/b alpine tar czf "/b/docs-$STAMP.tgz" -C /d .
find "$OUT" -type f -mtime +14 -delete
echo "$(date -Is) backup ok: $(du -sh "$OUT/db-$STAMP.dump" | cut -f1) db, $(du -sh "$OUT/docs-$STAMP.tgz" | cut -f1) docs"
