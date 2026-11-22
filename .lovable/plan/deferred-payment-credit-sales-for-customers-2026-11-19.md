# Deferred-payment (credit) sales for customers

Replace the "Card" payment method with "Deferred / On account" (آجل). Only registered customers with an active credit account can buy on credit. Each customer has a running balance, a list of unpaid invoices, recorded payments, and a printable account statement.

## What the user will see

1. **Customers page (new full page)**
   - List: name, phone, credit limit, current balance, oldest unpaid date, status (active / blocked).
   - Search, filter (has balance / overdue / blocked), sort, pagination.
   - Add / edit customer: name, phone, second phone, address, notes, credit allowed (yes/no), credit limit, payment terms in days (e.g. 30), opening balance (entered once, recorded as a movement — never edited afterwards).
   - Customer profile: details, balance summary (total invoiced, total paid, outstanding, overdue), unpaid invoices with invoice date and due date, payment history.

2. **POS checkout**
   - New payment method "Deferred" appears instead of Card.
   - Choosing it requires picking/creating a customer (search by name or phone).
   - Shows the customer's current balance and remaining limit; blocks the sale if the limit is exceeded or credit is disabled (managers may override with a reason, logged).
   - Split payment allowed: e.g. 500 cash + 700 deferred.
   - Receipt prints customer name, previous balance, this invoice amount, new balance, and due date.

3. **Receive payment (collection)**
   - From the customer profile: "Receive payment" — amount, date, method (cash / transfer), reference, optional proof photo, notes.
   - Payment is applied to the oldest unpaid invoices first (FIFO) automatically, or cashier can pick specific invoices.
   - Prints a payment receipt.

4. **Customer account statement**
   - Date range filter; opening balance, every invoice (debit) and payment/refund (credit) with date, reference, running balance, closing balance.
   - Print and export (PDF / Excel / CSV).

5. **Reports and dashboard**
   - Dashboard "Accounts receivable" card from real balances.
   - Aging report: current, 1–30, 31–60, 61–90, 90+ days overdue.
   - Collections report by date and by cashier.

## Rules
- Customer balance is never typed manually; it is always calculated from recorded movements.
- Refunding a deferred sale reduces the customer's balance automatically.
- Invoices and payments are never deleted; corrections are made by reversal with a reason and audit log.
- Who can do what: cashier — sell on credit within limit and receive payments; manager/admin — create/edit customers, limits, overrides, reversals; accountant — view statements and reports.

## Technical details
- Extend `customers`: phone2, address, notes, credit_enabled, credit_limit, payment_terms_days, active, deleted_at.
- New `customer_ledger` (append-only): customer_id, kind (opening, sale, payment, refund, adjustment), amount (+debit/−credit), sale_id, payment_id, entry_date, user_id, note.
- New `customer_payments`: customer_id, amount, method, reference, proof_path, paid_at, cashier_id, reversed_at/by/reason; `customer_payment_allocations` (payment_id, sale_id, amount).
- `sales`: add due_date and amount_due/paid status (unpaid, partial, paid) derived from allocations.
- Update `complete_counter_sale` to accept `deferred` method with customer id, enforce limit atomically (row lock on customer), write ledger entry. New RPCs: `receive_customer_payment`, `reverse_customer_payment`, `customer_statement(customer, from, to)`, `receivables_aging()`. `reverse_counter_sale` writes the refund ledger entry.
- Settings: deactivate `card` method, add `deferred` (non-removable while balances exist).
- Pure helpers + tests: FIFO allocation, limit check, running balance, aging buckets.
- Later Phase 3 accounting: sale on credit posts Debit Accounts Receivable / Credit Sales; collection posts Debit Cash / Credit Accounts Receivable.
