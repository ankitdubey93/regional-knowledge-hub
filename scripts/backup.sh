#!/usr/bin/env bash
# Writes a pg_dump -Fc of the database to <dir>/chub-<UTC stamp>.dump (P5d). Runs pg_dump inside the db container.
#   scripts/backup.sh [dir]     default dir: backups
set -euo pipefail
OUT_DIR="${1:-backups}"
CONTAINER="${CHUB_DB_CONTAINER:-chub-db}"
DB="${CHUB_DB_NAME:-chub}"
mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/$DB-$(date -u +%Y%m%dT%H%M%SZ).dump"
# Write to .partial first, so an interrupted dump never looks complete.
docker exec "$CONTAINER" pg_dump -U chub -d "$DB" -Fc > "$FILE.partial"
mv "$FILE.partial" "$FILE"
echo "backup written: $FILE ($(wc -c < "$FILE") bytes)"
