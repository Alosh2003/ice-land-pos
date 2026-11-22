import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageTitle } from "@/components/AppShell";
import { Receipt } from "@/components/Receipt";
import { useI18n } from "@/lib/i18n";
import { errMsg, useFmt, useMe, useSettings, type PayMethod } from "@/lib/app";

export const Route = createFileRoute("/_authenticated/sales")({
  head: () => ({ meta: [{ title: "Sales — ICE LAND" }, { name: "description", content: "ICE LAND sales history and invoices." }, { property: "og:title", content: "Sales — ICE LAND" }, { property: "og:description", content: "ICE LAND sales history and invoices." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: Sales,
});

const PAGE = 20;

function Sales() {
  const { t, lang } = useI18n();
  const { money, fmtDate, pmName } = useFmt();
  const { has } = useMe();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [rev, setRev] = useState<{ id: string; kind: "refunded" | "cancelled" } | null>(null);
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(false);
  const [cashier, setCashier] = useState("");
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const settings = useSettings();
  const { data: profiles } = useQuery({ queryKey: ["staff-list"], queryFn: async () => { const { data, error } = await supabase.from("profiles").select("id,full_name,email"); if (error) throw error; return data; } });

  const { data, isLoading } = useQuery({
    queryKey: ["sales", q, from, to, status, page, cashier, method, reference],
    queryFn: async () => {
      let s = supabase.from("sales").select(method || reference ? "*, payments!inner(*)" : "*, payments(*)", { count: "exact" }).order("created_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
      if (cashier) s = s.eq("cashier_id", cashier);
      if (method) s = s.eq("payments.method", method);
      if (reference) s = s.ilike("payments.reference", `%${reference}%`);
      if (q) s = s.ilike("invoice_no", `%${q}%`);
      if (from) s = s.gte("created_at", new Date(from).toISOString());
      if (to) s = s.lt("created_at", new Date(new Date(to).getTime() + 864e5).toISOString());
      if (status !== "all") s = s.eq("status", status);
      const { data, error, count } = await s;
      if (error) throw error;
      const ids = [...new Set(data.map((x) => x.cashier_id))];
      const { data: profs } = await supabase.from("profiles").select("id,full_name,email").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const profMap = new Map((profs ?? []).map((p) => [p.id, p]));
      const name = (id: string) => profMap.get(id)?.full_name || profMap.get(id)?.email || "—";
      // Re-read all payment rows for matching invoices, preserving split-payment details.
      const { data: payments, error: paymentError } = await supabase.from("payments").select("*").in("sale_id", data.length ? data.map((r) => r.id) : ["00000000-0000-0000-0000-000000000000"]);
      if (paymentError) throw paymentError;
      const paymentsBySale = new Map<string, typeof payments>();
      for (const p of payments ?? []) {
        const arr = paymentsBySale.get(p.sale_id) ?? [];
        arr.push(p);
        paymentsBySale.set(p.sale_id, arr);
      }
      return { rows: data.map((r) => ({ ...r, cashier: r.cashier_name || name(r.cashier_id), payments: paymentsBySale.get(r.id) ?? [] })), count: count ?? 0 };
    },
  });

  async function doReverse() {
    if (!rev) return;
    const { error } = await supabase.rpc("reverse_counter_sale", { p_sale_id: rev.id, p_reason: reason, p_status: rev.kind, p_restock: restock });
    if (error) { toast.error(errMsg(error, lang)); return; }
    toast.success(t(rev.kind));
    setRev(null); setReason("");
    qc.invalidateQueries({ queryKey: ["sales"] }); qc.invalidateQueries({ queryKey: ["sale"] }); qc.invalidateQueries({ queryKey: ["dash"] }); qc.invalidateQueries({ queryKey: ["catalog"] });
  }

  const pages = Math.max(1, Math.ceil((data?.count ?? 0) / PAGE));
  const badge = (s: string) => <Badge variant={s === "completed" ? "default" : "destructive"}>{t(s as "completed")}</Badge>;

  return (
    <div>
      <PageTitle>{t("sales")}</PageTitle>
      <div className="flex flex-wrap gap-2 mb-4">
        <Input placeholder={t("invoice") + "…"} className="w-48 bg-card" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        <Input type="date" className="w-44 bg-card" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} />
        <Input type="date" className="w-44 bg-card" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} />
        <select className="h-9 rounded-md border bg-card px-2" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
          {["all", "completed", "refunded", "cancelled"].map((s) => <option key={s} value={s}>{t(s as "all")}</option>)}
        </select>
        {has("admin", "manager", "accountant") && <select aria-label={t("cashier")} className="h-9 rounded-md border bg-card px-2" value={cashier} onChange={(e) => { setCashier(e.target.value); setPage(0); }}><option value="">{t("cashier")} · {t("all")}</option>{profiles?.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}</select>}
        <select aria-label={t("method")} className="h-9 rounded-md border bg-card px-2" value={method} onChange={(e) => { setMethod(e.target.value); setPage(0); }}><option value="">{t("method")} · {t("all")}</option>{(settings?.payment_methods as PayMethod[] | undefined)?.map((m) => <option key={m.code} value={m.code}>{pmName(m.code)}</option>)}</select>
        <Input aria-label={t("paymentReference")} placeholder={t("paymentReference")} className="w-56" value={reference} onChange={(e) => { setReference(e.target.value); setPage(0); }} />
      </div>
      <div className="bg-card rounded-2xl shadow-soft overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t("invoice")}</TableHead><TableHead>{t("date")}</TableHead><TableHead>{t("cashier")}</TableHead>
            <TableHead>{t("method")}</TableHead><TableHead>{t("total")}</TableHead><TableHead>{t("status")}</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">{t("loading")}</TableCell></TableRow>}
            {data?.rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">{t("noData")}</TableCell></TableRow>}
            {data?.rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell dir="ltr" className="font-mono">{r.invoice_no}</TableCell>
                <TableCell>{fmtDate(r.created_at)}</TableCell>
                <TableCell>{r.cashier}</TableCell>
                <TableCell>{r.payments.map((p) => <div key={p.id} className="whitespace-nowrap">{pmName(p.method)} · {money(Number(p.amount))}{p.reference && <div className="text-xs text-muted-foreground">{p.reference}</div>}</div>)}</TableCell>
                <TableCell className="font-semibold tabular">{money(Number(r.total))}</TableCell>
                <TableCell>{badge(r.status)}</TableCell>
                <TableCell className="text-end space-x-1 whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => setOpen(r.id)}>{t("details")}</Button>
                  {has("admin", "manager") && r.status === "completed" && (<>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setRestock(false); setRev({ id: r.id, kind: "refunded" }); }}>{t("refund")}</Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setRestock(false); setRev({ id: r.id, kind: "cancelled" }); }}>{t("cancel")}</Button>
                  </>)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-center gap-3 mt-4">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>{t("prev")}</Button>
        <span className="text-sm">{t("page")} {page + 1} / {pages}</span>
        <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>{t("next")}</Button>
      </div>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("invoice")}</DialogTitle></DialogHeader>
          {open && <Receipt saleId={open} />}
          <Button onClick={() => window.print()}><Printer className="h-4 w-4" />{t("reprint")}</Button>
        </DialogContent>
      </Dialog>
      <Dialog open={!!rev} onOpenChange={(o) => !o && setRev(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{rev && t(rev.kind === "refunded" ? "refund" : "cancel")}</DialogTitle></DialogHeader>
          <Textarea placeholder={t("reason")} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
          <label className="flex items-center gap-2"><Switch checked={restock} onCheckedChange={setRestock} />{t("restock")}</label>
          <Button variant="destructive" disabled={!reason.trim()} onClick={doReverse}>{t("confirm")}</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
