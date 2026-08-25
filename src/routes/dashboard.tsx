import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Instagram,
  Plus,
  Calendar as CalendarIcon,
  CheckCircle2,
  Layers,
  ChevronRight,
  ChevronDown,
  Clock,
  AlertCircle,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Painel de Controle — Reelary" }] }),
  component: () => (
    <AppShell>
      <DashboardPage />
    </AppShell>
  ),
});

interface Account {
  id: string;
  username: string;
  category_id: string | null;
  account_categories: { id: string; name: string; color: string } | null;
}

interface Post {
  id: string;
  caption: string;
  video_url: string;
  cover_url: string | null;
  scheduled_at: string;
  status: "pending" | "published" | "failed";
  instagram_account_id: string;
  instagram_accounts: { username: string } | null;
}

function DashboardPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [scheduledPending, setScheduledPending] = useState(0);
  const [totalPublished, setTotalPublished] = useState(0);
  const [totalFailed, setTotalFailed] = useState(0);
  const [upcomingPosts, setUpcomingPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const navigate = useNavigate();

  async function loadData() {
    try {
      // 1. Fetch instagram accounts - only visible (non-hidden) ones!
      const { data: accs, error: accsErr } = await supabase
        .from("instagram_accounts")
        .select("id, username, category_id, account_categories(id, name, color)")
        .eq("hidden", false)
        .order("created_at", { ascending: false });
      if (accsErr) throw accsErr;

      const loadedAccounts = accs || [];
      setAccounts(loadedAccounts);

      // Pre-fill selectedAccountIds with loaded visible accounts on first load
      setSelectedAccountIds((prev) => {
        if (prev.length === 0) {
          return loadedAccounts.map((a) => a.id);
        }
        return prev.filter((id) => loadedAccounts.some((a) => a.id === id));
      });
    } catch (err: any) {
      console.error("Dashboard error:", err);
      toast.error(err.message || "Erro ao carregar contas do painel");
    }
  }

  async function loadMetricsAndUpcoming(
    accountIds: string[],
    filter: string,
    range: DateRange | undefined,
  ) {
    setLoading(true);
    try {
      const nowStr = new Date().toISOString();
      const { start: filterStart, end: filterEnd } = getFilterDateRange();

      // 1. Pending count query
      let pendingQuery = supabase
        .from("scheduled_posts")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");

      if (accountIds.length > 0) {
        pendingQuery = pendingQuery.in("instagram_account_id", accountIds);
      }
      if (filterStart) {
        pendingQuery = pendingQuery.gte("scheduled_at", filterStart.toISOString());
      }
      if (filterEnd) {
        pendingQuery = pendingQuery.lte("scheduled_at", filterEnd.toISOString());
      }
      const { count: pendingCount, error: pendingErr } = await pendingQuery;
      if (pendingErr) throw pendingErr;
      setScheduledPending(pendingCount || 0);

      // 2. Published count query
      let publishedQuery = supabase
        .from("scheduled_posts")
        .select("*", { count: "exact", head: true })
        .eq("status", "published");

      if (accountIds.length > 0) {
        publishedQuery = publishedQuery.in("instagram_account_id", accountIds);
      }
      if (filterStart) {
        publishedQuery = publishedQuery.gte("scheduled_at", filterStart.toISOString());
      }
      if (filterEnd) {
        publishedQuery = publishedQuery.lte("scheduled_at", filterEnd.toISOString());
      }
      const { count: publishedCount, error: publishedErr } = await publishedQuery;
      if (publishedErr) throw publishedErr;
      setTotalPublished(publishedCount || 0);

      // 3. Failed count query
      let failedQuery = supabase
        .from("scheduled_posts")
        .select("*", { count: "exact", head: true })
        .eq("status", "failed");

      if (accountIds.length > 0) {
        failedQuery = failedQuery.in("instagram_account_id", accountIds);
      }
      if (filterStart) {
        failedQuery = failedQuery.gte("scheduled_at", filterStart.toISOString());
      }
      if (filterEnd) {
        failedQuery = failedQuery.lte("scheduled_at", filterEnd.toISOString());
      }
      const { count: failedCount, error: failedErr } = await failedQuery;
      if (failedErr) throw failedErr;
      setTotalFailed(failedCount || 0);

      // 4. Upcoming posts query
      let upcomingQuery = supabase
        .from("scheduled_posts")
        .select(
          "id, caption, video_url, cover_url, scheduled_at, status, instagram_account_id, instagram_accounts(username)",
        )
        .eq("status", "pending")
        .gt("scheduled_at", nowStr)
        .order("scheduled_at", { ascending: true })
        .limit(3);

      if (accountIds.length > 0) {
        upcomingQuery = upcomingQuery.in("instagram_account_id", accountIds);
      }
      const { data: upcomingData, error: upcomingErr } = await upcomingQuery;
      if (upcomingErr) throw upcomingErr;
      setUpcomingPosts((upcomingData as any) || []);
    } catch (err: any) {
      console.error("Metrics load error:", err);
      toast.error("Erro ao atualizar métricas do painel");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();

    // Listen to changes (e.g. if account is added/removed)
    const handleSync = () => {
      loadData();
    };
    window.addEventListener("active-account-changed", handleSync);
    return () => window.removeEventListener("active-account-changed", handleSync);
  }, []);

  useEffect(() => {
    if (accounts.length > 0) {
      loadMetricsAndUpcoming(selectedAccountIds, dateFilter, dateRange);
    }
  }, [accounts, selectedAccountIds, dateFilter, dateRange]);

  // Compute date range for filtering
  const getFilterDateRange = () => {
    const now = new Date();
    const start = new Date();
    const end = new Date();

    if (dateFilter === "today") {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    } else if (dateFilter === "yesterday") {
      start.setDate(now.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(now.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    } else if (dateFilter === "7d") {
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    } else if (dateFilter === "30d") {
      start.setDate(now.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    } else if (dateFilter === "custom" && dateRange?.from) {
      const s = new Date(dateRange.from);
      s.setHours(0, 0, 0, 0);
      const e = dateRange.to ? new Date(dateRange.to) : new Date(dateRange.from);
      e.setHours(23, 59, 59, 999);
      return { start: s, end: e };
    }
    return { start: null, end: null };
  };

  const totalAccounts = accounts.length;

  // Dynamic titles based on selected filter
  const getScheduledCardTitle = () => {
    if (dateFilter === "today") return "Reels Agendados (Hoje)";
    if (dateFilter === "yesterday") return "Reels Agendados (Ontem)";
    if (dateFilter === "7d") return "Reels Agendados (7d)";
    if (dateFilter === "30d") return "Reels Agendados (30d)";
    if (dateFilter === "custom") return "Reels Agendados (Período)";
    return "Reels Agendados";
  };

  const getPublishedCardTitle = () => {
    if (dateFilter === "today") return "Reels Publicados (Hoje)";
    if (dateFilter === "yesterday") return "Reels Publicados (Ontem)";
    if (dateFilter === "7d") return "Reels Publicados (7d)";
    if (dateFilter === "30d") return "Reels Publicados (30d)";
    if (dateFilter === "custom") return "Reels Publicados (Período)";
    return "Reels Publicados";
  };

  const getScheduledLabel = () => {
    if (dateFilter === "today") return "reels hoje";
    if (dateFilter === "yesterday") return "reels ontem";
    if (dateFilter === "7d") return "reels em 7 dias";
    if (dateFilter === "30d") return "reels em 30 dias";
    return "reels agendados";
  };

  return (
    <div className="space-y-8">
      {/* Header com Filtro */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Painel Geral</h1>
          <p className="text-muted-foreground mt-1">
            Acompanhe as métricas de postagem dos seus Reels.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* Filtro por Conta */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground font-medium shrink-0">Conta:</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="border-border/60 bg-card hover:bg-secondary rounded-xl text-xs font-semibold h-10 gap-2 cursor-pointer w-48 justify-between"
                >
                  <span className="truncate">
                    {selectedAccountIds.length === accounts.length
                      ? "Todas as contas"
                      : selectedAccountIds.length === 0
                        ? "Nenhuma conta"
                        : `${selectedAccountIds.length} selecionada(s)`}
                  </span>
                  <ChevronDown className="size-3 text-muted-foreground shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-card border border-border/60">
                <DropdownMenuLabel className="text-xs text-muted-foreground font-semibold flex items-center justify-between">
                  <span>Selecionar Contas</span>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAccountIds(accounts.map((a) => a.id));
                      }}
                      className="text-[10px] text-primary hover:underline font-bold cursor-pointer"
                    >
                      Todas
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAccountIds([]);
                      }}
                      className="text-[10px] text-destructive hover:underline font-bold cursor-pointer"
                    >
                      Limpar
                    </button>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {accounts.map((a) => {
                  const isChecked = selectedAccountIds.includes(a.id);
                  return (
                    <DropdownMenuCheckboxItem
                      key={a.id}
                      checked={isChecked}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedAccountIds((prev) => [...prev, a.id]);
                        } else {
                          setSelectedAccountIds((prev) => prev.filter((id) => id !== a.id));
                        }
                      }}
                      onSelect={(e) => e.preventDefault()}
                      className="cursor-pointer font-medium text-xs py-2"
                    >
                      <span className="flex items-center gap-2">
                        {a.account_categories && (
                          <span
                            className="size-2.5 rounded-full shrink-0 ring-1 ring-white/10"
                            style={{ backgroundColor: a.account_categories.color }}
                          />
                        )}
                        @{a.username}
                      </span>
                    </DropdownMenuCheckboxItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Filtro por Período */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground font-medium shrink-0">Período:</span>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-48 bg-card border-border/60 rounded-xl h-10 font-medium">
                <SelectValue placeholder="Qualquer período" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border/60">
                <SelectItem value="all" className="cursor-pointer">
                  Qualquer período
                </SelectItem>
                <SelectItem value="today" className="cursor-pointer">
                  Hoje
                </SelectItem>
                <SelectItem value="yesterday" className="cursor-pointer">
                  Ontem
                </SelectItem>
                <SelectItem value="7d" className="cursor-pointer">
                  Últimos 7 dias
                </SelectItem>
                <SelectItem value="30d" className="cursor-pointer">
                  Últimos 30 dias
                </SelectItem>
                <SelectItem value="custom" className="cursor-pointer">
                  Personalizado...
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Calendário para Período Personalizado */}
      {dateFilter === "custom" && (
        <div className="flex flex-col md:flex-row items-start gap-6 p-5 rounded-2xl border border-border/40 bg-card/25 backdrop-blur-sm shadow-card animate-in slide-in-from-top-2 duration-300">
          <div className="space-y-3 shrink-0">
            <h3 className="text-sm font-bold text-foreground">Intervalo de datas</h3>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-[200px]">
              Selecione o dia inicial e o dia final clicando diretamente no calendário para filtrar
              as métricas do painel.
            </p>
            {dateRange?.from && (
              <div className="p-3 rounded-xl bg-secondary/40 border border-border/40 space-y-1">
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-muted-foreground block">
                  Período selecionado:
                </span>
                <span className="text-xs font-bold text-primary">
                  {dateRange.from.toLocaleDateString("pt-BR")}
                  {dateRange.to
                    ? ` — ${dateRange.to.toLocaleDateString("pt-BR")}`
                    : " (Clique no dia de término)"}
                </span>
              </div>
            )}
          </div>

          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={setDateRange}
            className="rounded-xl border border-border/40 bg-card p-3"
          />
        </div>
      )}

      {loading ? (
        <div className="grid gap-6 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 rounded-2xl bg-card border border-border/50 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <>
          {/* Métricas */}
          <div className="grid gap-6 md:grid-cols-3">
            {/* Card 1: Agendados pro Dia/Período */}
            <div className="rounded-2xl border border-border/50 bg-card/45 p-6 shadow-card hover:bg-card/75 transition relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition duration-300">
                <CalendarIcon className="size-20 text-primary" />
              </div>
              <div className="flex items-center gap-3 text-muted-foreground text-sm font-semibold mb-3">
                <div className="size-8 rounded-lg bg-primary/10 grid place-items-center text-primary">
                  <CalendarIcon className="size-4" />
                </div>
                {getScheduledCardTitle()}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-extrabold text-gradient-brand">
                  {scheduledPending}
                </span>
                <span className="text-xs text-muted-foreground">{getScheduledLabel()}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
                Prontos para postagem automática nas próximas horas.
              </p>
            </div>

            {/* Card 2: Já Postados */}
            <div className="rounded-2xl border border-border/50 bg-card/45 p-6 shadow-card hover:bg-card/75 transition relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition duration-300">
                <CheckCircle2 className="size-20 text-success" />
              </div>
              <div className="flex items-center gap-3 text-muted-foreground text-sm font-semibold mb-3">
                <div className="size-8 rounded-lg bg-success/10 grid place-items-center text-success">
                  <CheckCircle2 className="size-4" />
                </div>
                {getPublishedCardTitle()}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-extrabold text-success">{totalPublished}</span>
                <span className="text-xs text-muted-foreground">publicados com sucesso</span>
              </div>
              <p className="text-xs text-muted-foreground mt-4 leading-relaxed flex items-center gap-1">
                {totalFailed > 0 ? (
                  <span className="text-destructive font-semibold flex items-center gap-1">
                    <AlertCircle className="size-3.5 inline text-destructive shrink-0" />{" "}
                    {totalFailed} falhas registradas
                  </span>
                ) : (
                  <span>Sem falhas de publicação.</span>
                )}
              </p>
            </div>

            {/* Card 3: Contas Conectadas */}
            <div className="rounded-2xl border border-border/50 bg-card/45 p-6 shadow-card hover:bg-card/75 transition relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition duration-300">
                <Instagram className="size-20 text-accent" />
              </div>
              <div className="flex items-center gap-3 text-muted-foreground text-sm font-semibold mb-3">
                <div className="size-8 rounded-lg bg-accent/10 grid place-items-center text-accent">
                  <Instagram className="size-4" />
                </div>
                Contas Conectadas
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-extrabold text-accent">{totalAccounts}</span>
                <span className="text-xs text-muted-foreground">perfis ativos</span>
              </div>
              <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
                Todas gerenciadas a partir de um único painel.
              </p>
            </div>
          </div>

          {/* Seção Inferior: Próximas Postagens e Ações */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Próximos Reels */}
            <div className="lg:col-span-2 rounded-2xl border border-border/50 bg-card/30 p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <Clock className="size-5 text-primary" /> Próximas Publicações
                  </h3>
                  <Link
                    to="/calendar"
                    className="text-xs text-primary hover:underline font-semibold flex items-center gap-0.5"
                  >
                    Ver calendário completo <ChevronRight className="size-3" />
                  </Link>
                </div>

                {upcomingPosts.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-border/60 rounded-xl bg-card/10">
                    <p className="text-muted-foreground text-sm">
                      Nenhum Reel agendado para o futuro.
                    </p>
                    <Link to="/calendar" className="inline-block mt-4">
                      <Button
                        size="sm"
                        className="bg-gradient-brand text-primary-foreground border-0"
                      >
                        Agendar Primeiro Reel
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {upcomingPosts.map((p) => (
                      <div
                        key={p.id}
                        className="flex gap-4 p-3 rounded-xl bg-card/65 border border-border/40 hover:bg-card/90 transition shadow-sm"
                      >
                        {p.video_url ? (
                          <video
                            src={p.video_url}
                            className="size-16 rounded-lg object-cover bg-background shrink-0"
                            muted
                            preload="metadata"
                          />
                        ) : (
                          <div
                            className="size-16 rounded-lg bg-secondary/60 flex flex-col items-center justify-center shrink-0 border border-border/40 shadow-inner gap-1"
                            title="Vídeo removido para economizar espaço"
                          >
                            <span className="text-[8px] text-muted-foreground/80 font-bold">
                              Limpo
                            </span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1 flex flex-col justify-between py-0.5">
                          <div>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-bold text-primary flex items-center gap-1.5">
                                @{p.instagram_accounts?.username || "instagram"}
                              </span>
                              <span className="text-muted-foreground">•</span>
                              <span className="text-muted-foreground">
                                {new Date(p.scheduled_at).toLocaleString("pt-BR", {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })}
                              </span>
                            </div>
                            <p className="text-sm font-medium mt-1 truncate text-foreground/90">
                              {p.caption || (
                                <span className="text-muted-foreground italic">Sem legenda</span>
                              )}
                            </p>
                          </div>
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-warning bg-warning/10 border border-warning/20 px-2 py-0.5 rounded-full max-w-max">
                            <Clock className="size-2.5 animate-pulse" /> Agendado
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {upcomingPosts.length > 0 && (
                <div className="pt-4 border-t border-border/40 mt-4 flex justify-end">
                  <Link to="/calendar">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground text-xs font-semibold"
                    >
                      Gerenciar Agendamentos ({scheduledPending}) →
                    </Button>
                  </Link>
                </div>
              )}
            </div>

            {/* Ações Rápidas */}
            <div className="rounded-2xl border border-border/50 bg-gradient-brand/5 p-6 flex flex-col justify-between shadow-card">
              <div className="space-y-4">
                <div className="size-12 rounded-xl bg-gradient-brand grid place-items-center">
                  <Sparkles className="size-6 text-primary-foreground" />
                </div>
                <h3 className="font-extrabold text-xl">Agendamento Automático</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Agende novos Reels adicionando arquivos de vídeo locais, legendas personalizadas e
                  escolhendo o dia e hora exatos de postagem.
                </p>
              </div>

              <div className="space-y-3 mt-8">
                {totalAccounts > 0 ? (
                  <Link to="/calendar" className="block w-full">
                    <Button className="w-full bg-gradient-brand text-primary-foreground border-0 shadow-glow font-bold h-11 hover:opacity-95">
                      <Plus className="size-4 mr-2" /> Agendar Novo Reel
                    </Button>
                  </Link>
                ) : (
                  <Link to="/accounts" className="block w-full">
                    <Button className="w-full bg-gradient-brand text-primary-foreground border-0 shadow-glow font-bold h-11 hover:opacity-95">
                      <Instagram className="size-4 mr-2" /> Conectar Conta
                    </Button>
                  </Link>
                )}

                <Link to="/accounts" className="block w-full">
                  <Button
                    variant="outline"
                    className="w-full border-border hover:bg-secondary h-11 font-semibold text-sm rounded-xl"
                  >
                    Ver Contas Vinculadas
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
