# ICE LAND — Local Deployment Guide

**Fully local, self-contained deployment of the ICE LAND POS + Store Management system.**

> **Note:** This is a **local** deployment running on your machine with no Lovable Cloud. It uses only local services. Everything runs on `localhost`.

---

## 📊 System Requirements

### Hardware
| Component | Minimum | Recommended |
|-----------|---------|-------------|
| OS | Windows 10+ | Windows 10/11 |
| RAM | 2 GB | 4 GB+ (8 GB+ for development) |
| Disk | 2 GB | 10 GB+ (for Docker + databases) |
| CPU | 2 cores | 4+ cores |

### Software

| Software | Version | Required | Installation |
|----------|---------|----------|--------------|
| **Docker Desktop** | 4.30+ | ✅ Essential | [docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/) — **Must be running** |
| **Node.js** | 22.14+ | ✅ Essential | [nodejs.org](https://nodejs.org/) (or via `nvm`) |
| **Git** | 2.40+ | ✅ Essential | [git-scm.com](https://git-scm.com/) |
| **PowerShell (PS 5.1+)** | 5.1+ | ✅ Windows 10/11 (required for scripts) | Built into Windows |
| **PowerShell Core (pwsh)** | 7.0+ | ⚠️ Recommended | [github.com/PowerShell](https://github.com/PowerShell) |

### Optional
| Software | Purpose |
|----------|---------|
| **Supabase CLI** | Database migrations (already installed if you followed this guide) |
| **pgAdmin** | Database browsing |
| **Insomnia / Postman** | API testing |

---

## 🗄️ Database

| Component | Technology | Version | Port | Status |
|-----------|-----------|---------|------|--------|
| **PostgreSQL** | Docker `postgres:17-alpine` | 17 | `5432` | ✅ Running |
| **PostgREST** | Docker `supabase/postgrest` | v16.5 | `54321` | ✅ Running |
| **Storage Buckets** | PostgreSQL `storage` schema | N/A | — | ✅ Running |

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser (Frontend)                      │
│         http://localhost:8082 (Vite Dev Server)              │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼─────────────────────────────┐
│                    API Server (PostgREST)                  │
│                http://127.0.0.1:54321                       │
└─────────────────────────────┬─────────────────────────────┘
                              │
┌─────────────────────────────▼─────────────────────────────┐
│                    Database (PostgreSQL)                   │
│                Docker → postgres:17-alpine:5432             │
└─────────────────────────────────────────────────────────────┘
```

**No separate backend server needed** — PostgREST handles all API/RPC endpoints directly on the database.

---

## 🔑 Environment Configuration

The application uses `.env.local` for all local configuration. Never commit this file.

### Default Setup (You're Good to Go)

The current `.env.local` points to:
```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=local-anon-key
```

**You don't need to change anything** — the system is pre-configured for local.

### Custom Settings (Optional)

| Variable | Purpose | Default |
|----------|---------|---------|
| `VITE_SUPABASE_URL` | PostgREST API URL | `http://127.0.0.1:54321` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | API key | `local-anon-key` |
| `SUPABASE_URL` | Server-side PostgREST URL | `http://127.0.0.1:54321` |
| `SUPABASE_PUBLISHABLE_KEY` | Server-side key | `local-anon-key` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only (bypasses RLS) | `local-service-role-key` |
| `LOG_LEVEL` | Logging verbosity | `info` |

---

## 🚀 Installation

### 1. Clone and Setup
```powershell
git clone <your-repo-url>
cd ice-land-main
```

### 2. Install Dependencies
```powershell
npm install
```

### 3. Verify Prerequisites
```powershell
docker --version        # Should show v4.30+
node --version          # Should show v22.14+
```

### 4. Ensure Docker Desktop is Running
The Docker Desktop service might be stopped. Start it:
1. Open Docker Desktop app
2. Wait for "Docker Desktop running" in the status bar
3. Run: `docker info` to verify

---

## ▶️ Running the Application

### Option A: Development Mode (Recommended for Testing)
Use this for development and testing with hot-reload.

```powershell
npm run dev
```

**What it does:**
1. Starts Vite dev server on `http://localhost:8082`
2. Uses hot-reload for faster development
3. Compiles TSX on the fly
4. Proxy requests to PostgREST (via `.env.local`)

**Access the app:**
- **UI:** http://localhost:8082
- **Auth:** http://localhost:8082/auth

### Option B: Production Build
Use this when you want a built version.

```powershell
npm run build
npm run preview
```

**Or start the built server directly:**
```powershell
npm start
```

---

## 🔑 Default Credentials

**Admin User:**
| Field | Value |
|-------|-------|
| Email | `admin@iceland.local` |
| Password | `Admin123!` |
| Role | `admin` |

**API Keys:**
| Key | Purpose | Where to use |
|-----|---------|--------------|
| `local-anon-key` | Browser/frontend calls (PostgREST) | Browser apps, scripts |
| `local-service-role-key` | Server-side calls (bypasses RLS) | Server code, scripts |

**Test API (from PowerShell):**
```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:54321/settings?select=*" -Method Get
```

---

## 🗄️ Database Setup

### Fresh Database (For New Installs)
The database is pre-configured with:
- 19 tables, 68 functions
- All migrations applied (0000-0011)
- Seed data (39 products, 4 categories, default settings)
- Default admin user (`admin@iceland.local` / `Admin123!`)

**If you already have a database:**
```powershell
# Drop and recreate fresh
docker stop ice-land-db; docker rm ice-land-db
docker run -d --name ice-land-db -e POSTGRES_DB=ice_land -e POSTGRES_PASSWORD=ice_land_dev -e POSTGRES_USER=ice_land -p 5432:5432 postgres:17-alpine

# Apply migrations
Get-Content local-supabase/supabase/migrations/*.sql -Raw | docker exec -i ice-land-db psql -U ice_land -d ice_land
```

### Backup
```powershell
bash scripts/backup-db.sh
```
Creates `backups/ice_land_backup_YYYYMMDD_HHMMSS.sql`, keeps 10 most recent.

### Restore
```powershell
bash scripts/restore-db.sh backups/ice_land_backup_20240101_120000.sql
```

### Reset to Fresh (Drop + Migrate + Seed)
```powershell
bash scripts/reset-db.sh
```

---

## 🧪 Testing

### Run Tests
```powershell
npm run test
```
Runs:
- **29 tests** — Browser-safe rule helpers (`cart.ts`, `operations.ts`, `credit.ts`)
- Test coverage includes: cart math, daily stock, FIFO allocation, aging, customer status

### Manual Test Scenarios

| Scenario | Steps | Expected |
|----------|-------|----------|
| **Login** | Visit `/auth`, sign in | Redirect to `/dashboard` |
| **POS Sale** | Go to `/pos`, add items, complete with cash | Receipt shows, stock deducted |
| **Deferred Sale** | Select customer in POS, choose Deferred, complete | Sale on account, due date set |
| **Customer Payment** | Go to `/customers/<id>`, "Receive Payment" | FIFO allocation, balance reduced |
| **Customer Statement** | Go to `/customers/<id>`, "Statement" | Date range, opening/closing balance |
| **Receivables Aging** | Go to `/receivables` | Aging by buckets |
| **User Management** | Go to `/users` (admin) | Create/edit/delete users, assign roles |
| **Audit Log** | Go to `/audit` | Logs of all actions |
| **Daily Inventory** | Go to `/inventory` | Opening/waste/additions/close |

---

## 🛡️ Security & Access Control

### Roles & Permissions

| Role | Dashboard | POS | Sales | Products | Customers | Receivables | Inventory | Cashiers | Audit | Settings | Users |
|------|-----------|-----|-------|----------|-----------|-------------|-----------|----------|-------|----------|-------|
| **Admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Manager** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Cashier** | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Accountant** | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |

### Security Features
- **Session expiry**: Auto-logout after 1 hour of inactivity
- **Password strength**: 8+ chars, uppercase + digit
- **Login rate limiting**: 5 failed attempts → account locked 15 min
- **Account lockout**: 10 failed attempts across all sessions → auto-lock
- **Login audit trail**: All auth events logged in audit_logs
- **Failed password reset**: 15-minute token expiry, one-time use
- **RLS Policies**: Database-level row security on all tables
- **Deferred guard**: Can't deactivate "Deferred" payment while balances exist

### Local-Only Changes
- No Google OAuth (local email/password only)
- No Supabase Auth (custom `app_users` + `app_session`)
- No Lovable Cloud dependency

---

## 📦 Production Build

### Build
```powershell
npm run build
```
Output in `dist/` — ready for deployment to any static host or reverse proxy.

### Deployment Options

| Option | How | Notes |
|--------|-----|-------|
| **IIS** | Use `npx serve` or IIS static site hosting | `npm start` or `vite preview` for backend |
| **nginx** | Configure `location /` for static + `/api/*` proxy | Proxy to PostgREST or use CORS |
| **Docker** | Build custom image or use existing setup | See `docker-compose.yml` (create if needed) |
| **Anywhere** | Copy `dist/` + PostgREST is the only backend needed | Good for internal office network |

### SSL / HTTPS
For production, serve via reverse proxy (nginx, IIS). Since this is local, `http://localhost` is acceptable.

---

## 🔧 Troubleshooting

### Docker Won't Start
1. Open Docker Desktop app — wait for "Docker Desktop running" status
2. If stopped, start it: `docker start`
3. Check version: `docker info`

### Vite Dev Server Won't Start
```powershell
# Clear cache
Remove-Item node_modules\.vite -Recurse
npm run dev
```

### Database Connection Issues
```powershell
# Check DB health
docker exec ice-land-db psql -U ice_land -d ice_land -c "SELECT 1"

# Check PostgREST health
Invoke-WebRequest -Uri "http://127.0.0.1:54321/settings?select=*" -Method Get
```

### PostgREST Not Updated
After new migration:
```powershell
docker restart ice-land-postgrest
docker network connect ice-land-net ice-land-postgrest  # Re-connect if network dropped
```

### Old Data Stuck
To wipe and start fresh:
```powershell
bash scripts/reset-db.sh
docker restart ice-land-postgrest
```

### "Invalid path specified in request URL" on sign-in
PostgREST returns `PGRST125` for any path it does not serve. supabase-js adds the
Supabase gateway prefix (`/rest/v1`, `/storage/v1`) to every request, but a plain
PostgREST container serves tables and RPCs at the root (`/rpc/...`, `/settings`).
`src/integrations/supabase/client.ts` rewrites the `/rest/v1` prefix in its fetch
wrapper. If this error returns, check that the wrapper is intact and that the
request URL in DevTools is `http://127.0.0.1:54321/rpc/...` (without `/rest/v1`).

### Arabic text shows as "????????"
This happens when migrations/seeds are applied by a non-UTF-8 client (for example
`psql -c` from a Windows console). Copy the SQL file into the container and run it
from inside, where the file is read as UTF-8:

```powershell
docker cp local-supabase/fix_arabic_seed.sql ice-land-db:/tmp/fix_arabic_seed.sql
docker exec ice-land-db psql -U ice_land -d ice_land -v ON_ERROR_STOP=1 -f /tmp/fix_arabic_seed.sql
```

The script repairs category names, product names, the currency symbol, and the
payment method labels, and is safe to re-run.

### Permission Denied on Windows
```powershell
# Run as Administrator
docker stop ice-land-db; docker rm ice-land-db
docker run -d --name ice-land-db -e POSTGRES_DB=ice_land -e POSTGRES_PASSWORD=ice_land_dev -e POSTGRES_USER=ice_land -p 5432:5432 postgres:17-alpine
```

### Local Storage Usage (Working)
The local API gateway at `http://127.0.0.1:54320` serves the Supabase storage API
used by product images, the store logo, and payment proofs:
- `POST /storage/v1/object/{bucket}/{path}` → uploads (multipart), upsert via `x-upsert: true`
- `POST /storage/v1/object/sign/{bucket}/{path}` → signed URL (`{ "expiresIn": N }`)
- `GET /storage/v1/object/sign/{bucket}/{path}?token=...` → serves the file

### Slow Performance
1. Increase `refetchInterval` for inventory (currently 60s, reduce to 10s if needed)
2. Add database indexes:
```sql
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_created ON audit_logs(entity, created_at);
```

### Local API Gateway Not Running (Storage / API 404s)
`src/integrations/supabase/client.ts` points the Supabase client at the local
API gateway at `http://127.0.0.1:54320`. That gateway must be running:

```powershell
npm run dev:api
```

It forwards `/rest/v1/*` to PostgREST on `127.0.0.1:54321` and serves
`/storage/v1/*` (uploads + signed URLs) from local files. If it is stopped,
REST calls will return `PGRST125 Invalid path specified in request URL` and
storage calls will return `404`.

### Image Download Slow
First install may take 5-15 min to download Docker images. Run:
```powershell
docker pull postgres:17-alpine
docker pull public.ecr.aws/supabase/postgrest:v16.5
```

---

## 📊 Services & Ports

| Service | Port | Access | Purpose |
|---------|------|--------|---------|
| **Local API Gateway** | `54320` | http://127.0.0.1:54320 | Supabase-style gateway: forwards `/rest/v1` to PostgREST, serves `/storage/v1` |
| **Vite Dev Server** | `8082` | http://localhost:8082 | Frontend (Testing) |
| **PostgREST API** | `54321` | http://127.0.0.1:54321 | Backend (All queries/RPCs) |
| **PostgreSQL** | `5432` | `ice_land:ice_land_dev@localhost` | Database |
| **Docker Desktop** | N/A | N/A | Container management |

---

## 🗄️ Local Storage Buckets

| Bucket | Purpose | RLS Policy |
|--------|---------|------------|
| `product-images` | Product photos | Staff read, manager upload |
| `payment-proofs` | Payment receipts (per-user folders) | Cashier upload, invoice-authorized read |

> ✅ **Served locally** through the local API gateway at
> `http://127.0.0.1:54320/storage/v1/...` (see `local-supabase/local-api.mjs`).
> Uploads (`POST /storage/v1/object/{bucket}/{path}`) and signed URLs
> (`POST /storage/v1/object/sign/{bucket}/{path}`) are served from local files
> under `local-supabase/storage/`.

---

## 📋 Quick Start Checklist

- [ ] Docker Desktop is running (`docker info` shows server info)
- [ ] Dependencies installed: `npm install`
- [ ] API gateway started: `npm run dev:api` (also: `node local-supabase/local-api.mjs`)
- [ ] Dev server started: `npm run dev`
- [ ] Dev server responds: `Invoke-WebRequest -Uri "http://localhost:8082/dashboard"`
- [ ] API gateway responds: `Invoke-WebRequest -Uri "http://127.0.0.1:54320/healthz"`
- [ ] PostgREST responds: `Invoke-WebRequest -Uri "http://127.0.0.1:54321/settings"`
- [ ] Sign in at `http://localhost:8082/auth`
- [ ] Test POS sale on dashboard
- [ ] Verify customer, receivables, etc.

---

## 📈 Performance & Scaling

### Small (< 10 users, < 100 daily sales)
- **RAM:** 2 GB Postgres + 2 GB Dev/Prod total ~4 GB
- **Disk:** ~5 GB (data + backups)
- **CPU:** 1-2 cores sufficient

### Medium (10-30 users, 100-500 daily sales)
- **RAM:** 4 GB Postgres + 4 GB Dev/Prod total ~8 GB
- **Disk:** ~20 GB (with 6 months data)
- **CPU:** 2-4 cores
- **Backup daily**

### Large (50+ users, 1000+ daily sales)
- **RAM:** 8+ GB Postgres
- **Disk:** 100+ GB
- **Backup every 6h**
- **Consider PostgreSQL tuning**

---

## 🔄 Upgrade Path

If you want to later:
1. **Increase PostgreSQL performance:** Add indexes, tune `postgresql.conf`
2. **Add HTTPS:** Set up reverse proxy (nginx)
3. **Deploy to another machine:** Copy `dist/` + PostgREST config
4. **Replace local auth with GoTrue:** Requires Supabase Cloud or self-hosted GoTrue
5. **Add real auth:** Custom JWT + sessions or third-party auth

---

## 📧 Support & Troubleshooting

For issues:
1. Check `LOCAL_BACKEND.md` — detailed setup instructions
2. Check `PROJECT_ASSESSMENT.md` — full system analysis
3. Check `DEFERRED_PAYMENT.md` — credit/loyalty feature specs
4. Check `PLAN.md` — all implementation plans
5. Run `bash scripts/backup-db.sh` — backup before testing

---

## 📄 Key Files

| File | Purpose |
|------|---------|
| `LOCAL_BACKEND.md` | Detailed backend setup (auth, migrations, scripts) |
| `PROJECT_ASSESSMENT.md` | Full system assessment (8/10/7/6/8/4/7/7) |
| `DEFERRED_PAYMENT.md` | Credit + loyalty feature specification |
| `PLAN.md` | Implementation plan for all fixes |
| `scripts/backup-db.sh` | Database backup |
| `scripts/restore-db.sh` | Database restore |
| `scripts/reset-db.sh` | Fresh database reset |
| `scripts/start-postgrest.sh` | PostgREST startup script |
| `.env.local.example` | Template for local config |

---

## ✅ Final Status

**Your local deployment is ready!**

| Component | Status |
|-----------|--------|
| PostgreSQL 17 | ✅ Running on port 5432 |
| PostgREST | ✅ Running on port 54321 |
| Dev server (Vite) | ✅ Running on port 8082 |
| Database (19 tables, 68 functions) | ✅ Ready |
| Migrations (0000-0011) | ✅ Applied |
| Seed data (39 products, etc.) | ✅ Loaded |
| Default admin | ✅ `admin@iceland.local` / `Admin123!` |

**Ready to test at:** http://localhost:8082
