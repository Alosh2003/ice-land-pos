# ICE LAND — Progress Review & Updated Delivery Plan

Reviewed 16 November 2026. This updates the original four-phase plan with cashier accountability, payment references/proof, item photos, dine-in/takeaway/delivery, customer phone ordering, and daily item reconciliation.

## Implementation update — counter milestone
- Added cashier/item reports and cashier/payment/reference filters in Sales.
- Added automatic invoice cashier-name snapshots, order types, configured delivery fees, item-photo snapshots and typed payment references/private proof photos.
- Added Settings and Audit pages, Dashboard custom dates/recent sales and daily inventory opening/additions/waste/count/closing controls with movement history.
- Thirteen calculation/routing tests pass. Signed-in verification completed a labelled sample sale, read its reference/proof back, refunded/restocked it, and closed a count with a −1 discrepancy. Delivery switching showed 700 Rial with a 300 fee versus 400 Rial takeaway; the original settings were restored.
- The sample sale remains explicitly refunded in history for traceability; sample catalog items were soft-deleted. Actual menu photos still need to be supplied/uploaded where absent.
- Still pending: two-account/concurrency/idempotency acceptance, historical photo replacement, closed-day edge cases, customer phone ordering/queue, and Phases 2–4. The system is not yet fully accepted as production-ready.

## Where we are now

**Phase 1 is partially implemented, not yet accepted as complete.** The current app has Login, Dashboard, POS, Sales, and Products pages. Later phases are not built.

| Area | Current state | What remains |
|---|---|---|
| Login & roles | Sign-in and separate Admin, Manager, Cashier, Accountant roles implemented | Verify real multi-account access and role restrictions |
| Products & menu | Bilingual catalog, categories, price/cost, active state, stock fields, photo upload/display implemented | Verify uploads and actual menu photos; add preview/remove controls |
| POS | Cart, discounts, restricted price editing, tax, split payment, invoice numbering, receipt and stock deduction implemented | End-to-end checkout/retry/refund verification and the order additions below |
| Sales history | Invoice number, cashier name, payment methods, dates, invoice detail/reprint and reversal implemented | Employee/payment filters, payment amounts in list, cashier/item summary and payment references/proof |
| Dashboard | Period figures and charts implemented | Custom dates, recent sales, cashier summaries and reconciliation against real records; clearly label product-margin figures until full accounting exists |
| Settings | Stored settings are consumed by the app | Build the settings editor promised in Phase 1 |
| Audit | Product/settings/sale/refund event recording exists | Build audit viewer and filters; include meaningful stock quantity changes |
| Inventory | Basic tracked-product quantity deduction/restoration exists | Daily opening/count/closing workflow, movement history, raw materials, recipes, waste and valuation |
| Customer ordering | Minimal customer records exist | Customer phone-order page and staff order queue; no ordering workflow exists yet |
| Accounting & other modules | Not implemented | Purchases, suppliers, expenses, shifts, double-entry accounting, reports and employee administration |

### Verification so far
- Seven existing tests pass: cart/tax/discount/payment calculations and home-route matching.
- These tests do **not** prove that real cashier sales, storage uploads, receipts, refunds, stock, permissions or dashboard totals work end-to-end.
- Full acceptance testing remains required. Do not describe the system as production-ready before it passes.

## Design retained from the original plan
- Teal/turquoise primary, cyan accent, pink secondary, white/pale-blue backgrounds and dark navy text, using the ICE LAND logo.
- Tajawal for Arabic and Outfit for English. Arabic default RTL with English LTR switching.
- Configurable Rial currency with no decimals by default.
- Collapsible navigation; hide modules until they are usable, with no dead links.

## Next milestone — Finish Phase 1 and daily counter operations

### 1. Know who sold what and how much
- Every cashier uses a separate account; each sale is attributed automatically to the signed-in cashier, never a manually selected name.
- Keep invoice number, cashier identity, time, item quantities, unit prices, discounts, total, payment methods and amounts together.
- Add date + cashier + payment-method filters and a cashier summary showing transaction count, item quantities, completed revenue, reversals and net sales.
- Item breakdown per cashier shows each product's quantity and sales amount. Split payments must not duplicate transaction counts or item quantities.
- Retain cashier identity/name for historical invoices even after staff details change.
- Admin/Manager can compare cashiers; cashier access remains limited to permitted records. Financial views follow the established roles.

### 2. Invoice number, payment method and payment reference/proof
- Continue generating invoice numbers automatically.
- Each payment row stores its own method and amount, with **an optional typed payment reference or an uploaded payment-proof photo**, as confirmed by the user; support both together too.
- Show references/proof with the matching payment in invoice detail, including split payments. Do not confuse the invoice number with a bank/card/transfer reference.
- Proof photos are staff-only, not public product images; use restricted access and safe upload validation.
- Distinguish amount tendered, net payment and cash change. Filter/search by invoice, method and typed reference.
- Keep sensitive proof off printed customer receipts by default; receipt shows invoice, cashier, methods and amounts.

### 3. Item photos
- Display the item's photo beside its name in catalog/POS, cart, invoice detail and customer phone menu, with a consistent fallback when unavailable.
- Add photo preview, replacement and removal in product editing; verify uploaded photos actually load.
- Preserve the sold item's name/price and photo reference for historical invoice detail. Keep the compact thermal receipt text-first.
- Use supplied/real product photos; request missing actual item photos rather than claiming unrelated images are the products.

