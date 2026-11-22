import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageTitle, RequireRole } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n, type TKey } from "@/lib/i18n";
import { useFmt } from "@/lib/app";
import { dailyRemaining } from "@/lib/operations";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({ meta: [{ title: "Daily Inventory — ICE LAND" }, { name: "description", content: "ICE LAND daily item availability, movements and closing counts." }, { property: "og:title", content: "Daily Inventory — ICE LAND" }, { property: "og:description", content: "Reconcile opening stock, sales, returns and daily closing counts." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: () => <RequireRole roles={["admin", "manager"]}><Inventory /></RequireRole>,
});

function Inventory() {
  const { t, lang } = useI18n(); const { num, fmtDate } = useFmt(); const qc = useQueryClient();
  const [date, setDate] = useState(""); const [edit, setEdit] = useState<{ id: string; name: string; action: string; quantity: number } | null>(null);
  const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false);
  const { data, error } = useQuery({ queryKey: ["daily-stock", date], refetchInterval: 60000, queryFn: async () => {
    const { data: today, error: dayError } = await supabase.rpc("business_today"); if (dayError) throw dayError;
    const day = date || today;
    const [products, counts, movements] = await Promise.all([supabase.from("products").select("*").is("deleted_at", null).order("sku"), supabase.from("daily_counts").select("*").eq("business_date", day), supabase.from("stock_movements").select("*").eq("business_date", day).order("created_at", { ascending: false })]);
    if (products.error) throw products.error; if (counts.error) throw counts.error; if (movements.error) throw movements.error;
    // Precompute Maps for O(1) lookups in the render loop (avoids O(n²) with .find()/.filter()).
    const countsByProduct = new Map((counts.data ?? []).map((x) => [x.product_id, x]));
    const movementsByProduct = new Map<string, typeof movements.data>();
    for (const m of movements.data ?? []) {
      const arr = movementsByProduct.get(m.product_id) ?? [];
      arr.push(m);
      movementsByProduct.set(m.product_id, arr);
    }
    return { products: products.data, countsByProduct, movementsByProduct, movements: movements.data, day, today };
  } });
  async function save() {
    if (!edit || busy) return; setBusy(true);
    const { error } = await supabase.rpc("manage_daily_stock", { p_product_id: edit.id, p_action: edit.action, p_quantity: edit.quantity, p_reason: reason });
    setBusy(false); if (error) { toast.error(error.message); return; }
    setEdit(null); setReason(""); toast.success(t("saved"));
    for (const key of ["daily-stock", "catalog", "products-admin"]) qc.invalidateQueries({ queryKey: [key] });
  }
  return <div className="space-y-5"><PageTitle actions={<Input aria-label={t("date")} className="w-44" type="date" value={date || data?.day || ""} max={data?.today} onChange={(e) => setDate(e.target.value)} />}>{t("inventory")}</PageTitle>
    {error && <div className="text-destructive">{error.message}</div>}
    <div className="overflow-x-auto border rounded-lg"><Table><TableHeader><TableRow>{["items", "opening", "addition", "sold", "returned", "waste", "adjustments", "expected", "closing", "discrepancy", "status"].map((key) => <TableHead key={key} className="whitespace-nowrap">{t(key as TKey)}</TableHead>)}<TableHead /></TableRow></TableHeader><TableBody>
      {data?.products.map((p) => {
        const c = data.countsByProduct.get(p.id);
        const m = data.movementsByProduct.get(p.id) ?? [];
        const sum = (kind: string) => m.filter((x) => x.kind === kind).reduce((a, x) => a + Number(x.quantity), 0);
        const additions = sum("addition"), sold = -sum("sale"), returned = sum("return"), waste = -sum("waste"), adjustments = sum("adjustment");
        const opening = Number(c?.opening ?? (data.day === data.today ? p.stock_qty : 0));
        const expected = c?.expected_at_close ?? dailyRemaining(opening, additions, sold, returned, waste, adjustments);
        const name = lang === "ar" ? p.name_ar : p.name_en;
        return <TableRow key={p.id}><TableCell className="font-medium whitespace-nowrap">{name}</TableCell>{[opening, additions, sold, returned, waste, adjustments, expected, c?.closing, c?.discrepancy].map((v, i) => <TableCell key={i} className="tabular">{v == null ? "—" : num(Number(v))}</TableCell>)}<TableCell>{c?.closed_at ? t("closed") : p.track_stock ? t("active") : t("inactive")}</TableCell><TableCell><div className="flex gap-1">{data.day === data.today && !c?.closed_at && (c ? ["addition", "waste", "close"] : ["opening"]).map((action) => <Button key={action} variant="outline" size="sm" onClick={() => { setReason(""); setEdit({ id: p.id, name, action, quantity: action === "opening" || action === "close" ? Number(p.stock_qty) : 0 }); }}>{t(action as TKey)}</Button>)}</div></TableCell></TableRow>;
      })}
    </TableBody></Table></div>
    <h2 className="text-lg font-semibold">{t("movementHistory")}</h2><div className="overflow-x-auto border rounded-lg"><Table><TableHeader><TableRow>{["date", "items", "action", "qty", "reason"].map((k) => <TableHead key={k}>{t(k as TKey)}</TableHead>)}</TableRow></TableHeader><TableBody>{data?.movements.map((m) => { const p = data.products.find((p) => p.id === m.product_id); return <TableRow key={m.id}><TableCell>{fmtDate(m.created_at)}</TableCell><TableCell>{lang === "ar" ? p?.name_ar : p?.name_en}</TableCell><TableCell>{({ sale: t("sold"), return: t("returned"), addition: t("addition"), waste: t("waste"), opening_adjustment: t("opening"), closing_adjustment: t("close"), adjustment: t("adjustments") } as Record<string, string>)[m.kind] ?? m.kind}</TableCell><TableCell>{num(Number(m.quantity))}</TableCell><TableCell>{m.reason}</TableCell></TableRow>; })}</TableBody></Table></div>
    <Dialog open={!!edit} onOpenChange={(open) => { if (!open && !busy) setEdit(null); }}><DialogContent><DialogHeader><DialogTitle>{edit?.name} — {edit && t(edit.action as TKey)}</DialogTitle></DialogHeader><Input aria-label={t("qty")} type="number" min={0} step="0.001" value={edit?.quantity ?? 0} onChange={(e) => setEdit((x) => x ? { ...x, quantity: Number(e.target.value) } : x)} /><Input aria-label={t("reason")} placeholder={t("reason")} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /><Button disabled={busy || !edit || edit.quantity < 0 || (edit.action === "waste" && !reason.trim())} onClick={save}>{t("save")}</Button></DialogContent></Dialog>
  </div>;
}