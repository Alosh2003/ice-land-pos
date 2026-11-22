# ICE LAND — Local Backend Setup

This project was originally built on **Lovable + Supabase** (cloud). It has been converted to a **fully local, self-hosted backend** with **local authentication** — no Supabase Auth, no Google OAuth, no Lovable Cloud, no external network for auth.

## Authentication (fully local)

| Feature | Implementation |
|---------|---------------|
| User accounts | `public.app_users` table (admin creates/manages) |
| Passwords | `pgcrypto` `crypt()` + `gen_salt('bf')` hashing |
| Session | `public.app_session` single-row table (current user id) |
| `auth.uid()` | Redefined to read from `app_session` (all existing RLS/policies work unchanged) |
| Login RPC | `public.authenticate_user(email, password)` |
| Current user RPC | `public.whoami()` |
| Logout RPC | `public.sign_out()` |

**Default admin account** (seeded in migration):
- Email: `admin@iceland.local`
- Password: `admin123`
- Role: `admin`

The admin creates all other accounts and assigns roles (`admin`, `manager`, `cashier`, `accountant`) through the app's user management interface.

## What runs locally

| Service | Technology | Port | Purpose |
|---------|-----------|------|---------|
| Database | PostgreSQL 17 | 5432 | All tables, functions, RLS |
| API | PostgREST | 54321 | REST + RPC endpoints for supabase-js |

