import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageTitle, RequireRole } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n, type TKey } from "@/lib/i18n";
import { useFmt } from "@/lib/app";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({ meta: [{ title: "Audit Log — ICE LAND" }, { name: "description", content: "ICE LAND transaction and stock audit history." }, { property: "og:title", content: "Audit Log — ICE LAND" }, { property: "og:description", content: "Review staff actions, invoices, stock and settings changes." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: () => <RequireRole roles={["admin", "manager", "accountant"]}><Audit /></RequireRole>,
});
function Audit() {
  const { t } = useI18n(); const { fmtDate } = useFmt();
  const [action, setAction] = useState(""); const [entity, setEntity] = useState(""); const [user, setUser] = useState(""); const [from, setFrom] = useState(""); const [page, setPage] = useState(0);
  const { data: profiles } = useQuery({ queryKey: ["staff-list"], queryFn: async () => { const { data, error } = await supabase.from("profiles").select("id,full_name,email"); if (error) throw error; return data; } });
  const { data, error } = useQuery({ queryKey: ["audit", action, entity, user, from, page], queryFn: async () => {
    let query = supabase.from("audit_logs").select("*", { count: "exact" }).order("id", { ascending: false }).range(page * 30, page * 30 + 29);
    if (action) query = query.ilike("action", `%${action}%`); if (entity) query = query.ilike("entity", `%${entity}%`); if (user) query = query.eq("user_id", user); if (from) query = query.gte("created_at", new Date(`${from}T00:00:00`).toISOString());
    const { data, error, count } = await query; if (error) throw error; return { rows: data, count: count ?? 0 };
  } });
  const profMap = new Map((profiles ?? []).map((p) => [p.id, p]));  return <div className="space-y-4"><PageTitle>{t("audit")}</PageTitle><div className="flex gap-2 flex-wrap"><Input className="w-40" aria-label={t("action")} placeholder={t("action")} value={action} onChange={(e) => { setAction(e.target.value); setPage(0); }} /><Input className="w-40" aria-label={t("entity")} placeholder={t("entity")} value={entity} onChange={(e) => { setEntity(e.target.value); setPage(0); }} /><Input aria-label={t("from")} className="w-44" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} /><select aria-label={t("user")} className="h-9 border rounded-md bg-card px-2" value={user} onChange={(e) => { setUser(e.target.value); setPage(0); }}><option value="">{t("all")}</option>{profiles?.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}</select></div>{error && <div className="text-destructive">{error.message}</div>}<div className="overflow-x-auto"><Table><TableHeader><TableRow>{["date", "user", "action", "entity", "details"].map((k) => <TableHead key={k}>{t(k as TKey)}</TableHead>)}</TableRow></TableHeader><TableBody>{data?.rows.map((row) => <TableRow key={row.id}><TableCell className="whitespace-nowrap">{fmtDate(row.created_at)}</TableCell><TableCell>{profMap.get(row.user_id ?? "")?.full_name || row.user_id?.slice(0, 8) || "—"}</TableCell><TableCell>{row.action}</TableCell><TableCell>{row.entity}</TableCell><TableCell><details><summary className="cursor-pointer">{t("details")}</summary><pre dir="ltr" className="text-xs max-w-sm whitespace-pre-wrap break-all">{JSON.stringify(row.details, null, 2)}</pre></details></TableCell></TableRow>)}</TableBody></Table></div><div className="flex justify-center gap-3"><Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>{t("prev")}</Button><span>{page + 1}</span><Button size="sm" variant="outline" disabled={(page + 1) * 30 >= (data?.count ?? 0)} onClick={() => setPage(page + 1)}>{t("next")}</Button></div></div>;
}