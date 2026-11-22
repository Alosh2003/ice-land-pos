import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Pencil, UserRound, Download, Upload, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageTitle, RequireRole } from "@/components/AppShell";
import { useI18n, type TKey } from "@/lib/i18n";
import { createUser, errMsg, useFmt, useMe } from "@/lib/app";
import { customerStatus, daysOverdue } from "@/lib/credit";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({ meta: [{ title: "Customers — ICE LAND" }, { name: "description", content: "ICE LAND customer credit accounts." }, { property: "og:title", content: "Customers — ICE LAND" }, { property: "og:description", content: "ICE LAND customer credit accounts." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: () => <RequireRole roles={["admin", "manager", "accountant"]}><Customers /></RequireRole>,
});

type Customer = Database["public"]["Tables"]["customers"]["Row"];
type Balance = { customer_id: string | null; balance: number | null; oldest_due: string | null };

const PAGE = 15;
type Filter = "all" | "balance" | "overdue" | "blocked";
type Sort = "name" | "balance" | "oldest";

function Customers() {
  const { t, lang } = useI18n();
  const { money, fmtDate } = useFmt();
  const { has } = useMe();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("name");
  const [page, setPage] = useState(0);
  const [edit, setEdit] = useState<Partial<Customer> | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const { data, isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const [{ data: cs, error: cErr }, { data: bs, error: bErr }] = await Promise.all([
        supabase.from("customers").select("*").is("deleted_at", null),
        supabase.from("customer_balances").select("customer_id,balance,oldest_due"),
      ]);
      if (cErr) throw cErr;
      if (bErr) throw bErr;
      const balMap = new Map((bs ?? []).map((b: Balance) => [b.customer_id, b]));
      return (cs ?? []).map((c) => {
        const b = balMap.get(c.id);
        const balance = Number(b?.balance ?? 0);
        const overdue = daysOverdue(b?.oldest_due ?? null, today) > 0;
        return { ...c, balance, oldest_due: b?.oldest_due ?? null, overdue };
      });
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["customers"] });

  function exportCsv() {
    const header = ["name", "phone", "phone2", "address", "notes", "credit_enabled", "credit_limit", "payment_terms_days", "active"];
    const rows = (data ?? []).map((c) => header.map((h) => c[h as keyof Customer] ?? "").map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([header.join(",") + "\n" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `customers-${today}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) { toast.error(t("invalidCsv")); return; }
      const headers = (lines[0] ?? "").split(",").map((h) => h.trim().toLowerCase());
      let created = 0;
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i] ?? "");
        const row = Object.fromEntries(headers.map((h, j) => [h, cols[j] ?? ""]));
        const name = row["name"]?.trim();
        if (!name) continue;
        await createUser(row["name"]?.trim() || "", row["name"]?.trim() || "", row["phone"]?.trim() || "Admin123!", "cashier");
        created++;
      }
      toast.success(t("importDone").replace("{count}", String(created)));
      setImportOpen(false);
      refresh();
    } catch (err) { toast.error(errMsg(err, lang)); }
    finally { setBusy(false); }
  }

  function parseCsvLine(line: string): string[] {
    // Simple CSV parser (handles quoted fields)
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQuotes = !inQuotes; }
      else if (c === "," && !inQuotes) { result.push(current.replace(/^"|"$/g, "")); current = ""; }
      else { current += c; }
    }
    result.push(current.replace(/^"|"$/g, ""));
    return result;
  }

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = (data ?? []).filter((c) => {
      if (s && !(c.name.toLowerCase().includes(s) || (c.phone ?? "").includes(s) || (c.phone2 ?? "").includes(s))) return false;
      if (filter === "balance" && c.balance <= 0) return false;
      if (filter === "overdue" && !c.overdue) return false;
      if (filter === "blocked" && customerStatus(c.active, c.overdue, c.credit_enabled) !== "blocked") return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === "balance") return b.balance - a.balance;
      if (sort === "oldest") return (a.oldest_due ?? "9999").localeCompare(b.oldest_due ?? "9999");
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [data, q, filter, sort]);

  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE);
  const statusOf = (c: Customer & { overdue: boolean }) => customerStatus(c.active, c.overdue, c.credit_enabled);

  return (
    <div className="space-y-4">
      <PageTitle actions={<>
        <Input aria-label={t("search")} className="w-56 bg-card" placeholder={t("search")} value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        <select aria-label={t("status")} className="h-9 rounded-md border bg-card px-2" value={filter} onChange={(e) => { setFilter(e.target.value as Filter); setPage(0); }}>
          <option value="all">{t("all")}</option>
          <option value="balance">{t("hasBalance")}</option>
          <option value="overdue">{t("overdue")}</option>
          <option value="blocked">{t("blocked")}</option>
        </select>
        <select aria-label={t("sortBy")} className="h-9 rounded-md border bg-card px-2" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="name">{t("sortName")}</option>
          <option value="balance">{t("sortBalance")}</option>
          <option value="oldest">{t("sortOldest")}</option>
        </select>
        {has("admin", "manager") && <Button onClick={() => setEdit({ active: true, credit_enabled: false, credit_limit: 0, payment_terms_days: 30, opening_balance: 0 })}><Plus className="h-4 w-4" />{t("newCustomer")}</Button>}
        <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4" />{t("export")}</Button>
        <label className="inline-block cursor-pointer">
          <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" />{t("importCsv")}</Button>
          <Input type="file" accept=".csv" className="hidden" onChange={(e) => { handleImportFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
        </label>
      </>}>
        {t("customers")}
      </PageTitle>

      <div className="bg-card rounded-2xl shadow-soft overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t("nameAr")}</TableHead>
            <TableHead>{t("phone")}</TableHead>
            <TableHead className="text-end">{t("creditLimit")}</TableHead>
            <TableHead className="text-end">{t("balance")}</TableHead>
            <TableHead>{t("oldestUnpaid")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{t("loading")}</TableCell></TableRow>}
            {!isLoading && pageRows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{t("noData")}</TableCell></TableRow>}
            {pageRows.map((c) => {
              const st = statusOf(c);
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium"><Link className="hover:underline" to="/customers/$id" params={{ id: c.id }}>{c.name}</Link></TableCell>
                  <TableCell dir="ltr">{c.phone || "—"}</TableCell>
                  <TableCell className="tabular text-end">{money(Number(c.credit_limit))}</TableCell>
                  <TableCell className={`tabular text-end font-semibold ${c.balance > 0 ? "text-destructive" : ""}`}>{money(c.balance)}</TableCell>
                  <TableCell>{c.oldest_due ? fmtDate(c.oldest_due, false) : "—"}</TableCell>
                  <TableCell><Badge variant={st === "active" ? "default" : "secondary"}>{t(st === "active" ? "active" : "blocked")}</Badge></TableCell>
                  <TableCell>{has("admin", "manager") && <Button size="sm" variant="ghost" onClick={() => setEdit(c)}><Pencil className="h-4 w-4" /></Button>}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-center gap-3">
        <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>{t("prev")}</Button>
        <span className="text-sm text-muted-foreground">{page + 1} / {Math.max(1, Math.ceil(rows.length / PAGE))}</span>
        <Button size="sm" variant="outline" disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage(page + 1)}>{t("next")}</Button>
      </div>

      {edit && <CustomerForm value={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); refresh(); }} />}

      <Dialog open={importOpen} onOpenChange={(o) => !o && setImportOpen(false)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("importCsv")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">CSV columns: name, phone, phone2, address, notes, credit_enabled, credit_limit, payment_terms_days, active. Only name is required.</p>
          <input ref={importFileRef} type="file" accept=".csv" className="hidden" onChange={(e) => { handleImportFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          <Button className="w-full" disabled={busy} onClick={() => importFileRef.current?.click()}><Upload className="h-4 w-4" />{t("importCsv")}</Button>
          {busy && <div className="text-sm text-muted-foreground">{t("loading")}</div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CustomerForm({ value, onClose, onSaved }: { value: Partial<Customer>; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [c, setC] = useState(value);
  const [busy, setBusy] = useState(false);
  const isNew = !c.id;
  const set = (k: keyof Customer, v: unknown) => setC((x) => x ? { ...x, [k]: v } : x);

  async function save() {
    if (!c.name?.trim()) { toast.error(t("nameAr")); return; }
    setBusy(true);
    const row = {
      name: c.name.trim(),
      phone: c.phone?.trim() || null,
      phone2: c.phone2?.trim() || null,
      address: c.address?.trim() || null,
      notes: c.notes?.trim() || null,
      credit_enabled: !!c.credit_enabled,
      credit_limit: Number(c.credit_limit ?? 0),
      payment_terms_days: Number(c.payment_terms_days ?? 30),
      active: !!c.active,
      ...(isNew ? { opening_balance: Number(c.opening_balance ?? 0) } : {}),
    };
    const { error } = c.id
      ? await supabase.from("customers").update(row).eq("id", c.id)
      : await supabase.from("customers").insert(row);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("saved")); onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{c.id ? t("edit") : t("newCustomer")}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1"><Label>{t("nameAr")} *</Label><Input maxLength={100} value={c.name ?? ""} onChange={(e) => set("name", e.target.value)} /></div>
          <div className="space-y-1"><Label>{t("phone")}</Label><Input maxLength={50} dir="ltr" value={c.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></div>
          <div className="space-y-1"><Label>{t("phone2")}</Label><Input maxLength={50} dir="ltr" value={c.phone2 ?? ""} onChange={(e) => set("phone2", e.target.value)} /></div>
          <div className="col-span-2 space-y-1"><Label>{t("address")}</Label><Input maxLength={200} value={c.address ?? ""} onChange={(e) => set("address", e.target.value)} /></div>
          <div className="col-span-2 space-y-1"><Label>{t("notes")}</Label><Input maxLength={300} value={c.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></div>
          <label className="flex items-center gap-2"><Switch checked={!!c.active} onCheckedChange={(v) => set("active", v)} />{t("active")}</label>
          <label className="flex items-center gap-2"><Switch checked={!!c.credit_enabled} onCheckedChange={(v) => set("credit_enabled", v)} />{t("creditEnabled")}</label>
          <div className="space-y-1"><Label>{t("creditLimit")}</Label><Input type="number" min={0} value={c.credit_limit ?? 0} onChange={(e) => set("credit_limit", Number(e.target.value))} /></div>
          <div className="space-y-1"><Label>{t("paymentTerms")}</Label><Input type="number" min={0} max={365} value={c.payment_terms_days ?? 30} onChange={(e) => set("payment_terms_days", Number(e.target.value))} /></div>
          {isNew && <div className="col-span-2 space-y-1"><Label>{t("openingBalance")}</Label><Input type="number" step="0.01" value={c.opening_balance ?? 0} onChange={(e) => set("opening_balance", Number(e.target.value))} /></div>}
        </div>
        <div className="flex gap-2 mt-2">
          <Button className="flex-1" disabled={busy} onClick={save}>{t("save")}</Button>
          <Button variant="secondary" className="flex-1" disabled={busy} onClick={onClose}>{t("cancel")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
