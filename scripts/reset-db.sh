#!/usr/bin/env bash
# ICE LAND local backend — reset database
# Drops and recreates the local database, applies all migrations, then seeds.
#
# Usage: ./scripts/reset-db.sh
# Requires: docker, psql (or docker exec into the running container)

set -euo pipefail

DB_NAME="ice_land"
DB_USER="ice_land"
DB_PASS="ice_land_dev"
CONTAINER="ice-land-db"
MIGRATIONS_DIR="local-supabase/supabase/migrations"

echo "==> Stopping and removing existing container (if any)"
docker stop "$CONTAINER" 2>/dev/null || true
docker rm "$CONTAINER" 2>/dev/null || true

echo "==> Starting fresh PostgreSQL container"
docker run -d --name "$CONTAINER" \
  -e POSTGRES_DB="$DB_NAME" \
  -e POSTGRES_PASSWORD="$DB_PASS" \
  -e POSTGRES_USER="$DB_USER" \
  -p 5432:5432 \
  postgres:17-alpine

echo "==> Waiting for PostgreSQL to be ready"
for i in $(seq 1 30); do
  if docker exec -i "$CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "==> Applying migrations in order"
for f in "$MIGRATIONS_DIR"/*.sql; do
  echo "    Applying $(basename "$f")"
  docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < "$f" || {
    echo "    ERROR: failed to apply $f"
    exit 1
  }
done

echo "==> Seeding storage buckets"
docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < local-supabase/supabase/seed.sql

echo "==> Done. Database ready at localhost:5432"
echo "    Connect: PGPASSWORD=$DB_PASS psql -h localhost -U $DB_USER -d $DB_NAME"
echo "    PostgREST API: http://127.0.0.1:54321"
