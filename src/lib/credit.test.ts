import { describe, expect, it } from "vitest";
import {
  agingBucket,
  agingSummary,
  balanceSummary,
  closingBalance,
  customerStatus,
  daysOverdue,
  fifoAllocate,
  openingBalance,
  remainingCredit,
  runningBalance,
  salePaymentStatus,
  withinCreditLimit,
  type LedgerEntry,
  type UnpaidInvoice,
} from "./credit";

const entry = (date: string, amount: number): LedgerEntry => ({
  entry_date: date,
  kind: "sale",
  reference: "",
  amount,
  balance_after: 0,
  note: "",
  user_id: null,
  created_at: date,
});

describe("running balance", () => {
  it("sums all ledger movements", () => {
    expect(runningBalance([entry("2026-01-01", 500), entry("2026-01-02", -200)])).toBe(300);
  });

  it("opening balance only includes entries before the range", () => {
    const entries = [entry("2025-12-31", 1000), entry("2026-01-01", 200), entry("2026-01-02", -300)];
    expect(openingBalance(entries, "2026-01-01")).toBe(1000);
    expect(closingBalance(entries, "2026-01-01", "2026-01-02")).toBe(900);
  });
});

describe("FIFO allocation", () => {
  const invoices: UnpaidInvoice[] = [
    { sale_id: "a", invoice_no: "IL-000001", invoice_date: "2026-01-01", due_date: "2026-01-31", amount_due: 500, amount_settled: 0, outstanding: 500 },
    { sale_id: "b", invoice_no: "IL-000002", invoice_date: "2026-01-02", due_date: "2026-02-01", amount_due: 700, amount_settled: 100, outstanding: 600 },
    { sale_id: "c", invoice_no: "IL-000003", invoice_date: "2026-01-03", due_date: "2026-02-02", amount_due: 300, amount_settled: 0, outstanding: 300 },
  ];

  it("applies payment to the oldest invoice first", () => {
    const alloc = fifoAllocate(500, invoices);
    expect(alloc).toEqual([{ sale_id: "a", amount: 500 }]);
  });

  it("spills over to the next invoice when payment exceeds the oldest", () => {
    const alloc = fifoAllocate(800, invoices);
    expect(alloc).toEqual([
      { sale_id: "a", amount: 500 },
      { sale_id: "b", amount: 300 },
    ]);
  });

  it("skips already-settled invoices and never over-allocates", () => {
    const alloc = fifoAllocate(2000, invoices);
    expect(alloc.reduce((s, a) => s + a.amount, 0)).toBe(1400);
    expect(alloc.find((a) => a.sale_id === "b")?.amount).toBe(600);
  });

  it("returns nothing for a zero payment", () => {
    expect(fifoAllocate(0, invoices)).toEqual([]);
  });
});

describe("credit limit", () => {
  it("allows a sale within the limit", () => {
    expect(withinCreditLimit(200, 1000, 500)).toBe(true);
  });
  it("blocks a sale that exceeds the limit", () => {
    expect(withinCreditLimit(800, 1000, 500)).toBe(false);
  });
  it("allows exactly reaching the limit", () => {
    expect(withinCreditLimit(500, 1000, 500)).toBe(true);
  });
  it("remaining credit never goes negative", () => {
    expect(remainingCredit(1200, 1000)).toBe(0);
    expect(remainingCredit(200, 1000)).toBe(800);
  });
});

describe("aging", () => {
  const today = "2026-02-15";

  it("buckets by days overdue", () => {
    expect(agingBucket("2026-02-20", today)).toBe("current");
    expect(agingBucket("2026-02-15", today)).toBe("current");
    expect(agingBucket("2026-01-20", today)).toBe("1_30");
    expect(agingBucket("2026-01-01", today)).toBe("31_60");
    expect(agingBucket("2025-12-15", today)).toBe("61_90");
    expect(agingBucket("2025-08-01", today)).toBe("90_plus");
  });

  it("null due date is current", () => {
    expect(daysOverdue(null, today)).toBe(0);
    expect(agingBucket(null, today)).toBe("current");
  });

  it("aggregates outstanding into buckets", () => {
    const invoices: UnpaidInvoice[] = [
      { sale_id: "1", invoice_no: "1", invoice_date: "2026-02-01", due_date: "2026-02-20", amount_due: 100, amount_settled: 0, outstanding: 100 },
      { sale_id: "2", invoice_no: "2", invoice_date: "2026-01-01", due_date: "2026-01-20", amount_due: 200, amount_settled: 0, outstanding: 200 },
      { sale_id: "3", invoice_no: "3", invoice_date: "2025-10-01", due_date: "2025-10-20", amount_due: 300, amount_settled: 0, outstanding: 300 },
    ];
    const summary = agingSummary(invoices, today);
    expect(summary.current).toBe(100);
    expect(summary["1_30"]).toBe(200);
    expect(summary["90_plus"]).toBe(300);
    expect(summary.total).toBe(600);
  });
});

describe("status helpers", () => {
  it("sale payment status from due/settled", () => {
    expect(salePaymentStatus(500, 0)).toBe("unpaid");
    expect(salePaymentStatus(500, 200)).toBe("partial");
    expect(salePaymentStatus(500, 500)).toBe("paid");
    expect(salePaymentStatus(0, 0)).toBe("paid");
  });

  it("customer status is blocked when overdue or inactive", () => {
    expect(customerStatus(true, false, true)).toBe("active");
    expect(customerStatus(true, true, true)).toBe("blocked");
    expect(customerStatus(false, false, true)).toBe("blocked");
  });

  it("balance summary separates outstanding and overdue", () => {
    const invoices: UnpaidInvoice[] = [
      { sale_id: "1", invoice_no: "1", invoice_date: "2026-02-01", due_date: "2026-02-20", amount_due: 100, amount_settled: 0, outstanding: 100 },
      { sale_id: "2", invoice_no: "2", invoice_date: "2026-01-01", due_date: "2026-01-10", amount_due: 200, amount_settled: 0, outstanding: 200 },
    ];
    const s = balanceSummary(invoices, 50, "2026-02-15");
    expect(s.total_invoiced).toBe(350);
    expect(s.total_paid).toBe(50);
    expect(s.outstanding).toBe(300);
    expect(s.overdue).toBe(200);
  });
});
