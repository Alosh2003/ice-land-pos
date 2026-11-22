import { describe, expect, it } from "vitest";
import { computeTotals, paymentSummary, type CartLine } from "./cart";

const line = (price: number, qty: number, discount = 0): CartLine => ({
  product_id: "x", name_ar: "", name_en: "", list_price: price, unit_price: price, qty, discount,
});

describe("cart totals", () => {
  it("tax is off by default: 2 ice creams at 400 + 1 milkshake at 1200 = 2000", () => {
    expect(computeTotals([line(400, 2), line(1200, 1)], 0, { enabled: false, rate: 15 }).total).toBe(2000);
  });
  it("applies tax after order discount when enabled", () => {
    const t = computeTotals([line(1000, 1)], 100, { enabled: true, rate: 10 });
    expect(t.tax).toBe(90);
    expect(t.total).toBe(990);
  });
  it("order discount cannot exceed subtotal", () => {
    expect(computeTotals([line(500, 1)], 900, { enabled: false, rate: 0 }).total).toBe(0);
  });
  it("adds the delivery fee exactly once without taxing it when disabled", () => {
    expect(computeTotals([line(400, 2)], 0, { enabled: false, rate: 10 }, { fee: 300, taxable: false }).total).toBe(1100);
  });
  it("taxes delivery only when configured", () => {
    expect(computeTotals([line(400, 2)], 0, { enabled: true, rate: 10 }, { fee: 300, taxable: true }).total).toBe(1210);
    expect(computeTotals([line(400, 2)], 0, { enabled: true, rate: 10 }, { fee: 300, taxable: false }).total).toBe(1180);
  });
});

describe("payments", () => {
  it("cash 2000 for a 1500 total gives 500 change", () => {
    const p = paymentSummary(1500, [{ method: "cash", amount: 2000 }]);
    expect(p.change).toBe(500);
    expect(p.valid).toBe(true);
  });
  it("split payment must cover the total", () => {
    expect(paymentSummary(1200, [{ method: "cash", amount: 500 }, { method: "card", amount: 500 }]).valid).toBe(false);
  });
  it("change cannot come from card overpayment", () => {
    expect(paymentSummary(1000, [{ method: "card", amount: 1500 }]).valid).toBe(false);
  });
});
