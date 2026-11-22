import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, ShoppingCart, Receipt, IceCreamCone, LogOut, Languages, Package, Users, Settings, History, UserRound, Wallet, ShieldAlert } from "lucide-react";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, SidebarHeader, SidebarFooter, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Logo, LogoMark } from "./Logo";
import { useI18n, type TKey } from "@/lib/i18n";
import { useMe, type Role, signOut } from "@/lib/app";

const NAV: { to: string; k: TKey; icon: typeof LayoutDashboard; roles: Role[] }[] = [
  { to: "/dashboard", k: "dashboard", icon: LayoutDashboard, roles: ["admin", "manager", "accountant"] },
  { to: "/pos", k: "pos", icon: ShoppingCart, roles: ["admin", "manager", "cashier"] },
  { to: "/sales", k: "sales", icon: Receipt, roles: ["admin", "manager", "cashier", "accountant"] },
  { to: "/customers", k: "customers", icon: UserRound, roles: ["admin", "manager", "accountant"] },
  { to: "/receivables", k: "receivables", icon: Wallet, roles: ["admin", "manager", "accountant"] },
  { to: "/products", k: "products", icon: IceCreamCone, roles: ["admin", "manager"] },
  { to: "/inventory", k: "inventory", icon: Package, roles: ["admin", "manager"] },
  { to: "/cashiers", k: "cashierReport", icon: Users, roles: ["admin", "manager", "accountant"] },
  { to: "/settings", k: "settings", icon: Settings, roles: ["admin"] },
  { to: "/audit", k: "audit", icon: History, roles: ["admin", "manager", "accountant"] },
  { to: "/users", k: "users", icon: ShieldAlert, roles: ["admin"] },
];

function Nav() {
  const { t, dir } = useI18n();
  const { has } = useMe();
  const { state } = useSidebar();
  const path = useRouterState({ select: (r) => r.location.pathname });
  return (
    <Sidebar collapsible="icon" side={dir === "rtl" ? "right" : "left"}>
      <SidebarHeader className="p-4">{state === "collapsed" ? <LogoMark className="h-8 w-8" /> : <Logo light />}</SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.filter((n) => has(...n.roles)).map((n) => (
                <SidebarMenuItem key={n.to}>
                  <SidebarMenuButton asChild isActive={path.startsWith(n.to)} tooltip={t(n.k)} className="h-11 rounded-xl">
                    <Link to={n.to}><n.icon className="h-5 w-5" /><span>{t(n.k)}</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  );
}

export function AppShell() {
  const { t, lang, setLang } = useI18n();
  const { data, roles } = useMe();
  const qc = useQueryClient();
  const nav = useNavigate();
  async function signOutUser() {
    await qc.cancelQueries();
    qc.clear();
    await signOut();
    nav({ to: "/auth", replace: true });
  }
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <Nav />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-2 border-b bg-card/80 backdrop-blur px-3 sticky top-0 z-20">
            <SidebarTrigger />
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
              <Languages className="h-4 w-4" />{lang === "ar" ? "English" : "العربية"}
            </Button>
            <div className="hidden sm:block text-end text-xs leading-tight">
              <div className="font-semibold">{data?.profile?.full_name || data?.user.email}</div>
              <div className="text-muted-foreground">{roles.map((r) => t(`role_${r}` as TKey)).join("، ")}</div>
            </div>
            <Button variant="ghost" size="icon" onClick={signOutUser} aria-label={t("signOut")}><LogOut className="h-4 w-4" /></Button>
          </header>
          <main className="flex-1 p-4 md:p-6 min-w-0"><Outlet /></main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export function RequireRole({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { has, isLoading } = useMe();
  const { t } = useI18n();
  if (isLoading) return <div className="p-8 text-muted-foreground">{t("loading")}</div>;
  if (!has(...roles)) return <div className="p-8 text-center text-muted-foreground">{t("noAccess")}</div>;
  return <>{children}</>;
}

export function PageTitle({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
      <h1 className="text-2xl md:text-3xl font-bold">{children}</h1>
      {actions}
    </div>
  );
}
