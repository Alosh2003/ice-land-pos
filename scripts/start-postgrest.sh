#!/usr/bin/env bash
# ICE LAND local backend — start PostgREST API
# Requires: ice-land-db PostgreSQL container running on port 5432

set -euo pipefail

CONTAINER="ice-land-postgrest"

echo "==> Stopping existing PostgREST container (if any)"
docker stop "$CONTAINER" 2>/dev/null || true
docker rm "$CONTAINER" 2>/dev/null || true

echo "==> Creating shared network (if needed)"
docker network create ice-land-net 2>/dev/null || true
docker network connect ice-land-net ice-land-db 2>/dev/null || true

echo "==> Starting PostgREST on http://127.0.0.1:54321"
docker run -d --name "$CONTAINER" --network ice-land-net -p 54321:3000 \
  -e PGRST_DB_URI="postgres://ice_land:ice_land_dev@ice-land-db:5432/ice_land" \
  -e PGRST_DB_SCHEMA="public" \
  -e PGRST_DB_ANON_ROLE="ice_land" \
  -e PGRST_JWT_SECRET="local-dev-secret-do-not-use-in-prod" \
  -e PGRST_MAX_ROWS="1000" \
  public.ecr.aws/supabase/postgrest:v16.5

echo "==> Done. API at http://127.0.0.1:54321"
echo "    Test: curl http://127.0.0.1:54321/settings?select=*"
