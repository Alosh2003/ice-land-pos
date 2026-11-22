import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageTitle, RequireRole } from "@/components/AppShell";
import { useI18n, type TKey } from "@/lib/i18n";
import { useFmt } from "@/lib/app";
import { ReceivePaymentDialog } from "@/components/ReceivePaymentDialog";
import type { UnpaidInvoice } from "@/lib/credit";

export const Route = createFileRoute("/_authenticated/receivables")({
  head: () => ({ meta: [{ title: "Receivables — ICE LAND" }, { name: "description", content: "ICE LAND accounts receivable aging." }, { property: "og:title", content: "Receivables — ICE LAND" }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: () => <RequireRole roles={["admin", "manager", "accountant"]}><Receivables /></RequireRole>,
});

type AgingRow = {
  customer_id: string;
  customer_name: string;
  phone: string | null;
  current_due: number;
  age_1_30: number;
  age_31_60: number;
  age_61_90: number;
  age_90_plus: number;
  total_outstanding: number;
};

type CollectionRow = {
  paid_on: string;
  cashier_id: string;
  cashier_name: string | null;
  total_collected: number;
  payment_count: number;
};

function Receivables() {
  const { t } = useI18n();
  const { money, fmtDate } = useFmt();
  const qc = useQueryClient();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const monthStart = today.slice(0, 8) + "01";
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [payTarget, setPayTarget] = useState<AgingRow | null>(null);

  const { data: payInvoices, isLoading: payInvoicesLoading } = useQuery({
    queryKey: ["customer-invoices", payTarget?.customer_id],
    enabled: !!payTarget?.customer_id,
    queryFn: async (): Promise<UnpaidInvoice[]> => {
      if (!payTarget?.customer_id) return [];
      const { data, error } = await supabase
        .from("sales")
        .select("id,invoice_no,created_at,due_date,total,amount_due,amount_settled,status")
        .eq("customer_id", payTarget.customer_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const sales = (data ?? []) as { id: string; invoice_no: string; created_at: string; due_date: string | null; amount_due: number; amount_settled: number; status: string }[];
      return sales
        .filter((s) => s.status === "completed" && Number(s.amount_due) > Number(s.amount_settled))
        .map((s) => ({
          sale_id: s.id,
          invoice_no: s.invoice_no,
          invoice_date: s.created_at.slice(0, 10),
          due_date: s.due_date,
          amount_due: Number(s.amount_due),
          amount_settled: Number(s.amount_settled),
          outstanding: Number(s.amount_due) - Number(s.amount_settled),
        }));
    },
  });

  const { data: aging, isLoading } = useQuery({
    queryKey: ["receivables-aging"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("receivables_aging");
      if (error) throw error;
      return (data ?? []) as AgingRow[];
    },
  });

  const { data: collections } = useQuery({
    queryKey: ["collections", from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("collections_report", { p_from: from, p_to: to });
      if (error) throw error;
      return (data ?? []) as CollectionRow[];
    },
  });

  const totals = useMemo(() => {
    const sum = (k: keyof AgingRow) => (aging ?? []).reduce((s, r) => s + Number(r[k]), 0);
    return {
      current: sum("current_due"),
      a1_30: sum("age_1_30"),
      a31_60: sum("age_31_60"),
      a61_90: sum("age_61_90"),
      a90: sum("age_90_plus"),
      total: sum("total_outstanding"),
    };
  }, [aging]);

  const buckets: [TKey, number][] = [
    ["current", totals.current],
    ["1_30", totals.a1_30],
    ["31_60", totals.a31_60],
    ["61_90", totals.a61_90],
    ["90_plus", totals.a90],
  ];

  return (
    <div className="space-y-6">
      <PageTitle actions={<Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />{t("print")}</Button>}>{t("receivables")}</PageTitle>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {buckets.map(([k, v]) => (
          <div key={k} className="bg-card rounded-2xl shadow-soft p-4">
            <div className="text-xs text-muted-foreground">{t(k)}</div>
            <div className="text-xl font-bold tabular mt-1">{money(v)}</div>
          </div>
        ))}
        <div className="bg-card rounded-2xl shadow-soft p-4 border-primary/40">
          <div className="text-xs text-muted-foreground">{t("total")}</div>
          <div className="text-xl font-bold tabular mt-1 text-primary">{money(totals.total)}</div>
        </div>
      </div>

      <div className="bg-card rounded-2xl shadow-soft overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t("nameAr")}</TableHead><TableHead>{t("phone")}</TableHead>
            <TableHead className="text-end">{t("current")}</TableHead>
            <TableHead className="text-end">{t("1_30")}</TableHead>
            <TableHead className="text-end">{t("31_60")}</TableHead>
            <TableHead className="text-end">{t("61_90")}</TableHead>
            <TableHead className="text-end">{t("90_plus")}</TableHead>
            <TableHead className="text-end">{t("totalOutstanding")}</TableHead>
            <TableHead className="text-end">{t("receivePayment")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">{t("loading")}</TableCell></TableRow>}
            {!isLoading && (aging ?? []).length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">{t("noData")}</TableCell></TableRow>}
            {(aging ?? []).map((r) => (
              <TableRow key={r.customer_id}>
                <TableCell className="font-medium">{r.customer_name}</TableCell>
                <TableCell dir="ltr">{r.phone || "—"}</TableCell>
                <TableCell className="tabular text-end">{money(Number(r.current_due))}</TableCell>
                <TableCell className="tabular text-end">{money(Number(r.age_1_30))}</TableCell>
                <TableCell className="tabular text-end">{money(Number(r.age_31_60))}</TableCell>
                <TableCell className="tabular text-end">{money(Number(r.age_61_90))}</TableCell>
                <TableCell className="tabular text-end">{money(Number(r.age_90_plus))}</TableCell>
                <TableCell className="tabular text-end font-semibold text-destructive">{money(Number(r.total_outstanding))}</TableCell>
                <TableCell className="text-end">
                  <Button size="sm" variant="outline" disabled={Number(r.total_outstanding) <= 0} onClick={() => setPayTarget(r)}>{t("receivePayment")}</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <h2 className="text-lg font-semibold">{t("collectionsReport")}</h2>
      <div className="flex gap-2 items-end">
        <label className="space-y-1 text-sm"><span>{t("from")}</span><Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="space-y-1 text-sm"><span>{t("to")}</span><Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <div className="bg-card rounded-2xl shadow-soft overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t("date")}</TableHead><TableHead>{t("cashier")}</TableHead>
            <TableHead className="text-end">{t("payments")}</TableHead><TableHead className="text-end">{t("totalCollected")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(collections ?? []).length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">{t("noData")}</TableCell></TableRow>}
            {(collections ?? []).map((r, i) => (
              <TableRow key={i}>
                <TableCell>{fmtDate(r.paid_on, false)}</TableCell>
                <TableCell>{r.cashier_name || "—"}</TableCell>
                <TableCell className="tabular text-end">{r.payment_count}</TableCell>
                <TableCell className="tabular text-end font-semibold">{money(Number(r.total_collected))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {payTarget && (
        <ReceivePaymentDialog
          customerId={payTarget.customer_id}
          customerName={payTarget.customer_name}
          balance={Number(payTarget.total_outstanding)}
          creditEnabled
          unpaid={payInvoices ?? []}
          onClose={() => setPayTarget(null)}
          onDone={() => {
            setPayTarget(null);
            qc.invalidateQueries({ queryKey: ["receivables-aging"] });
            qc.invalidateQueries({ queryKey: ["collections"] });
          }}
        />
      )}
    </div>
  );
}
