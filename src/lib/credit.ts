// ICE LAND — deferred-payment (credit) pure helpers.
// Browser-safe, no database access. Mirrors the rules enforced by the
// PostgreSQL RPCs (complete_counter_sale, receive_customer_payment,
// customer_statement, receivables_aging) so the UI and the backend agree.

export type AgingBucket = "current" | "1_30" | "31_60" | "61_90" | "90_plus";

export type UnpaidInvoice = {
  sale_id: string;
  invoice_no: string;
  invoice_date: string; // ISO date
  due_date: string | null; // ISO date
  amount_due: number;
  amount_settled: number;
  outstanding: number;
};

export type LedgerEntry = {
  entry_date: string; // ISO date
  kind: string;
  reference: string;
  amount: number; // +debit / -credit
  balance_after: number;
  note: string;
  user_id: string | null;
  created_at: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Customer balance = sum of all ledger movements. Never typed manually. */
export function runningBalance(entries: LedgerEntry[]): number {
  return r2(entries.reduce((sum, e) => sum + e.amount, 0));
}

/** Opening balance = sum of movements before the statement start date. */
export function openingBalance(allEntries: LedgerEntry[], fromDate: string): number {
  return r2(allEntries.filter((e) => e.entry_date < fromDate).reduce((sum, e) => sum + e.amount, 0));
}

/** Closing balance for a date range = opening + movements inside the range. */
export function closingBalance(allEntries: LedgerEntry[], fromDate: string, toDate: string): number {
  const opening = openingBalance(allEntries, fromDate);
  const inRange = allEntries
    .filter((e) => e.entry_date >= fromDate && e.entry_date <= toDate)
    .reduce((sum, e) => sum + e.amount, 0);
  return r2(opening + inRange);
}

/** FIFO allocation: apply a payment to the oldest unpaid invoices first. */
export function fifoAllocate(paymentAmount: number, invoices: UnpaidInvoice[]): { sale_id: string; amount: number }[] {
  const allocations: { sale_id: string; amount: number }[] = [];
  let remaining = Math.max(0, paymentAmount);

  // Oldest invoice date first; fall back to invoice number for stable order.
  const ordered = [...invoices]
    .filter((i) => i.outstanding > 0)
    .sort((a, b) => (a.invoice_date < b.invoice_date ? -1 : a.invoice_date > b.invoice_date ? 1 : a.invoice_no.localeCompare(b.invoice_no)));

  for (const inv of ordered) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, inv.outstanding);
    if (take > 0) {
      allocations.push({ sale_id: inv.sale_id, amount: r2(take) });
      remaining = r2(remaining - take);
    }
  }

  return allocations;
}

/** True when a new deferred amount fits within the customer's credit limit. */
export function withinCreditLimit(currentBalance: number, creditLimit: number, newAmount: number): boolean {
  return r2(currentBalance + newAmount) <= r2(creditLimit);
}

export function remainingCredit(currentBalance: number, creditLimit: number): number {
  return Math.max(0, r2(creditLimit - currentBalance));
}

/** Days overdue: 0 when not yet due, negative when not due yet. */
export function daysOverdue(dueDate: string | null, today: string): number {
  if (!dueDate) return 0;
  const due = new Date(dueDate + "T00:00:00");
  const now = new Date(today + "T00:00:00");
  return Math.max(0, Math.floor((now.getTime() - due.getTime()) / 86400000));
}

/** Bucket a single invoice by days overdue. */
export function agingBucket(dueDate: string | null, today: string): AgingBucket {
  const days = daysOverdue(dueDate, today);
  if (days <= 0) return "current";
  if (days <= 30) return "1_30";
  if (days <= 60) return "31_60";
  if (days <= 90) return "61_90";
  return "90_plus";
}

export type AgingSummary = Record<AgingBucket, number> & { total: number };

/** Aggregate outstanding invoices into aging buckets. */
export function agingSummary(invoices: UnpaidInvoice[], today: string): AgingSummary {
  const summary: AgingSummary = { current: 0, "1_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0, total: 0 };
  for (const inv of invoices) {
    const bucket = agingBucket(inv.due_date, today);
    summary[bucket] = r2(summary[bucket] + inv.outstanding);
    summary.total = r2(summary.total + inv.outstanding);
  }
  return summary;
}

/** Status of a customer for list display. */
export type CustomerStatus = "active" | "blocked";

export function customerStatus(active: boolean, overdue: boolean, creditEnabled: boolean): CustomerStatus {
  if (!active) return "blocked";
  if (overdue) return "blocked";
  return "active";
}

/** Payment status of a sale derived from amount_due / amount_settled. */
export type SalePaymentStatus = "unpaid" | "partial" | "paid";

export function salePaymentStatus(amountDue: number, amountSettled: number): SalePaymentStatus {
  if (amountDue <= 0) return "paid";
  if (amountSettled <= 0) return "unpaid";
  if (amountSettled >= amountDue) return "paid";
  return "partial";
}

/** Balance summary for a customer profile. */
export type BalanceSummary = {
  total_invoiced: number;
  total_paid: number;
  outstanding: number;
  overdue: number;
};

export function balanceSummary(invoices: UnpaidInvoice[], paymentsTotal: number, today: string): BalanceSummary {
  const outstanding = r2(invoices.reduce((s, i) => s + i.outstanding, 0));
  const overdue = r2(
    invoices
      .filter((i) => daysOverdue(i.due_date, today) > 0)
      .reduce((s, i) => s + i.outstanding, 0),
  );
  return {
    total_invoiced: r2(paymentsTotal + outstanding),
    total_paid: r2(paymentsTotal),
    outstanding,
    overdue,
  };
}

/** Format a number as an integer or 2-decimal amount. */
export function fmtAmount(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}
