export type CartLine = {
  product_id: string;
  name_ar: string;
  name_en: string;
  list_price: number;
  unit_price: number;
  qty: number;
  discount: number;
  img?: string | null;
};

export type Totals = { subtotal: number; discount: number; tax: number; total: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

export function lineTotal(l: CartLine) {
  return r2(l.unit_price * l.qty - l.discount);
}

/** Mirrors the database complete_sale() math so the cashier sees what will be charged. */
export function computeTotals(
  lines: CartLine[],
  orderDiscount: number,
  tax: { enabled: boolean; rate: number },
  delivery: { fee: number; taxable: boolean } = { fee: 0, taxable: false },
): Totals {
  const subtotal = r2(lines.reduce((s, l) => s + lineTotal(l), 0));
  const discount = Math.min(Math.max(orderDiscount, 0), subtotal);
  const fee = Math.max(0, delivery.fee);
  const taxAmt = tax.enabled ? r2(((subtotal - discount + (delivery.taxable ? fee : 0)) * tax.rate) / 100) : 0;
  return { subtotal, discount, tax: taxAmt, total: r2(subtotal - discount + taxAmt + fee) };
}

export type Pay = { method: string; amount: number; reference?: string; proof_path?: string };

export function paymentSummary(total: number, pays: Pay[]) {
  const paid = r2(pays.reduce((s, p) => s + (p.amount > 0 ? p.amount : 0), 0));
  const cash = r2(pays.filter((p) => p.method === "cash").reduce((s, p) => s + p.amount, 0));
  const change = Math.max(0, r2(paid - total));
  return {
    paid,
    remaining: Math.max(0, r2(total - paid)),
    change,
    // Change can only be handed back from cash.
    valid: paid >= total && change <= cash && pays.every((p) => p.amount >= 0),
  };
}
