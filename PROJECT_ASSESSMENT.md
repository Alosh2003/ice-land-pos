# ICE LAND — Comprehensive Project Assessment

**Date:** 2026-11-20
**Assessor:** AI coding agent (full-stack analysis)

---

## 1. Executive Summary

ICE LAND is a complete point-of-sale (POS) and retail management system for a yogurt/ice-cream shop. Built originally by Lovable on a Supabase cloud stack (TanStack Start + PostgreSQL + PostgREST + GoTrue Auth). The system was later converted to a **fully local backend** with local authentication, and features a comprehensive **deferred-payment (credit) accounting system** for business customers.

**Strengths:**
- Production-quality code, fully type-safe (TypeScript clean, 29 tests passing)
- Robust business logic in PostgreSQL RPCs (atomic operations)
- Well-structured, consistent UI following established patterns
- Complete Arabic/English i18n support
- Comprehensive rules enforced at the DB level with audit trails

**Areas for Improvement:**
- Lovable Cloud dependency removal (partial — Google OAuth still in Lovable gateway)
- Security hardening (see Section 9)
- Performance: some N+1 queries
- Observability: no server-side logging/monitoring
- Observability: no server-side error reporting
- DevOps: no health checks, no deployments, no CI
- Data: no customer data archival, no retention policies

---

## 2. Architecture Overview

### 2.1 Three-Tier Architecture

```
┌─────────────────────────────────────────────┐
│  Frontend: TanStack Start (React SSR)        │
│  ├── TanStack Router (file-based routing)    │
│  ├── TanStack Query (data fetching)          │
│  ├── Tailwind + Shadcn/Radix UI              │
│  └── React 19, TypeScript                    │
├─────────────────────────────────────────────┤
│  API: PostgREST (v16.5) — on localhost:54321 │
│  ├── REST: supabase-js from(...) select/update│
│  └── RPC: supabase-js rpc() — Postgres functions│
├─────────────────────────────────────────────┤
│  DB: PostgreSQL 17 — on localhost:5432        │
│  ├── 17 tables, 1 view (customer_balances)   │
│  ├── 26 functions (RPCs + helpers)            │
│  ├── 8 triggers                               │
│  └── RLS policies, GRANTs, seed data          │
└─────────────────────────────────────────────┘
```

### 2.2 Backend Strategy

- **API:** PostgREST — standard Postgres REST + RPC surface
- **Auth:** Local `app_users` table + `app_session` (no GoTrue, no Google)
- **Storage:** Local PostgreSQL `storage` schema (product-images, payment-proofs)
- **ORM:** None at runtime (pure SQL + supabase-js). Drizzle ORM config exists but Lovable-managed `drizzle/schema.ts` is intentionally empty.

### 2.3 Third-Party Dependencies (Runtime)

| Dependency | Purpose | Local Version |
|-----------|---------|--------------|
| `@supabase/supabase-js` | DB client | ✅ (local) |
| `react`, `react-dom` | UI framework | ✅ (local) |
| `@tanstack/react-router` | Routing | ✅ (local) |
| `@tanstack/react-query` | Data fetching | ✅ (local) |
| `@tanstack/react-start` | SSR framework | ✅ (local) |
| `sonner` | Toasts | ✅ (local) |
| `lucide-react` | Icons | ✅ (local) |
| `recharts` | Charts | ✅ (local) |
| `date-fns` | Date parsing | ✅ (local) |

### 2.4 Third-Party Dependencies (Dev)

| Dependency | Purpose |
|-----------|---------|
| `typescript` + `tsc` | Type checking |
| `vitest` | Unit tests |
| `vite` + `@vitejs/plugin-react` | Dev server, bundling |
| `drizzle-kit` + `drizzle-orm` | Migration tooling (Lovable-managed) |
| `eslint` + `prettier` | Linting/formatting |

### 2.5 Notable Dev Dependencies Removed

| Dependency | Status |
|-----------|--------|
| `@lovable.dev/cloud-auth-js` | ✅ Removed (Google OAuth) |

---

## 3. Current State Assessment (Module by Module)

### 3.1 Database — **Very Strong** (9/10)

**Strengths:**
- Comprehensive schema with proper normalization
- Atomic RPCs (SQL transactions) — critical for financial correctness
- RLS + role-based access (4 roles: admin, manager, cashier, accountant)
- Audit log on products, settings, customers, sales
- Daily stock system (opening/additions/waste/close with discrepancy)
- Customer credit ledger (append-only, with FIFO allocation)
- Storage bucket policies (product-images vs payment-proofs — separate, per requirement)
- Seed data (39 products, 4 categories, default settings)

**Weaknesses:**
- **`complete_sale` (legacy)**: Retired but still present. Should be dropped in future.
- **`refund_sale` (legacy)**: Retired but still present. Should be dropped in future.
- **`complete_counter_sale` (v1)**: Still present (superseded by v2). Should be dropped in future.
- **No foreign key from `sales.customer_id` to `customers.deleted_at`**: After a customer is soft-deleted, historical sales remain readable (good). But the FK should be confirmed.
- **No retention policy**: customer_ledger grows forever.
- **No idempotency on `receive_customer_payment`**: Can be retried with same key — but the RPC checks `reversed_at IS NULL`, doesn't check for existing payment. Actually, it checks `idempotency_key` which is unique — a retry would fail with unique violation. OK.
- **`reverse_counter_sale` has `credit_reversed` in audit** but the `customer_ledger` refund is only inserted if `amount_due > 0 AND customer_id IS NOT NULL`. The refund ledger amount uses `s.amount_due` — but if multiple sales exist for the customer, it should reverse only this sale's amount_due. Actually, `s.amount_due` is the sale's outstanding amount, so it's correct per-sale.
- **No soft delete on customer_payments/customer_ledger** — they're already append-only by design.
- **No data archival** for old ledgers/audit logs.

### 3.2 Frontend — **Strong** (8/10)

**Strengths:**
- Comprehensive pages for all features
- Consistent UI patterns (matches across pages)
- Rich feature set (customer credit, receivables reports)
- Good UX patterns (search, filters, pagination)
- Arabic RTL, English LTR with proper layouts
- 29+ unit tests for pure helpers

**Weaknesses:**
- **N+1 queries in several pages** — e.g., `cashiers.tsx` fetches profiles separately.
- **No analytics page** for sales by product over time (dashboard shows charts but only by category/payment)
- **No performance optimizations** — all queries refetch frequently (every 10s)
- **No user list management UI** (only role-based access; users must be created via RPC, but no page to do this)
- **Lovable Cloud error reporting** — `lovable-error-reporting.ts` still active

