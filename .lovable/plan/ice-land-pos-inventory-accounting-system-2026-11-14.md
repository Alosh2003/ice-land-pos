# ICE LAND – POS, Inventory & Accounting System

Built in 4 phases on one architecture (Lovable Cloud database + logins). This plan delivers Phase 1 fully working, with the database and navigation designed for all 14 modules so later phases plug in without rework. Each later phase is a follow-up request.

## Design
- Brand from the logo: teal/turquoise primary, cyan accent, pink secondary, white / pale-blue backgrounds, dark navy text. Circle "scoops" motif from the logo used in the sidebar header and empty states.
- Fonts: Tajawal (Arabic) + Outfit (English).
- Arabic default (RTL), English switch (LTR) in the top bar. Currency "ريال / Rial" configurable, no decimals by default.
- Collapsible sidebar with all 14 modules; modules not yet built are hidden until their phase (no dead buttons).

## Phase 1 (this build)
1. **Login** – email/password. First account becomes Administrator. Roles: Admin, Manager, Cashier, Accountant (stored in a separate roles table, enforced by database rules).
2. **Products & Menu** – categories (Ice Cream, Special Flavors, Milkshakes, Sour Milkshakes), Arabic/English names, SKU, image upload, selling price, cost price, margin, active toggle, stock tracking. Seeded with the full menu from the images (400 / 500 / 1,200 Rial), costs left at 0 for the admin to fill in.
3. **POS** – category tabs + search, product grid, cart with quantity, line/order discount, notes, price edit for Admin/Manager only, tax (off by default), cash/card/transfer + split payment, amount received and change. One-click checkout that creates the invoice (unique number like IL-000123) in a single all-or-nothing database operation, guarded against double submit. Printable 80mm receipt + reprint.
4. **Sales history** – search, filter by date/employee/payment, paging, invoice detail, reprint, cancel/refund (Admin/Manager, with reason; recorded, never deleted).
5. **Dashboard** – all from real records: today/period sales, transaction count, average order, best product/category, period comparison, daily trend, revenue by category and payment method, top 10 products, recent sales. Date filters: Today, Yesterday, This Week, This Month, Custom. Profit/expense/cash cards appear once Phases 2–3 exist.
6. **Settings (basic)** – store name, logo, contact, currency, date format, tax toggle/rate, payment methods, receipt footer.
7. **Audit log** for sales, refunds, price edits, product changes.

## Later phases (same foundation)
- **Phase 2:** Inventory (finished goods + raw materials, movements, waste, expiry, min alerts, valuation), recipes that auto-deduct on sale, suppliers, purchases (paid/partial/unpaid), expenses with categories, receipts, recurring.
- **Phase 3:** Cash registers & shifts with reconciliation; double-entry accounting with chart of accounts, automatic balanced entries for every sale/purchase/expense/refund, ledger, trial balance, P&L, balance sheet, cash flow, period closing. Phase 1 sales get back-posted.
- **Phase 4:** Reports center with Excel/CSV/PDF export, customers, employee management & login history, full permission settings, backup guidance.

## Technical details
- TanStack Start + Lovable Cloud (Postgres, Auth, Storage for product images/logo).
- Tables now: user_roles (app_role enum + has_role()), profiles, settings, categories, products, customers (minimal), sales, sale_items, payments, invoice counter sequence, audit_logs. All with GRANTs + RLS by role.
- `complete_sale` Postgres function (security definer, checks role) inserts sale, items, payments atomically, validates totals, uses an idempotency key to block duplicates; `refund_sale` similar. Later phases extend these functions to deduct inventory and post journal entries in the same transaction.
- Soft deletes for products; sales never deleted, only status changes.
- i18n via a lightweight dictionary + `dir` on `<html>`; Intl for numbers/dates.
- Charts with Recharts; dashboard numbers computed by SQL aggregate functions.
- Verification: create product, complete sale, refund, confirm dashboard totals match sales table; unit tests for cart/total/change calculation.
