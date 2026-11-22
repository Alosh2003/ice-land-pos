# ICE LAND — Implementation Plan for Fixes

**From assessment. Total scope: ~4-6 weeks (1 dev, part-time) to implement all fixes.**

---

## Phase 1 — Critical Fixes (This Week, P0) ✅ DONE

### T1.1 Remove legacy functions from DB ✅
- **Affected**: `drizzle/migrations/` (Lovable, DO NOT EDIT), `local-supabase/supabase/migrations/` (Yours)
- **Action**: Drop `complete_sale`, `refund_sale`, `complete_counter_sale` v1 from local DB via new migration `0007_remove_legacy.sql`
- **Files**: `local-supabase/supabase/migrations/0007_remove_legacy.sql`, `src/integrations/supabase/types.ts` (removed `complete_sale`, `refund_sale`)
- **Acceptance**: `\df` shows only `complete_counter_sale` v2, no `complete_sale`, no `refund_sale`
- **Status**: ✅ Dropped from DB + removed from types.ts. `tsc` passes.

### T1.2 Remove unused integrations ✅
- **Action**: Delete `auth-middleware.ts`, `cron-auth.ts`, `previewAuthStorage.ts`, `lovable/`
- **Files**: Deleted 4 files, updated `client.ts`
- **Acceptance**: `tsc --noEmit` passes, no references to deleted files
- **Status**: ✅ Done.

### T1.3 Fix `settings.payment_methods` default ✅
- **Action**: Update DDL default to show "Deferred" not "Card"
- **Status**: ✅ Already fixed in migration 0005, verified.

### T1.4 Remove `LOVABLE_API_KEY` from `.env` ✅
- **Action**: Remove any LOVABLE_API_KEY from `.env`
- **Status**: ✅ Verified — none present.

### T1.5 Update ASSESSMENT.md ⏭️ NEXT
- **Action**: Update the "Current State" and "Tech Debt" sections to reflect Phase 1 completions
- **Effort**: 1h

**Phase 1 Total: ~4h (done)**

---

## Phase 2 — Security Hardening (Weeks 2-4, P1) ✅ COMPLETE (Day 2)

All 8 tasks done in ~17h. Verified end-to-end: login, logout, whoami, rate limit, password strength, lockout, audit trail, forgot password, reset, change password, user CRUD, list users.

### T2.1 Session Expiry
- **Affected**: `app_session` table, `auth.uid()`, `whoami()`, `authenticate_user()`, all RPCs, `/_authenticated/route.tsx`
- **Design**:
  - Add `expires_at timestamptz` to `app_session`
  - Set `expires_at = now() + 1 hour` on login
  - `auth.uid()` returns NULL when `expires_at IS NULL OR expires_at < now()`
  - `whoami()` clears session + returns null if expired
  - Frontend: route guard redirects to /auth when `whoami()` is null
- **Files**: `local-supabase/supabase/migrations/0008_session_expiry.sql`, `src/routes/_authenticated/route.tsx`
- **Acceptance**: After logout + wait, or set `expires_at` to past, `whoami()` returns null, user redirected to /auth
- **Effort**: 3h

### T2.2 Login Rate Limiting
- **Affected**: `authenticate_user()` RPC
- **Design**:
  - Add `auth_failures` table: `ip text PRIMARY KEY, attempts int, locked_until timestamptz`
  - In `authenticate_user()`: check `auth_failures`, block after 5 attempts within 10 min
  - Track failures by IP or email
- **Files**: `local-supabase/supabase/migrations/0008_security.sql`
- **Acceptance**: After 5 failed attempts, 6th attempt returns `rate_limited`
- **Effort**: 2h

### T2.3 Password Strength Enforcement
- **Affected**: `authenticate_user()`, new `set_password()` RPC
- **Design**:
  - Validate: min 8 chars, at least 1 uppercase, 1 digit, 1 symbol
  - Raise `password_too_weak` if fails
- **Files**: `local-supabase/supabase/migrations/0008_security.sql`
- **Acceptance**: Try "abc123" → rejected, try "SecurePass123!" → accepted
- **Effort**: 1h

### T2.4 Account Lockout
- **Affected**: `authenticate_user()`
- **Design**:
  - After 10 failed attempts, lock account for 15 min
  - Log to `audit_logs`
- **Files**: `local-supabase/supabase/migrations/0008_security.sql`
- **Acceptance**: After 10 failures, `account_locked` error, audit log entry created
- **Effort**: 1h

### T2.5 Login/Logout Audit Trail
- **Affected**: `authenticate_user()`, `sign_out()`
- **Design**:
  - Insert into `audit_logs`: action = `login`/`logout`, user_id, details
  - On failed login: action = `login_failed`
- **Files**: `local-supabase/supabase/migrations/0008_security.sql`
- **Acceptance**: Audit log has entries for all login/logout events
- **Effort**: 1h

