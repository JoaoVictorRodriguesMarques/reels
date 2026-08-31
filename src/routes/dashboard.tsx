import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
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
  AlertTriangle,
  ArrowUpRight,
  Sparkles,
  RefreshCw,
  Eye,
  Users,
  Heart,
  TrendingUp,
  ShieldCheck,
  ShieldAlert,
  Search,
  ArrowUpDown,
  Trophy,
  Award,
  Video,
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Painel de Performance & Saúde — Reelary" }] }),
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
  followers_count: number;
  media_count: number;
  total_views: number;
  total_reach: number;
  total_likes: number;
  total_comments: number;
  engagement_rate: number;
  profile_picture_url: string | null;
  health_status: string;
  health_reason: string | null;
  last_health_check_at: string | null;
  metrics_updated_at: string | null;
  account_categories: { id: string; name: string; color: string } | null;
}

interface Post {
  id: string;
  caption: string;
  video_url: string;
  cover_url: string | null;
  scheduled_at: string;
  status: "pending" | "published" | "failed";
  views_count?: number;
  likes_count?: number;
  reach_count?: number;
  is_trial?: boolean;
  instagram_account_id: string;
  instagram_accounts: { username: string } | null;
}

function DashboardPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [scheduledPending, setScheduledPending] = useState(0);
  const [scheduledByAccount, setScheduledByAccount] = useState<Record<string, number>>({});
  const [totalPublished, setTotalPublished] = useState(0);
  const [totalFailed, setTotalFailed] = useState(0);
  const [upcomingPosts, setUpcomingPosts] = useState<Post[]>([]);
  const [topReels, setTopReels] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Sorting & Filtering State for the Leaderboard
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"views" | "scheduled" | "reach" | "followers" | "engagement" | "health">("views");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const navigate = useNavigate();

  // 1. Load All Accounts and Metrics from Supabase
  async function loadData() {
    try {
      const { data: accs, error: accsErr } = await supabase
        .from("instagram_accounts")
        .select(
          "id, username, category_id, followers_count, media_count, total_views, total_reach, total_likes, total_comments, engagement_rate, profile_picture_url, health_status, health_reason, last_health_check_at, metrics_updated_at, account_categories(id, name, color)",
        )
        .eq("hidden", false)
        .order("created_at", { ascending: false });

      if (accsErr) throw accsErr;

      const loadedAccounts = (accs as any) || [];
      setAccounts(loadedAccounts);

      setSelectedAccountIds((prev) => {
        if (prev.length === 0) {
          return loadedAccounts.map((a: Account) => a.id);
        }
        return prev.filter((id) => loadedAccounts.some((a: Account) => a.id === id));
      });
    } catch (err: any) {
      console.error("Dashboard error:", err);
      toast.error(err.message || "Erro ao carregar contas do painel");
    }
  }

  // 2. Load Pending, Published, and Top Posts
  async function loadPostsData(accountIds: string[]) {
    setLoading(true);
    try {
      // 1. Fetch pending posts counts per account (Instant aggregation without 1000-row cutoff)
      const { data: rpcData, error: rpcErr } = await supabase.rpc("get_account_scheduled_counts" as any);

      const countsMap: Record<string, number> = {};
      let totalAllPending = 0;

      if (!rpcErr && rpcData && Array.isArray(rpcData)) {
        rpcData.forEach((row: any) => {
          const c = Number(row.pending_count || 0);
          countsMap[row.instagram_account_id] = c;
          totalAllPending += c;
        });
      } else {
        // Direct query fallback with large limit to bypass default 1000-row PostgREST limit
        const { data: pendingPosts } = await supabase
          .from("scheduled_posts")
          .select("instagram_account_id")
          .eq("status", "pending")
          .limit(50000);

        if (pendingPosts) {
          totalAllPending = pendingPosts.length;
          pendingPosts.forEach((p) => {
            if (p.instagram_account_id) {
              countsMap[p.instagram_account_id] = (countsMap[p.instagram_account_id] || 0) + 1;
            }
          });
        }
      }

      setScheduledPending(totalAllPending);
      setScheduledByAccount(countsMap);

      // 2. Published count
      let publishedQuery = supabase
        .from("scheduled_posts")
        .select("*", { count: "exact", head: true })
        .eq("status", "published");

      if (accountIds.length > 0) {
        publishedQuery = publishedQuery.in("instagram_account_id", accountIds);
      }
      const { count: publishedCount } = await publishedQuery;
      setTotalPublished(publishedCount || 0);

      // 3. Failed count
      let failedQuery = supabase
        .from("scheduled_posts")
        .select("*", { count: "exact", head: true })
        .eq("status", "failed");

      if (accountIds.length > 0) {
        failedQuery = failedQuery.in("instagram_account_id", accountIds);
      }
      const { count: failedCount } = await failedQuery;
      setTotalFailed(failedCount || 0);

      // 4. Upcoming Posts
      const nowStr = new Date().toISOString();
      let upcomingQuery = supabase
        .from("scheduled_posts")
        .select("id, caption, video_url, cover_url, scheduled_at, status, is_trial, instagram_account_id, instagram_accounts(username)")
        .eq("status", "pending")
        .gte("scheduled_at", nowStr)
        .order("scheduled_at", { ascending: true })
        .limit(5);

      if (accountIds.length > 0) {
        upcomingQuery = upcomingQuery.in("instagram_account_id", accountIds);
      }
      const { data: upcomingData } = await upcomingQuery;
      setUpcomingPosts((upcomingData as any) || []);

      // 5. Top Published Reels
      let topQuery = supabase
        .from("scheduled_posts")
        .select("id, caption, video_url, cover_url, scheduled_at, status, views_count, likes_count, reach_count, is_trial, instagram_account_id, instagram_accounts(username)")
        .eq("status", "published")
        .order("views_count", { ascending: false })
        .limit(4);

      if (accountIds.length > 0) {
        topQuery = topQuery.in("instagram_account_id", accountIds);
      }
      const { data: topData } = await topQuery;
      setTopReels((topData as any) || []);
    } catch (err) {
      console.error("Error loading posts metrics:", err);
    } finally {
      setLoading(false);
    }
  }

  // 3. Trigger Live Insights & Health Sync
  async function handleSyncInsights() {
    setSyncing(true);
    toast.info("Consultando Meta Graph API para sincronizar métricas e diagnóstico...");
    try {
      let resultData: any = null;

      try {
        const { data, error } = await supabase.functions.invoke("sync-insights");
        if (error) throw error;
        resultData = data;
      } catch (invokeErr: any) {
        console.warn("supabase.functions.invoke error, trying direct endpoint fetch...", invokeErr);
        const fallbackRes = await fetch("https://mbvjnqaufjykgpjkudju.supabase.co/functions/v1/sync-insights", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1idmpucWF1Zmp5a2dwamt1ZGp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2ODEyNjgsImV4cCI6MjEwMzI1NzI2OH0.DoGk9MP_bgMg0ewqy3ftJFRc67wUwE0EFmukMbi8HKo",
            "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1idmpucWF1Zmp5a2dwamt1ZGp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2ODEyNjgsImV4cCI6MjEwMzI1NzI2OH0.DoGk9MP_bgMg0ewqy3ftJFRc67wUwE0EFmukMbi8HKo",
          },
          body: JSON.stringify({}),
        });

        if (!fallbackRes.ok) {
          const errText = await fallbackRes.text();
          throw new Error(`Falha na resposta do servidor (${fallbackRes.status}): ${errText}`);
        }
        resultData = await fallbackRes.json();
      }

      const count = resultData?.accounts_synced || accounts.length;
      toast.success(`Sincronização concluída! ${count} contas atualizadas.`);
      await loadData();
    } catch (err: any) {
      console.error("Error syncing insights:", err);
      toast.error(err.message || "Erro ao sincronizar dados com o Instagram.");
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (accounts.length > 0) {
      loadPostsData(selectedAccountIds);
    } else {
      setLoading(false);
    }
  }, [accounts, selectedAccountIds]);

  // Compute Aggregates
  const totalViewsSum = useMemo(() => accounts.reduce((acc, a) => acc + (a.total_views || 0), 0), [accounts]);
  const totalReachSum = useMemo(() => accounts.reduce((acc, a) => acc + (a.total_reach || 0), 0), [accounts]);
  const totalFollowersSum = useMemo(() => accounts.reduce((acc, a) => acc + (a.followers_count || 0), 0), [accounts]);
  const avgEngagementRate = useMemo(() => {
    if (accounts.length === 0) return 0;
    const sum = accounts.reduce((acc, a) => acc + Number(a.engagement_rate || 0), 0);
    return Number((sum / accounts.length).toFixed(2));
  }, [accounts]);

  // Health Diagnostics
  const restrictedAccounts = useMemo(() => accounts.filter((a) => a.health_status === "restricted"), [accounts]);
  const expiredAccounts = useMemo(() => accounts.filter((a) => a.health_status === "token_expired"), [accounts]);
  const healthyAccountsCount = useMemo(() => accounts.filter((a) => a.health_status === "healthy").length, [accounts]);

  // Filter and Sort ALL connected accounts
  const filteredAndSortedAccounts = useMemo(() => {
    return accounts
      .filter((a) => {
        const matchesSearch = a.username.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory =
          categoryFilter === "all" || a.category_id === categoryFilter;
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => {
        if (sortBy === "views") return (b.total_views || 0) - (a.total_views || 0);
        if (sortBy === "scheduled") return (scheduledByAccount[b.id] || 0) - (scheduledByAccount[a.id] || 0);
        if (sortBy === "reach") return (b.total_reach || 0) - (a.total_reach || 0);
        if (sortBy === "followers") return (b.followers_count || 0) - (a.followers_count || 0);
        if (sortBy === "engagement") return Number(b.engagement_rate || 0) - Number(a.engagement_rate || 0);
        if (sortBy === "health") {
          const score = (status: string) => (status === "restricted" ? 3 : status === "token_expired" ? 2 : 1);
          return score(b.health_status) - score(a.health_status);
        }
        return 0;
      });
  }, [accounts, searchQuery, sortBy, categoryFilter, scheduledByAccount]);

  // Unique categories for filter
  const categories = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string }>();
    accounts.forEach((a) => {
      if (a.account_categories) {
        map.set(a.account_categories.id, a.account_categories);
      }
    });
    return Array.from(map.values());
  }, [accounts]);

  return (
    <div className="space-y-8 animate-in fade-in-50 duration-300 pb-16">
      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* 1. Header & Quick Actions */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-muted-foreground bg-clip-text text-transparent">
              Painel de Performance & Saúde
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-primary/10 text-primary border border-primary/25">
              <Sparkles className="size-3" /> Live Analytics
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Monitore o ranking de engajamento, alcance e integridade de todas as suas contas conectadas.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            onClick={handleSyncInsights}
            disabled={syncing || accounts.length === 0}
            variant="outline"
            className="border-border/60 hover:bg-secondary/60 h-10 px-4 gap-2 text-xs font-bold rounded-xl shadow-sm transition"
          >
            <RefreshCw className={`size-3.5 text-primary ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando..." : "Sincronizar Métricas & Saúde"}
          </Button>

          <Link to="/schedule">
            <Button className="bg-gradient-brand text-primary-foreground border-0 hover:opacity-90 h-10 px-4 gap-2 text-xs font-bold rounded-xl shadow-glow">
              <Plus className="size-4" /> Novo Reel
            </Button>
          </Link>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* 2. Account Health & Restriction Diagnostic Banner */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      {accounts.length > 0 && (
        <>
          {restrictedAccounts.length > 0 || expiredAccounts.length > 0 ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 md:p-5 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="size-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-destructive">
                      Diagnóstico da Meta: Atenção necessária em {restrictedAccounts.length + expiredAccounts.length} conta(s)
                    </h3>
                    <p className="text-xs text-foreground/80 mt-1 leading-relaxed">
                      {restrictedAccounts.length > 0 && (
                        <span>
                          <strong>{restrictedAccounts.length} conta(s)</strong> com bloqueio temporário de postagem da Meta (API access blocked).{" "}
                        </span>
                      )}
                      {expiredAccounts.length > 0 && (
                        <span>
                          <strong>{expiredAccounts.length} conta(s)</strong> com token expirado aguardando reconexão.
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <Link to="/accounts">
                  <Button size="sm" variant="destructive" className="text-xs h-8 font-bold rounded-lg shrink-0">
                    Gerenciar Contas
                  </Button>
                </Link>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {restrictedAccounts.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-destructive/20 text-destructive border border-destructive/30"
                  >
                    🔴 @{a.username}: Restrição temporária da Meta
                  </span>
                ))}
                {expiredAccounts.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-warning/20 text-warning border border-warning/30"
                  >
                    ⚠️ @{a.username}: Sessão expirada
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 shadow-sm flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="size-4 text-emerald-400 shrink-0" />
                <span className="text-xs font-semibold text-emerald-400">
                  Todas as {accounts.length} contas conectadas estão <strong>100% Saudáveis e Operacionais</strong> junto à Meta.
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground hidden sm:inline">
                API Meta Status: 200 OK
              </span>
            </div>
          )}
        </>
      )}

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* 3. Global KPI Cards (Summary) */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Total Views */}
        <div className="rounded-2xl border border-border/50 bg-card/60 p-5 backdrop-blur-sm shadow-card flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Visualizações Totais</span>
            <div className="size-8 rounded-xl bg-primary/10 text-primary grid place-items-center">
              <Eye className="size-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground">
              {totalViewsSum.toLocaleString("pt-BR")}
            </div>
            <span className="text-[11px] text-muted-foreground font-medium mt-1 flex items-center gap-1">
              <TrendingUp className="size-3 text-emerald-400" /> Todas as contas
            </span>
          </div>
        </div>

        {/* Total Scheduled Reels */}
        <div className="rounded-2xl border border-primary/30 bg-primary/[0.04] p-5 backdrop-blur-sm shadow-card flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-primary">Reels Agendados</span>
            <div className="size-8 rounded-xl bg-primary/15 text-primary grid place-items-center shadow-glow">
              <CalendarIcon className="size-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-extrabold tracking-tight text-primary">
              {scheduledPending.toLocaleString("pt-BR")}
            </div>
            <span className="text-[11px] text-muted-foreground font-medium mt-1 flex items-center gap-1">
              <Clock className="size-3 text-primary" /> Total na fila de disparo
            </span>
          </div>
        </div>

        {/* Total Reach */}
        <div className="rounded-2xl border border-border/50 bg-card/60 p-5 backdrop-blur-sm shadow-card flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Alcance Consolidado</span>
            <div className="size-8 rounded-xl bg-purple-500/10 text-purple-400 grid place-items-center">
              <Users className="size-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground">
              {totalReachSum.toLocaleString("pt-BR")}
            </div>
            <span className="text-[11px] text-muted-foreground font-medium mt-1 flex items-center gap-1">
              Contas únicas alcançadas
            </span>
          </div>
        </div>

        {/* Total Followers */}
        <div className="rounded-2xl border border-border/50 bg-card/60 p-5 backdrop-blur-sm shadow-card flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Total de Seguidores</span>
            <div className="size-8 rounded-xl bg-emerald-500/10 text-emerald-400 grid place-items-center">
              <Instagram className="size-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground">
              {totalFollowersSum.toLocaleString("pt-BR")}
            </div>
            <span className="text-[11px] text-muted-foreground font-medium mt-1 flex items-center gap-1">
              Em {accounts.length} contas
            </span>
          </div>
        </div>

        {/* Avg Engagement */}
        <div className="rounded-2xl border border-border/50 bg-card/60 p-5 backdrop-blur-sm shadow-card flex flex-col justify-between space-y-3 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Engajamento Médio</span>
            <div className="size-8 rounded-xl bg-pink-500/10 text-pink-400 grid place-items-center">
              <Heart className="size-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground">
              {avgEngagementRate}%
            </div>
            <span className="text-[11px] text-muted-foreground font-medium mt-1 flex items-center gap-1">
              Interações / seguidores
            </span>
          </div>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* 4. Complete Leaderboard / Ranking Table of ALL Accounts */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm shadow-card overflow-hidden">
        {/* Table Header Controls */}
        <div className="p-5 border-b border-border/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-gradient-brand text-primary-foreground grid place-items-center shadow-glow">
              <Trophy className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">
                Ranking de Performance de Contas
              </h2>
              <p className="text-xs text-muted-foreground">
                Listagem completa das {accounts.length} contas conectadas, ordenadas por desempenho.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative w-full sm:w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar conta..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9 text-xs bg-secondary/50 border-border/50 rounded-xl"
              />
            </div>

            {/* Category Filter */}
            {categories.length > 0 && (
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-9 text-xs w-36 bg-secondary/50 border-border/50 rounded-xl">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border/60">
                  <SelectItem value="all">Todas Categorias</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full" style={{ backgroundColor: c.color }} />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Sort Dropdown */}
            <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
              <SelectTrigger className="h-9 text-xs w-44 bg-secondary/50 border-border/50 rounded-xl font-semibold">
                <ArrowUpDown className="size-3.5 mr-1 text-primary" />
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border/60">
                <SelectItem value="views">🥇 Mais Visualizações</SelectItem>
                <SelectItem value="scheduled">📅 Mais Agendados</SelectItem>
                <SelectItem value="reach">👥 Maior Alcance</SelectItem>
                <SelectItem value="followers">📈 Mais Seguidores</SelectItem>
                <SelectItem value="engagement">💬 Maior Engajamento</SelectItem>
                <SelectItem value="health">🛡️ Status de Saúde</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table Content */}
        {accounts.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Instagram className="size-10 text-muted-foreground mx-auto opacity-50" />
            <h3 className="font-bold text-sm">Nenhuma conta conectada</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Conecte suas contas do Instagram para começar a visualizar rankings e métricas de desempenho.
            </p>
            <Link to="/accounts">
              <Button size="sm" className="bg-gradient-brand text-primary-foreground border-0 mt-2">
                Conectar Conta
              </Button>
            </Link>
          </div>
        ) : filteredAndSortedAccounts.length === 0 ? (
          <div className="p-10 text-center text-xs text-muted-foreground">
            Nenhuma conta encontrada para a busca "{searchQuery}".
          </div>
        ) : (
          <div className="divide-y divide-border/30 overflow-x-auto">
            {filteredAndSortedAccounts.map((acc, index) => {
              const viewsPercentage = totalViewsSum > 0 ? ((acc.total_views || 0) / totalViewsSum) * 100 : 0;
              const isChampion = index === 0 && (acc.total_views || 0) > 0;
              const accountPendingCount = scheduledByAccount[acc.id] || 0;

              return (
                <div
                  key={acc.id}
                  className={`p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${
                    isChampion ? "bg-primary/[0.04] border-l-4 border-l-amber-400" : "hover:bg-secondary/20"
                  }`}
                >
                  {/* Left: Rank + Account Info */}
                  <div className="flex items-center gap-3.5 min-w-[220px]">
                    {/* Rank Badge */}
                    <div className="shrink-0 flex items-center justify-center size-8 rounded-xl font-extrabold text-xs">
                      {index === 0 ? (
                        <span className="text-base" title="1º Lugar - Conta Campeã">
                          🥇
                        </span>
                      ) : index === 1 ? (
                        <span className="text-base" title="2º Lugar">
                          🥈
                        </span>
                      ) : index === 2 ? (
                        <span className="text-base" title="3º Lugar">
                          🥉
                        </span>
                      ) : (
                        <span className="text-muted-foreground font-mono">#{index + 1}</span>
                      )}
                    </div>

                    {/* Profile Picture / Initial */}
                    <div className="relative shrink-0">
                      {acc.profile_picture_url ? (
                        <img
                          src={acc.profile_picture_url}
                          alt={acc.username}
                          className="size-10 rounded-xl object-cover ring-1 ring-border"
                        />
                      ) : (
                        <div className="size-10 rounded-xl bg-gradient-brand text-primary-foreground grid place-items-center font-bold text-xs shadow-sm">
                          {acc.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      {acc.account_categories && (
                        <span
                          className="absolute -bottom-1 -right-1 size-3 rounded-full ring-2 ring-background"
                          style={{ backgroundColor: acc.account_categories.color }}
                          title={acc.account_categories.name}
                        />
                      )}
                    </div>

                    {/* Username and Health Badge */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-foreground truncate">
                          @{acc.username}
                        </span>
                        {isChampion && (
                          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-400/15 text-amber-400 border border-amber-400/30">
                            🏆 Top 1
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-0.5">
                        {acc.health_status === "healthy" ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Saudável
                          </span>
                        ) : acc.health_status === "token_expired" ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-warning" title={acc.health_reason || ""}>
                            <AlertCircle className="size-3 text-warning" />
                            Sessão Expirada
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-destructive" title={acc.health_reason || ""}>
                            <AlertTriangle className="size-3 text-destructive" />
                            Restrita pela Meta
                          </span>
                        )}

                        {acc.account_categories && (
                          <>
                            <span className="text-muted-foreground/40 text-xs">•</span>
                            <span className="text-[10px] text-muted-foreground font-medium">
                              {acc.account_categories.name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Middle / Right: Metrics Comparison */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5 flex-1 max-w-3xl">
                    {/* Views & Progress Bar */}
                    <div className="space-y-1.5">
                      <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                        Visualizações
                      </div>
                      <div className="text-sm font-extrabold text-foreground">
                        {(acc.total_views || 0).toLocaleString("pt-BR")}
                      </div>
                      <div className="w-full bg-secondary/80 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-primary h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(viewsPercentage, 4)}%` }}
                        />
                      </div>
                    </div>

                    {/* Scheduled Reels in this Account */}
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase font-bold tracking-wider text-primary">
                        Agendados
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-extrabold text-primary">
                          {accountPendingCount.toLocaleString("pt-BR")}
                        </span>
                        {accountPendingCount > 0 ? (
                          <span className="px-1.5 py-0.2 rounded-md text-[9px] font-bold bg-primary/15 text-primary border border-primary/20">
                            Fila
                          </span>
                        ) : null}
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {accountPendingCount === 1 ? "1 reel pendente" : `${accountPendingCount} reels na fila`}
                      </span>
                    </div>

                    {/* Reach */}
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                        Alcance
                      </div>
                      <div className="text-sm font-extrabold text-foreground">
                        {(acc.total_reach || 0).toLocaleString("pt-BR")}
                      </div>
                      <span className="text-[10px] text-muted-foreground">contas únicas</span>
                    </div>

                    {/* Followers & Posts */}
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                        Seguidores
                      </div>
                      <div className="text-sm font-extrabold text-foreground">
                        {(acc.followers_count || 0).toLocaleString("pt-BR")}
                      </div>
                      <span className="text-[10px] text-muted-foreground">{acc.media_count || 0} posts</span>
                    </div>

                    {/* Engagement Rate */}
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                        Engajamento
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-extrabold text-foreground">
                          {acc.engagement_rate || 0}%
                        </span>
                        {Number(acc.engagement_rate || 0) > 3 && (
                          <span className="text-xs">🔥</span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {(acc.total_likes || 0) + (acc.total_comments || 0)} interações
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="shrink-0 flex items-center justify-end">
                    <Link to="/schedule">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs font-bold rounded-lg border-border/60 hover:bg-secondary"
                      >
                        Agendar Reel
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* 5. Top Viral Reels & Upcoming Scheduling Grid */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Published Reels */}
        <div className="rounded-2xl border border-border/60 bg-card/40 p-5 backdrop-blur-sm shadow-card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
              <Award className="size-4 text-primary" /> Top Reels Publicados
            </h3>
            <Link to="/posts" className="text-xs text-primary hover:underline font-semibold">
              Ver Todos
            </Link>
          </div>

          {topReels.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              Nenhum post publicado com métricas registradas ainda.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {topReels.map((reel) => (
                <div
                  key={reel.id}
                  className="rounded-xl border border-border/40 bg-secondary/20 p-2.5 flex flex-col justify-between space-y-2 hover:border-primary/30 transition"
                >
                  <div className="flex gap-2 items-start">
                    {reel.cover_url ? (
                      <img
                        src={reel.cover_url}
                        alt="Capa"
                        className="size-12 rounded-lg object-cover bg-background shrink-0"
                        loading="lazy"
                      />
                    ) : reel.video_url ? (
                      <video
                        src={reel.video_url}
                        className="size-12 rounded-lg object-cover bg-background shrink-0"
                        muted
                        preload="none"
                      />
                    ) : (
                      <div className="size-12 rounded-lg bg-secondary grid place-items-center shrink-0">
                        <Video className="size-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <span className="text-[11px] font-bold text-foreground truncate block">
                        @{reel.instagram_accounts?.username || "instagram"}
                      </span>
                      <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                        {reel.caption || "Sem legenda"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-border/20 text-[10px] font-semibold text-muted-foreground">
                    <span className="flex items-center gap-1 text-foreground">
                      <Eye className="size-3 text-primary" /> {(reel.views_count || 0).toLocaleString("pt-BR")}
                    </span>
                    <span className="flex items-center gap-1">
                      <Heart className="size-3 text-pink-400" /> {(reel.likes_count || 0).toLocaleString("pt-BR")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Scheduled Posts */}
        <div className="rounded-2xl border border-border/60 bg-card/40 p-5 backdrop-blur-sm shadow-card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
              <Clock className="size-4 text-purple-400" /> Próximas Postagens Agendadas
            </h3>
            <Link to="/posts" className="text-xs text-primary hover:underline font-semibold">
              Ver Fila
            </Link>
          </div>

          {upcomingPosts.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              Nenhuma postagem agendada no momento.
            </div>
          ) : (
            <div className="space-y-2.5">
              {upcomingPosts.map((post) => (
                <div
                  key={post.id}
                  className="rounded-xl border border-border/40 bg-secondary/20 p-3 flex items-center justify-between gap-3 hover:border-primary/30 transition"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {post.cover_url ? (
                      <img
                        src={post.cover_url}
                        alt="Capa"
                        className="size-9 rounded-lg object-cover bg-background shrink-0"
                        loading="lazy"
                      />
                    ) : post.video_url ? (
                      <video
                        src={post.video_url}
                        className="size-9 rounded-lg object-cover bg-background shrink-0"
                        muted
                        preload="none"
                      />
                    ) : (
                      <div className="size-9 rounded-lg bg-secondary grid place-items-center shrink-0">
                        <Video className="size-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-foreground truncate">
                          @{post.instagram_accounts?.username || "usuario"}
                        </span>
                        {post.is_trial && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-primary/15 text-primary">
                            🧪 Teste
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate max-w-xs mt-0.5">
                        {post.caption || "Sem legenda"}
                      </p>
                    </div>
                  </div>

                  <span className="text-xs font-bold text-foreground shrink-0">
                    {new Date(post.scheduled_at).toLocaleString("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
