import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Mail, Key, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { useI18n } from "@/lib/i18n";
import { signIn, requestPasswordReset, resetPasswordWithToken, errMsg } from "@/lib/app";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — ICE LAND" },
      { name: "description", content: "Sign in to the ICE LAND store system." },
      { property: "og:title", content: "Sign in — ICE LAND" },
      { property: "og:description", content: "Sign in to the ICE LAND store system." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t, lang, setLang } = useI18n();
  const nav = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, string | boolean | undefined>;
  const token = search["token"] as string | undefined;
  const hasToken = !!token;
  const isRequestMode = search["reset"] as boolean | undefined;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"login" | "request" | "reset">(
    hasToken ? "reset" : "login"
  );

  async function doLogin() {
    setBusy(true);
    try {
      await signIn(email, password);
      nav({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(errMsg(err, lang));
    } finally { setBusy(false); }
  }

  async function doRequest() {
    setBusy(true);
    try {
      await requestPasswordReset(email);
      toast.success(t("resetSent"));
      // The console will show the reset link (fake email in local mode).
    } catch (err) { toast.error(errMsg(err, lang)); }
    finally { setBusy(false); }
  }

  async function doReset() {
    setBusy(true);
    try {
      if (password !== confirmPassword) { toast.error(t("passwordMismatch")); return; }
      await resetPasswordWithToken(token!, password);
      toast.success(t("resetDone"));
      nav({ to: "/dashboard" });
    } catch (err) { toast.error(errMsg(err, lang)); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen bg-ice-gradient grid place-items-center p-4">
      <div className="w-full max-w-md bg-card rounded-3xl shadow-soft p-8 space-y-6">
        <div className="flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <button className="text-sm text-muted-foreground" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
              {lang === "ar" ? "English" : "العربية"}
            </button>
            {mode !== "login" && <button className="text-sm text-muted-foreground" onClick={() => setMode("login")}><ArrowLeft className="h-4 w-4" /></button>}
          </div>
        </div>

        {mode === "login" && (
          <>
            <div className="flex items-center gap-2">
              <UserRound className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold">{t("signIn")}</h1>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); doLogin(); }} className="space-y-4">
              <div className="space-y-1.5"><Label>{t("username")}</Label><Input type="email" required dir="ltr" placeholder="your-username" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>{t("password")}</Label><Input type="password" required minLength={8} dir="ltr" placeholder="Minimum 8 characters, uppercase + digit" value={password} onChange={(e) => setPassword(e.target.value)} />
                <p className="text-xs text-muted-foreground">{lang === "ar" ? "8+ أحرف، حرف كبير ورقم" : "8+ chars, uppercase and digit"}</p>
              </div>
              <Button type="submit" className="w-full rounded-xl h-11" disabled={busy}>{busy ? t("loading") : t("signIn")}</Button>
            </form>
            <div className="flex flex-col items-center gap-2">
              <Button type="button" variant="link" onClick={() => setMode("request")}>{t("forgotPassword")}</Button>
              <p className="text-xs text-muted-foreground text-center">{t("adminCreatesAccounts")}</p>
            </div>
          </>
        )}

        {mode === "request" && (
          <>
            <div className="flex items-center gap-2">
              <Mail className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold">{t("resetPassword")}</h1>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); doRequest(); }} className="space-y-4">
              <div className="space-y-1.5"><Label>{t("username")}</Label><Input type="email" required dir="ltr" placeholder="your-username" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <Button type="submit" className="w-full rounded-xl h-11" disabled={busy}>{t("requestReset")}</Button>
            </form>
            <div className="flex justify-center"><Button type="button" variant="ghost" onClick={() => setMode("login")}>{t("backToLogin")}</Button></div>
          </>
        )}

        {mode === "reset" && (
          <>
            <div className="flex items-center gap-2">
              <Key className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold">{t("resetPassword")}</h1>
            </div>
            {hasToken && (
              <form onSubmit={(e) => { e.preventDefault(); doReset(); }} className="space-y-4">
                <div className="space-y-1.5"><Label>{t("newPassword")}</Label><Input type="password" required minLength={8} dir="ltr" placeholder="Minimum 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>{t("confirmNewPassword")}</Label><Input type="password" required minLength={8} dir="ltr" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></div>
                <Button type="submit" className="w-full rounded-xl h-11" disabled={busy}>{busy ? t("loading") : t("resetPassword")}</Button>
              </form>
            )}
            <div className="flex justify-center"><Button type="button" variant="ghost" onClick={() => setMode("login")}>{t("backToLogin")}</Button></div>
          </>
        )}
      </div>
    </div>
  );
}