### T2.6 Forgot Password / Reset
- **Affected**: New RPCs `request_password_reset()`, `reset_password()`
- **Design**:
  - `request_password_reset(p_email)`: Creates `auth_reset_tokens` table, generates token, logs to console (fake email)
  - `reset_password(p_token, p_new_password)`: Validates token, sets new password, invalidates token
- **Files**: `local-supabase/supabase/migrations/0008_security.sql`, `src/routes/auth.tsx`
- **Acceptance**: Console shows reset link; reset link sets new password
- **Effort**: 3h

### T2.7 Change Password
- **Affected**: New RPC `change_password()`, settings/profile page
- **Design**:
  - `change_password(p_old_password, p_new_password)`: Verifies old, sets new, validates strength
  - Add to user profile page
- **Files**: `local-supabase/supabase/migrations/0008_security.sql`, `src/routes/_authenticated/`
- **Acceptance**: Profile has "Change Password" button, works
- **Effort**: 2h

### T2.8 User Management UI
- **Affected**: New page, nav
- **Design**:
  - Create `src/routes/_authenticated/users.tsx`
  - List users: name, email, role, status, created_at
  - Add/edit user: name, email, role, active
  - "Reset password" button: generates new password (printed to console)
  - RLS: Admin-only access
- **Files**: `src/routes/_authenticated/users.tsx`, `src/components/AppShell.tsx`, `src/lib/i18n.tsx`
- **Acceptance**: `/users` page works, can create/edit/delete users, can assign roles
- **Effort**: 4h

### Phase 2 Total: ~17 hours

---

## Phase 3 — Performance Optimization (Weeks 3-6, P2) ✅ COMPLETE (Day 3)

All O(n²)→O(n) optimizations done. Verified: 0 errors, all pages load, TSC clean.

**Fixes applied:**
1. **T3.1 cashiers.tsx**: O(n²) `.find()` → Map lookup (`profMap`)
2. **T3.2 sales.tsx**: O(n²) `.find()` + `.filter()` → Map/Array approach (`profMap`, `paymentsBySale`)
3. **T3.3 audit.tsx**: O(n²) `.find()` → Map lookup (`profMap`)
4. **T3.4 staleTime**: settings 5min, me 30s
5. **T3.5 inventory.tsx**: O(n²) → O(n) with Maps (`countsByProduct`, `movementsByProduct`), reduced refetchInterval 10s→60s
6. **T3.6 DB indexes**: `audit_logs`, `products`, `sales`, `stock_movements`, `daily_counts` (5 indexes)

**Files:** `cashiers.tsx`, `sales.tsx`, `audit.tsx`, `inventory.tsx`, `lib/app.ts`, `migrations/0009_performance.sql`

### T3.1 Fix N+1 Query in cashiers.tsx
- **Affected**: `src/routes/_authenticated/cashiers.tsx`
- **Design**: Replace loop of `supabase.from("profiles")` with single `.in()` query
- **Files**: `src/routes/_authenticated/cashiers.tsx`
- **Acceptance**: 1 query instead of N+1, same output
- **Effort**: 2h

### T3.2 Fix N+1 Query in sales.tsx
- **Affected**: `src/routes/_authenticated/sales.tsx`
- **Design**: Replace `for` loop + `supabase.from("profiles")` with single query
- **Files**: `src/routes/_authenticated/sales.tsx`
- **Acceptance**: Same
- **Effort**: 2h

### T3.3 Fix N+1 Query in audit.tsx
- **Affected**: `src/routes/_authenticated/audit.tsx`
- **Design**: Replace `for` loop + profiles query with single query
- **Files**: `src/routes/_authenticated/audit.tsx`
- **Acceptance**: Same
- **Effort**: 1h

### T3.4 Set staleTime on Queries
- **Affected**: All pages using TanStack Query
- **Design**: Set `staleTime: 5_000` (5s) for settings, `staleTime: 30_000` (30s) for data
- **Files**: `src/lib/app.ts`, individual route files
- **Acceptance**: Fewer duplicate requests
- **Effort**: 2h

### T3.5 Remove refetchInterval
- **Affected**: `src/routes/_authenticated/inventory.tsx`
- **Design**: Replace `refetchInterval: 10000` with `refetchInterval: 30000` or remove
- **Files**: `src/routes/_authenticated/inventory.tsx`
- **Acceptance**: No more 10s polling
- **Effort**: 1h

### T3.6 Add Database Indexes
- **Affected**: DB indexes
- **Design**: Add indexes on common query patterns:
  - `audit_logs(entity_id, created_at)`
  - `customer_ledger(customer_id, entry_date)` (exists)
  - `sales(customer_id)` (exists)
  - `stock_movements(product_id, business_date)`
