import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ICE LAND — Point of Sale & Store Management" },
      { name: "description", content: "Sell, track and understand your ICE LAND ice cream store in one place." },
      { property: "og:title", content: "ICE LAND — Point of Sale & Store Management" },
      { property: "og:description", content: "Sell, track and understand your ICE LAND ice cream store in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { t, lang, setLang } = useI18n();
  return (
    <div className="min-h-screen bg-ice-gradient flex flex-col items-center justify-center gap-8 px-6 text-center">
      <button className="absolute top-4 end-4 text-sm text-muted-foreground" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
        {lang === "ar" ? "English" : "العربية"}
      </button>
      <div className="scale-150"><Logo /></div>
      <h1 className="text-3xl md:text-5xl font-bold max-w-xl mt-6">{t("welcome")}</h1>
      <p className="text-muted-foreground max-w-md">
        {lang === "ar" ? "نقطة بيع سريعة، سجل مبيعات، وإدارة القائمة — في مكان واحد." : "Fast checkout, sales history and menu management — in one place."}
      </p>
      <Button asChild size="lg" className="rounded-full px-10 shadow-pop"><Link to="/dashboard">{t("openApp")}</Link></Button>
    </div>
  );
}