> No GoTrue/Auth container — ECR (Supabase's image registry) is unreachable from this network, and it's not needed.

## Directory layout

```
ice-land-main/
├── .env                          # Lovable production env (do not edit)
├── .env.local                    # LOCAL backend env (created by you, gitignored)
├── .env.local.example            # Template for .env.local
├── supabase/                     # Lovable-managed (DO NOT EDIT)
├── drizzle/                      # Lovable-managed (DO NOT EDIT)
├── local-supabase/               # YOUR local backend
│   ├── supabase/
│   │   ├── config.toml           # Local Supabase config (Postgres 14)
│   │   ├── migrations/
│   │   │   ├── 00_auth_infra.sql     # auth schema, users, roles, auth.uid(), storage stubs
│   │   │   ├── 0000_core.sql         # profiles, roles, settings, categories, products, sales, etc.
│   │   │   ├── 0001_storage.sql      # product-images storage policies
│   │   │   ├── 0002_counter_daily_inventory.sql  # counter sale, daily stock, payment proofs
│   │   │   ├── 0003_counter_variable_fix.sql     # plpgsql variable fix
│   │   │   ├── 0004_customer_credit.sql          # customer credit/ledger
│   │   │   ├── 01_auth_uid_dev_fallback.sql      # auth.uid() dev fallback (superseded by 04)
│   │   │   ├── 02_dev_user.sql         # dev user seed (superseded by 04)
│   │   │   ├── 03_fix_complete_counter_sale.sql  # bug fix: no-customer sales
│   │   │   └── 04_local_auth.sql       # LOCAL AUTH: app_users, app_session, authenticate_user, whoami, sign_out
│   │   ├── 0005_deferred_payment.sql   # Deferred replaces Card; new credit RPCs (statement, aging, collections)
│   │   ├── 0005b_fix_statement.sql     # fixed statement ambiguity, collections bigint
│   │   ├── 0006_guard_deferred.sql     # guard: deferred not deactivatable while balances exist
│   │   └── seed.sql                # storage buckets: product-images, payment-proofs
│   └── config.toml
├── scripts/
│   ├── reset-db.sh               # Recreate DB + apply all migrations + seed
│   └── start-postgrest.sh        # Start PostgREST API container
├── src/integrations/supabase/
│   ├── client.ts                 # Edited: plain supabase-js client, no auth mock
│   ├── client.server.ts          # Unchanged (server-side service role)
│   ├── client.local.ts           # DELETED (no longer needed)
│   ├── auth-attacher.ts          # DELETED (no longer needed)
│   └── lovable/                  # DELETED (Google OAuth removed)
├── src/lib/app.ts                # Edited: meQuery uses whoami(), signIn/signOut/getCurrentUser use RPCs
├── src/routes/auth.tsx           # Rewritten: local email/password login only (no Google, no signUp)
├── src/routes/_authenticated/route.tsx  # Edited: uses whoami() RPC for auth check
├── src/routes/__root.tsx         # Edited: removed onAuthStateChange listener
├── src/components/AppShell.tsx   # Edited: uses signOut() RPC
├── src/components/PaymentProof.tsx      # Edited: uses getCurrentUser() RPC
├── src/lib/cart.ts               # Browser-safe pure cart math (kept)
├── src/lib/cart.test.ts          # Cart rule tests (kept)
├── src/lib/operations.ts         # Browser-safe pure daily-stock math (kept)
├── src/lib/operations.test.ts    # Operations rule tests (kept)
└── .gitignore                    # .env.local is ignored via *.local
```

## Quick start

### 1. Create local env
```powershell
copy .env.local.example .env.local
```

### 2. Start the database
```powershell
docker run -d --name ice-land-db -e POSTGRES_DB=ice_land -e POSTGRES_PASSWORD=ice_land_dev -e POSTGRES_USER=ice_land -p 5432:5432 postgres:17-alpine
```

### 3. Apply migrations (in order)
```powershell
Get-Content local-supabase/supabase/migrations/00_auth_infra.sql -Raw | docker exec -i ice-land-db psql -U ice_land -d ice_land
Get-Content local-supabase/supabase/migrations/0000_core.sql -Raw | docker exec -i ice-land-db psql -U ice_land -d ice_land
Get-Content local-supabase/supabase/migrations/0001_storage.sql -Raw | docker exec -i ice-land-db psql -U ice_land -d ice_land
Get-Content local-supabase/supabase/migrations/0002_counter_daily_inventory.sql -Raw | docker exec -i ice-land-db psql -U ice_land -d ice_land
Get-Content local-supabase/supabase/migrations/0003_counter_variable_fix.sql -Raw | docker exec -i ice-land-db psql -U ice_land -d ice_land
Get-Content local-supabase/supabase/migrations/0004_customer_credit.sql -Raw | docker exec -i ice-land-db psql -U ice_land -d ice_land
Get-Content local-supabase/supabase/migrations/04_local_auth.sql -Raw | docker exec -i ice-land-db psql -U ice_land -d ice_land
Get-Content local-supabase/supabase/seed.sql -Raw | docker exec -i ice-land-db psql -U ice_land -d ice_land
```

Or use the reset script (bash): `./scripts/reset-db.sh`

### 4. Start PostgREST API
```powershell
./scripts/start-postgrest.sh
```

### 5. Start the frontend
```powershell
npm run dev
```

### 6. Verify
- Open `http://localhost:5173` (or whatever Vite prints)
- Sign in with `admin@iceland.local` / `admin123`
- All pages work against local DB

## Bug fixes vs. Lovable original

Two bugs were found and fixed in the ported `complete_counter_sale` (migration `03_fix_complete_counter_sale.sql`):

1. **`record "cust" is not assigned yet`** — When `p_customer_id` is null (walk-in sale), the `cust` record variable is never assigned but is referenced in the `due_date` expression. Fixed by computing `due_date` into a separate variable only when a customer exists.

2. **`column reference "paid" is ambiguous`** — The local variable `paid` collides with the `sales.paid` column in the UPDATE SET clause. Fixed by renaming the local variable to `v_paid`.

## Storage buckets

Two buckets are created (separate, per AGENTS.md requirement):
- `product-images` — product photos (staff read, manager upload)
- `payment-proofs` — per-user private folders (cashier upload, invoice-authorized read)

They must NOT share a bucket.

## Testing

Rule tests are browser-safe pure helpers:
- `src/lib/cart.test.ts` — `computeTotals`, `paymentSummary` (tax after discount, change ≤ cash, etc.)
- `src/lib/operations.test.ts` — `dailyRemaining`, `closingDiscrepancy`, `cashierSummary`

Run tests:
```powershell
npm run test
```

## Constraints respected (from AGENTS.md)

- `supabase/migrations/` and `drizzle/` (Lovable-managed) are **not edited**. Local copies live under `local-supabase/`.
- No `LOVABLE_API_KEY` or secrets in browser code.
- Product images and payment proofs use **separate** storage buckets.
- Cart/daily-stock calculations remain in browser-safe pure helpers with concrete tests.
- No Google OAuth. No Supabase Auth. No Lovable Cloud. No external network for authentication.
