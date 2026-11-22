import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { getCurrentUser } from "@/lib/app";

export function PaymentProofUpload({ path, onChange, onBusy }: { path: string | undefined; onChange: (path: string) => void; onBusy: (busy: boolean) => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  async function upload(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { toast.error("JPG / PNG / WebP · max 5 MB"); return; }
    setBusy(true); onBusy(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error("Sign in required");
      const next = `${user.id}/${crypto.randomUUID()}.${file.type.split("/")[1]}`;
      const { error } = await supabase.storage.from("payment-proofs").upload(next, file);
      if (error) throw error;
      onChange(next);
    } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); onBusy(false); }
  }
  return <div className="space-y-2"><Input aria-label={t("paymentProof")} disabled={busy} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => upload(e.target.files?.[0])} />{path && <><PaymentProofImage path={path} /><Button size="sm" variant="ghost" disabled={busy} onClick={() => onChange("")}>{t("removeImage")}</Button></>}</div>;
}

export function PaymentProofImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const { t } = useI18n();
  useEffect(() => {
    let active = true;
    supabase.storage.from("payment-proofs").createSignedUrl(path, 300).then(({ data }) => { if (active) setUrl(data?.signedUrl ?? null); });
    return () => { active = false; };
  }, [path]);
  return url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={t("paymentProof")} className="max-h-40 max-w-full rounded-md object-contain" /></a> : <span className="text-muted-foreground text-xs">{t("loading")}</span>;
}