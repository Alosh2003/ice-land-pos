import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageTitle, RequireRole } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/lib/i18n";
import { useFmt } from "@/lib/app";
import { cashierSummary, type ReportSale } from "@/lib/operations";

export const Route = createFileRoute("/_authenticated/cashiers")({
  head: () => ({ meta: [{ title: "Cashier Reports — ICE LAND" }, { name: "description", content: "ICE LAND sales and items by cashier." }, { property: "og:title", content: "Cashier Reports — ICE LAND" }, { property: "og:description", content: "Cashier transaction counts, revenue and item quantities." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: () => <RequireRole roles={["admin", "manager", "accountant"]}><Cashiers /></RequireRole>,
});

function Cashiers() {
  const { t, lang } = useI18n(); const { money, num } = useFmt();
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const { data, error } = useQuery({ queryKey: ["cashier-report", from, to], queryFn: async () => {
    const rows: ReportSale[] = [];
    for (let offset = 0; ; offset += 500) {
      let query = supabase.from("sales").select("id,cashier_id,cashier_name,total,status,sale_items(product_id,name_ar,name_en,qty,line_total)").order("id").range(offset, offset + 499);
      if (from) query = query.gte("created_at", new Date(`${from}T00:00:00`).toISOString());
      if (to) query = query.lt("created_at", new Date(new Date(`${to}T00:00:00`).getTime() + 86400000).toISOString());
      const { data, error } = await query; if (error) throw error; rows.push(...data); if (data.length < 500) break;
    }
    const { data: profiles } = await supabase.from("profiles").select("id,full_name,email");
    const profMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    return cashierSummary(rows.map((s) => ({ ...s, cashier_name: s.cashier_name || profMap.get(s.cashier_id)?.full_name || profMap.get(s.cashier_id)?.email || null })));
  } });
  return <div className="space-y-6"><PageTitle>{t("cashierReport")}</PageTitle><div className="flex flex-wrap gap-3"><label className="space-y-1">{t("from")}<Input aria-label={t("from")} type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label className="space-y-1">{t("to")}<Input aria-label={t("to")} type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label></div>{error && <div className="text-destructive">{error.message}</div>}
    {data?.length === 0 && <div className="text-muted-foreground">{t("noData")}</div>}
    {data?.map((c) => <section key={c.id} className="border-t pt-5"><h2 className="text-xl font-bold mb-4">{c.name}</h2><dl className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">{[[t("transactions"), num(c.count)], [t("todaySales"), money(c.revenue)], [t("qty"), num(c.qty)], [t("reversedAmount"), money(c.reversed)]].map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="text-xl font-semibold">{value}</dd></div>)}</dl><Table><TableHeader><TableRow><TableHead>{t("items")}</TableHead><TableHead>{t("qty")}</TableHead><TableHead>{t("amount")}</TableHead></TableRow></TableHeader><TableBody>{c.items.map((item, i) => <TableRow key={i}><TableCell>{lang === "ar" ? item.name_ar : item.name_en}</TableCell><TableCell>{num(item.qty)}</TableCell><TableCell>{money(item.revenue)}</TableCell></TableRow>)}</TableBody></Table></section>)}
  </div>;
}