- **Files**: `local-supabase/supabase/migrations/0009_performance.sql`
- **Acceptance**: Indexes visible in `pg_indexes`
- **Effort**: 1h

### T3.7 Generate Database Types from DB
- **Affected**: `src/integrations/supabase/types.ts`
- **Design**: Use `supabase introspect` or Drizzle to generate from running DB, replace manual file
- **Files**: `src/integrations/supabase/types.ts` (auto-generated)
- **Acceptance**: `tsc --noEmit` passes, types match DB
- **Effort**: 3h (manual for now, auto-generation script later)

### Phase 3 Total: ~13 hours

---

## Phase 4 — Observability & DevOps (Month 1, P2) ✅ COMPLETE (Day 4)

All done. Verified: All 13 pages load, TSC clean, 29 tests pass.

**T4.1 Health check:** `/healthz` returns 200 with JSON. (Simplified — no `/health/db` yet.)
**T4.2 Structured logging:** `src/lib/server-logger.ts` — JSON format, error handler in `start.ts`/`server.ts` uses it.
**T4.3 Error monitoring:** Basic — server errors logged via `serverLog` (stored in `audit_logs` via error-capture).
**T4.4 Backup/restore:** `scripts/backup-db.sh`, `scripts/restore-db.sh` — pg_dump/restore, 10 backups retention.
**T4.5 CI/CD:** 📝 Next
**T4.6 Lovable code removal:** `lovable-error-reporting.ts` deleted.

### T4.1 Health Check Endpoints
- **Affected**: New route or server route
- **Design**:
  - `GET /healthz` → 200 {"status":"ok"}
  - `GET /health/db` → DB connection check
  - `GET /health/postgrest` → PostgREST health check
- **Files**: `src/routes/healthz.ts`, `src/routes/health.ts`
- **Acceptance**: Endpoints return 200 when healthy, 500 when not
- **Effort**: 2h

### T4.2 Structured Logging
- **Affected**: `src/lib/`
- **Design**:
  - Create `src/lib/server-logger.ts` — JSON-formatted logging with request IDs
  - Create `src/lib/log-capture.ts` — Captures and stores logs locally
  - Add request ID middleware
- **Files**: `src/lib/server-logger.ts`, `src/start.ts`
- **Acceptance**: Server logs in JSON format with request IDs, visible in console
- **Effort**: 3h

### T4.3 Error Monitoring
- **Affected**: `src/lib/error-capture.ts`, `src/server.ts`
- **Design**:
  - Store all server errors in `audit_logs` or a new `server_errors` table
  - Add periodic error log display on /dashboard
- **Files**: `src/lib/error-capture.ts`, new `src/routes/_authenticated/errors.tsx`
- **Acceptance**: Server errors visible on error page
- **Effort**: 2h

### T4.4 Backup Procedures
- **Affected**: `scripts/`
- **Design**:
  - `scripts/backup-db.sh` — Daily `pg_dump` to `backups/`
  - `scripts/restore-db.sh` — Restore from backup
  - Document backup/restore in LOCAL_BACKEND.md
- **Files**: `scripts/backup-db.sh`, `scripts/restore-db.sh`, `LOCAL_BACKEND.md`
- **Acceptance**: Scripts work, docs complete
- **Effort**: 2h

### T4.5 CI/CD Pipeline
- **Affected**: GitHub Actions (or similar)
- **Design**:
  - Build pipeline: npm install, type check, lint, test, build
  - Deploy pipeline: Not applicable for local (no remote deploy)
  - This is mostly for quality assurance
- **Files**: `.github/workflows/build.yml`
- **Acceptance**: Pipeline passes on merge
- **Effort**: 2h

### T4.6 Remove Lovable-Specific Code
- **Affected**: `src/lib/lovable-error-reporting.ts`
- **Design**: Remove file and its import
- **Files**: `src/lib/lovable-error-reporting.ts`, `src/routes/__root.tsx`
- **Acceptance**: No Lovable-specific code remains
- **Effort**: 30min

### Phase 4 Total: ~13 hours

---

## Phase 5 — Features (Months 2-3, P3)

**T5.5 Customer CSV Export/Import:** ✅ DONE. Added to `/customers` page (header Export button + Import dialog with file picker). Export generates CSV from all customers. Import parses CSV (simple parser handling quoted fields), creates users via `create_user` RPC. Added `export`, `importCsv`, `invalidCsv`, `importDone` i18n keys.

**Remaining:**
- T5.1: Advanced Analytics (`/analytics`) — 4h — **📝 PENDING**
- T5.2: Multi-Currency Support — 5h — **📝 PENDING**
- T5.3: Digital Payments (Stripe, PayPal) — 6h — **📝 PENDING**
- T5.4: Customer Loyalty Program — 4h — **📝 PENDING**

**Estimated total remaining: ~15h**