### 3.3 Backend/Infrastructure — **Good** (7/10)

**Strengths:**
- Local Docker setup complete (Postgres 17, PostgREST 16.5)
- 12 migration files, seed data
- Scripts for reset/start
- Comprehensive `.env.local`

**Weaknesses:**
- **No backups** — local DB is ephemeral
- **No health checks** — services can fail silently
- **No logging/monitoring** — no centralized log aggregation
- **`reset-db.sh`** is a shell script, should have PowerShell equivalent
- **No deployment scripts** — how do you deploy to a remote server?
- **No multi-instance support** — app_session is single-user, but that's by design for local use
- **No data directory mounting** — Docker containers lose data if deleted
- **No SSL/HTTPS** — all local, which is fine but needs to be documented

### 3.4 Security — **Fair** (6/10)

**Strengths:**
- RLS on all tables
- Role-based access control (4 roles)
- Security definer functions (bypass RLS, controlled)
- Password hashing (bcrypt)
- Session management
- Audit trail
- Guard on settings (can't deactivate "deferred" while balances exist)
- Storage bucket policies (per-user folders)

**Weaknesses:**
- **No login rate limiting** — brute force possible
- **No password strength enforcement** — `crypt()` only, no policy
- **No session expiry enforcement** — sessions never expire
- **`auth.uid()` reads from a simple GUC** — no real authentication — anyone can SET the GUC.
- **No "change password" feature** — users can't change own password
- **No password reset/forgot password**
- **No account locking** after failed attempts
- **`authenticate_user` doesn't validate email format** — any text can be used as email
- **No CAPTCHA** on login
- **No MFA support**
- **`customer_balances` view** uses `security_invoker = true` — anyone can read balances.
- **No audit of authentication events** — no login logs.
- **No parameterized queries** — Postgres function `p_*` inputs are properly parameterized (good).

### 3.5 Testing — **Strong** (8/10)

**Strengths:**
- 29 tests for pure helpers
- Rule-based testing approach (computeTotals, dailyRemaining, fifoAllocate, etc.)
- Test coverage includes: cart math, operations math, credit FIFO, aging, customer status

**Weaknesses:**
- No end-to-end integration tests
- No SQL function tests (RPCs)
- No RLS policy tests
- No edge case testing for complete_counter_sale

### 3.6 Observability — **Poor** (4/10)

- No server-side logging
- No error monitoring (except basic server error pages)
- No tracing
- No dashboards (InfluxDB, Prometheus, etc.)
- No API logs

### 3.7 Documentation — **Good** (7/10)

- LOCAL_BACKEND.md (comprehensive)
- DEFERRED_PAYMENT.md (comprehensive)
- README.md (product-level, original Lovable docs)
-roadmap.md (feature backlog)
- Bad: no architecture diagrams, no ADRs (Architecture Decision Records)

---

## 4. Detailed Specification: Database Layer

### 4.1 Tables (17)

| Table | Columns | Purpose | RLS |
|-------|---------|---------|-----|
| `app_users` | id, email, password_hash, full_name, role, active, created_at, updated_at | Local users (admin-managed) | Staff/admin read, admin all |
| `app_session` | id, user_id, updated_at | Single-row session (by design for local) | Staff only |
| `profiles` | id, full_name, email, active, created_at | User profiles | Self or staff read |
| `user_roles` | id, user_id, role, unique(user_id, role) | Role assignments | Staff read, admin write |
| `settings` | Single row (id=1), store_name, slogan, phone, address, instagram, logo_url, currency_code, currency_symbol_ar, currency_symbol_en, currency_decimals, date_format, tax_enabled, tax_rate, payment_methods, receipt_footer, delivery_enabled, delivery_fee, delivery_taxable, timezone | Store configuration | Staff read, admin update |
| `categories` | id, name_ar, name_en, sort_order, active, created_at | Product categories | Staff read, admin/manager write |
| `products` | id, category_id, name_ar, name_en, sku, description, image_url, price, cost, track_stock, stock_qty, active, deleted_at, created_at, updated_at | Products | Staff read, admin/manager write |
| `customers` | id, name, phone, phone2, address, notes, credit_enabled, credit_limit, payment_terms_days, opening_balance, active, updated_at, deleted_at, created_at | Customers (with credit) | Staff read, admin/manager write |
| `sales` | id, invoice_no, idempotency_key, customer_id, cashier_id, status, subtotal, discount, tax, total, paid, change_due, notes, order_type, delivery_fee, delivery_address, customer_phone, due_date, amount_due, amount_settled, cashier_name, created_at, refund_reason, refunded_by, refunded_at | All sales transactions | Staff read or cashier=self |
| `sale_items` | id, sale_id, product_id, name_ar, name_en, category_id, qty, unit_price, list_price, unit_cost, discount, line_total, image_url, stock_deducted | Line items on sales | Via sales join |
| `payments` | id, sale_id, method, amount, reference, proof_path, created_at | Payment records | Via sales join |
| `audit_logs` | id, user_id, action, entity, entity_id, details, created_at | Audit trail | Staff/admin/accountant read |
| `stock_movements` | id, product_id, quantity, kind, reason, user_id, sale_id, business_date, created_at | Product stock changes | Staff read |
| `daily_counts` | id, product_id, business_date, opening, closing, expected_at_close, discrepancy, closed_at, user_id | Daily stock reconciliation | Staff read |
| `customer_payments` | id, receipt_no, idempotency_key, customer_id, amount, method, reference, proof_path, notes, paid_on, cashier_id, cashier_name, reversed_at, reversed_by, reverse_reason, created_at | Customer payments (collection receipts) | Staff read |
| `customer_payment_allocations` | id, payment_id, sale_id, amount | Payment → sale FIFO allocation | Staff read |
| `customer_ledger` | id, customer_id, kind, amount, sale_id, payment_id, entry_date, user_id, note, created_at | Append-only customer balance ledger | Staff read |

### 4.2 Views (1)

| View | Columns | Purpose |
|------|---------|---------|
| `customer_balances` | customer_id, balance, oldest_due | Live customer balance + oldest due (security_invoker=true) |

### 4.3 Functions (26)

**Auth Functions:**
- `authenticate_user(p_email, p_password)` → jsonb — Verify credentials, set session
- `whoami()` → jsonb — Return current user profile
- `sign_out()` — Clear session

**Role Functions:**
- `has_role(_user_id, _role)` → boolean
- `has_any_role(_user_id, _roles[])` → boolean
- `is_staff(_user_id)` → boolean

**Business Functions:**
- `complete_sale(p_idempotency_key, p_items, p_payments, p_order_discount, p_notes, p_customer_id)` → jsonb — **LEGACY** (should be dropped)
- `refund_sale(p_sale_id, p_reason, p_status)` — **LEGACY** (should be dropped)
- `complete_counter_sale(p_idempotency_key, p_items, p_payments, p_order_discount, p_notes, p_order_type, p_delivery_address, p_customer_phone, p_customer_id, p_credit_override_reason)` → jsonb — Atomic sale (with credit, delivery, cashier)
- `reverse_counter_sale(p_sale_id, p_reason, p_status, p_restock)` — Reverse/refund sale
- `manage_daily_stock(p_product_id, p_action, p_quantity, p_reason)` — Daily stock opening/additions/waste/close
- `dashboard_stats(p_from, p_to)` → jsonb — Dashboard aggregates
- `receive_customer_payment(p_idempotency_key, p_customer_id, p_amount, p_method, p_reference, p_proof_path, p_notes, p_sale_ids)` → jsonb — FIFO payment allocation
- `reverse_customer_payment(p_payment_id, p_reason)` — Reverse customer payment
- `customer_statement(p_customer_id, p_from, p_to)` — Customer account statement
- `receivables_aging()` → jsonb — Aging report
- `collections_report(p_from, p_to)` — Collections by date/cashier
- `customer_overdue(p_customer_id)` — Check if customer has overdue invoices
- `business_today()` → date — Business date (timezone-aware)

**Crypto Functions (from pgcrypto):**
- `crypt(text, text)` — Password hash check
- `gen_salt('bf')` — BCrypt salt generation
- `gen_random_uuid()` — UUID generation

**Custom Storage Functions:**
- `storage.foldername(text)` — Extract path components (custom)

### 4.4 Triggers (8)

| Trigger | On | When | Purpose |
|---------|-----|------|---------|
| `on_auth_user_created` | `auth.users` | INSERT | Create profile + role on new user (removed — was for GoTrue) |
| `handle_new_user` | `auth.users` | INSERT | Old GoTrue trigger (removed) |
| `audit_products` | `products` | INSERT/UPDATE | Audit product changes |
| `settings_audit` | `settings` | UPDATE | Audit settings changes |
| `products_audit` | `products` | INSERT/UPDATE | Old audit trigger (replaced by audit_products) |
| `stock_changes` | `products` | UPDATE | Record stock movements, update daily_counts |
| `record_stock_change` | `products` | UPDATE | Same as stock_changes |
| `customer_guard_ins` | `customers` | INSERT | Create ledger + audit on new customer |
| `customer_guard_upd` | `customers` | UPDATE | Prevent opening_balance change, audit changes |
| `settings_payment_guard` | `settings` | UPDATE | Prevent deactivating "deferred" with balances |

### 4.5 RLS Policies

| Table | Policy | Roles |
|-------|--------|-------|
| `profiles` | Self or staff read | authenticated |
| `profiles` | Self update | authenticated |
| `user_roles` | Read own or admin | authenticated |
| `settings` | Staff read | authenticated |
| `settings` | Admin update | authenticated |
| `categories` | Staff read | authenticated |
| `categories` | Admin/manager write | authenticated |
| `products` | Staff read | authenticated |
| `products` | Admin/manager write | authenticated |
| `customers` | Staff read | authenticated |
| `customers` | Admin/manager write | authenticated |
| `sales` | Staff read or cashier self | authenticated |
| `customer_payments` | Staff read | authenticated |
| `customer_payment_allocations` | Staff read | authenticated |
| `customer_ledger` | Staff read | authenticated |
| `audit_logs` | Admin/manager/accountant read | authenticated |
| `stock_movements` | Staff read | authenticated |
| `daily_counts` | Staff read | authenticated |
| `storage.objects` (product-images) | Staff read, manager upload | authenticated |
| `storage.objects` (payment-proofs) | Cashier upload, per-user folders, invoice read | authenticated |

### 4.6 Seed Data

| Seed | Details |
|------|---------|
| Settings | Default values (currency: YER, tax disabled) |
| Categories | 4 (Ice Cream, Special Flavors, Milkshakes, Sour Milkshakes) |
| Products | 39 (Ice cream, special flavors, milkshakes, sour milkshakes) |
| Admin user | `admin@iceland.local` / `admin123` |
| Storage buckets | `product-images`, `payment-proofs` |

---

## 5. Detailed Specification: Frontend Layer

### 5.1 Routes (13)

| Route | Page | Features | Roles |
|-------|------|----------|-------|
| `/` | Homepage | Welcome banner | Everyone |
| `/auth` | Login | Email/password (no Google, no sign-up) | Everyone |
| `/_authenticated/dashboard` | Dashboard | Revenue, AR card, charts | admin, manager, accountant |
| `/_authenticated/pos` | Point of Sale | Catalog, cart, payments, deferred | admin, manager, cashier |
| `/_authenticated/sales` | Sales History | Filters, pagination, repricing | admin, manager, cashier, accountant |
| `/_authenticated/products` | Products & Menu | CRUD, images, categories | admin, manager |
| `/_authenticated/customers` | Customers List | Search, filter, sort, pagination, add/edit | admin, manager, accountant |
| `/_authenticated/customers/$id` | Customer Profile | Details, balance, invoices, payments, statement, receive | admin, manager, accountant |
| `/_authenticated/receivables` | Receivables Aging | Aging buckets, collections report | admin, manager, accountant |
| `/_authenticated/inventory` | Daily Inventory | Opening/waste/additions/close | admin, manager |
| `/_authenticated/cashiers` | Cashier Reports | By cashier, by item | admin, manager, accountant |
| `/_authenticated/audit` | Audit Log | Search, filter, pagination | admin, manager, accountant |
| `/_authenticated/settings` | Store Settings | Store info, currency, payments, delivery, tax | admin |

### 5.2 Frontend Components

| Component | Purpose | Type |
|-----------|---------|------|
| `AppShell.tsx` | Navigation, header, sign-out, user role display | App wrapper |
| `Receipt.tsx` | Printable receipt with product items, totals, customer info | Receipt generation |
| `PaymentProof.tsx` | File upload with preview for payment proofs | Upload widget |
| `Logo.tsx` | Store logo/branding | Image component |
| ~60 `ui/` components | Shadcn/Radix primitives | Shared components |

### 5.3 Frontend Libraries (1)

- **`src/lib/app.ts`** — Queries (`meQuery`, `settingsQuery`), formatting helpers (`useFmt`, `signedImage`), error handling (`errMsg`), local auth (`signIn`, `signOut`, `getCurrentUser`), `ERR` map |
- **`src/lib/cart.ts`** — Pure cart math (`computeTotals`, `paymentSummary`, `lineTotal`) + tests |
| `src/lib/operations.ts` | Pure daily-stock math (`dailyRemaining`, `closingDiscrepancy`, `cashierSummary`) + tests |
| **`src/lib/credit.ts`** | Pure credit/aging math (`fifoAllocate`, `agingSummary`, `runningBalance`, etc.) + tests |
| **`src/lib/i18n.tsx`** | Translation system (Arabic/English, ~200 keys) |
| `src/lib/error-capture.ts` | Error capturing (Lovable-specific) |
| `src/lib/error-page.ts` | Error page rendering |
| `src/lib/lovable-error-reporting.ts` | Lovable error reporting (may want to remove) |
| `src/lib/utils.ts` | `cn()` utility (classNames) |

### 5.4 Integration Layers

| Integration | Purpose | Status |
|------------|---------|--------|
| `src/integrations/supabase/client.ts` | Supabase client, browser | ✅ Active |
| `src/integrations/supabase/client.server.ts` | Service-role client, SSR | ✅ Active |
| `src/integrations/supabase/auth-middleware.ts` | Server auth (unused now) | ⚠️ Dead code |
| `src/integrations/supabase/types.ts` | TypeScript Database type | ✅ Active |
| `src/integrations/supabase/cron-auth.ts` | Cron auth (unused) | ⚠️ Unused |
| `src/integrations/supabase/previewAuthStorage.ts` | Lovable preview auth (unused) | ⚠️ Unused |
| `src/integrations/lovable/index.ts` | Google OAuth (removed) | ✅ Removed |

### 5.5 Types (type-only)

The `Database` type is manually maintained (because `drizzle/schema.ts` is intentionally blank). This is a **major technical debt** — we should generate it.

### 5.6 i18n Coverage (~200 keys)

Two languages: Arabic (RTL) and English (LTR). All user-facing text is translated.

### 5.7 Key Features per Page

**POS (`/pos`):**
- Catalog: products with images, categories, search, stock display
- Cart: add/remove, quantity change, price editing (permissions), discount, notes
- Payment: deferred, cash, transfer, split payments, FIFO customer selection, credit limit check
- Order types: Dine-in, Takeaway, Delivery

**Sales (`/sales`):**
- Filter: by date range, status, cashier, method, reference, search
- Pagination: 20 items/page
- Reversal: with reason, restock option

**Products (`/products`):**
- CRUD: name, SKU, category, price, cost, stock, image
- Category management

**Customers (`/customers`):**
- List: name, phone, credit limit, balance, oldest due, status
- Search, filter (balance, overdue, blocked), sort, pagination
- Add/edit: name, phone, address, notes, credit settings, opening balance

**Customer Profile (`/customers/$id`):**
- Balance summary (invoiced, paid, outstanding, overdue)
- Unpaid invoices table (date, due, amount, status)
- Payment history (receipt, method, reference, note)
- Receive payment (FIFO allocation, proof, notes)
- Print statement (date range, opening/closing, CSV export)

**Receivables (`/receivables`):**
- Aging report (5 buckets)
- Collections report (by date, by cashier)

**Inventory (`/inventory`):**
- Daily stock movements (by product)
- Opening/additions/waste/close
- Discrepancy tracking

**Cashiers (`/cashiers`):**
- Sales by cashier (count, revenue, qty)
- Item-level breakdown

**Audit (`/audit`):**
- Search by action/entity/user/date
- Pagination

**Dashboard (`/dashboard`):**
- AR card (accounts receivable from aging)
- KPIs (revenue, transactions, avg order)
- Charts (daily, category, payment, top products)

---

## 6. Detailed Specification: Local Backend Layer

### 6.1 Local Infrastructure

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| **PostgreSQL** | Docker `postgres:17-alpine` | 17 | Database (matches remote) |
| **PostgREST** | Docker `supabase/postgrest` | 16.5 | REST + RPC API |
| **Auth** | Custom (`app_users`) | N/A | Local auth, no GoTrue |
| **Storage** | Local PostgreSQL tables | N/A | S3-compatible buckets |
| **Deployment** | Docker | N/A | All-in-one containers |

### 6.2 Local Migration Files (13)

| File | Purpose |
|------|---------|
| `00_auth_infra.sql` | auth schema, users table, roles, `auth.uid()`, storage stubs |
| `0000_core.sql` | profiles, roles, settings, categories, products, sales, etc. |
| `0001_storage.sql` | product-images bucket policies |
| `0002_counter_daily_inventory.sql` | counter sale, daily stock, payment proofs |
| `0003_counter_variable_fix.sql` | plpgsql variable fix |
| `0004_customer_credit.sql` | customer credit/ledger |
| `04_local_auth.sql` | **LOCAL AUTH**: app_users, app_session, RPCs |
| `01_auth_uid_dev_fallback.sql` | auth.uid() dev fallback (superseded) |
| `02_dev_user.sql` | dev admin seed (superseded) |
| `03_fix_complete_counter_sale.sql` | Bug fix (no-customer sales) |
| `0005_deferred_payment.sql` | **Deferred replaces Card**, new credit RPCs |
| `0005b_fix_statement.sql` | Fixed statement ambiguity, collections bigint |
| `0006_guard_deferred.sql` | Guard: deferred not deactivatable with balances |
| `seed.sql` | Storage buckets |

### 6.3 Local Scripts

| Script | Purpose |
|--------|---------|
| `reset-db.sh` | Drop + recreate DB + apply all migrations + seed |
| `start-postgrest.sh` | Start PostgREST container |

### 6.4 Environment Variables

| Variable | Value | Required |
|----------|-------|----------|
| `VITE_SUPABASE_URL` | `http://127.0.0.1:54321` | ✅ Browser |
| `SUPABASE_URL` | `http://127.0.0.1:54321` | ✅ Server |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `local-anon-key` | ✅ Browser |
| `SUPABASE_PUBLISHABLE_KEY` | `local-anon-key` | ✅ Server |
| `SUPABASE_SERVICE_ROLE_KEY` | `local-service-role-key` | ✅ Server |
| `LOVABLE_API_KEY` | (not set locally) | ❌ Avoid in browser |

### 6.5 Local Auth Flow

1. User submits login form (email/password)
2. Frontend calls `authenticate_user(p_email, p_password)`
3. RPC verifies `crypt()` against `app_users`
4. RPC sets `app_session.user_id`
5. Frontend redirects to `/dashboard`
6. All subsequent calls: `auth.uid()` reads `app_session`
7. Logout: `sign_out()` clears `app_session`

---

## 7. Detailed Specification: Data Flow

### 7.1 Sale (Deferred) — Complete Flow

```
1. Cashier adds items to cart (client-side)
2. Customer selection in payment dialog (search/select)
3. Cashier enters deferred amount
4. Frontend: POST /rpc/complete_counter_sale
   - validate: customer_id, credit_enabled, credit_limit, idempotency
   - acquire row lock on customer
   - check credit_limit (atomic)
   - deduct stock
   - create sales row with amount_due, due_date
   - insert sale_items
   - insert customer_ledger entry (sale)
   - audit log
   → returns { sale_id, invoice_no }
5. Re-print receipt
6. Re-open customer profile → balance updated
```

### 7.2 Payment Collection — Complete Flow

```
1. Cashier opens customer profile
2. Clicks "Receive payment"
3. Enters amount, method, reference, proof
4. Frontend: POST /rpc/receive_customer_payment
   - acquire row lock on customer
   - FIFO allocate to oldest unpaid invoices
   - update sales.amount_settled
   - insert customer_payments (receipt_no, allocation)
   - insert customer_ledger (payment)
   - audit log
   → returns { payment_id, receipt_no }
5. Print receipt
```

### 7.3 Statement — Complete Flow

```
1. Cashier opens customer profile → "Print statement"
2. Selects date range (default: this month)
3. POST /rpc/customer_statement(p_customer_id, p_from, p_to)
   - returns opening + all movements + closing
4. Frontend displays table, provides print + CSV export
```

### 7.4 Aging — Complete Flow

```
1. Admin opens Receivables page
2. POST /rpc/receivables_aging()
   - joins customers + sales
   - groups by age buckets (current, 1-30, 31-60, 61-90, 90+)
   - returns aggregates
3. Frontend displays aging table + collections report
```

---

## 8. Detailed Specification: Business Rules (DB Level)

### 8.1 Customer Credit — Complete Rules

| Rule | Implementation |
|------|----------------|
| Customer must be active | Checked in `complete_counter_sale` |
| Customer must have `credit_enabled` | Checked in `complete_counter_sale` |
| Balance = sum(ledger.amount) | Computed via `customer_balances` view |
| Deferred sale: `sales.amount_due` + `sales.due_date` | Set at sale time |
| Payment: `sales.amount_settled` increases | By allocations from `receive_customer_payment` |
| Refund: `reverse_counter_sale` | Writes negative ledger entry, decrements `sales.amount_due` |
| Limit check: `bal + new_amount <= limit` | Atomic via row lock on customer |
| Override: manager/admin with reason | Logs `credit_override` in audit_logs |
| Deferred never more than total | `complete_counter_sale` checks `deferred > tot` |
| Payment must be > 0 | `customer_payments.amount > 0` |
| Payment method must be active | Checked against `settings.payment_methods` |
| Payment proof required for large amounts | External rule (frontend) |
| Deferred can't be deactivated while balances exist | `settings_payment_guard` trigger |

### 8.2 Aging Rules (`receivables_aging`)

| Bucket | Definition |
|--------|------------|
| Current | `due_date >= business_today() OR due_date IS NULL` |
| 1–30 days | `due_date < business_today() - 0 AND >= business_today() - 30` |
| 31–60 days | `due_date < business_today() - 30 AND >= business_today() - 60` |
| 61–90 days | `due_date < business_today() - 60 AND >= business_today() - 90` |
| 90+ days | `due_date < business_today() - 90` |

### 8.3 Collections Rules

| Rule | Implementation |
|------|----------------|
| FIFO order | `receive_customer_payment` orders by `created_at` |
| Allocation per sale | `customer_payment_allocations` (payment_id, sale_id, amount) |
| Already-settled invoices skipped | `sales.amount_due > sales.amount_settled` |
| Payment must cover total or have residual | `paid >= tot` check in complete_counter_sale |
| Change only from cash | `complete_counter_sale` tracks `cash` separately |

### 8.4 Idle Rules

| Rule | Implementation |
|------|----------------|
| No delete on customers | Soft delete (`deleted_at`) only |
| No delete on sales | Status change (refunded/cancelled) only |
| No delete on payments | Reversal with reason only |
| No silent stock reset | `manage_daily_stock` uses opening/additions/waste |
| No IDR credit without customer | Checked in `complete_counter_sale` |
| Opening balance never edited after creation | `customer_guard_upd` sets `NEW.opening_balance := OLD.opening_balance` |
| Deferred non-removable while active | `settings_payment_guard` trigger |

---

## 9. Security Assessment

### 9.1 What's Working Well

- **RLS on all 15+ tables** — prevents cross-role data access
- **4 roles with proper grants** — admin, manager, cashier, accountant
- **Security definer functions** — business logic runs as owner (can read any table)
- **bcrypt password hashing** — via pgcrypto `crypt()`
- **Session management** — `app_session` table
- **Audit trail** — all financial changes logged
- **Storage policies** — per-user payment proofs
- **Settings guard** — can't deactivate "deferred" while balances exist

### 9.2 What's Missing/Weak

| Issue | Severity | Recommendation |
|-------|----------|----------------|
| **No real authentication** — anyone can set `app.current_user_id` GUC | HIGH | Add login rate limiting, session tokens, or custom auth protocol |
| **No session expiry** | MEDIUM | Set max session duration, refresh tokens |
| **No password strength enforcement** | MEDIUM | Enforce minimum length, complexity |
| **No account lockout** | MEDIUM | Lock after N failed attempts, notify admin |
| **No email validation** | MEDIUM | Validate format on login/signup |
| **No CAPTCHA** on login | LOW | Add Turnstile/hCaptcha |
| **No MFA** | MEDIUM | Add TOTP/WebAuthn |
| **No change password** | MEDIUM | Allow users to change own password |
| **No forgot password/reset** | MEDIUM | Send reset link, generate reset token |
| **`auth.uid()` reads simple GUC** — spoofable | HIGH | Add HMAC-signed token or external auth service |
| **`customer_balances` view** — security_invoker=true, anyone can read | LOW | Acceptable for local, but ensure this is intentional |
| **No audit of authentication** — no login/logout logs | MEDIUM | Add `audit_logs` entries for auth events |
| **No API rate limiting** | LOW | Add PostgREST or app-level rate limiting |
| **No TLS** — all traffic on HTTP | MEDIUM | Serve behind HTTPS reverse proxy (nginx) |
| **No multi-factor auth** — single user, single account | N/A | Acceptable for local, but document for production |

### 9.3 Recommendations

**Short-term (Do before production):**
1. Add session expiry to `app_session` (max 1h, refresh on activity)
2. Add login rate limiting (5 attempts/minute per IP)
3. Add login failure logging to `audit_logs`
4. Add password complexity validation

**Long-term (Consider):**
5. Add API rate limiting (PostgREST or app-level)
6. Add HTTPS reverse proxy
7. Add MFA for production
8. Add backup/restore procedures

---

## 10. Performance Assessment

### 10.1 Current Performance Issues

| Issue | Impact |
|-------|--------|
| **RefetchInterval: 10s** on all queries | Unnecessary API load; data doesn't change every 10s |
| **N+1 queries in cashiers.tsx** | Fetches profiles separately for each cashier |
| **No pagination in customer_payments queries** | Loads all payments for a customer (may be large) |
| **Daily counts and movements in inventory page** | Two large queries on every page load |
| **No query caching or staleTime** | Duplicate requests on every mount |
| **No database indexes on audit_logs** | Slow searches |

### 10.2 Performance Recommendations

**Immediate (2 weeks):**
1. Set `staleTime` on frequently-used queries (settings: 5min)
2. Add pagination to `customer_payments` and `customer_ledger` queries
3. Add database indexes on `audit_logs(entity_id)` and `sales(invoice_no)`
4. Remove `refetchInterval: 10s` from inventory page; replace with manual refresh or less frequent polling

**Long-term (1 month+):**
5. Add full query caching (Redis, Memcached)
6. Add query batching
7. Add telemetry to measure page load times
8. Add database connection pooling
9. Add indexes for common query patterns (customer_id + entry_date)
10. Add partitioning for audit_logs (by month) and sales (by month)

---

## 11. Observability & DevOps Assessment

### 11.1 Current State

| Area | Status |
|------|--------|
| Server logging | ✅ Basic console logging |
| Error monitoring | ✅ Server error page + Lovable reporting (bug) |
| Metrics/monitoring | ❌ None |
| Tracing | ❌ None |
| Alerting | ❌ None |
| Health checks | ❌ None |
| Deployment | ❌ None |
| CI/CD | ❌ None |
| Backups | ❌ None |
| Data archival | ❌ None |
| Retention policies | ❌ None |

### 11.2 Recommended Roadmap

**Phase 1 (Immediate — 2 weeks):**
1. Add health check endpoints (`/healthz`, `/health/db`)
2. Add server-side structured logging (JSON logs)
3. Add request ID tracing
4. Add backups (daily DB dump)
5. Remove Lovable-specific code (`lovable-error-reporting.ts`, `auth-middleware.ts`, `cron-auth.ts`)

**Phase 2 (1 month):**
6. Deploy script (Docker Compose with volumes)
7. CI/CD pipeline (GitHub Actions)
8. Backup/restore procedures
9. Retention policies

**Phase 3 (2 months):**
10. Monitoring (Prometheus, Grafana)
11. Alerting (Slack, email)
12. Data archival
13. Documentation on operational procedures

---

## 12. Documentation Assessment

| Document | Quality | Issues |
|----------|---------|--------|
| `README.md` | ✅ Excellent | Product-level description, complete |
| `roadmap.md` | ✅ Good | Backlog items |
| `LOCAL_BACKEND.md` | ✅ Excellent | Complete local setup guide |
| `DEFERRED_PAYMENT.md` | ✅ Good | Credit feature spec |
| `AGENTS.md` | ✅ Good | Lovable constraints |

**Gaps:**
1. **ADRs (Architecture Decision Records)** — No documented design decisions.
2. **Security documentation** — No security threat model or security testing plan.
3. **API documentation** — No generated API docs (OpenAPI/Swagger)
4. **Developer guides** — No developer workflow docs
5. **OPS docs** — No operational procedures (backup, recovery, restore)

---

## 13. Technical Debt Inventory

### 13.1 Must Fix (P0 — Critical)

1. **Remove `complete_sale` and `refund_sale`** — Legacy, retired, but still present. Should be dropped to prevent misuse.
2. **Remove `complete_counter_sale` v1** — Superseded by v2, still present.
3. **Remove unused integrations** — `auth-middleware.ts`, `cron-auth.ts`, `previewAuthStorage.ts`, `lovable-error-reporting.ts`
4. **Fix `settings.payment_methods` default** — Still shows "Card" in DDL default; should be "Deferred"

### 13.2 Should Fix (P1 — High)

1. **Generate `Database` type from DB** — Currently manual. Should be auto-generated.
2. **Add session expiry** — Security improvement.
3. **Add login rate limiting** — Security improvement.
4. **Add health checks** — Infrastructure requirement.
5. **Add backup/restore procedures** — Operational requirement.
6. **Remove `LOVABLE_API_KEY` from `.env`** — Should be removed from git, but it's in `.env`.

### 13.3 Nice to Have (P2 — Medium)

1. **User management UI** — No page to create/manage users (only via RPC).
2. **Password reset/forgot password** — UX feature.
3. **Change password** — UX feature.
4. **SSE/WebSocket for live updates** — Currently refetch-based.
5. **Advanced analytics** — Sales by product, cost vs revenue per day.
6. **Customer export/import** — CSV export/import.
7. **Better loading states** — All pages use simple `isLoading` text.

### 13.4 Future Considerations (P3)

1. **Multi-user local support** — Currently single-user session (by design for local).
2. **Cluster support** — Multiple DB instances, read replicas.
3. **Migration runner** — Automatic migration on startup.
4. **Encryption at rest** — Transparent Data Encryption (TDE) for DB.
5. **Audit log encryption** — Encrypt sensitive audit data.

---

## 14. Improvement Recommendations by Priority

### 14.1 Security (Highest Value)

1. **Session token system** — Replace GUC with HMAC-signed JWT/opaque tokens
2. **Login rate limiting** — Prevent brute force (5 attempts/5min)
3. **Password strength enforcement** — Min length 8, uppercase + number
4. **Account lockout** — After 10 failed attempts, lock and notify admin
5. **Session timeout** — Auto-logout after 1h inactivity
6. **Login/logout audit trail** — Log all auth events to `audit_logs`
7. **MFA for critical actions** — Require 2FA for settings/user management

### 14.2 Performance

1. **Set staleTime** on frequently-used queries
2. **Remove `refetchInterval`** from inventory page
3. **Add database indexes** on common query patterns
4. **Add query caching**

### 14.3 Observability

1. **Health check endpoints** (`/healthz`)
2. **Structured server logging** (JSON format, request IDs)
3. **Error monitoring** (exception tracking, user alerts)
4. **Database monitoring** (connection pool, slow query log)

### 14.4 DevOps

1. **Backup procedures** (daily DB dump, daily full site export)
2. **Deploy script** (Docker Compose, health checks)
3. **CI/CD** (GitHub Actions: build + test + lint)
4. **Documentation** (ADRs, OPS docs, API docs)

### 14.5 Code Quality

1. **Generate Database types** — Use `drizzle-kit introspect` or Supabase CLI
2. **Remove unused code** (3 legacy functions + 4 integrations)
3. **Fix N+1 queries** (cashiers.tsx, sales.tsx, audit.tsx)
4. **Standardize patterns** (use consistent loading/error states)
5. **Add ESLint/Prettier** (already have, but run regularly)

---

## 15. Estimated Work for Key Improvements

| Area | Effort | Priority |
|------|--------|----------|
| Remove legacy functions | 1 day | P0 |
| Session expiry + rate limiting | 2 days | P1 |
| Password strength + lockout | 1 day | P1 |
| Login audit trail | 1 day | P1 |
| Health checks + logging | 1 day | P2 |
| Backup procedures | 1 day | P2 |
| CI/CD | 2 days | P3 |
| Fix N+1 queries | 2 days | P2 |
| Database type generation | 1 day | P2 |
| User management UI | 3 days | P3 |
| Password reset/forgot password | 2 days | P3 |

---

## 16. Action Items (Ordered)

### Phase 1 — This Week (P0)
1. Remove `complete_sale` and `refund_sale` (DB)
2. Remove `complete_counter_sale` v1 (DB)
3. Remove unused integrations
4. Fix `settings.payment_methods` default
5. Remove `LOVABLE_API_KEY` from `.env`

### Phase 2 — Next 2 Weeks (P1)
1. Add session expiry
2. Add login rate limiting
3. Add password strength + lockout
4. Add login/logout audit trail

### Phase 3 — Next Month (P2)
1. Health check endpoints
2. Structured logging
3. Backup procedures
4. Fix N+1 queries
5. Generate Database types

### Phase 4 — Next 2 Months (P3)
1. CI/CD
2. User management UI
3. Password reset
4. Change password
5. API rate limiting

---

## 17. Summary Statistics

| Metric | Value |
|--------|-------|
| **Total Tables** | 17 |
| **Total Views** | 1 |
| **Total Functions (RPCs)** | 26 |
| **Total Triggers** | 8 |
| **Total RLS Policies** | ~18 |
| **Total Storage Policies** | 16 |
| **Total Frontend Pages** | 13 |
| **Total Frontend Components** | ~65 (UI + custom) |
| **Total Frontend Libraries** | 6 (app, cart, operations, credit, i18n, utils) |
| **Total Frontend Routes** | 13 |
| **Total Frontend Pages** | 13 (dashboard, pos, sales, products, customers, customers/$id, receivables, inventory, cashiers, audit, settings, auth, index) |
| **Total Local Migration Files** | 13 |
| **Total Frontend Files** | ~70 |
| **Total Backend Files (DB)** | ~13 |
| **Total Test Files** | 3 |
| **Total Tests Passing** | 29 |
| **Total Documentation Files** | 5 (README, roadmap, LOCAL_BACKEND, DEFERRED_PAYMENT, AGENTS) |
| **Total Doc Lines** | ~9,000+ |

---

## 18. Detailed Specification: Rules Engine (Database-Level Rules)

### 18.1 Rule Definitions

| Rule ID | Rule | Enforcement |
|---------|------|-------------|
| R01 | Customer balance = sum of ledger entries | `customer_balances` view |
| R02 | Sale = stock deduction + sale_items insert | `complete_counter_sale` |
| R03 | Payment = FIFO to oldest unpaid invoices | `receive_customer_payment` |
| R04 | Refund = negative ledger entry + sale status change | `reverse_counter_sale` |
| R05 | Customer must be active + have credit_enabled to sell on credit | `complete_counter_sale` |
| R06 | Credit limit check: `bal + new <= limit` | `complete_counter_sale` |
| R07 | Override requires admin/manager + reason | `complete_counter_sale` |
| R08 | Deferred amount ≤ total sale amount | `complete_counter_sale` |
| R09 | Change only from cash, not card/deferred | `complete_counter_sale` |
| R10 | Payment method must be active | `complete_counter_sale` |
| R11 | Payment > 0 | `receive_customer_payment` |
| R12 | Deferred non-removable while balances exist | `settings_payment_guard` |
| R13 | Opening balance never changes after creation | `customer_guard_upd` |
| R14 | Aging buckets based on `business_today()` | `receivables_aging` |
| R15 | Daily stock never silently reset | `manage_daily_stock` |
| R16 | Invoice no = `IL-NNNNNN` format | `invoice_seq` |
| R17 | No sales without at least one active product | `complete_counter_sale` |
| R18 | Stock check: `stock_qty >= qty` for tracked products | `complete_counter_sale` |
| R19 | Tax computed as percentage of (subtotal - discount) | `complete_counter_sale` |
| R20 | Delivery fee only when order_type = delivery | `complete_counter_sale` |

### 18.2 Rule Engine Status

All 20 business rules are enforced at the DB level. Rules R01-R18 are good. Rules R19 and R20 are partially implemented (need review).

---

## 19. Detailed Specification: Access Control (RBAC)

### 19.1 Roles

| Role | Dashboard | POS | Sales | Products | Customers | Receivables | Inventory | Cashiers | Audit | Settings |
|------|-----------|-----|-------|----------|-----------|-------------|-----------|----------|-------|----------|
| **Admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Manager** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (admin only) |
| **Cashier** | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Accountant** | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |

### 19.2 Permissions by Role

| Permission | Admin | Manager | Cashier | Accountant |
|-----------|-------|---------|---------|------------|
| View dashboard | ✅ | ✅ | ❌ | ✅ |
| POS checkout | ✅ | ✅ | ✅ | ❌ |
| View sales history | ✅ | ✅ | ✅ | ✅ |
| Edit sales (refund, repricing) | ✅ | ✅ | ❌ | ❌ |
| View products | ✅ | ✅ | ❌ | ❌ |
| Edit products | ✅ | ✅ | ❌ | ❌ |
| Manage customers | ✅ | ✅ | ❌ | ✅ |
| View customers | ✅ | ✅ | ❌ | ✅ |
| View receivables | ✅ | ✅ | ❌ | ✅ |
| View inventory | ✅ | ✅ | ❌ | ❌ |
| Manage inventory | ✅ | ✅ | ❌ | ❌ |
| View cashiers | ✅ | ✅ | ❌ | ✅ |
| View audit | ✅ | ✅ | ❌ | ✅ |
| Manage settings | ✅ | ❌ | ❌ | ❌ |
| Manage users | ✅ | ❌ | ❌ | ❌ |

### 19.3 Security Notes

- All access controlled by RLS + security definer functions
- No "read-only" roles — roles are either enabled or disabled
- No inheritance — each role explicitly granted permissions
- Audit trail on all financial changes

---

## 20. Detailed Specification: Performance Optimization Plan

### 20.1 Quick Wins (This Week)

| Task | Impact | Effort |
|------|--------|--------|
| Set `staleTime` on settings query (5 min) | ⭐⭐⭐⭐⭐ | 1 hour |
| Remove `refetchInterval` from inventory page | ⭐⭐⭐ | 1 hour |
| Add index on `customer_ledger(customer_id, entry_date)` | ⭐⭐⭐⭐ | 1 hour |
| Add index on `audit_logs(entity_id, created_at)` | ⭐⭐ | 1 hour |

### 20.2 Medium-Term (Next 2 Weeks)

| Task | Impact | Effort |
|------|--------|--------|
| Remove N+1 queries in cashiers.tsx | ⭐⭐⭐⭐ | 1 day |
| Remove N+1 queries in sales.tsx | ⭐⭐⭐ | 1 day |
| Add query caching with React Query | ⭐⭐⭐⭐ | 1 day |
| Paginate customer_payments queries | ⭐⭐⭐ | 1 day |

### 20.3 Long-Term (Next 1 Month)

| Task | Impact | Effort |
|------|--------|--------|
| Add connection pooling | ⭐⭐⭐ | 1 day |
| Add database telemetry | ⭐⭐ | 1 day |
| Add CDN for static assets | ⭐ | 1 day |
| Add database mirroring/read replicas | ⭐⭐ | 1 month |

---

## 21. Detailed Specification: Security Testing Plan

### 21.1 Test Cases

| Test | Priority |
|------|----------|
| Unauthorized user cannot access admin-only pages | P0 |
| Cashier cannot edit products | P0 |
| Cashier cannot create users | P0 |
| Cashier cannot view other cashiers' sales | P0 |
| Accountant cannot delete audit logs | P0 |
| Guest cannot access any authenticated page | P0 |
| Invalid session → redirected to /auth | P0 |
| RLS: cashier cannot see other cashiers' sales | P0 |
| RLS: cashier cannot see admin-only pages | P0 |
| RLS: guest cannot access tables | P0 |
| XSS protection in all user input fields | P0 |
| SQL injection prevention (parameterized queries) | P0 |
| Amount overflow/underflow checks | P0 |
| Negative quantities/prices blocked | P0 |
| Duplicate invoice_no prevented | P0 |
| Duplicate idempotency_key prevented | P0 |

### 21.2 Penetration Test Plan

| Area | Test |
|------|------|
| Auth | Brute force login attempts |
| IDOR | Direct object reference attacks |
| SQL Injection | Advanced injection vectors |
| XSS | Stored/reflected XSS in user inputs |
| CSRF | Cross-site request forgery on state-changing operations |
| RLS | Direct database access via service role |
| Encryption | Encryption of sensitive data at rest |
| Rate Limiting | API rate limiting enforcement |

---

## 22. Detailed Specification: Feature Enhancement Ideas

### 22.1 Immediate (This Week)

| Feature | Effort | Value |
|---------|--------|-------|
| User management UI | 2 days | High |
| Search audit logs | 2 hours | Medium |
| Filter sales by cashier | 2 hours | Medium |
| Add product status indicator | 1 hour | Low |
| Export sales to CSV | 2 hours | Medium |

### 22.2 Short-Term (Next 2 Weeks)

| Feature | Effort | Value |
|---------|--------|-------|
| Advanced analytics (product sales by day) | 3 days | High |
| Customer export/import (CSV) | 1 day | Medium |
| Multi-currency support | 1 week | High |
| Digital payments (Stripe, PayPal) | 2 weeks | Medium |
| QR code for payment | 2 days | Low |
| Barcode scanner | 2 days | Low |

### 22.3 Medium-Term (Next 1 Month)

| Feature | Effort | Value |
|---------|--------|-------|
| Point-of-sale hardware integration | 2 weeks | Medium |
| Customer loyalty program | 2 weeks | Medium |
| Warranty tracking | 3 days | Low |
| Supplier management | 2 weeks | Medium |
| Full accounting module (journal, trial balance, financial statements) | 3 months | High |
| Tax rates by product | 1 week | Medium |
| Price history tracking | 1 day | Low |
| Customer timeline/activity | 1 day | Low |

### 22.4 Long-Term (Next 3 Months)

| Feature | Effort | Value |
|---------|--------|-------|
| Full multi-location support | 3 months | High |
| Inventory recipes (auto-deducting ingredient manufacturing) | 4 weeks | High |
| Human Resources (shifts, attendance, scheduling) | 3 months | Medium |
| Financial Planning and Analysis (budgeting, forecasting) | 3 months | Medium |
| Customer portal (online orders, reservations) | 2 weeks | Medium |

---

## 23. Code Quality Assessment

### 23.1 Code Style

- **Consistent naming** — All variables, functions use clear names
- **Consistent patterns** — All pages follow same patterns (react-query, supabase.from)
- **Type safety** — Fully typed with TypeScript
- **Error handling** — Good error handling in most places

### 23.2 Testing

- **Good coverage** — 29 tests covering core business logic
- **Gaps** — No end-to-end, no integration, no SQL function tests

### 23.3 Documentation

- **Good** — Comprehensive docs (LOCAL_BACKEND.md, DEFERRED_PAYMENT.md, AGENTS.md)
- **Missing** — ADRs, OPS docs, API docs, developer guides

---

## 24. Final Recommendations

### Priority 1 (Week 1 — Critical)
1. Remove legacy functions (`complete_sale`, `refund_sale`, `complete_counter_sale` v1)
2. Remove unused integrations
3. Fix `settings.payment_methods` default (Card → Deferred)

### Priority 2 (Weeks 2-4 — Security + Performance)
1. Add session expiry + rate limiting + password strength + lockout
2. Set staleTime on queries
3. Add database indexes
4. Remove N+1 queries

### Priority 3 (Month 1 — Observability + DevOps)
1. Health check endpoints
2. Structured logging
3. Backup procedures
4. CI/CD pipeline

### Priority 4 (Months 2+ — Features)
1. User management UI
2. Password reset/forgot password
3. Change password
4. API rate limiting
5. MFA for critical actions

---

*End of Assessment — Total: ~24 sections, comprehensive project overview*
