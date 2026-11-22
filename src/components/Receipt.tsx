import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { signedImage, useFmt, useSettings } from "@/lib/app";
import { PaymentProofImage } from "./PaymentProof";
import { useI18n } from "@/lib/i18n";
import { LogoMark } from "./Logo";

export function useSaleDetail(id: string | null) {
  return useQuery({
    queryKey: ["sale", id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) throw new Error("Invoice required");
      const { data, error } = await supabase.from("sales").select("*, sale_items(*), payments(*)").eq("id", id).single();
      if (error) throw error;
      const { data: p } = await supabase.from("profiles").select("full_name,email").eq("id", data.cashier_id).maybeSingle();
      let customer: { id: string; name: string; balance: number } | null = null;
      if (data.customer_id) {
        const { data: c, error: cErr } = await supabase.from("customers").select("id,name").eq("id", data.customer_id).maybeSingle();
        if (!cErr && c) {
          const { data: b } = await supabase.from("customer_balances").select("balance").eq("customer_id", c.id).maybeSingle();
          customer = { id: c.id, name: c.name, balance: Number(b?.balance ?? 0) };
        }
      }
      return { ...data, cashier: data.cashier_name || p?.full_name || p?.email || "", sale_items: await Promise.all(data.sale_items.map(async (i) => ({ ...i, img: await signedImage(i.image_url) }))), customer };
    },
  });
}

export function Receipt({ saleId }: { saleId: string }) {
  const { data: s } = useSaleDetail(saleId);
  const st = useSettings();
  const { money, fmtDate, pmName, lang } = useFmt();
  const { t } = useI18n();
  const { data: logo } = useQuery({ queryKey: ["receipt-logo", st?.logo_url], queryFn: () => signedImage(st?.logo_url ?? null) });
  if (!s) return <div className="p-6 text-muted-foreground">{t("loading")}</div>;
  return (
    <div className="print-area bg-card text-card-foreground mx-auto w-full max-w-[80mm] p-3 text-[12px] font-mono">
      <div className="text-center space-y-1">
        {logo ? <img src={logo} alt="" className="h-10 w-10 object-contain mx-auto" /> : <LogoMark className="h-10 w-10 mx-auto" />}
        <div className="font-bold text-sm">{st?.store_name}</div>
        <div>{st?.slogan}</div>
        {st?.phone && <div dir="ltr">{st.phone}</div>}
        {st?.address && <div>{st.address}</div>}
      </div>
      <div className="border-t border-dashed my-2" />
      <div>{t("invoice")}: <b dir="ltr">{s.invoice_no}</b></div>
      <div>{t("date")}: {fmtDate(s.created_at)}</div>
      <div>{t("cashier")}: {s.cashier}</div>
      <div>{t("orderType")}: {t(s.order_type as "dine_in" | "takeaway" | "delivery")}</div>
      {s.status !== "completed" && <div className="font-bold text-destructive">*** {t(s.status as "refunded")} ***</div>}
      <div className="border-t border-dashed my-2" />
      {s.sale_items.map((i) => (
        <div key={i.id} className="flex justify-between gap-2">
          <span className="flex items-center gap-2">{i.img && <img src={i.img} alt="" className="print:hidden h-8 w-8 rounded-md object-cover" />}{Number(i.qty)} × {lang === "ar" ? i.name_ar : i.name_en}</span>
          <span>{money(Number(i.line_total))}</span>
        </div>
      ))}
      <div className="border-t border-dashed my-2" />
      <Row k={t("subtotal")} v={money(Number(s.subtotal))} />
      {Number(s.discount) > 0 && <Row k={t("discount")} v={"-" + money(Number(s.discount))} />}
      {Number(s.tax) > 0 && <Row k={t("tax")} v={money(Number(s.tax))} />}
      {s.order_type === "delivery" && <Row k={t("deliveryFee")} v={money(Number(s.delivery_fee))} />}
      <div className="font-bold text-sm"><Row k={t("total")} v={money(Number(s.total))} /></div>
      {s.customer_id && <Row k={t("customer")} v={s.customer?.name ?? "—"} />}
      {s.customer_id && Number(s.amount_due) > 0 && <>
        <Row k={t("outstanding")} v={money(Number(s.amount_due))} />
        {s.due_date && <Row k={t("dueDate")} v={fmtDate(s.due_date, false)} />}
        {s.customer && <Row k={t("balance")} v={money(s.customer.balance)} />}
      </>}
      {s.payments.map((p) => <div key={p.id}><Row k={pmName(p.method)} v={money(Number(p.amount))} />{p.reference && <div className="print:hidden break-all text-muted-foreground">{p.reference}</div>}{p.proof_path && <div className="print:hidden my-2"><PaymentProofImage path={p.proof_path} /></div>}</div>)}
      <Row k={t("received")} v={money(Number(s.paid))} />
      <Row k={t("change")} v={money(Number(s.change_due))} />
      {s.notes && <div className="mt-1">{t("notes")}: {s.notes}</div>}
      {s.delivery_address && <div>{t("address")}: {s.delivery_address}</div>}
      {s.customer_phone && <div>{t("phone")}: {s.customer_phone}</div>}
      {s.refund_reason && <div className="print:hidden">{t("reason")}: {s.refund_reason}</div>}
      <div className="border-t border-dashed my-2" />
      <div className="text-center">{st?.receipt_footer}</div>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span>{k}</span><span>{v}</span></div>;
}
