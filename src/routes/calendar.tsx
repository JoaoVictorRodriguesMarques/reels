import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Video,
  Plus,
  Clock,
  Trash2,
  Sparkles,
  Instagram,
  Eye,
  Heart,
  MessageCircle,
  Users,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Search,
  Play,
  Layers,
  Calendar as CalendarIcon,
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
import { deleteR2File } from "@/lib/r2.functions";
import { getPublishedReelsWithPerformance } from "@/lib/instagram.functions";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/calendar")({
  head: () => ({ meta: [{ title: "Fluxo de Publicações & Performance — Reelary" }] }),
  component: () => (
    <AppShell>
      <PublicationsFlowPage />
    </AppShell>
  ),
});

interface Account {
  id: string;
  username: string;
  category_id: string | null;
  profile_picture_url: string | null;
  account_categories: { id: string; name: string; color: string } | null;
}

interface PublishedMedia {
  id: string;
  instagram_account_id: string;
  username: string;
  profile_picture_url: string | null;
  account_categories: { id: string; name: string; color: string } | null;
  caption: string;
  media_url: string;
  thumbnail_url: string;
  permalink: string;
  timestamp: string;
  likes_count: number;
  comments_count: number;
  views_count: number;
  reach_count: number;
}

interface ScheduledPost {
  id: string;
  caption: string;
  video_url: string;
  cover_url: string | null;
  scheduled_at: string;
  status: "pending" | "published" | "failed";
  is_trial?: boolean;
  instagram_account_id: string;
  instagram_accounts: {
    username: string;
    profile_picture_url?: string | null;
    category_id?: string | null;
    account_categories?: { id: string; name: string; color: string } | null;
  } | null;
}

function PublicationsFlowPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [publishedMedia, setPublishedMedia] = useState<PublishedMedia[]>([]);
  const [upcomingPosts, setUpcomingPosts] = useState<ScheduledPost[]>([]);
  const [totalPublishedCount, setTotalPublishedCount] = useState(0);
  const [totalPendingCount, setTotalPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Video preview modal
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);

  const fetchPublishedMedia = useServerFn(getPublishedReelsWithPerformance);

  // 1. Load accounts
  async function loadAccounts() {
    try {
      const { data: accs } = await supabase
        .from("instagram_accounts")
        .select("id, username, category_id, profile_picture_url, account_categories(id, name, color)")
        .eq("hidden", false)
        .order("created_at", { ascending: false });

      setAccounts((accs as any) || []);
    } catch (err) {
      console.error("Error loading accounts:", err);
    }
  }

  // 2. Load latest 10 published posts with real performance & next 10 scheduled posts
  async function loadData() {
    try {
      // 1. Fetch real published media from Meta Graph API
      const pubList = await fetchPublishedMedia({
        data: {
          accountId: selectedAccountId,
          limit: 10,
        },
      });
      setPublishedMedia((pubList as any) || []);

      // 2. Fetch next 10 upcoming scheduled posts from database
      let upcomingQuery = supabase
        .from("scheduled_posts")
        .select(
          "id, caption, video_url, cover_url, scheduled_at, status, is_trial, instagram_account_id, instagram_accounts(username, profile_picture_url, category_id, account_categories(id, name, color))",
        )
        .eq("status", "pending")
        .order("scheduled_at", { ascending: true })
        .limit(10);

      if (selectedAccountId !== "all") {
        upcomingQuery = upcomingQuery.eq("instagram_account_id", selectedAccountId);
      }

      const { data: upData } = await upcomingQuery;
      setUpcomingPosts((upData as any) || []);

      // 3. Totals
      const { count: pubCount } = await supabase
        .from("scheduled_posts")
        .select("*", { count: "exact", head: true })
        .eq("status", "published");
      setTotalPublishedCount(pubCount || 0);

      const { count: pendCount } = await supabase
        .from("scheduled_posts")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      setTotalPendingCount(pendCount || 0);
    } catch (err) {
      console.error("Error loading publications flow:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Handle delete post
  async function handleDeletePost(post: ScheduledPost) {
    if (!confirm("Tem certeza que deseja cancelar e excluir este agendamento?")) return;

    setDeletingId(post.id);
    try {
      if (post.video_url) {
        try {
          await deleteR2File({ data: { url: post.video_url } });
        } catch (_) {}
      }
      if (post.cover_url) {
        try {
          await deleteR2File({ data: { url: post.cover_url } });
        } catch (_) {}
      }

      const { error } = await supabase.from("scheduled_posts").delete().eq("id", post.id);
      if (error) throw error;

      toast.success("Post agendado excluído com sucesso.");
      setUpcomingPosts((prev) => prev.filter((p) => p.id !== post.id));
      setTotalPendingCount((prev) => Math.max(0, prev - 1));
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir agendamento.");
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    loadData();
  }, [selectedAccountId]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await loadData();
    toast.success("Métricas e agendamentos atualizados!");
  };

  // Filtered lists
  const filteredPublished = useMemo(() => {
    if (!searchQuery) return publishedMedia;
    const q = searchQuery.toLowerCase();
    return publishedMedia.filter(
      (p) =>
        p.username.toLowerCase().includes(q) ||
        p.caption?.toLowerCase().includes(q),
    );
  }, [publishedMedia, searchQuery]);

  const filteredUpcoming = useMemo(() => {
    if (!searchQuery) return upcomingPosts;
    const q = searchQuery.toLowerCase();
    return upcomingPosts.filter(
      (p) =>
        p.instagram_accounts?.username.toLowerCase().includes(q) ||
        p.caption?.toLowerCase().includes(q),
    );
  }, [upcomingPosts, searchQuery]);

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in-50 duration-300 pb-16">
      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* 1. Header & Actions */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground">
              Fluxo de Publicações & Performance
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-primary/10 text-primary border border-primary/25">
              <Sparkles className="size-3" /> Meta API v21.0
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Acompanhe a performance real dos últimos Reels postados no Instagram e os próximos da fila.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            onClick={handleManualRefresh}
            disabled={refreshing}
            variant="outline"
            className="border-border/60 hover:bg-secondary h-10 px-3.5 text-xs font-bold rounded-xl gap-2 shadow-sm cursor-pointer"
          >
            <RefreshCw className={`size-3.5 text-primary ${refreshing ? "animate-spin" : ""}`} />
            Atualizar
          </Button>

          <Link to="/bulk">
            <Button variant="outline" className="border-border/60 hover:bg-secondary h-10 px-3.5 text-xs font-bold rounded-xl gap-2 cursor-pointer">
              <Layers className="size-4 text-purple-400" /> Postar em Massa
            </Button>
          </Link>

          <Link to="/schedule">
            <Button className="bg-gradient-brand text-primary-foreground border-0 hover:opacity-90 h-10 px-4 text-xs font-bold rounded-xl shadow-glow gap-2 cursor-pointer">
              <Plus className="size-4" /> Novo Reel
            </Button>
          </Link>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* 2. Quick Filters */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Published */}
        <div className="rounded-2xl border border-border/50 bg-card/60 p-4 backdrop-blur-sm shadow-card flex items-center gap-3.5">
          <div className="size-11 rounded-xl bg-emerald-500/10 text-emerald-400 grid place-items-center shrink-0">
            <CheckCircle2 className="size-5" />
          </div>
          <div>
            <div className="text-xl font-extrabold text-foreground">
              {totalPublishedCount.toLocaleString("pt-BR")}
            </div>
            <span className="text-xs text-muted-foreground font-medium">Reels já Publicados</span>
          </div>
        </div>

        {/* Filter by Account */}
        <div>
          <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
            <SelectTrigger className="h-full min-h-[58px] bg-card/60 border-border/50 rounded-2xl px-4 text-xs font-bold">
              <div className="flex items-center gap-2">
                <Instagram className="size-4 text-primary" />
                <SelectValue placeholder="Filtrar por Conta" />
              </div>
            </SelectTrigger>
            <SelectContent className="bg-popover border-border/60">
              <SelectItem value="all">Todas as Contas ({accounts.length})</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <span className="flex items-center gap-2 font-semibold">
                    {a.account_categories && (
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: a.account_categories.color }}
                      />
                    )}
                    @{a.username}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por legenda..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-full min-h-[58px] text-xs bg-card/60 border-border/50 rounded-2xl font-medium"
          />
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* 3. SECTION 1: ÚLTIMOS 10 REELS PUBLICADOS COM SUCESSO & PERFORMANCE */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-6 shadow-card space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-emerald-500/10 text-emerald-400 grid place-items-center shadow-sm">
              <CheckCircle2 className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                Últimos 10 Reels Publicados com Sucesso
              </h2>
              <p className="text-xs text-muted-foreground">
                Métricas reais de visualizações, alcance, curtidas e comentários obtidas direto da Meta.
              </p>
            </div>
          </div>

          <span className="px-3 py-1 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            {filteredPublished.length} Reels
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-muted-foreground">
            Carregando publicações e métricas da Meta...
          </div>
        ) : filteredPublished.length === 0 ? (
          <div className="p-12 text-center text-xs text-muted-foreground space-y-2">
            <Video className="size-8 mx-auto opacity-40 text-muted-foreground" />
            <p>Nenhuma publicação encontrada no Instagram para os filtros aplicados.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {filteredPublished.map((post, idx) => {
              const formattedDate = new Date(post.timestamp).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div
                  key={post.id || idx}
                  className="py-4.5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-secondary/15 px-3 rounded-2xl transition"
                >
                  {/* Left: Thumbnail & Info */}
                  <div className="flex items-start sm:items-center gap-4 min-w-0 flex-1">
                    {/* Media Thumbnail */}
                    <div
                      onClick={() => post.media_url && setPreviewVideoUrl(post.media_url)}
                      className="relative size-16 rounded-xl bg-background overflow-hidden shrink-0 cursor-pointer group ring-1 ring-border/50 shadow-sm"
                      title="Clique para reproduzir"
                    >
                      {post.thumbnail_url ? (
                        <img
                          src={post.thumbnail_url}
                          alt="Capa"
                          className="size-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="size-full grid place-items-center bg-secondary/80">
                          <Video className="size-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity grid place-items-center">
                        <Play className="size-5 text-white fill-white" />
                      </div>
                    </div>

                    {/* Account, Caption & Time */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-foreground">
                          @{post.username}
                        </span>
                        {post.account_categories && (
                          <span
                            className="size-2 rounded-full ring-1 ring-background"
                            style={{ backgroundColor: post.account_categories.color }}
                            title={post.account_categories.name}
                          />
                        )}
                        <span className="text-[11px] text-muted-foreground">
                          • {formattedDate}
                        </span>
                      </div>

                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {post.caption || "Sem legenda cadastrada"}
                      </p>
                    </div>
                  </div>

                  {/* Right: Metrics Badges & External Link */}
                  <div className="flex items-center gap-2.5 flex-wrap shrink-0">
                    {/* Views */}
                    <div className="px-3 py-1.5 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center gap-1.5 shadow-sm">
                      <Eye className="size-3.5" />
                      <span className="text-xs font-extrabold">
                        {(post.views_count || 0).toLocaleString("pt-BR")}
                      </span>
                      <span className="text-[10px] opacity-80">views</span>
                    </div>

                    {/* Reach */}
                    <div className="px-3 py-1.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-1.5 shadow-sm">
                      <Users className="size-3.5" />
                      <span className="text-xs font-extrabold">
                        {(post.reach_count || 0).toLocaleString("pt-BR")}
                      </span>
                      <span className="text-[10px] opacity-80">alcance</span>
                    </div>

                    {/* Likes */}
                    <div className="px-3 py-1.5 rounded-xl bg-pink-500/10 text-pink-400 border border-pink-500/20 flex items-center gap-1.5 shadow-sm">
                      <Heart className="size-3.5" />
                      <span className="text-xs font-extrabold">
                        {(post.likes_count || 0).toLocaleString("pt-BR")}
                      </span>
                      <span className="text-[10px] opacity-80">likes</span>
                    </div>

                    {/* Comments */}
                    <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5 shadow-sm">
                      <MessageCircle className="size-3.5" />
                      <span className="text-xs font-extrabold">
                        {(post.comments_count || 0).toLocaleString("pt-BR")}
                      </span>
                    </div>

                    {/* Instagram Link */}
                    {post.permalink && (
                      <a
                        href={post.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary/80 hover:bg-secondary text-xs font-semibold text-foreground border border-border/40 transition cursor-pointer"
                        title="Abrir no Instagram"
                      >
                        <Instagram className="size-3.5 text-pink-400" />
                        <ExternalLink className="size-3 opacity-60" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* 4. SECTION 2: PRÓXIMOS 10 REELS AGENDADOS (FILA DE DISPARO) */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-6 shadow-card space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/10 text-primary grid place-items-center shadow-glow">
              <Clock className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                Próximos 10 Reels Agendados na Fila
              </h2>
              <p className="text-xs text-muted-foreground">
                Cronograma ordenado dos próximos disparos automáticos programados.
              </p>
            </div>
          </div>

          <span className="px-3 py-1 rounded-xl text-xs font-bold bg-primary/10 text-primary border border-primary/20">
            {filteredUpcoming.length} de {totalPendingCount} na fila
          </span>
        </div>

        {filteredUpcoming.length === 0 ? (
          <div className="p-12 text-center text-xs text-muted-foreground space-y-3">
            <Clock className="size-8 mx-auto opacity-40 text-muted-foreground" />
            <p>Nenhum Reel agendado na fila no momento.</p>
            <Link to="/schedule">
              <Button size="sm" className="bg-gradient-brand text-primary-foreground border-0 mt-2">
                Agendar Novo Reel
              </Button>
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {filteredUpcoming.map((post, idx) => {
              const account = post.instagram_accounts;
              const formattedDate = new Date(post.scheduled_at).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div
                  key={post.id}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-secondary/15 px-3 rounded-2xl transition"
                >
                  {/* Left: Position, Thumb & Info */}
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <span className="text-xs font-mono font-bold text-muted-foreground w-6 text-center shrink-0">
                      #{idx + 1}
                    </span>

                    {/* Thumbnail */}
                    <div
                      onClick={() => post.video_url && setPreviewVideoUrl(post.video_url)}
                      className="size-12 rounded-xl bg-background overflow-hidden shrink-0 cursor-pointer group ring-1 ring-border/50 relative shadow-sm"
                      title="Clique para ver preview"
                    >
                      {post.cover_url ? (
                        <img
                          src={post.cover_url}
                          alt="Capa"
                          className="size-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="size-full grid place-items-center bg-secondary/80">
                          <Video className="size-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity grid place-items-center">
                        <Play className="size-3.5 text-white fill-white" />
                      </div>
                    </div>

                    {/* Account & Caption */}
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-foreground">
                          @{account?.username || "instagram"}
                        </span>
                        {post.is_trial && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-primary/15 text-primary">
                            🧪 Teste
                          </span>
                        )}
                        {account?.account_categories && (
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: account.account_categories.color }}
                            title={account.account_categories.name}
                          />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate max-w-lg">
                        {post.caption || "Sem legenda"}
                      </p>
                    </div>
                  </div>

                  {/* Right: Date, Status Badge & Actions */}
                  <div className="flex items-center gap-3 shrink-0 justify-between sm:justify-end">
                    <div className="text-right">
                      <div className="text-xs font-bold text-foreground">{formattedDate}</div>
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary">
                        <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                        Na fila de disparo
                      </span>
                    </div>

                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDeletePost(post)}
                      disabled={deletingId === post.id}
                      className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg cursor-pointer"
                      title="Excluir agendamento"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* 5. Video Preview Modal */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!previewVideoUrl} onOpenChange={() => setPreviewVideoUrl(null)}>
        <DialogContent className="max-w-md bg-card border-border/60 p-5 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center justify-between">
              <span>Preview do Reel</span>
            </DialogTitle>
          </DialogHeader>

          {previewVideoUrl && (
            <div className="rounded-xl overflow-hidden bg-black aspect-[9/16] max-h-[70vh] mx-auto mt-2">
              <video
                src={previewVideoUrl}
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
