import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n, type TKey } from "@/lib/i18n";
import { useFmt, useSettings } from "@/lib/app";
import { fifoAllocate, type UnpaidInvoice } from "@/lib/credit";
import { PaymentProofUpload, PaymentProofImage } from "@/components/PaymentProof";

export function ReceivePaymentDialog({ customerId, customerName, balance, creditEnabled, unpaid, onClose, onDone }: {
  customerId: string;
  customerName: string;
  balance: number;
  creditEnabled: boolean;
  unpaid: UnpaidInvoice[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t, lang } = useI18n();
  const { money } = useFmt();
  const settings = useSettings();
  const methods = ((settings?.payment_methods as { code: string; ar: string; en: string; active: boolean }[] | undefined) ?? [])
    .filter((m) => m.active && m.code !== "deferred");
  const [amount, setAmount] = useState(balance);
  const [method, setMethod] = useState(methods[0]?.code ?? "cash");
  const [reference, setReference] = useState("");
  const [proof, setProof] = useState<string | undefined>(undefined);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const key = useMemo(() => crypto.randomUUID(), []);

  const alloc = useMemo(() => fifoAllocate(amount, unpaid), [amount, unpaid]);
  const covered = alloc.reduce((s, a) => s + a.amount, 0);

  async function save() {
    if (amount <= 0 || busy || uploading) return;
    setBusy(true);
    const { error } = await supabase.rpc("receive_customer_payment", {
      p_idempotency_key: key,
      p_customer_id: customerId,
      p_amount: amount,
      p_method: method,
      p_reference: reference,
      p_proof_path: proof ?? "",
      p_notes: notes,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("saved")); onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t("receivePayment")} — {customerName}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-2xl bg-ice p-3 text-sm flex justify-between"><span>{t("currentBalance")}</span><b className="tabular">{money(balance)}</b></div>
          <div className="space-y-1"><Label>{t("amount")}</Label><Input type="number" min={0} step="0.01" value={amount || ""} onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))} /></div>
          <div className="space-y-1"><Label>{t("method")}</Label>
            <select className="h-10 w-full rounded-md border bg-background px-2" value={method} onChange={(e) => setMethod(e.target.value)}>
              {methods.map((m) => <option key={m.code} value={m.code}>{m.code === "cash" ? t("cash") : m.code === "transfer" ? t("transfer") : (lang === "ar" ? m.ar : m.en)}</option>)}
            </select>
          </div>
          <div className="space-y-1"><Label>{t("paymentReference")}</Label><Input maxLength={150} value={reference} onChange={(e) => setReference(e.target.value)} /></div>
          <div className="space-y-1"><Label>{t("paymentProof")}</Label><PaymentProofUpload path={proof} onChange={setProof} onBusy={setUploading} /></div>
          <div className="space-y-1"><Label>{t("notes")}</Label><Textarea rows={2} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

          {alloc.length > 0 && (
            <div className="rounded-2xl border p-3 space-y-1 text-sm">
              <div className="font-semibold mb-1">{t("allocation")} ({t("fifo")})</div>
              {alloc.map((a) => {
                const inv = unpaid.find((i) => i.sale_id === a.sale_id);
                return <div key={a.sale_id} className="flex justify-between"><span dir="ltr" className="font-mono text-xs">{inv?.invoice_no}</span><span className="tabular">{money(a.amount)}</span></div>;
              })}
              {covered < amount && <div className="text-xs text-muted-foreground pt-1">{t("unallocated")}: {money(amount - covered)}</div>}
            </div>
          )}

          <Button className="w-full h-11" disabled={busy || uploading || amount <= 0} onClick={save}>{busy ? t("loading") : t("save")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
