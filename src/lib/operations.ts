export type Fulfillment = "dine_in" | "takeaway" | "delivery";

export function deliveryCharge(type: Fulfillment, fee: number) {
  return type === "delivery" ? Math.max(0, fee) : 0;
}

export function dailyRemaining(opening: number, additions: number, sold: number, returned: number, waste: number, adjustments = 0) {
  return opening + additions + returned - sold - waste + adjustments;
}

export function closingDiscrepancy(expected: number, counted: number) {
  return counted - expected;
}

export type ReportSale = { id: string; cashier_id: string; cashier_name: string | null; total: number; status: string; sale_items: { name_ar: string; name_en: string; product_id: string; qty: number; line_total: number }[] };

export function cashierSummary(sales: ReportSale[]) {
  const grouped = new Map<string, { id: string; name: string; count: number; revenue: number; reversed: number; qty: number; items: Map<string, { name_ar: string; name_en: string; qty: number; revenue: number }> }>();
  const seen = new Set<string>();
  for (const s of sales) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    const row = grouped.get(s.cashier_id) ?? { id: s.cashier_id, name: s.cashier_name || s.cashier_id.slice(0, 8), count: 0, revenue: 0, reversed: 0, qty: 0, items: new Map() };
    if (s.status === "completed") {
      row.count += 1;
      row.revenue += Number(s.total);
      for (const item of s.sale_items) {
        const x = row.items.get(item.product_id) ?? { name_ar: item.name_ar, name_en: item.name_en, qty: 0, revenue: 0 };
        x.qty += Number(item.qty); x.revenue += Number(item.line_total); row.qty += Number(item.qty);
        row.items.set(item.product_id, x);
      }
    } else row.reversed += Number(s.total);
    grouped.set(s.cashier_id, row);
  }
  return [...grouped.values()].map((r) => ({ ...r, items: [...r.items.values()] }));
}