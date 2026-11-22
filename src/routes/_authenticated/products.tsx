import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, IceCreamCone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageTitle, RequireRole } from "@/components/AppShell";
import { useI18n } from "@/lib/i18n";
import { signedImage, useFmt } from "@/lib/app";

type Product = Database["public"]["Tables"]["products"]["Row"];

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({ meta: [{ title: "Products & Menu — ICE LAND" }, { name: "description", content: "Manage ICE LAND menu items and prices." }, { property: "og:title", content: "Products & Menu — ICE LAND" }, { property: "og:description", content: "Manage ICE LAND menu items and prices." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: () => <RequireRole roles={["admin", "manager"]}><Products /></RequireRole>,
});

function Products() {
  const { t, lang } = useI18n();
  const { money } = useFmt();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [edit, setEdit] = useState<Partial<Product> | null>(null);
  const [catEdit, setCatEdit] = useState<{ name_ar: string; name_en: string } | null>(null);

  const { data } = useQuery({
    queryKey: ["products-admin"],
    queryFn: async () => {
      const [c, p] = await Promise.all([
        supabase.from("categories").select("*").order("sort_order"),
        supabase.from("products").select("*").is("deleted_at", null).order("sku"),
      ]);
      if (p.error) throw p.error;
      return { categories: c.data ?? [], products: await Promise.all(p.data.map(async (x) => ({ ...x, img: await signedImage(x.image_url) }))) };
    },
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["products-admin"] }); qc.invalidateQueries({ queryKey: ["catalog"] }); };
  const catName = (id: string) => { const c = data?.categories.find((x) => x.id === id); return c ? (lang === "ar" ? c.name_ar : c.name_en) : ""; };
  const rows = (data?.products ?? []).filter((p) => (cat === "all" || p.category_id === cat) && (!q || p.name_ar.includes(q) || p.name_en.toLowerCase().includes(q.toLowerCase()) || p.sku?.toLowerCase().includes(q.toLowerCase())));

  async function saveCat() {
    if (!catEdit?.name_ar.trim() || !catEdit.name_en.trim()) return;
    const { error } = await supabase.from("categories").insert({ ...catEdit, sort_order: (data?.categories.length ?? 0) + 1 });
    if (error) { toast.error(error.message); return; }
    setCatEdit(null); refresh(); toast.success(t("saved"));
  }

  return (
    <div>
      <PageTitle actions={<div className="flex gap-2">
        <Button variant="secondary" onClick={() => setCatEdit({ name_ar: "", name_en: "" })}><Plus className="h-4 w-4" />{t("newCategory")}</Button>
        <Button disabled={!data?.categories.length} onClick={() => setEdit({ active: true, track_stock: false, price: 0, cost: 0, ...(data?.categories[0] ? { category_id: data.categories[0].id } : {}) })}><Plus className="h-4 w-4" />{t("newProduct")}</Button>
      </div>}>{t("products")}</PageTitle>
      <div className="flex flex-wrap gap-2 mb-4">
        <Input placeholder={t("search")} className="w-56 bg-card" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="h-9 rounded-md border bg-card px-2" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">{t("all")}</option>
          {data?.categories.map((c) => <option key={c.id} value={c.id}>{lang === "ar" ? c.name_ar : c.name_en}</option>)}
        </select>
      </div>
      <div className="bg-card rounded-2xl shadow-soft overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead /><TableHead>{t("sku")}</TableHead><TableHead>{t("nameAr")}</TableHead><TableHead>{t("nameEn")}</TableHead><TableHead>{t("category")}</TableHead>
            <TableHead>{t("price")}</TableHead><TableHead>{t("cost")}</TableHead><TableHead>{t("margin")}</TableHead><TableHead>{t("stock")}</TableHead><TableHead>{t("status")}</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((p) => {
              const m = Number(p.price) > 0 ? ((Number(p.price) - Number(p.cost)) / Number(p.price)) * 100 : 0;
              return (
                <TableRow key={p.id}>
                  <TableCell><div className="h-10 w-10 rounded-lg bg-ice grid place-items-center overflow-hidden">{p.img ? <img src={p.img} alt="" className="h-full w-full object-cover" /> : <IceCreamCone className="h-5 w-5 text-primary/60" />}</div></TableCell>
                  <TableCell dir="ltr" className="font-mono text-xs">{p.sku}</TableCell>
                  <TableCell>{p.name_ar}</TableCell><TableCell>{p.name_en}</TableCell><TableCell>{catName(p.category_id)}</TableCell>
                  <TableCell className="tabular">{money(Number(p.price))}</TableCell>
                  <TableCell className="tabular">{Number(p.cost) ? money(Number(p.cost)) : <span className="text-pink">—</span>}</TableCell>
                  <TableCell className="tabular">{Number(p.cost) ? `${m.toFixed(0)}%` : "—"}</TableCell>
                  <TableCell>{p.track_stock ? Number(p.stock_qty) : "—"}</TableCell>
                  <TableCell><Badge variant={p.active ? "default" : "secondary"}>{p.active ? t("active") : t("inactive")}</Badge></TableCell>
                  <TableCell><Button size="sm" variant="ghost" onClick={() => setEdit(p)}>{t("edit")}</Button></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {edit && <ProductForm value={edit} categories={data?.categories ?? []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); refresh(); }} />}
      <Dialog open={!!catEdit} onOpenChange={(o) => !o && setCatEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("newCategory")}</DialogTitle></DialogHeader>
          <Label>{t("nameAr")}</Label><Input value={catEdit?.name_ar ?? ""} onChange={(e) => setCatEdit((c) => c ? { ...c, name_ar: e.target.value } : c)} />
          <Label>{t("nameEn")}</Label><Input value={catEdit?.name_en ?? ""} onChange={(e) => setCatEdit((c) => c ? { ...c, name_en: e.target.value } : c)} />
          <Button onClick={saveCat}>{t("save")}</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProductForm({ value, categories, onClose, onSaved }: { value: Partial<Product>; categories: { id: string; name_ar: string; name_en: string }[]; onClose: () => void; onSaved: () => void }) {
  const { t, lang } = useI18n();
  const [p, setP] = useState(value);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (file) { const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }
    signedImage(p.image_url ?? null).then((url) => { if (active) setPreview(url); });
    return () => { active = false; };
  }, [file, p.image_url]);
  const set = (k: keyof Product, v: unknown) => setP({ ...p, [k]: v });

  async function save(del = false) {
    if (!p.name_ar?.trim() || !p.name_en?.trim() || !p.category_id) { toast.error(t("nameAr") + " / " + t("nameEn")); return; }
    if (Number(p.price) < 0 || Number(p.cost) < 0 || isNaN(Number(p.price))) { toast.error(t("price")); return; }
    setBusy(true);
    let image_url = p.image_url ?? null;
    if (file) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { setBusy(false); toast.error("JPG / PNG / WebP · max 5 MB"); return; }
      const path = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "")}`;
      const up = await supabase.storage.from("product-images").upload(path, file);
      if (up.error) { setBusy(false); toast.error(up.error.message); return; }
      image_url = path;
    }
    const row = {
      name_ar: p.name_ar.trim(), name_en: p.name_en.trim(), sku: p.sku?.trim() || null, category_id: p.category_id,
      description: p.description ?? null, price: Number(p.price), cost: Number(p.cost ?? 0), track_stock: !!p.track_stock,
      ...(!p.id ? { stock_qty: Number(p.stock_qty ?? 0) } : {}), active: !!p.active, image_url, ...(del ? { deleted_at: new Date().toISOString() } : {}),
    };
    const { error } = p.id ? await supabase.from("products").update(row).eq("id", p.id) : await supabase.from("products").insert(row);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("saved")); onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{p.id ? t("edit") : t("newProduct")}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>{t("nameAr")}</Label><Input maxLength={100} value={p.name_ar ?? ""} onChange={(e) => set("name_ar", e.target.value)} /></div>
          <div className="space-y-1"><Label>{t("nameEn")}</Label><Input maxLength={100} value={p.name_en ?? ""} onChange={(e) => set("name_en", e.target.value)} /></div>
          <div className="space-y-1"><Label>{t("sku")}</Label><Input maxLength={40} value={p.sku ?? ""} onChange={(e) => set("sku", e.target.value)} /></div>
          <div className="space-y-1"><Label>{t("category")}</Label>
            <select className="h-9 w-full rounded-md border bg-background px-2" value={p.category_id} onChange={(e) => set("category_id", e.target.value)}>
              {categories.map((c) => <option key={c.id} value={c.id}>{lang === "ar" ? c.name_ar : c.name_en}</option>)}
            </select></div>
          <div className="space-y-1"><Label>{t("price")}</Label><Input type="number" min={0} value={p.price ?? 0} onChange={(e) => set("price", e.target.value)} /></div>
          <div className="space-y-1"><Label>{t("cost")}</Label><Input type="number" min={0} value={p.cost ?? 0} onChange={(e) => set("cost", e.target.value)} /></div>
          <div className="col-span-2 space-y-1"><Label>{t("description")}</Label><Textarea maxLength={500} value={p.description ?? ""} onChange={(e) => set("description", e.target.value)} /></div>
          <div className="col-span-2 space-y-2"><Label>{t("image")}</Label>{preview && <img src={preview} alt={p.name_en ?? ""} className="h-28 w-28 rounded-md object-cover" />}<Input aria-label={t("image")} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />{(preview || p.image_url) && <Button variant="ghost" size="sm" onClick={() => { setFile(null); set("image_url", null); setPreview(null); }}>{t("removeImage")}</Button>}</div>
          <label className="flex items-center gap-2"><Switch checked={!!p.track_stock} onCheckedChange={(v) => set("track_stock", v)} />{t("trackStock")}</label>
          {p.track_stock && <div className="space-y-1"><Label>{t("stock")}</Label><Input disabled={!!p.id} type="number" min={0} value={p.stock_qty ?? 0} onChange={(e) => set("stock_qty", e.target.value)} /></div>}
          <label className="flex items-center gap-2"><Switch checked={!!p.active} onCheckedChange={(v) => set("active", v)} />{t("active")}</label>
        </div>
        <div className="flex gap-2 mt-2">
          <Button className="flex-1" disabled={busy} onClick={() => save()}>{t("save")}</Button>
          {p.id && <Button variant="destructive" disabled={busy} onClick={() => confirm(t("delete") + "?") && save(true)}>{t("delete")}</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