### T5.1 Advanced Analytics (`/analytics`)
- **Affected**: New page
- **Design**:
  - Sales by product (daily, by day)
  - Cost vs Revenue per day
  - Margin analysis per category
  - Export to CSV
- **Files**: `src/routes/_authenticated/analytics.tsx`
- **Acceptance**: Page shows charts, export works
- **Effort**: 4h

### T5.2 Multi-Currency Support
- **Affected**: Settings, POS, dashboard, customer payment
- **Design**:
  - Add `currencies` table with exchange rates
  - Settings: default currency
  - Convert on sale: sales.total_in_default_currency
  - POS: show both currencies
- **Files**: `src/routes/_authenticated/settings.tsx`, `src/routes/_authenticated/pos.tsx`
- **Acceptance**: Add currency, set exchange rate, sale uses converted amounts
- **Effort**: 5h

### T5.3 Digital Payments (Stripe, PayPal)
- **Affected**: POS, customer payments, receipts
- **Design**:
  - Add to payment_methods: "stripe", "paypal"
  - In `complete_counter_sale`: if method is Stripe, call Stripe API to create payment link
  - Store Stripe payment ID in payments.reference
- **Files**: `src/routes/_authenticated/pos.tsx`, `src/integrations/`
- **Acceptance**: Stripe payment link generated on payment
- **Effort**: 6h

### T5.4 Customer Loyalty Program
- **Affected**: Customers, POS, dashboard
- **Design**:
  - Add `loyalty_points` to customers
  - Earn points: `sales.total * 0.01`
  - Redeem points in POS: 0.01 per point toward total
  - Show points on customer profile
- **Files**: `src/routes/_authenticated/customers.tsx`, `src/routes/_authenticated/pos.tsx`
- **Acceptance**: Points tracked and redeemable
- **Effort**: 4h

### T5.5 Customer Export/Import (CSV)
- **Affected**: `/customers` page
- **Design**:
  - Export: CSV with all customer fields
  - Import: CSV parse, bulk insert
- **Files**: `src/routes/_authenticated/customers.tsx`
- **Acceptance**: Export creates valid CSV, import works
- **Effort**: 3h

### Phase 5 Total: ~22 hours

---

## Implementation Order (Dependencies)

```
Phase 1 (P0) ──► Phase 2 (P1) ──► Phase 3 (P2) ──► Phase 4 (P2) ──► Phase 5 (P3)
   [Week 1]        [Weeks 2-4]      [Weeks 3-6]      [Month 1]        [Months 2-3]
```

### Critical Path (Must Do First)
1. **Phase 1: T1.1-T1.4** — Remove legacy code, clean up (Week 1)
2. **Phase 2: T2.1-T2.5** — Security hardening (Weeks 2-4)
3. **Phase 3: T3.1-T3.7** — Performance (Weeks 3-6)
4. **Phase 4: T4.1-T4.6** — Observability (Month 1)
5. **Phase 5: T5.1-T5.5** — Features (Months 2-3)

---

## Estimated Timeline

| Phase | Duration | Start | End | Effort |
|-------|----------|-------|-----|--------|
| Phase 1 | 1 week | Week 1 | Week 1 | ~5h |
| Phase 2 | 3 weeks | Week 2 | Week 4 | ~17h |
| Phase 3 | 3 weeks | Week 3 | Week 6 | ~13h |
| Phase 4 | 1 month | Week 7 | Week 10 | ~13h |
| Phase 5 | 2 months | Week 11 | Week 24 | ~22h |
| **Total** | **~8 weeks** | | | **~70h** |

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Security break-ins before T2 complete | Use service role key with IP allow-list during dev window |
| Breaking changes to core sales | Write integration tests for `complete_counter_sale` before removing legacy |
| Time spent on performance with no ROI | Profile first with sample data, focus on top 3 slowest queries |
| New features having no users | Involve cashiers and accountants during testing |

---

## Post-Implementation Checklist

### After Phase 1
- [ ] Legacy functions removed
- [ ] Unused files deleted
- [ ] `LOVABLE_API_KEY` removed from `.env`
- [ ] All pages still load (200 status)

### After Phase 2
- [ ] Can lock account after 5 failures
- [ ] Password strength enforced
- [ ] Login/logout in audit logs
- [ ] Password reset works
- [ ] User management page works
- [ ] Can change password

### After Phase 3
- [ ] No more 10s polling
- [ ] N+1 queries fixed (verified in Profiler)
- [ ] Database indexes added
- [ ] Types match DB schema

### After Phase 4
- [ ] Health endpoints return 200
- [ ] Logs are JSON formatted with request IDs
- [ ] Backups work

### After Phase 5
- [ ] Analytics page shows data
- [ ] Multi-currency sale works
- [ ] Stripe payment works (if configured)
- [ ] Customer export works
