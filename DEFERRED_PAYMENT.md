# ICE LAND — Deferred-Payment (Credit) Sales

**Status: Complete.** Cash/Deferred payments are built on a ledger-based credit system. No Card method anymore.

## What the user sees

### Customers page (`/customers`)
- List with: name, phone, credit limit, current balance, oldest unpaid date, status (active/blocked)
- Search, filter (has balance / overdue / blocked), sort, pagination
- Add / edit customer: name, phone, second phone, address, notes, credit allowed (yes/no), credit limit, payment terms (days), opening balance (recorded once as movement)

### Customer profile (`/customers/<id>`)
- Details, balance summary (total invoiced, total paid, outstanding, overdue)
- Unpaid invoices with invoice date, due date, outstanding
- Payment history (receipts, net of change, reference, proof, notes)
- Receive payment: amount, method, reference, optional proof, notes → FIFO allocation to oldest invoices
- Print statement: date range, opening balance, invoices, payments, running balance

### POS checkout
- "Deferred" replaces "Card"
- Choosing it requires picking a customer (search by name/phone)
- Shows current balance + remaining limit; blocks if limit exceeded or credit disabled (managers may override with reason, logged)
- Split payment allowed (e.g., 500 cash + 700 deferred)
- Receipt prints customer name, outstanding, due date, current balance

### Receive payment (customer profile)
- Amount, date, method, reference, proof, notes
- FIFO allocation to oldest unpaid invoices
- Prints payment receipt

### Customer account statement
- Date range; opening balance; every invoice (debit) and payment/refund (credit) with running balance; closing balance
- Print and CSV export

### Reports and dashboard
- Dashboard: "Accounts receivable" card from `receivables_aging()`
- Aging report (`/receivables`): current, 1–30, 31–60, 61–90, 90+ days overdue + total
- Collections report (by date, by cashier)

## Rules
- Customer balance is never typed — always calculated from recorded movements
- Refunding a deferred sale writes a negative ledger entry (auto reduces balance)
- Invoices/payments are never deleted; corrections use reversal with reason (audit-logged)
- Who can do what: cashier — sell on credit within limit, receive payments; manager/admin — create/edit customers, limits, overrides, reversals; accountant — view statements/reports

## Technical details
- `customers`: added `deleted_at`; `phone2`, `address`, `notes`, `credit_enabled`, `credit_limit`, `payment_terms_days`, `opening_balance` (from 0004)
- `customer_ledger`: append-only — kind (opening, sale, payment, refund, adjustment), amount (+debit/−credit), sale_id, payment_id, entry_date, user_id, note
- `customer_payments`: customer_id, receipt_no, amount, method, reference, proof_path, paid_on, cashier_id, reversed info
- `customer_payment_allocations`: payment_id → sale_id, amount (FIFO)
- `sales`: due_date, amount_due, amount_settled (derived)
- RPCs: `complete_counter_sale` (with deferred), `receive_customer_payment`, `reverse_customer_payment`, `customer_statement`, `receivables_aging`, `collections_report`, `customer_overdue`
- Guard: `settings_payment_guard` trigger prevents deactivating "deferred" while balances exist

## Pure helpers + tests
Browser-safe helpers in `src/lib/credit.ts` (no DB):
- `fifoAllocate`, `withinCreditLimit`, `remainingCredit`, `runningBalance`, `openingBalance`, `closingBalance`, `agingBucket`, `agingSummary`, `salePaymentStatus`, `customerStatus`, `balanceSummary`
- Tests in `src/lib/credit.test.ts` — 15+ assertions across 10+ describe blocks

## Migration files (new)
- `0005_deferred_payment.sql` — settings: deferred replaces card; guard + new RPCs
- `0005b_fix_statement.sql` — fixed `customer_statement` ambiguity, `collections_report` bigint
- `0006_guard_deferred.sql` — guard trigger to protect deferred method

## Files changed/added
- New pages: `customers.tsx`, `customers_.$id.tsx`, `receivables.tsx`
- Updated: `pos.tsx` (deferred, customer selection, limit check), `dashboard.tsx` (AR card), `AppShell.tsx` (nav links), `Receipt.tsx` (credit info), `types.ts`
- New helpers: `src/lib/credit.ts`, `src/lib/credit.test.ts`

## End-to-end verification
- Deferred sale creates ledger + sale with due_date and amount_due
- `receive_customer_payment` does FIFO allocation to oldest invoices
- `reverse_customer_payment` writes negative ledger entry (refund)
- `customer_statement` returns opening + all movements + closing
- `receivables_aging` returns correct bucket totals
- `collections_report` returns payments by date/cashier
- Guard blocks deactivating "deferred" while balances exist
