import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, Trash2, Search, Printer, X, IceCreamCone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RequireRole } from "@/components/AppShell";
import { Receipt } from "@/components/Receipt";
import { PaymentProofUpload } from "@/components/PaymentProof";
import { deliveryCharge, type Fulfillment } from "@/lib/operations";
import { useI18n } from "@/lib/i18n";
import { errMsg, signedImage, useFmt, useMe, useSettings, type PayMethod } from "@/lib/app";
import { computeTotals, lineTotal, paymentSummary, type CartLine, type Pay } from "@/lib/cart";

export const Route = createFileRoute("/_authenticated/pos")({
  head: () => ({ meta: [{ title: "Point of Sale — ICE LAND" }, { name: "description", content: "ICE LAND counter checkout." }, { property: "og:title", content: "Point of Sale — ICE LAND" }, { property: "og:description", content: "ICE LAND counter checkout." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: () => <RequireRole roles={["admin", "manager", "cashier"]}><POS /></RequireRole>,
});

function useCatalog() {
  return useQuery({
    queryKey: ["catalog"],
    refetchInterval: 10000,
    queryFn: async () => {
      const [c, p] = await Promise.all([
        supabase.from("categories").select("*").eq("active", true).order("sort_order"),
        supabase.from("products").select("*").eq("active", true).is("deleted_at", null).order("sku"),
      ]);
      if (c.error) throw c.error;
      if (p.error) throw p.error;
      const prods = await Promise.all(p.data.map(async (x) => ({ ...x, img: await signedImage(x.image_url) })));
      return { categories: c.data, products: prods };
    },
  });
}

function POS() {
  const { t, lang } = useI18n();
  const { money } = useFmt();
  const settings = useSettings();
  const { has } = useMe();
  const canPrice = has("admin", "manager");
  const qc = useQueryClient();
  const { data, isLoading } = useCatalog();
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderDisc, setOrderDisc] = useState(0);
  const [notes, setNotes] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<Fulfillment>("dine_in");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const fee = deliveryCharge(orderType, Number(settings?.delivery_fee ?? 0));

  const totals = computeTotals(cart, orderDisc, { enabled: !!settings?.tax_enabled, rate: Number(settings?.tax_rate ?? 0) }, { fee, taxable: !!settings?.delivery_taxable });
  const products = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.products ?? []).filter((p) => (cat === "all" || p.category_id === cat) &&
      (!s || p.name_ar.includes(s) || p.name_en.toLowerCase().includes(s) || (p.sku ?? "").toLowerCase().includes(s)));
  }, [data, cat, q]);

  function add(p: NonNullable<typeof data>["products"][number]) {
    if (p.track_stock) {
      const inCart = cart.find((l) => l.product_id === p.id)?.qty ?? 0;
      if (inCart + 1 > Number(p.stock_qty)) { toast.error(t("outOfStock")); return; }
    }
    setCart((c) => {
      const ex = c.find((l) => l.product_id === p.id);
      if (ex) return c.map((l) => (l.product_id === p.id ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { product_id: p.id, name_ar: p.name_ar, name_en: p.name_en, list_price: Number(p.price), unit_price: Number(p.price), qty: 1, discount: 0, img: p.img }];
    });
  }
  const upd = (id: string, patch: Partial<CartLine>) => setCart((c) => c.map((l) => (l.product_id === id ? { ...l, ...patch } : l)).filter((l) => l.qty > 0));
  const reset = () => { setCart([]); setOrderDisc(0); setNotes(""); setOrderType("dine_in"); setAddress(""); setPhone(""); };

  return (
    <div className="grid lg:grid-cols-[1fr_400px] gap-5 h-full">
      <section className="min-w-0 space-y-4">
        <div className="relative">
          <Search className="absolute top-3 start-3 h-4 w-4 text-muted-foreground" />
          <Input className="ps-9 h-11 rounded-xl bg-card" placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[{ id: "all", name_ar: t("all"), name_en: t("all") }, ...(data?.categories ?? [])].map((c) => (
            <Button key={c.id} variant={cat === c.id ? "default" : "secondary"} className="rounded-full shrink-0" onClick={() => setCat(c.id)}>
              {lang === "ar" ? c.name_ar : c.name_en}
            </Button>
          ))}
        </div>
        {isLoading ? <div className="text-muted-foreground">{t("loading")}</div> : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
            {products.map((p) => {
              const out = p.track_stock && Number(p.stock_qty) <= 0;
              return (
                <button key={p.id} disabled={out} onClick={() => add(p)}
                  className="group text-start bg-card rounded-2xl shadow-soft p-3 hover:shadow-pop hover:-translate-y-0.5 transition disabled:opacity-50">
                  <div className="aspect-square rounded-xl bg-ice-gradient grid place-items-center overflow-hidden mb-2">
                    {p.img ? <img src={p.img} alt="" className="h-full w-full object-cover" /> : <IceCreamCone className="h-10 w-10 text-primary/60" />}
                  </div>
                  <div className="font-semibold leading-tight line-clamp-2">{lang === "ar" ? p.name_ar : p.name_en}</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-primary font-bold tabular">{money(Number(p.price))}</span>
                    {p.track_stock && <span className="text-xs text-muted-foreground">{out ? t("outOfStock") : Number(p.stock_qty)}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <aside className="bg-card rounded-3xl shadow-soft p-4 flex flex-col lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-lg">{t("cart")}</h2>
          {cart.length > 0 && <Button variant="ghost" size="sm" onClick={reset}>{t("clear")}</Button>}
        </div>
        <div className="flex gap-1 mb-3" role="group" aria-label={t("orderType")}>
          {(["dine_in", "takeaway", ...(settings?.delivery_enabled ? ["delivery"] : [])] as Fulfillment[]).map((type) => <Button key={type} size="sm" className="flex-1" variant={orderType === type ? "default" : "outline"} onClick={() => setOrderType(type)}>{t(type)}</Button>)}
        </div>
        {orderType === "delivery" && <div className="space-y-2 mb-3"><Input aria-label={t("phone")} placeholder={t("phone")} value={phone} maxLength={50} onChange={(e) => setPhone(e.target.value)} /><Input aria-label={t("address")} placeholder={t("address")} value={address} maxLength={500} onChange={(e) => setAddress(e.target.value)} /></div>}
        <div className="flex-1 overflow-y-auto space-y-2 min-h-24">
          {cart.length === 0 && <div className="text-center text-muted-foreground py-10">{t("emptyCart")}</div>}
          {cart.map((l) => (
            <div key={l.product_id} className="rounded-xl bg-muted/60 p-2.5 space-y-2">
              <div className="flex justify-between gap-2">
                <span className="font-medium flex items-center gap-2">{l.img ? <img src={l.img} alt="" className="h-9 w-9 rounded-md object-cover shrink-0" /> : <IceCreamCone className="h-6 w-6 shrink-0 text-primary" />}{lang === "ar" ? l.name_ar : l.name_en}</span>
                <span className="font-bold tabular">{money(lineTotal(l))}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => upd(l.product_id, { qty: l.qty - 1 })}><Minus className="h-3 w-3" /></Button>
                <span className="w-8 text-center tabular">{l.qty}</span>
                <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => { const p = data?.products.find((x) => x.id === l.product_id); if (p) add(p); }}><Plus className="h-3 w-3" /></Button>
                <Input type="number" min={0} className="h-8 w-20 text-xs" title={canPrice ? t("price") : t("priceLocked")} disabled={!canPrice}
                  value={l.unit_price} onChange={(e) => upd(l.product_id, { unit_price: Math.max(0, Number(e.target.value)) })} />
                <Input type="number" min={0} placeholder={t("discount")} className="h-8 w-20 text-xs"
                  value={l.discount || ""} onChange={(e) => upd(l.product_id, { discount: Math.min(Math.max(0, Number(e.target.value)), l.unit_price * l.qty) })} />
                <Button size="icon" variant="ghost" className="h-8 w-8 ms-auto" onClick={() => upd(l.product_id, { qty: 0 })}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t pt-3 mt-3 space-y-2 text-sm">
          <Textarea rows={1} placeholder={t("notes")} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="flex items-center justify-between"><span>{t("subtotal")}</span><span className="tabular">{money(totals.subtotal)}</span></div>
          <div className="flex items-center justify-between gap-2"><span>{t("orderDiscount")}</span>
            <Input type="number" min={0} className="h-8 w-28" value={orderDisc || ""} onChange={(e) => setOrderDisc(Math.max(0, Number(e.target.value)))} /></div>
          {settings?.tax_enabled && <div className="flex justify-between"><span>{t("tax")} ({Number(settings.tax_rate)}%)</span><span className="tabular">{money(totals.tax)}</span></div>}
          {orderType === "delivery" && <div className="flex justify-between"><span>{t("deliveryFee")}</span><span>{money(fee)}</span></div>}
          <div className="flex justify-between text-xl font-bold"><span>{t("total")}</span><span className="tabular text-primary">{money(totals.total)}</span></div>
          <Button className="w-full h-14 text-lg rounded-2xl bg-brand-gradient shadow-pop" disabled={cart.length === 0 || (orderType === "delivery" && (!phone.trim() || !address.trim()))} onClick={() => setPayOpen(true)}>
            {t("charge")} · {money(totals.total)}
          </Button>
        </div>
      </aside>

      {payOpen && (
        <PayDialog total={totals.total} cart={cart} orderDisc={totals.discount} notes={notes} orderType={orderType} address={address} phone={phone}
          onClose={() => setPayOpen(false)}
          onDone={(id) => { setPayOpen(false); reset(); setReceiptId(id); qc.invalidateQueries({ queryKey: ["catalog"] }); qc.invalidateQueries({ queryKey: ["sales"] }); qc.invalidateQueries({ queryKey: ["dash"] }); }} />
      )}
      <Dialog open={!!receiptId} onOpenChange={(o) => !o && setReceiptId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("saleDone")}</DialogTitle></DialogHeader>
          {receiptId && <Receipt saleId={receiptId} />}
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => window.print()}><Printer className="h-4 w-4" />{t("print")}</Button>
            <Button variant="secondary" className="flex-1" onClick={() => setReceiptId(null)}>{t("newSale")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PayDialog({ total, cart, orderDisc, notes, orderType, address, phone, onClose, onDone }: {
  total: number; cart: CartLine[]; orderDisc: number; notes: string; orderType: Fulfillment; address: string; phone: string; onClose: () => void; onDone: (id: string) => void;
}) {
  const { t, lang } = useI18n();
  const { money } = useFmt();
  const settings = useSettings();
  const { has } = useMe();
  const canOverride = has("admin", "manager");
  const methods = ((settings?.payment_methods as PayMethod[] | undefined) ?? []).filter((m) => m.active);
  const [pays, setPays] = useState<Pay[]>([{ method: methods.find((m) => m.code === "cash")?.code ?? methods[0]?.code ?? "cash", amount: total }]);
  const [busy, setBusy] = useState(false);
  const [uploads, setUploads] = useState<Record<number, boolean>>({});
  const uploading = Object.values(uploads).some(Boolean);
  const submitting = useRef(false);
  const key = useRef(crypto.randomUUID()); // same key on retries → server dedupes
  const sum = paymentSummary(total, pays);
  const quick = [total, Math.ceil(total / 500) * 500, Math.ceil(total / 1000) * 1000, Math.ceil(total / 1000) * 1000 + 1000].filter((v, i, a) => a.indexOf(v) === i);

  // Deferred (credit) customer selection
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const deferredTotal = r2(pays.filter((p) => p.method === "deferred").reduce((s, p) => s + p.amount, 0));
  const needsCustomer = deferredTotal > 0;
  const [custQ, setCustQ] = useState("");
  const [custId, setCustId] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const { data: custRows } = useQuery({
    queryKey: ["pos-customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id,name,phone,phone2,credit_enabled,credit_limit,active,deleted_at").is("deleted_at", null).order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; phone: string | null; phone2: string | null; credit_enabled: boolean; credit_limit: number; active: boolean }[];
    },
  });
  const customer = custRows?.find((c) => c.id === custId) ?? null;
  const { data: balRows } = useQuery({
    queryKey: ["pos-customer-balances", custId],
    enabled: !!custId,
    queryFn: async () => {
      const { data, error } = await supabase.from("customer_balances").select("balance").eq("customer_id", custId!).maybeSingle();
      if (error) throw error;
      return Number(data?.balance ?? 0);
    },
  });
  const balance = balRows ?? 0;
  const remainingCredit = customer ? Math.max(0, Number(customer.credit_limit) - balance) : 0;
  const overLimit = needsCustomer && customer ? deferredTotal > remainingCredit : false;
  const blocked = needsCustomer && (!customer || !customer.credit_enabled || !customer.active);
  const canSubmit = sum.valid && !blocked && (!overLimit || (canOverride && overrideReason.trim() !== ""));

  const custMatches = useMemo(() => {
    const s = custQ.trim().toLowerCase();
    const list = custRows ?? [];
    if (!s) return list.slice(0, 8);
    return list.filter((c) => c.name.toLowerCase().includes(s) || (c.phone ?? "").includes(s) || (c.phone2 ?? "").includes(s)).slice(0, 8);
  }, [custRows, custQ]);

  async function submit() {
    if (submitting.current || uploading || !canSubmit) return;
    submitting.current = true;
    setBusy(true);
    const { data, error } = await supabase.rpc("complete_counter_sale", {
      p_idempotency_key: key.current,
      p_items: cart.map((l) => ({ product_id: l.product_id, qty: l.qty, unit_price: l.unit_price, discount: l.discount })),
      p_payments: pays.filter((p) => p.amount > 0),
      p_order_discount: orderDisc,
      p_notes: notes,
      p_order_type: orderType,
      p_delivery_address: address,
      p_customer_phone: phone,
      ...(needsCustomer && custId ? { p_customer_id: custId } : {}),
      ...(overLimit ? { p_credit_override_reason: overrideReason } : {}),
    });
    setBusy(false);
    submitting.current = false;
    if (error) { toast.error(errMsg(error, lang)); return; }
    toast.success(t("saleDone"));
    onDone((data as { sale_id: string }).sale_id);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && !uploading && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t("payment")} — {money(total)}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {pays.map((p, i) => (
            <div key={i} className="space-y-2 border-b pb-3"><div className="flex gap-2">
              <select className="h-10 rounded-md border bg-background px-2 flex-1" value={p.method}
                onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, method: e.target.value } : x)))}>
                {methods.map((m) => <option key={m.code} value={m.code}>{lang === "ar" ? m.ar : m.en}</option>)}
              </select>
              <Input type="number" min={0} className="w-36" value={p.amount || ""}
                onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, amount: Math.max(0, Number(e.target.value)) } : x)))} />
               {pays.length > 1 && <Button disabled={uploading || busy} aria-label={t("delete")} variant="ghost" size="icon" onClick={() => setPays(pays.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>}
            </div><Input aria-label={t("paymentReference")} placeholder={t("paymentReference")} maxLength={150} value={p.reference ?? ""} onChange={(e) => setPays((rows) => rows.map((x, j) => j === i ? { ...x, reference: e.target.value } : x))} /><PaymentProofUpload path={p.proof_path} onChange={(path) => setPays((rows) => rows.map((x, j) => j === i ? { ...x, proof_path: path } : x))} onBusy={(v) => setUploads((rows) => ({ ...rows, [i]: v }))} /></div>
          ))}
          <Button disabled={busy || uploading} variant="outline" size="sm" onClick={() => setPays([...pays, { method: methods.find((m) => m.code !== "cash")?.code ?? "cash", amount: sum.remaining }])}>
            <Plus className="h-4 w-4" />{t("addPayment")}
          </Button>
          {pays.length === 1 && pays[0]?.method === "cash" && (
            <div className="flex flex-wrap gap-2">
              {quick.map((v) => <Button disabled={busy || uploading} key={v} variant="secondary" size="sm" onClick={() => setPays((rows) => rows.map((p) => ({ ...p, amount: v })))}>{money(v)}</Button>)}
            </div>
          )}

          {needsCustomer && (
            <div className="rounded-2xl border p-3 space-y-2">
              <div className="font-semibold text-sm">{t("customerOnAccount")}</div>
              <div className="relative">
                <Search className="absolute top-2.5 start-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="ps-8" placeholder={t("searchCustomer")} value={custQ} onChange={(e) => setCustQ(e.target.value)} />
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {custMatches.map((c) => (
                  <button key={c.id} type="button" onClick={() => setCustId(c.id)}
                    className={`w-full text-start rounded-lg border px-2.5 py-1.5 text-sm ${custId === c.id ? "border-primary bg-primary/10" : "hover:bg-muted"} ${!c.credit_enabled || !c.active ? "opacity-50" : ""}`}>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground" dir="ltr">{c.phone || c.phone2 || "—"} · {c.credit_enabled ? t("creditEnabled") : t("creditDisabled")}</div>
                  </button>
                ))}
                {custMatches.length === 0 && <div className="text-xs text-muted-foreground py-2">{t("noData")}</div>}
              </div>
              {customer && (
                <div className="rounded-xl bg-ice p-2.5 text-xs space-y-1">
                  <div className="flex justify-between"><span>{t("currentBalance")}</span><b className="tabular">{money(balance)}</b></div>
                  <div className="flex justify-between"><span>{t("creditLimit")}</span><b className="tabular">{money(Number(customer.credit_limit))}</b></div>
                  <div className="flex justify-between"><span>{t("remainingCredit")}</span><b className="tabular">{money(remainingCredit)}</b></div>
                  <div className="flex justify-between"><span>{t("thisInvoice")}</span><b className="tabular">{money(deferredTotal)}</b></div>
                </div>
              )}
              {overLimit && (
                <div className="rounded-xl bg-destructive/10 text-destructive p-2.5 text-xs space-y-2">
                  <div>{t("creditLimitExceeded")}: {money(deferredTotal - remainingCredit)}</div>
                  {canOverride && <Input placeholder={t("overrideReason")} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />}
                  {!canOverride && <div className="text-muted-foreground">{t("managerOverrideOnly")}</div>}
                </div>
              )}
            </div>
          )}

          <div className="rounded-2xl bg-ice p-4 space-y-1">
            <div className="flex justify-between"><span>{t("received")}</span><b className="tabular">{money(sum.paid)}</b></div>
            {sum.remaining > 0 && <div className="flex justify-between text-destructive"><span>{t("remaining")}</span><b className="tabular">{money(sum.remaining)}</b></div>}
            <div className="flex justify-between text-2xl font-bold text-primary"><span>{t("change")}</span><span className="tabular">{money(sum.change)}</span></div>
          </div>
           <Button className="w-full h-12 text-lg rounded-xl" disabled={!canSubmit || busy || uploading || methods.length === 0} onClick={submit}>{busy ? t("loading") : t("complete")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
