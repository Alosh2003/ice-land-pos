#!/usr/bin/env bash
# ICE LAND local backend — restore database from backup
# Restores a database dump to the local PostgreSQL.
# Usage: bash scripts/restore-db.sh <backup-file>
# If no backup file is given, uses the latest in backups/

set -euo pipefail

BACKUP_FILE="${1:-$(ls -t backups/ice_land_backup_*.sql 2>/dev/null | head -1)}"

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: No backup file found. Use: bash scripts/restore-db.sh <path-to-backup>"
  exit 1
fi

echo "=== Restoring from: $BACKUP_FILE ==="

# Stop postgrest before restoring (to avoid connections during restore)
docker stop ice-land-postgrest 2>/dev/null || true

# Restore data to existing database
docker exec -i ice-land-db psql -U ice_land -d ice_land < "$BACKUP_FILE"

echo "✓ Restore complete"

# Restart postgrest
docker start ice-land-postgrest 2>/dev/null || true

echo "=== PostgREST restarted ==="
echo "✓ Done. Check: Invoke-WebRequest -Uri 'http://127.0.0.1:54321/settings?select=*' -Method Get"