### 4. Dine-in, takeaway and optional delivery
- Add one order-type selector: **Dine-in (local), Takeaway, Delivery**; default Dine-in.
- Delivery is optional. When selected, collect delivery fee, customer contact and delivery address; show the fee separately and include it in amount due and receipt.
- Dine-in/takeaway have no delivery fee. Switching away from delivery clears that fee.
- Authorized staff manage delivery pricing; do not invent a fee. Configure fee/tax treatment in settings and show the exact calculation.
- Store fulfillment type/fee on the invoice, separate from item revenue and inventory quantities.

### 5. Daily availability and end-of-day reconciliation
- Admin/Manager sets each item's **opening available quantity for the store's business day**, and records additional production/restocking during the day.
- Show a daily item table: opening quantity, additions, sold quantity, returned quantity, waste/adjustments, expected remaining, physical closing count and discrepancy.
- Calculation: **expected remaining = opening + additions + restocked returns − sold − waste + signed adjustments**.
- Daily quantities must reconcile with the continuing inventory balance: opening from yesterday's closing, with discrepancies recorded as movements, not silent overwrites or a daily reset of history.
- Sales automatically reduce availability; staff cannot oversell. Simultaneous cashier sales must use the same live availability safely.
- Record whether stock was actually deducted for each sold line so reversals restore exactly that quantity, even if the product's tracking setting changes later. Only resalable returns go back into available stock; others are waste.
- Customer ordering uses the same availability. Pending orders reserve quantities; cancellation/expiry releases them; completion consumes them once.
- Support units appropriate to the item; quantities do not change prices. Store timezone/business-day boundaries are configurable.
- Admin/Manager closes the day after counting. Keep an immutable audit trail of openings, additions, adjustments and closing discrepancies.

### 6. Complete original Phase 1 omissions
- Settings editor: store/logo/contact, currency/decimals, date format, tax/rate, active payment methods, receipt footer, delivery configuration and business-day timezone.
- Audit page with date/user/action/entity filters and event details.
- Sales filters and cashier summaries; Dashboard custom dates and recent sales.
- Verify original checkout, full-sale refund/cancel, receipt/reprint, stock changes, role access and totals before moving on.

## Customer phone ordering — after daily availability is reliable
- Add a public, phone-friendly menu page under the same app, with Arabic/English product names, real photos, prices, availability, cart and checkout; no staff login required.
- Customer chooses dine-in, takeaway or delivery and sees any delivery fee before submitting. Collect the minimum contact details and delivery address only when needed.
- Start with **payment confirmed by staff / pay at store / cash on delivery** where enabled, not a claimed online payment integration. Online payment processing is separate scope.
- Create a pending order, not a completed sale. Staff queue supports accept/reject, preparing, ready, fulfilled and cancelled states with stock reservation/release.
- The cashier confirming payment/fulfillment becomes the sale's accountable cashier; keep online order source and accepting staff separate. Create the final invoice only once.
- Customer sees confirmation and a secure order-status link; prevent access to other customers' orders, staff records or payment-proof photos.
- Protect public submissions from spam and duplicate orders; validate prices, fees and availability on the server.

## Remaining original phases

### Phase 2 — Full inventory, purchasing & expenses
- Extend the daily finished-item foundation with raw materials, units, recipes and automatic ingredient deduction.
- Inventory movements, waste, expiry, minimum alerts and valuation.
- Suppliers and purchase invoices with paid/partial/unpaid balances and receiving into inventory.
- Expense categories, receipts and recurring expenses.

### Phase 3 — Registers, shifts & accounting
- Register opening/closing, cashier shifts, expected vs counted cash and reconciliation.
- Chart of accounts and automatic balanced journal entries for sales, delivery fees, purchases, expenses and refunds.
- Ledger, trial balance, Profit & Loss, balance sheet, cash flow and period closing.
- Back-post existing transactions once, with reconciliation and no duplicates.

### Phase 4 — Reporting & administration
- Reports center with Excel/CSV/PDF exports, including cashier/item/day, payment and delivery reports.
- Customer management, employee accounts, login history and full permission administration.
- Backup/restore guidance and final operational/security acceptance checks.

## Technical details
- Preserve TanStack Start and Lovable Cloud, existing role table, RLS and atomic sale processing.
- Extend sales/order/payment records additively for historical cashier/item information, fulfillment, fees, references and private proof paths.
- Add stock movements, daily counts and order reservations as the inventory source of truth; keep updates, sale completion and reversals transactional and idempotent.
- Public customer menu exposes only active sellable items and safe availability. Public order actions validate server-side; staff access remains authenticated and role-restricted.
- Shared calculation logic and small rule tests cover delivery fees, daily quantity equations, multi-cashier sales, split payment counts and reversal stock behavior.

## Acceptance checklist
- Two cashier accounts sell different items; the manager sees correct item quantities, per-cashier amounts and transaction counts.
- Automatic invoice number and each method/amount/reference/proof read back correctly, including split payments and cash change.
- Real product photos display in product editing, POS, cart, invoice detail and phone menu.
- Dine-in/takeaway charge no delivery fee; delivery charges the configured fee exactly once.
- Opening 20 + additions 5 − sold 8 + restocked returns 1 − waste 2 = expected remaining 16; a closing count of 15 records a discrepancy of −1.
- Concurrent cashier/customer orders cannot oversell; cancelled reservations release stock; retries cannot create duplicate sales or deductions.
- Refund after changing stock-tracking settings restores only the quantity originally deducted and approved for restocking.
- Customer submits a phone order, staff accepts and fulfills it, and the resulting invoice/stock/customer status agree.
- Purchase receiving, expense entry, shift closing, P&L and balanced debits/credits pass when their phases are built.
- Dashboard, cashier reports, daily counts and accounting totals reconcile with underlying transactions.

**This request updates the plan only; none of the new features are implemented by this revision.**