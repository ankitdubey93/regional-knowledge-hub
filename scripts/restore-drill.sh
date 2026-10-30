#!/usr/bin/env bash
# Restore drill (P5d): restores a dump into a scratch database, then checks rows, migrations and sealed data with the image.
#   scripts/restore-drill.sh <dump-file> [env-file]     default env-file: .env (production: .env.production)
set -euo pipefail
DUMP="${1:?usage: scripts/restore-drill.sh <dump-file> [env-file]}"
ENV_FILE="${2:-.env}"
CONTAINER="${CHUB_DB_CONTAINER:-chub-db}"
IMAGE="${CHUB_API_IMAGE:-compliance-hub-api:local}"
SCRATCH=chub_restore_drill
DRILL_URL="${DRILL_DATABASE_URL:-postgres://chub:chub@localhost:5432/$SCRATCH}"
docker exec "$CONTAINER" psql -U chub -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $SCRATCH" -c "CREATE DATABASE $SCRATCH OWNER chub"
docker exec -i "$CONTAINER" pg_restore -U chub -d "$SCRATCH" --exit-on-error < "$DUMP"
# The check runs in the API image on the db container's network, with the same key the API uses.
docker run --rm --network "container:$CONTAINER" --env-file "$ENV_FILE" -e DRILL_DATABASE_URL="$DRILL_URL" "$IMAGE" node --import tsx scripts/drill-check.ts
docker exec "$CONTAINER" psql -U chub -d postgres -c "DROP DATABASE $SCRATCH"
echo "restore drill finished"
