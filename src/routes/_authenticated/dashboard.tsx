import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageTitle } from "@/components/AppShell";
import { useI18n, type TKey } from "@/lib/i18n";
import { useFmt, useMe } from "@/lib/app";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — ICE LAND" }, { name: "description", content: "ICE LAND sales performance." }, { property: "og:title", content: "Dashboard — ICE LAND" }, { property: "og:description", content: "ICE LAND sales performance." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: Dashboard,
});

type Stats = { revenue: number; count: number; cogs: number; prev_revenue: number; prev_count: number;
  daily: { day: string; revenue: number }[]; by_category: { name_ar: string; name_en: string; revenue: number }[];
  by_payment: { method: string; amount: number }[]; top_products: { name_ar: string; name_en: string; qty: number; revenue: number }[] };

function range(k: string): [Date, Date] {
  const n = new Date(); const d0 = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  const add = (d: Date, x: number) => new Date(d.getTime() + x * 864e5);
  if (k === "yesterday") return [add(d0, -1), d0];
  if (k === "thisWeek") return [add(d0, -d0.getDay()), add(d0, 1)];
  if (k === "thisMonth") return [new Date(n.getFullYear(), n.getMonth(), 1), add(d0, 1)];
  return [d0, add(d0, 1)];
}
const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function Dashboard() {
  const { t, lang } = useI18n();
  const { money, num, pmName } = useFmt();
  const { has, isLoading: meLoading } = useMe();
  const [k, setK] = useState("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [from, to] = k === "custom" && customFrom && customTo ? [new Date(`${customFrom}T00:00:00`), new Date(new Date(`${customTo}T00:00:00`).getTime() + 86400000)] : range(k);
  const allowed = has("admin", "manager", "accountant");
  const { data: s } = useQuery({
    queryKey: ["dash", k, customFrom, customTo], enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_stats", { p_from: from.toISOString(), p_to: to.toISOString() });
      if (error) throw error;
      return data as unknown as Stats;
    },
  });
  const { data: recent } = useQuery({ queryKey: ["sales", "recent", from.toISOString(), to.toISOString()], enabled: allowed, queryFn: async () => {
    const { data, error } = await supabase.from("sales").select("id,invoice_no,cashier_name,total,status").gte("created_at", from.toISOString()).lt("created_at", to.toISOString()).order("created_at", { ascending: false }).limit(10);
    if (error) throw error; return data;
  } });
  const { data: ar } = useQuery({
    queryKey: ["receivables-total"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("receivables_aging");
      if (error) throw error;
      return (data ?? []) as { total_outstanding: number }[];
    },
  });
  const arTotal = (ar ?? []).reduce((s, r) => s + Number(r.total_outstanding), 0);
  if (!meLoading && !allowed) return <Navigate to="/pos" />;
  const nm = (x: { name_ar: string; name_en: string }) => (lang === "ar" ? x.name_ar : x.name_en);
  const delta = s && s.prev_revenue > 0 ? ((s.revenue - s.prev_revenue) / s.prev_revenue) * 100 : null;
  const cards: [TKey, string][] = s ? [
    ["todaySales", money(s.revenue)], ["transactions", num(s.count)], ["avgOrder", money(s.count ? s.revenue / s.count : 0)],
    ["bestProduct", s.top_products[0] ? nm(s.top_products[0]) : "—"],
    ["bestCategory", (() => { const best = [...s.by_category].sort((a, b) => b.revenue - a.revenue)[0]; return best ? nm(best) : "—"; })()],
    ["accountsReceivable", money(arTotal)],
  ] : [];
  return (
    <div className="space-y-6">
      <PageTitle actions={<div className="flex gap-1 flex-wrap">{["today", "yesterday", "thisWeek", "thisMonth", "custom"].map((x) =>
        <Button key={x} size="sm" variant={k === x ? "default" : "secondary"} className="rounded-full" onClick={() => setK(x)}>{t(x as TKey)}</Button>)}</div>}>{t("dashboard")}</PageTitle>
      {k === "custom" && <div className="flex gap-3 flex-wrap"><Input aria-label={t("from")} type="date" className="w-44" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /><Input aria-label={t("to")} type="date" className="w-44" min={customFrom} value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></div>}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {cards.map(([key, v], i) => (
          <div key={key} className={`rounded-2xl p-4 shadow-soft ${i === 0 ? "bg-brand-gradient text-primary-foreground" : "bg-card"}`}>
            <div className="text-xs opacity-80">{t(key)}</div>
            <div className="text-xl font-bold mt-1 tabular truncate">{v}</div>
            {i === 0 && delta !== null && <div className="text-xs mt-1">{delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}% {t("vsPrev")}</div>}
          </div>
        ))}
      </div>
      {s && s.count === 0 && <div className="bg-card rounded-2xl p-10 text-center text-muted-foreground shadow-soft">{t("noData")}</div>}
      {s && s.count > 0 && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card title={t("dailyTrend")}><LineChart data={s.daily}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis /><Tooltip formatter={(v: number) => money(v)} /><Line dataKey="revenue" stroke="var(--chart-1)" strokeWidth={3} /></LineChart></Card>
          <Card title={t("byCategory")}><PieChart><Pie data={s.by_category.map((c) => ({ name: nm(c), value: c.revenue }))} dataKey="value" nameKey="name" innerRadius={50} label>{s.by_category.map((_, i) => <Cell key={i} fill={COLORS[i % 5]} />)}</Pie><Tooltip formatter={(v: number) => money(v)} /></PieChart></Card>
          <Card title={t("byPayment")}><BarChart data={s.by_payment.map((p) => ({ name: pmName(p.method), amount: p.amount }))}><XAxis dataKey="name" /><YAxis /><Tooltip formatter={(v: number) => money(v)} /><Bar dataKey="amount" fill="var(--chart-2)" radius={8} /></BarChart></Card>
          <Card title={t("top10")}><BarChart layout="vertical" data={s.top_products.map((p) => ({ name: nm(p), qty: p.qty }))}><XAxis type="number" /><YAxis type="category" dataKey="name" width={110} /><Tooltip /><Bar dataKey="qty" fill="var(--chart-1)" radius={8} /></BarChart></Card>
        </div>
      )}
      <section className="border-t pt-5"><h2 className="font-semibold text-lg mb-3">{t("recent")}</h2>{recent?.map((sale) => <div key={sale.id} className="flex flex-wrap justify-between gap-3 py-3 border-b"><span className="font-mono">{sale.invoice_no}</span><span>{sale.cashier_name}</span><span>{t(sale.status as "completed")}</span><b>{money(Number(sale.total))}</b></div>)}</section>
    </div>
  );
}
function Card({ title, children }: { title: string; children: React.ReactElement }) {
  return <div className="bg-card rounded-2xl shadow-soft p-4"><h3 className="font-semibold mb-3">{title}</h3><div className="h-64" dir="ltr"><ResponsiveContainer>{children}</ResponsiveContainer></div></div>;
}
