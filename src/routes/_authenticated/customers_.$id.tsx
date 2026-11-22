import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Printer, ArrowRight, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageTitle, RequireRole } from "@/components/AppShell";
import { useI18n, type TKey } from "@/lib/i18n";
import { useFmt, useMe, useSettings } from "@/lib/app";
import { agingSummary, balanceSummary, daysOverdue, fifoAllocate, salePaymentStatus, fmtAmount, type UnpaidInvoice } from "@/lib/credit";
import { ReceivePaymentDialog } from "@/components/ReceivePaymentDialog";
import { PaymentProofUpload, PaymentProofImage } from "@/components/PaymentProof";

export const Route = createFileRoute("/_authenticated/customers_/$id")({
  head: () => ({ meta: [{ title: "Customer — ICE LAND" }, { name: "description", content: "ICE LAND customer account." }, { property: "og:title", content: "Customer — ICE LAND" }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: () => <RequireRole roles={["admin", "manager", "accountant"]}><CustomerProfile /></RequireRole>,
});

type Customer = Database["public"]["Tables"]["customers"]["Row"];
type Sale = Database["public"]["Tables"]["sales"]["Row"];
type CustomerPayment = Database["public"]["Tables"]["customer_payments"]["Row"];

function CustomerProfile() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const { t, lang } = useI18n();
  const { money, fmtDate, pmName } = useFmt();
  const settings = useSettings();
  const { has } = useMe();
  const qc = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);
  const [stmtOpen, setStmtOpen] = useState(false);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const { data, isLoading } = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const [{ data: c, error: cErr }, { data: sales, error: sErr }, { data: pays, error: pErr }] = await Promise.all([
        supabase.from("customers").select("*").eq("id", id).maybeSingle(),
        supabase.from("sales").select("id,invoice_no,created_at,due_date,total,amount_due,amount_settled,status").eq("customer_id", id).order("created_at", { ascending: false }),
        supabase.from("customer_payments").select("*").eq("customer_id", id).order("paid_on", { ascending: false }),
      ]);
      if (cErr) throw cErr;
      if (sErr) throw sErr;
      if (pErr) throw pErr;
      return { customer: c, sales: sales ?? [], payments: pays ?? [] };
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["customer", id] });

  const customer = data?.customer ?? null;
  const unpaid: UnpaidInvoice[] = useMemo(() => (data?.sales ?? [])
    .filter((s) => s.status === "completed" && Number(s.amount_due) > Number(s.amount_settled))
    .map((s) => ({
      sale_id: s.id,
      invoice_no: s.invoice_no,
      invoice_date: s.created_at.slice(0, 10),
      due_date: s.due_date,
      amount_due: Number(s.amount_due),
      amount_settled: Number(s.amount_settled),
      outstanding: Number(s.amount_due) - Number(s.amount_settled),
    })), [data]);

  const paymentsTotal = useMemo(() => (data?.payments ?? [])
    .filter((p) => !p.reversed_at)
    .reduce((s, p) => s + Number(p.amount), 0), [data]);

  const summary = useMemo(() => balanceSummary(unpaid, paymentsTotal, today), [unpaid, paymentsTotal, today]);
  const aging = useMemo(() => agingSummary(unpaid, today), [unpaid, today]);
  const balance = summary.outstanding;
  const remaining = Math.max(0, Number(customer?.credit_limit ?? 0) - balance);

  if (isLoading) return <div className="p-8 text-muted-foreground">{t("loading")}</div>;
  if (!customer) return <div className="p-8 text-muted-foreground">{t("noData")}</div>;

  const overdue = aging["1_30"] + aging["31_60"] + aging["61_90"] + aging["90_plus"] > 0;

  return (
    <div className="space-y-5">
      <PageTitle actions={<>
        <Button variant="outline" onClick={() => setStmtOpen(true)}><Printer className="h-4 w-4" />{t("statement")}</Button>
        {has("admin", "manager", "cashier") && <Button onClick={() => setPayOpen(true)} disabled={!customer.credit_enabled || balance <= 0}><Plus className="h-4 w-4" />{t("receivePayment")}</Button>}
      </>}>
        <button className="text-muted-foreground hover:underline" onClick={() => nav({ to: "/customers" })}>{t("customers")}</button>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <span>{customer.name}</span>
        {overdue && <Badge variant="destructive">{t("overdue")}</Badge>}
      </PageTitle>

      {/* Balance summary */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {([
          ["totalInvoiced", summary.total_invoiced],
          ["totalPaid", summary.total_paid],
          ["outstanding", summary.outstanding],
          ["overdue", summary.overdue],
          ["remainingCredit", remaining],
          ["loyaltyPoints", Number(customer.loyalty_points ?? 0)],
        ] as [TKey, number][]).map(([k, v]) => (
          <div key={k} className="bg-card rounded-2xl shadow-soft p-4">
            <div className="text-xs text-muted-foreground">{t(k)}</div>
            <div className={`text-xl font-bold tabular mt-1 ${k === "outstanding" && v > 0 ? "text-destructive" : ""}`}>{k === "loyaltyPoints" ? fmtAmount(v) : money(v)}</div>
          </div>
        ))}
      </div>

      {/* Details */}
      <section className="bg-card rounded-2xl shadow-soft p-4 grid sm:grid-cols-3 gap-3 text-sm">
        <div><span className="text-muted-foreground">{t("phone")}:</span> <span dir="ltr">{customer.phone || "—"}</span></div>
        <div><span className="text-muted-foreground">{t("phone2")}:</span> <span dir="ltr">{customer.phone2 || "—"}</span></div>
        <div><span className="text-muted-foreground">{t("address")}:</span> {customer.address || "—"}</div>
        <div><span className="text-muted-foreground">{t("creditLimit")}:</span> {money(Number(customer.credit_limit))}</div>
        <div><span className="text-muted-foreground">{t("paymentTerms")}:</span> {customer.payment_terms_days} {t("days")}</div>
        <div><span className="text-muted-foreground">{t("notes")}:</span> {customer.notes || "—"}</div>
      </section>

      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">{t("unpaidInvoices")}</TabsTrigger>
          <TabsTrigger value="payments">{t("paymentHistory")}</TabsTrigger>
          <TabsTrigger value="aging">{t("aging")}</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices">
          <div className="bg-card rounded-2xl shadow-soft overflow-x-auto mt-3">
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("invoice")}</TableHead><TableHead>{t("date")}</TableHead><TableHead>{t("dueDate")}</TableHead>
                <TableHead className="text-end">{t("amount")}</TableHead><TableHead className="text-end">{t("paid")}</TableHead>
                <TableHead className="text-end">{t("outstanding")}</TableHead><TableHead>{t("status")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {unpaid.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{t("noData")}</TableCell></TableRow>}
                {unpaid.map((inv) => {
                  const st = salePaymentStatus(inv.amount_due, inv.amount_settled);
                  const dd = daysOverdue(inv.due_date, today);
                  return (
                    <TableRow key={inv.sale_id}>
                      <TableCell className="font-mono text-xs" dir="ltr">{inv.invoice_no}</TableCell>
                      <TableCell>{fmtDate(inv.invoice_date, false)}</TableCell>
                      <TableCell>{inv.due_date ? fmtDate(inv.due_date, false) : "—"}</TableCell>
                      <TableCell className="tabular text-end">{money(inv.amount_due)}</TableCell>
                      <TableCell className="tabular text-end">{money(inv.amount_settled)}</TableCell>
                      <TableCell className="tabular text-end font-semibold text-destructive">{money(inv.outstanding)}</TableCell>
                      <TableCell><Badge variant={dd > 0 ? "destructive" : st === "partial" ? "secondary" : "default"}>{dd > 0 ? `${t("overdue")} ${dd} ${t("days")}` : t(st)}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="payments">
          <div className="bg-card rounded-2xl shadow-soft overflow-x-auto mt-3">
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("receipt")}</TableHead><TableHead>{t("date")}</TableHead><TableHead>{t("method")}</TableHead>
                <TableHead className="text-end">{t("amount")}</TableHead><TableHead>{t("reference")}</TableHead><TableHead>{t("cashier")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(data?.payments ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{t("noData")}</TableCell></TableRow>}
                {(data?.payments ?? []).map((p) => (
                  <TableRow key={p.id} className={p.reversed_at ? "opacity-50" : ""}>
                    <TableCell className="font-mono text-xs" dir="ltr">{p.receipt_no}</TableCell>
                    <TableCell>{fmtDate(p.paid_on, false)}</TableCell>
                    <TableCell>{pmName(p.method)}</TableCell>
                    <TableCell className="tabular text-end">{money(Number(p.amount))}</TableCell>
                    <TableCell>{p.reference || "—"}</TableCell>
                    <TableCell>{p.cashier_name || "—"}{p.reversed_at ? ` · ${t("reversed")}` : ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="aging">
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mt-3">
            {([
              ["current", aging.current],
              ["1_30", aging["1_30"]],
              ["31_60", aging["31_60"]],
              ["61_90", aging["61_90"]],
              ["90_plus", aging["90_plus"]],
              ["total", aging.total],
            ] as [string, number][]).map(([k, v]) => (
              <div key={k} className="bg-card rounded-2xl shadow-soft p-4">
                <div className="text-xs text-muted-foreground">{t(k as TKey)}</div>
                <div className="text-xl font-bold tabular mt-1">{money(v)}</div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {payOpen && <ReceivePaymentDialog customerId={customer.id} customerName={customer.name} balance={balance} creditEnabled={!!customer.credit_enabled} unpaid={unpaid} onClose={() => setPayOpen(false)} onDone={() => { setPayOpen(false); refresh(); }} />}
      {stmtOpen && <StatementDialog customer={customer} onClose={() => setStmtOpen(false)} />}
    </div>
  );
}

function StatementDialog({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const { t, lang } = useI18n();
  const { money, fmtDate } = useFmt();
  type StatementRow = {
    entry_date: string;
    kind: string;
    reference: string;
    amount: number;
    balance_after: number;
    note: string;
  };
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const monthStart = today.slice(0, 8) + "01";
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<StatementRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.rpc("customer_statement", { p_customer_id: customer.id, p_from: from, p_to: to });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setRows((data ?? []) as unknown as StatementRow[]);
  }

  function exportCsv() {
    const header = "entry_date,kind,reference,amount,balance_after,note";
    const body = rows.map((r) => [r.entry_date, r.kind, r.reference, r.amount, r.balance_after, r.note].join(",")).join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `statement-${customer.name}-${from}-${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t("statement")} — {customer.name}</DialogTitle></DialogHeader>
        <div className="flex flex-wrap gap-2 items-end">
          <label className="space-y-1 text-sm"><span>{t("from")}</span><Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="space-y-1 text-sm"><span>{t("to")}</span><Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <Button size="sm" onClick={load}>{t("show")}</Button>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />{t("print")}</Button>
          <Button size="sm" variant="outline" onClick={exportCsv}>{t("exportCsv")}</Button>
        </div>
        <div className="overflow-x-auto border rounded-lg">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("date")}</TableHead><TableHead>{t("kind")}</TableHead><TableHead>{t("reference")}</TableHead>
              <TableHead className="text-end">{t("debit")}</TableHead><TableHead className="text-end">{t("credit")}</TableHead>
              <TableHead className="text-end">{t("balance")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">{t("loading")}</TableCell></TableRow>}
              {!loading && rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">{t("noData")}</TableCell></TableRow>}
              {!loading && rows.map((r, i) => (
                <TableRow key={i} className={r.kind === "closing" ? "font-bold bg-muted/40" : ""}>
                  <TableCell>{fmtDate(r.entry_date, false)}</TableCell>
                  <TableCell>{t(r.kind as TKey)}</TableCell>
                  <TableCell className="font-mono text-xs" dir="ltr">{r.reference}</TableCell>
                  <TableCell className="tabular text-end">{r.amount > 0 ? money(r.amount) : "—"}</TableCell>
                  <TableCell className="tabular text-end">{r.amount < 0 ? money(-r.amount) : "—"}</TableCell>
                  <TableCell className="tabular text-end">{money(r.balance_after)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
