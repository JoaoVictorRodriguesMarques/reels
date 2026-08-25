import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Calendar,
  LayoutDashboard,
  LogOut,
  Sparkles,
  Plus,
  Menu,
  ChevronLeft,
  ChevronRight,
  Instagram,
  Check,
  UserCircle2,
  ChevronDown,
  Settings,
  Layers,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/use-auth";
import { useEffect, useState, type ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

interface Account {
  id: string;
  username: string;
  category_id: string | null;
  account_categories: { id: string; name: string; color: string } | null;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { location } = useRouterState();

  // Collapsed state
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sidebar_collapsed") === "true";
    }
    return false;
  });

  // Accounts state
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccount, setActiveAccount] = useState<Account | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  // Load Instagram Accounts & Selected Active Account
  const loadAccounts = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("instagram_accounts")
        .select("id, username, category_id, account_categories(id, name, color)")
        .eq("hidden", false)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const list = (data as any) || [];
      setAccounts(list);

      const storedId = localStorage.getItem("active_ig_account_id");
      let active = list.find((a: Account) => a.id === storedId);

      if (!active && list.length > 0) {
        active = list[0];
        localStorage.setItem("active_ig_account_id", list[0].id);
      }

      setActiveAccount(active || null);
    } catch (err) {
      console.error("Error loading accounts in AppShell:", err);
    }
  };

  useEffect(() => {
    loadAccounts();

    // Listen for external updates to the active account
    const handleActiveAccountChange = () => {
      loadAccounts();
    };

    window.addEventListener("active-account-changed", handleActiveAccountChange);
    return () => {
      window.removeEventListener("active-account-changed", handleActiveAccountChange);
    };
  }, [user]);

  const selectActiveAccount = (account: Account) => {
    localStorage.setItem("active_ig_account_id", account.id);
    setActiveAccount(account);
    window.dispatchEvent(new Event("active-account-changed"));
    toast.success(`Conta ativa alterada para @${account.username}`);
  };

  const toggleSidebar = () => {
    const nextState = !collapsed;
    setCollapsed(nextState);
    localStorage.setItem("sidebar_collapsed", String(nextState));
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="relative flex flex-col items-center gap-4">
          <div className="size-12 rounded-2xl bg-gradient-brand grid place-items-center animate-bounce shadow-glow">
            <Sparkles className="size-6 text-primary-foreground" />
          </div>
          <div className="size-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  const navItems = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/calendar", label: "Calendário", icon: Calendar },
    { to: "/bulk", label: "Postar em Massa", icon: Layers },
    { to: "/posts", label: "Excluir Reels", icon: Trash2 },
    { to: "/accounts", label: "Contas", icon: Instagram },
    { to: "/failed", label: "Falhas", icon: AlertTriangle },
    { to: "/settings", label: "Configurações", icon: Settings },
  ];

  return (
    <div className="min-h-screen flex bg-background text-foreground transition-all duration-300">
      {/* Sidebar - Desktop */}
      <aside
        className={`hidden md:flex flex-col border-r border-border/50 bg-card/60 backdrop-blur-xl shrink-0 transition-all duration-300 relative z-30 ${
          collapsed ? "w-20" : "w-64"
        }`}
      >
        {/* Header da Sidebar */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-border/40">
          <Link to="/dashboard" className="flex items-center gap-3 group">
            <div className="size-9 rounded-xl bg-gradient-brand grid place-items-center shadow-glow shrink-0 transition group-hover:scale-105">
              <Sparkles className="size-4.5 text-primary-foreground" />
            </div>
            {!collapsed && (
              <span className="font-display text-lg font-bold tracking-tight text-gradient-brand animate-in fade-in duration-200">
                Reelary
              </span>
            )}
          </Link>

          {!collapsed && (
            <button
              onClick={toggleSidebar}
              className="size-7 rounded-lg hover:bg-secondary grid place-items-center text-muted-foreground hover:text-foreground transition cursor-pointer"
              title="Recolher menu"
            >
              <ChevronLeft className="size-4" />
            </button>
          )}
        </div>

        {/* Botão de Expandir se estiver recolhido */}
        {collapsed && (
          <div className="flex justify-center py-4 border-b border-border/40">
            <button
              onClick={toggleSidebar}
              className="size-8 rounded-lg bg-secondary/80 hover:bg-secondary grid place-items-center text-muted-foreground hover:text-foreground transition cursor-pointer"
              title="Expandir menu"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}

        {/* Menu de Navegação */}
        <nav className="flex-1 px-3 py-6 space-y-1.5">
          {navItems.map((item) => {
            const active = location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 h-11 rounded-xl text-sm font-medium transition-all duration-200 group ${
                  active
                    ? "bg-gradient-brand text-primary-foreground shadow-glow"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/70"
                }`}
              >
                <item.icon
                  className={`size-5 shrink-0 transition-transform group-hover:scale-105 ${active ? "text-primary-foreground" : "text-muted-foreground group-hover:text-primary"}`}
                />
                {!collapsed && (
                  <span className="animate-in fade-in slide-in-from-left-2 duration-200">
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Rodapé da Sidebar (User Profile & Logout) */}
        <div className="p-4 border-t border-border/40 space-y-3 bg-secondary/10">
          <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : "px-2"}`}>
            <UserCircle2 className="size-8 text-muted-foreground shrink-0" />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate text-foreground/95">
                  {user.user_metadata?.full_name || user.email?.split("@")[0]}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
              </div>
            )}
          </div>

          <Button
            variant="ghost"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
            className={`w-full hover:bg-destructive/10 hover:text-destructive text-muted-foreground flex items-center ${
              collapsed ? "justify-center h-10 px-0" : "justify-start px-3 h-10 gap-3"
            }`}
            title="Sair da conta"
          >
            <LogOut className="size-5 shrink-0" />
            {!collapsed && <span>Sair</span>}
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Topbar */}
        <header className="sticky top-0 z-20 h-16 border-b border-border/50 bg-background/80 backdrop-blur-xl flex items-center justify-between px-6">
          {/* Mobile Menu Trigger & Logo */}
          <div className="flex items-center gap-3 md:hidden">
            <Link to="/dashboard" className="flex items-center gap-2">
              <div className="size-8 rounded-lg bg-gradient-brand grid place-items-center shadow-glow">
                <Sparkles className="size-4 text-primary-foreground" />
              </div>
              <span className="font-display font-bold tracking-tight">Reelary</span>
            </Link>
          </div>

          <div className="hidden md:block">
            {/* Espaço ou título da página */}
            <span className="text-xs text-muted-foreground font-medium">
              Calendário profissional de Reels
            </span>
          </div>

          {/* Seletor de Conta do Instagram na Topbar */}
          <div className="flex items-center gap-3">
            {accounts.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 text-xs md:text-sm font-semibold rounded-full px-4 h-9 gap-2 shadow-sm text-foreground flex items-center"
                  >
                    {activeAccount?.account_categories && (
                      <span
                        className="size-2.5 rounded-full shrink-0 ring-1 ring-white/10"
                        style={{ backgroundColor: activeAccount.account_categories.color }}
                      />
                    )}
                    {!activeAccount?.account_categories && (
                      <span className="size-1.5 rounded-full bg-success animate-pulse shrink-0" />
                    )}
                    <span>
                      Estou na conta:{" "}
                      <strong className="text-primary font-bold">@{activeAccount?.username}</strong>
                    </span>
                    <ChevronDown className="size-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 bg-card border border-border/60">
                  <DropdownMenuLabel className="text-xs text-muted-foreground font-medium">
                    Alternar Conta Ativa
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {accounts.map((acc) => (
                    <DropdownMenuItem
                      key={acc.id}
                      onClick={() => selectActiveAccount(acc)}
                      className="flex items-center justify-between py-2.5 cursor-pointer text-sm"
                    >
                      <span className="flex items-center gap-2 font-medium">
                        {acc.account_categories ? (
                          <span
                            className="size-3 rounded-full shrink-0 ring-1 ring-white/10"
                            style={{ backgroundColor: acc.account_categories.color }}
                          />
                        ) : (
                          <Instagram className="size-4 text-primary" />
                        )}
                        <span className="flex flex-col">
                          <span>@{acc.username}</span>
                          {acc.account_categories && (
                            <span
                              className="text-[10px] font-semibold leading-tight"
                              style={{ color: acc.account_categories.color }}
                            >
                              {acc.account_categories.name}
                            </span>
                          )}
                        </span>
                      </span>
                      {activeAccount?.id === acc.id && <Check className="size-4 text-success" />}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => navigate({ to: "/accounts" })}
                    className="py-2 text-center text-xs text-primary hover:underline font-semibold cursor-pointer"
                  >
                    Gerenciar Contas
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate({ to: "/accounts" })}
                className="border-dashed border-muted-foreground/40 text-xs text-muted-foreground rounded-full px-3 h-8.5 gap-1.5"
              >
                <Instagram className="size-3.5" />
                Sem contas conectadas
              </Button>
            )}

            {/* Link de Agendamento Rápido ou Logout Mobile */}
            <div className="md:hidden flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate({ to: "/auth" });
                }}
                className="text-muted-foreground"
                aria-label="Sair"
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          </div>
        </header>

        {/* Mobile Navigation bar */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-16 border-t border-border bg-card/90 backdrop-blur-md flex items-center justify-around px-4">
          {navItems.map((item) => {
            const active = location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex flex-col items-center gap-1 py-1 text-[10px] font-semibold transition ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <item.icon className="size-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Main Content View */}
        <main className="flex-1 px-4 md:px-8 py-8 pb-24 md:pb-8 overflow-y-auto">
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">{children}</div>
        </main>
      </div>
    </div>
  );
}
