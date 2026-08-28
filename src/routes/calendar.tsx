import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
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
  Filter,
  Play,
  X,
  Layers,
  Flame,
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

interface Post {
  id: string;
  caption: string;
  video_url: string;
  cover_url: string | null;
  scheduled_at: string;
  status: "pending" | "published" | "failed";
  is_trial?: boolean;
  views_count?: number;
  reach_count?: number;
  likes_count?: number;
  comments_count?: number;
  ig_media_id?: string | null;
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
  const [publishedPosts, setPublishedPosts] = useState<Post[]>([]);
  const [upcomingPosts, setUpcomingPosts] = useState<Post[]>([]);
  const [totalPublishedCount, setTotalPublishedCount] = useState(0);
  const [totalPendingCount, setTotalPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Video preview modal
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);

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

  // 2. Load latest 10 published posts + next 10 upcoming posts
  async function loadPostsData() {
    try {
      // Query 1: Last 10 published posts with metrics
      let publishedQuery = supabase
        .from("scheduled_posts")
        .select(
          "id, caption, video_url, cover_url, scheduled_at, status, is_trial, views_count, reach_count, likes_count, comments_count, ig_media_id, instagram_account_id, instagram_accounts(username, profile_picture_url, category_id, account_categories(id, name, color))",
        )
        .eq("status", "published")
        .order("scheduled_at", { ascending: false })
        .limit(10);

      if (selectedAccountId !== "all") {
        publishedQuery = publishedQuery.eq("instagram_account_id", selectedAccountId);
      }

      const { data: pubData } = await publishedQuery;
      setPublishedPosts((pubData as any) || []);

      // Query 2: Next 10 scheduled posts on queue
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

      // Query 3: Totals
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
      console.error("Error loading posts flow:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Handle delete post
  async function handleDeletePost(post: Post) {
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
    loadPostsData();
  }, [selectedAccountId]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await loadPostsData();
    toast.success("Lista de publicações atualizada!");
  };

  // Filtered lists by search
  const filteredPublished = useMemo(() => {
    if (!searchQuery) return publishedPosts;
    const q = searchQuery.toLowerCase();
    return publishedPosts.filter(
      (p) =>
        p.instagram_accounts?.username.toLowerCase().includes(q) ||
        p.caption?.toLowerCase().includes(q),
    );
  }, [publishedPosts, searchQuery]);

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
    <div className="space-y-8 animate-in fade-in-50 duration-300 pb-16">
      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* 1. Header & Actions */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-muted-foreground bg-clip-text text-transparent">
              Fluxo de Publicações & Performance
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-primary/10 text-primary border border-primary/25">
              <Sparkles className="size-3" /> Tempo Real
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Monitore os últimos 10 Reels publicados com sucesso e a performance em tempo real, além dos próximos 10 agendamentos na fila.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            onClick={handleManualRefresh}
            disabled={refreshing}
            variant="outline"
            className="border-border/60 hover:bg-secondary h-10 px-3.5 text-xs font-bold rounded-xl gap-2 shadow-sm"
          >
            <RefreshCw className={`size-3.5 text-primary ${refreshing ? "animate-spin" : ""}`} />
            Atualizar
          </Button>

          <Link to="/bulk">
            <Button variant="outline" className="border-border/60 hover:bg-secondary h-10 px-3.5 text-xs font-bold rounded-xl gap-2">
              <Layers className="size-4 text-purple-400" /> Postar em Massa
            </Button>
          </Link>

          <Link to="/schedule">
            <Button className="bg-gradient-brand text-primary-foreground border-0 hover:opacity-90 h-10 px-4 text-xs font-bold rounded-xl shadow-glow gap-2">
              <Plus className="size-4" /> Novo Reel
            </Button>
          </Link>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* 2. Quick Summary Cards & Filters */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-border/50 bg-card/60 p-4 backdrop-blur-sm shadow-card flex items-center gap-3.5">
          <div className="size-11 rounded-xl bg-emerald-500/10 text-emerald-400 grid place-items-center shrink-0">
            <CheckCircle2 className="size-5" />
          </div>
          <div>
            <div className="text-xl font-extrabold text-foreground">
              {totalPublishedCount.toLocaleString("pt-BR")}
            </div>
            <span className="text-xs text-muted-foreground font-medium">Reels Publicados</span>
          </div>
        </div>

        <div className="rounded-2xl border border-primary/30 bg-primary/[0.04] p-4 backdrop-blur-sm shadow-card flex items-center gap-3.5">
          <div className="size-11 rounded-xl bg-primary/15 text-primary grid place-items-center shrink-0 shadow-glow">
            <Clock className="size-5" />
          </div>
          <div>
            <div className="text-xl font-extrabold text-primary">
              {totalPendingCount.toLocaleString("pt-BR")}
            </div>
            <span className="text-xs text-muted-foreground font-medium">Reels na Fila</span>
          </div>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card/60 p-4 backdrop-blur-sm shadow-card flex items-center gap-3.5 col-span-2">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full">
            {/* Filter by Account */}
            <div className="flex-1">
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger className="h-9 text-xs bg-secondary/50 border-border/50 rounded-xl">
                  <SelectValue placeholder="Todas as Contas" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border/60">
                  <SelectItem value="all">Todas as Contas ({accounts.length})</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="flex items-center gap-1.5">
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

            {/* Search Filter */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar legenda..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9 text-xs bg-secondary/50 border-border/50 rounded-xl"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* 3. Section: Últimos 10 Reels Postados com Sucesso & Performance */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-6 shadow-card space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-emerald-500/10 text-emerald-400 grid place-items-center">
              <CheckCircle2 className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">
                Últimos 10 Reels Postados com Sucesso
              </h2>
              <p className="text-xs text-muted-foreground">
                Métricas de reproduções, alcance e interações coletadas direto da Meta.
              </p>
            </div>
          </div>

          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            {filteredPublished.length} de 10 exibidos
          </span>
        </div>

        {filteredPublished.length === 0 ? (
          <div className="p-10 text-center text-xs text-muted-foreground space-y-2">
            <Video className="size-8 mx-auto opacity-40 text-muted-foreground" />
            <p>Nenhum Reel publicado encontrado com os filtros selecionados.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPublished.map((post) => {
              const account = post.instagram_accounts;
              const formattedDate = new Date(post.scheduled_at).toLocaleString("pt-BR", {
                dateStyle: "short",
                timeStyle: "short",
              });

              return (
                <div
                  key={post.id}
                  className="rounded-2xl border border-border/50 bg-secondary/15 p-4 hover:border-emerald-500/30 hover:bg-secondary/25 transition flex flex-col justify-between space-y-4 shadow-sm"
                >
                  <div className="flex items-start gap-3.5">
                    {/* Media Thumbnail */}
                    <div
                      onClick={() => post.video_url && setPreviewVideoUrl(post.video_url)}
                      className="relative size-16 rounded-xl bg-background overflow-hidden shrink-0 cursor-pointer group ring-1 ring-border/50"
                      title="Clique para reproduzir"
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
                          <Video className="size-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity grid place-items-center">
                        <Play className="size-5 text-white fill-white" />
                      </div>
                    </div>

                    {/* Post & Account Info */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-bold text-xs text-foreground truncate">
                            @{account?.username || "instagram"}
                          </span>
                          {post.is_trial && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-primary/15 text-primary">
                              🧪 Teste
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                          {formattedDate}
                        </span>
                      </div>

                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {post.caption || "Sem legenda"}
                      </p>
                    </div>
                  </div>

                  {/* Performance Metrics Bar */}
                  <div className="grid grid-cols-4 gap-2 pt-3 border-t border-border/30">
                    {/* Views */}
                    <div className="rounded-xl bg-background/60 p-2 text-center border border-border/30">
                      <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground font-bold">
                        <Eye className="size-3 text-primary" /> Views
                      </div>
                      <div className="text-xs font-extrabold text-foreground mt-0.5">
                        {(post.views_count || 0).toLocaleString("pt-BR")}
                      </div>
                    </div>

                    {/* Reach */}
                    <div className="rounded-xl bg-background/60 p-2 text-center border border-border/30">
                      <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground font-bold">
                        <Users className="size-3 text-purple-400" /> Alcance
                      </div>
                      <div className="text-xs font-extrabold text-foreground mt-0.5">
                        {(post.reach_count || 0).toLocaleString("pt-BR")}
                      </div>
                    </div>

                    {/* Likes */}
                    <div className="rounded-xl bg-background/60 p-2 text-center border border-border/30">
                      <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground font-bold">
                        <Heart className="size-3 text-pink-400" /> Curtidas
                      </div>
                      <div className="text-xs font-extrabold text-foreground mt-0.5">
                        {(post.likes_count || 0).toLocaleString("pt-BR")}
                      </div>
                    </div>

                    {/* Comments */}
                    <div className="rounded-xl bg-background/60 p-2 text-center border border-border/30">
                      <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground font-bold">
                        <MessageCircle className="size-3 text-emerald-400" /> Coments
                      </div>
                      <div className="text-xs font-extrabold text-foreground mt-0.5">
                        {(post.comments_count || 0).toLocaleString("pt-BR")}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* 4. Section: Próximos 10 Reels Agendados (Fila de Disparo) */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-6 shadow-card space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-primary/10 text-primary grid place-items-center">
              <Clock className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">
                Próximos 10 Reels Agendados na Fila
              </h2>
              <p className="text-xs text-muted-foreground">
                Cronograma em ordem cronológica dos próximos disparos automáticos.
              </p>
            </div>
          </div>

          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-primary/10 text-primary border border-primary/20">
            {filteredUpcoming.length} de {totalPendingCount} na fila
          </span>
        </div>

        {filteredUpcoming.length === 0 ? (
          <div className="p-10 text-center text-xs text-muted-foreground space-y-2">
            <Clock className="size-8 mx-auto opacity-40 text-muted-foreground" />
            <p>Nenhum Reel agendado na fila no momento.</p>
            <Link to="/schedule">
              <Button size="sm" className="bg-gradient-brand text-primary-foreground border-0 mt-2">
                Agendar Agora
              </Button>
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-border/30 overflow-x-auto">
            {filteredUpcoming.map((post, idx) => {
              const account = post.instagram_accounts;
              const formattedDate = new Date(post.scheduled_at).toLocaleString("pt-BR", {
                dateStyle: "short",
                timeStyle: "short",
              });

              return (
                <div
                  key={post.id}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-secondary/15 px-2 rounded-xl transition"
                >
                  {/* Left: Position, Thumb & Info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-mono font-bold text-muted-foreground w-6 text-center">
                      #{idx + 1}
                    </span>

                    {/* Thumbnail */}
                    <div
                      onClick={() => post.video_url && setPreviewVideoUrl(post.video_url)}
                      className="size-11 rounded-lg bg-background overflow-hidden shrink-0 cursor-pointer group ring-1 ring-border/50 relative"
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
                        <Play className="size-3 text-white fill-white" />
                      </div>
                    </div>

                    {/* Account & Caption */}
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-foreground truncate">
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
                      <p className="text-[11px] text-muted-foreground truncate max-w-sm">
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
                        Aguardando disparo
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
