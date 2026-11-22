import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageTitle, RequireRole } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useI18n, type TKey } from "@/lib/i18n";
import { signedImage, useSettings, type Settings, type PayMethod } from "@/lib/app";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Store Settings — ICE LAND" }, { name: "description", content: "ICE LAND store, receipt, tax, payment and delivery settings." }, { property: "og:title", content: "Store Settings — ICE LAND" }, { property: "og:description", content: "Manage ICE LAND currency, payments and delivery fees." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: () => <RequireRole roles={["admin"]}><SettingsPage /></RequireRole>,
});

function SettingsPage() {
  const { t } = useI18n(); const current = useSettings(); const qc = useQueryClient();
  const [form, setForm] = useState<Settings | null>(null); const [busy, setBusy] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  useEffect(() => { if (current) setForm(current); }, [current]);
  useEffect(() => {
    let active = true;
    if (logoFile) { const url = URL.createObjectURL(logoFile); setLogoPreview(url); return () => URL.revokeObjectURL(url); }
    signedImage(current?.logo_url ?? null).then((url) => { if (active) setLogoPreview(url); });
    return () => { active = false; };
  }, [logoFile, current?.logo_url]);
  if (!form) return <div>{t("loading")}</div>;
  const set = (key: keyof Settings, value: unknown) => setForm((f) => f ? { ...f, [key]: value } : f);
  const methods = form.payment_methods as PayMethod[];
  async function save() {
    if (!form || busy) return;
    try { new Intl.DateTimeFormat("en", { timeZone: form.timezone }); } catch { toast.error(t("timezone")); return; }
    if (!form.store_name.trim() || !methods.some((m) => m.active)) { toast.error(t("storeName") + " / " + t("paymentMethods")); return; }
    setBusy(true);
    const { id, updated_at, ...values } = form;
    if (logoFile) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(logoFile.type) || logoFile.size > 5 * 1024 * 1024) { setBusy(false); toast.error("JPG / PNG / WebP · max 5 MB"); return; }
      const path = `logo-${crypto.randomUUID()}.${logoFile.type.split("/")[1]}`;
      const { error } = await supabase.storage.from("product-images").upload(path, logoFile);
      if (error) { setBusy(false); toast.error(error.message); return; } values.logo_url = path;
    }
    const { error } = await supabase.from("settings").update(values).eq("id", id);
    setBusy(false); if (error) { toast.error(error.message); return; }
    setLogoFile(null); toast.success(t("saved")); qc.invalidateQueries({ queryKey: ["settings"] });
  }
  const textFields: [keyof Settings, TKey][] = [["store_name", "storeName"], ["phone", "phone"], ["address", "address"], ["currency_code", "currency"], ["currency_symbol_ar", "nameAr"], ["currency_symbol_en", "nameEn"], ["date_format", "dateFormat"], ["timezone", "timezone"]];
  return <div className="max-w-4xl space-y-7"><PageTitle actions={<Button disabled={busy} onClick={save}>{t("save")}</Button>}>{t("settings")}</PageTitle><section className="grid sm:grid-cols-2 gap-4">{textFields.map(([key, label]) => <label key={key} className="space-y-1 text-sm font-medium">{t(label)}<Input aria-label={t(label)} value={String(form[key] ?? "")} onChange={(e) => set(key, e.target.value)} /></label>)}<label className="space-y-1 text-sm font-medium">{t("decimals")}<Input aria-label={t("decimals")} type="number" min={0} max={3} value={form.currency_decimals} onChange={(e) => set("currency_decimals", Number(e.target.value))} /></label><label className="space-y-1 text-sm font-medium">Instagram<Input aria-label="Instagram" value={form.instagram ?? ""} onChange={(e) => set("instagram", e.target.value)} /></label></section>
    <section className="border-t pt-5 space-y-3">{logoPreview && <img src={logoPreview} alt="ICE LAND" className="h-24 w-24 object-contain" />}<Input aria-label="Store logo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} /><label className="block">ICE LAND slogan<Input value={form.slogan} onChange={(e) => set("slogan", e.target.value)} /></label></section>
    <section className="border-t pt-5 space-y-4"><label className="flex gap-3 items-center"><Switch checked={form.tax_enabled} onCheckedChange={(v) => set("tax_enabled", v)} />{t("taxEnabled")}</label><label className="block max-w-xs">{t("taxRate")}<Input aria-label={t("taxRate")} type="number" min={0} max={100} value={form.tax_rate} onChange={(e) => set("tax_rate", Number(e.target.value))} /></label></section>
    <section className="border-t pt-5 space-y-4"><label className="flex gap-3 items-center"><Switch aria-label={t("deliveryEnabled")} checked={form.delivery_enabled} onCheckedChange={(v) => set("delivery_enabled", v)} />{t("deliveryEnabled")}</label><label className="block max-w-xs">{t("deliveryFee")}<Input aria-label={t("deliveryFee")} type="number" min={0} value={form.delivery_fee} onChange={(e) => set("delivery_fee", Number(e.target.value))} /></label><label className="flex gap-3 items-center"><Switch checked={form.delivery_taxable} onCheckedChange={(v) => set("delivery_taxable", v)} />{t("deliveryTaxable")}</label></section>
    <section className="border-t pt-5 space-y-3"><h2 className="text-lg font-semibold">{t("paymentMethods")}</h2>{methods.map((m, i) => <div key={m.code} className="flex flex-wrap gap-2 items-center"><Switch checked={m.active} onCheckedChange={(active) => set("payment_methods", methods.map((x, j) => j === i ? { ...x, active } : x))} /><span className="w-20 font-mono text-sm">{m.code}</span><Input className="w-40" aria-label={`${m.code} ${t("nameAr")}`} value={m.ar} onChange={(e) => set("payment_methods", methods.map((x, j) => j === i ? { ...x, ar: e.target.value } : x))} /><Input className="w-40" aria-label={`${m.code} ${t("nameEn")}`} value={m.en} onChange={(e) => set("payment_methods", methods.map((x, j) => j === i ? { ...x, en: e.target.value } : x))} /></div>)}</section>
    <section className="border-t pt-5 space-y-3"><label className="block">{t("receiptFooter")}<Textarea aria-label={t("receiptFooter")} value={form.receipt_footer ?? ""} onChange={(e) => set("receipt_footer", e.target.value)} /></label></section>
  </div>;
}