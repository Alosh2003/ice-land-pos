import { describe, expect, it } from "vitest";
import { cashierSummary, closingDiscrepancy, dailyRemaining, deliveryCharge } from "./operations";

describe("counter operation rules", () => {
  it("charges the configured delivery fee only for delivery", () => {
    expect(deliveryCharge("delivery", 300)).toBe(300);
    expect(deliveryCharge("dine_in", 300)).toBe(0);
    expect(deliveryCharge("takeaway", 300)).toBe(0);
  });
  it("reconciles the approved daily quantity example to 16", () => {
    expect(dailyRemaining(20, 5, 8, 1, 2)).toBe(16);
  });
  it("records 15 counted against 16 expected as minus one", () => {
    expect(closingDiscrepancy(16, 15)).toBe(-1);
  });
  it("counts one split-payment sale once and separates cashier items", () => {
    const sale = { id: "1", cashier_id: "a", cashier_name: "A", total: 800, status: "completed", sale_items: [{ product_id: "ice", name_ar: "", name_en: "Ice", qty: 2, line_total: 800 }] };
    const result = cashierSummary([sale, sale, { ...sale, id: "2", cashier_id: "b", cashier_name: "B", total: 400, sale_items: [{ product_id: "ice", name_ar: "", name_en: "Ice", qty: 1, line_total: 400 }] }]);
    expect(result[0]?.count).toBe(1); expect(result[0]?.revenue).toBe(800); expect(result[0]?.items[0]?.qty).toBe(2);
    expect(result[1]?.revenue).toBe(400);
  });
});