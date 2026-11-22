import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";
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
import { useI18n } from "@/lib/i18n";
import { useFmt } from "@/lib/app";
import { createUser, updateUser, resetUserPassword, listUsers, errMsg } from "@/lib/app";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({
    meta: [
      { title: "Users — ICE LAND" },
      { name: "description", content: "Manage ICE LAND users and roles." },
      { property: "og:title", content: "Users — ICE LAND" },
      { property: "og:description", content: "Manage ICE LAND users and roles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <RequireRole roles={["admin"]}><UsersPage /></RequireRole>,
});

type UserRow = { id: string; email: string; full_name: string; role: string; active: boolean; created_at: string };

const ROLES = [{ code: "admin", ar: "مدير النظام", en: "Administrator" }, { code: "manager", ar: "مدير", en: "Manager" }, { code: "cashier", ar: "كاشير", en: "Cashier" }, { code: "accountant", ar: "محاسب", en: "Accountant" }] as const;
const roleName = (code: string, lang: string) => ROLES.find((r) => r.code === code)?.[(lang === "ar" ? "ar" : "en") as "ar" | "en"] ?? code;

function UsersPage() {
  const { t, lang } = useI18n();
  const { fmtDate } = useFmt();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<{ id?: string; email: string; full_name: string; role: string; active: boolean } | null>(null);
  const [resetId, setResetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: users, error } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_users");
      if (error) throw error;
      return data as unknown as UserRow[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["users"] });

  const usersList = users ?? [];
  const activeCount = usersList.filter((u) => u.active).length;
  const roleCount = (code: string) => usersList.filter((u) => u.role === code && u.active).length;
  const adminCount = roleCount("admin");
  const managerCount = roleCount("manager");
  const cashierCount = roleCount("cashier");
  const accountantCount = roleCount("accountant");
  const totalUsers = usersList.length;

  async function save() {
    if (!edit?.email.trim() || !edit.full_name.trim()) { toast.error(t("nameAr")); return; }
    if (!ROLES.some((r) => r.code === edit.role)) { toast.error(t("role")); return; }
    setBusy(true);
    if (edit.id) {
      await updateUser(edit.id, { full_name: edit.full_name.trim(), role: edit.role as Database["public"]["Enums"]["app_role"], active: edit.active });
    } else {
      await createUser(edit.email.trim(), edit.full_name.trim(), (edit as { password?: string }).password ?? "Admin123!", edit.role as Database["public"]["Enums"]["app_role"], edit.active);
    }
    setBusy(false);
    setEdit(null); toast.success(t("saved")); refresh();
  }

  async function doReset() {
    if (!resetId) return;
    setBusy(true);
    try {
      const pw = await resetUserPassword(resetId);
      toast.success(`${t("resetPassword")}: ${pw}`);
    } catch (err) { toast.error(errMsg(err, lang)); }
    finally { setBusy(false); setResetId(null); }
  }

  async function del(id: string) {
    // TODO: Implement delete_user RPC
    toast.error("Not implemented");
  }

  return (
    <div>
      <PageTitle actions={<Button onClick={() => setEdit({ email: "", full_name: "", role: "cashier", active: true })}><Plus className="h-4 w-4" />{t("addUser")}</Button>}>
        {t("users")}
      </PageTitle>
      {error && <div className="bg-destructive/10 rounded-lg p-3 text-destructive mb-4">{error.message}</div>}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
        <div className="bg-card rounded-2xl shadow-soft p-4"><div className="text-xs text-muted-foreground">{t("users")}</div><div className="text-xl font-bold tabular mt-1">{totalUsers}</div></div>
        <div className="bg-card rounded-2xl shadow-soft p-4"><div className="text-xs text-muted-foreground">{t("active")}</div><div className="text-xl font-bold tabular mt-1">{activeCount}</div></div>
        <div className="bg-card rounded-2xl shadow-soft p-4"><div className="text-xs text-muted-foreground">{t("role")}</div><div className="text-xl font-bold tabular mt-1">{adminCount}</div><div className="text-xs text-muted-foreground">{roleName("admin", lang)}</div></div>
        <div className="bg-card rounded-2xl shadow-soft p-4"><div className="text-xs text-muted-foreground">{t("role")}</div><div className="text-xl font-bold tabular mt-1">{managerCount}</div><div className="text-xs text-muted-foreground">{roleName("manager", lang)}</div></div>
        <div className="bg-card rounded-2xl shadow-soft p-4"><div className="text-xs text-muted-foreground">{t("role")}</div><div className="text-xl font-bold tabular mt-1">{cashierCount}</div><div className="text-xs text-muted-foreground">{roleName("cashier", lang)}</div></div>
        <div className="bg-card rounded-2xl shadow-soft p-4"><div className="text-xs text-muted-foreground">{t("role")}</div><div className="text-xl font-bold tabular mt-1">{accountantCount}</div><div className="text-xs text-muted-foreground">{roleName("accountant", lang)}</div></div>
      </div>
      <div className="bg-card rounded-2xl shadow-soft overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t("nameAr")}</TableHead><TableHead>{t("email")}</TableHead>
            <TableHead>{t("role")}</TableHead><TableHead>{t("active")}</TableHead>
            <TableHead>{t("createdAt")}</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {users?.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.full_name}</TableCell>
                <TableCell dir="ltr">{u.email}</TableCell>
                <TableCell>{roleName(u.role, lang)}</TableCell>
                <TableCell><Badge variant={u.active ? "default" : "secondary"}>{u.active ? t("active") : t("inactive")}</Badge></TableCell>
                <TableCell>{fmtDate(u.created_at, false)}</TableCell>
                <TableCell className="text-end space-x-1 rtl:text-start">
                  <Button variant="outline" size="sm" onClick={() => setResetId(u.id)}>{t("resetPassword")}</Button>
                  <Button variant="ghost" size="sm" onClick={() => setEdit({ id: u.id, email: u.email, full_name: u.full_name, role: u.role, active: u.active })}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => del(u.id)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {users?.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("noData")}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.id ? t("edit") : t("addUser")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!edit?.id && <div className="space-y-1.5"><Label>{t("email")} *</Label><Input required dir="ltr" value={edit?.email ?? ""} onChange={(ev) => setEdit((x) => x ? { ...x, email: ev.target.value } : x)} /></div>}
            <div className="space-y-1.5"><Label>{t("nameAr")} *</Label><Input required maxLength={100} value={edit?.full_name ?? ""} onChange={(ev) => setEdit((x) => x ? { ...x, full_name: ev.target.value } : x)} /></div>
            {!edit?.id && <div className="space-y-1.5"><Label>{t("password")} *</Label><Input type="password" required minLength={8} value={(edit as { password?: string })?.password ?? ""} onChange={(ev) => setEdit((x) => x ? { ...x, password: ev.target.value } : x)} /></div>}
            <div className="space-y-1.5"><Label>{t("role")} *</Label>
              <select className="h-10 w-full rounded-md border bg-background px-2" value={edit?.role ?? "cashier"} onChange={(ev) => setEdit((x) => x ? { ...x, role: ev.target.value } : x)}>
                {ROLES.map((r) => <option key={r.code} value={r.code}>{lang === "ar" ? r.ar : r.en}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2"><Switch checked={!!edit?.active} onCheckedChange={(v) => setEdit((x) => x ? { ...x, active: v } : x)} />{t("active")}</label>
          </div>
          <Button className="w-full mt-4" disabled={busy} onClick={save}>{busy ? t("loading") : t("save")}</Button>
        </DialogContent>
      </Dialog>
      <Dialog open={!!resetId} onOpenChange={(o) => !o && setResetId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("resetPassword")}</DialogTitle></DialogHeader>
          <p className="text-sm">{t("resetConfirm")}</p>
          <Button className="w-full mt-4" disabled={busy} onClick={doReset}>{busy ? t("loading") : t("resetPassword")}</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
