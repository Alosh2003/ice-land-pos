#!/usr/bin/env bash
# ICE LAND local backend — backup database
# Creates timestamped dump of all tables + settings + users.
# Run from project root: bash scripts/backup-db.sh

set -euo pipefail

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="backups"
BACKUP_FILE="$BACKUP_DIR/ice_land_backup_${TIMESTAMP}.sql"

mkdir -p "$BACKUP_DIR"

echo "=== Backing up database to $BACKUP_FILE ==="
docker exec -i ice-land-db pg_dump -U ice_land -d ice_land --no-privileges --clean --if-exists > "$BACKUP_FILE"

# Count tables/functions in dump
TABLE_COUNT=$(grep -c "^CREATE TABLE" "$BACKUP_FILE" || true)
FUNC_COUNT=$(grep -c "^CREATE FUNCTION" "$BACKUP_FILE" || true)
SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

echo "✓ Backup complete: $BACKUP_FILE ($SIZE)"
echo "  Tables: $TABLE_COUNT, Functions: $FUNC_COUNT"
echo ""
echo "=== Retention: Keeping last 10 backups ==="
ls -t "$BACKUP_DIR"/ice_land_backup_*.sql | tail -n +11 | xargs -r rm -f
echo "Deleted old backups (keeping 10 newest)."
