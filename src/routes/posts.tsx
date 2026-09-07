import { createFileRoute, Link } from "@tanstack/react-router";
import { parseErrorMessage } from "@/lib/error-messages";
import { useEffect, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  XCircle,
  Trash2,
  Plus,
  Video,
  Instagram,
  ChevronDown,
  Loader2,
  AlertTriangle,
  Filter,
  Search,
  Sparkles,
  Check,
  RefreshCw,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { deleteR2File } from "@/lib/r2.functions";

export const Route = createFileRoute("/posts")({
  head: () => ({ meta: [{ title: "Excluir & Gerenciar Reels — Reelary" }] }),
  component: () => (
    <AppShell>
      <PostsPage />
    </AppShell>
  ),
});

type Account = {
  id: string;
  username: string;
  category_id?: string | null;
  account_categories?: { id: string; name: string; color: string } | null;
};

type Post = {
  id: string;
  caption: string;
  video_url: string;
  cover_url: string | null;
  scheduled_at: string;
  status: "pending" | "published" | "failed";
  error_message: string | null;
  is_trial?: boolean;
  instagram_account_id: string;
  instagram_accounts: {
    username: string;
    category_id: string | null;
    account_categories: { color: string } | null;
  } | null;
};

interface AccountCounts {
  pending: number;
  published: number;
  failed: number;
  lastDate: string | null;
}

const statusMeta = {
  pending: { label: "Agendado", icon: Clock, cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  published: {
    label: "Publicado",
    icon: CheckCircle2,
    cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  failed: {
    label: "Falhou",
    icon: XCircle,
    cls: "bg-destructive/15 text-destructive border-destructive/30",
  },
};

function PostsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "published" | "failed">("all");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Bulk delete modal state
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [deleteMode, setDeleteMode] = useState<"pending" | "published">("pending");
  const [deleteSelectedAccounts, setDeleteSelectedAccounts] = useState<string[]>([]);
  const [accountCounts, setAccountCounts] = useState<Record<string, AccountCounts>>({});
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Load accounts on mount
  useEffect(() => {
    supabase
      .from("instagram_accounts")
      .select("id, username, category_id, account_categories(id, name, color)")
      .eq("hidden", false)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setAccounts((data as any) ?? []);
      });
  }, []);

  // Fetch accurate counts per account using Postgres RPC
  async function refreshCounts() {
    try {
      const { data, error } = await supabase.rpc("get_account_scheduled_counts" as any);
      if (!error && data && Array.isArray(data)) {
        const countsMap: Record<string, AccountCounts> = {};
        data.forEach((row: any) => {
          countsMap[row.instagram_account_id] = {
            pending: Number(row.pending_count || 0),
            published: Number(row.published_count || 0),
            failed: Number(row.failed_count || 0),
            lastDate: row.last_scheduled_at || null,
          };
        });
        setAccountCounts(countsMap);
      }
    } catch (e) {
      console.error("Erro ao carregar contagens:", e);
    }
  }

  useEffect(() => {
    refreshCounts();
  }, [posts]);

  async function load(isInitial = true) {
    if (isInitial) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    const startOffset = isInitial ? 0 : posts.length;
    const endOffset = startOffset + 49;

    let query = supabase
      .from("scheduled_posts")
      .select(
        "id, caption, video_url, cover_url, scheduled_at, status, error_message, is_trial, instagram_account_id, instagram_accounts(username, category_id, account_categories(color))",
      );

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }
    if (selectedAccountId !== "all") {
      query = query.eq("instagram_account_id", selectedAccountId);
    }

    // Order published posts with newest first, and pending posts with upcoming first
    if (statusFilter === "published") {
      query = query.order("scheduled_at", { ascending: false });
    } else {
      query = query.order("scheduled_at", { ascending: true });
    }

    const { data, error } = await query.range(startOffset, endOffset);

    if (error) {
      toast.error(error.message);
    } else {
      const newPosts = (data as any) ?? [];
      if (isInitial) {
        setPosts(newPosts);
      } else {
        setPosts((prev) => [...prev, ...newPosts]);
      }
      setHasMore(newPosts.length === 50);
    }

    setLoading(false);
    setLoadingMore(false);
  }

  useEffect(() => {
    load(true);
  }, [statusFilter, selectedAccountId]);

  async function remove(id: string) {
    if (!confirm("Excluir este post do histórico/agendamento?")) return;
    try {
      const post = posts.find((p) => p.id === id);
      if (post) {
        if (post.video_url) {
          try {
            await deleteR2File({ data: { url: post.video_url } });
          } catch (err) {
            console.error("Erro ao deletar vídeo do R2:", err);
          }
        }
        if (post.cover_url) {
          try {
            await deleteR2File({ data: { url: post.cover_url } });
          } catch (err) {
            console.error("Erro ao deletar capa do R2:", err);
          }
        }
      }

      const { error } = await supabase.from("scheduled_posts").delete().eq("id", id);
      if (error) throw error;

      toast.success("Post excluído com sucesso");
      load(true);
      refreshCounts();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir agendamento.");
    }
  }

  // Bulk delete handler for either pending or published posts
  async function handleBulkDelete() {
    if (deleteSelectedAccounts.length === 0) {
      toast.error("Selecione pelo menos uma conta.");
      return;
    }

    const isPendingMode = deleteMode === "pending";
    const totalCount = deleteSelectedAccounts.reduce(
      (sum, accId) =>
        sum + (isPendingMode ? accountCounts[accId]?.pending || 0 : accountCounts[accId]?.published || 0),
      0,
    );

    if (totalCount === 0) {
      toast.info(
        isPendingMode
          ? "Nenhum agendamento pendente para as contas selecionadas."
          : "Nenhum log de post publicado para as contas selecionadas.",
      );
      return;
    }

    const accountNames = deleteSelectedAccounts
      .map((id) => {
        const acc = accounts.find((a) => a.id === id);
        return acc ? `@${acc.username}` : id;
      })
      .join(", ");

    const confirmMsg = isPendingMode
      ? `Excluir ${totalCount} agendamento(s) pendente(s) de ${accountNames}?\n\nEsta ação não pode ser desfeita.`
      : `Excluir ${totalCount} log(s) de reels já publicados de ${accountNames}?\n\nIsso liberará espaço e não afeta o Instagram nem os agendamentos futuros.`;

    if (!confirm(confirmMsg)) return;

    setBulkDeleting(true);

    try {
      if (isPendingMode) {
        // 1. Fetch pending posts to delete R2 files
        const { data: postsToDelete } = await supabase
          .from("scheduled_posts")
          .select("id, video_url, cover_url")
          .eq("status", "pending")
          .in("instagram_account_id", deleteSelectedAccounts);

        if (postsToDelete && postsToDelete.length > 0) {
          const uniqueUrls = new Set<string>();
          for (const post of postsToDelete) {
            if (post.video_url) uniqueUrls.add(post.video_url);
            if (post.cover_url) uniqueUrls.add(post.cover_url);
          }
          for (const url of uniqueUrls) {
            try {
              await deleteR2File({ data: { url } });
            } catch (err) {
              console.error("Erro ao deletar arquivo do R2:", err);
            }
          }
        }

        const { error: deleteErr } = await supabase
          .from("scheduled_posts")
          .delete()
          .eq("status", "pending")
          .in("instagram_account_id", deleteSelectedAccounts);

        if (deleteErr) throw deleteErr;

        toast.success(`${totalCount} agendamento(s) pendente(s) excluído(s) com sucesso!`);
      } else {
        // Delete published logs via RPC
        const { error: deleteErr } = await supabase.rpc("delete_published_posts_by_accounts" as any, {
          account_ids: deleteSelectedAccounts,
        });

        if (deleteErr) {
          // Fallback direct delete
          await supabase
            .from("scheduled_posts")
            .delete()
            .eq("status", "published")
            .in("instagram_account_id", deleteSelectedAccounts);
        }

        toast.success(`${totalCount} log(s) de posts publicados excluído(s) com sucesso!`);
      }

      setDeleteSelectedAccounts([]);
      load(true);
      refreshCounts();
    } catch (err: any) {
      console.error("Erro no bulk delete:", err);
      toast.error(err.message || "Erro ao excluir registros.");
    } finally {
      setBulkDeleting(false);
    }
  }

  const totalSelectedCount = deleteSelectedAccounts.reduce(
    (sum, accId) =>
      sum + (deleteMode === "pending" ? accountCounts[accId]?.pending || 0 : accountCounts[accId]?.published || 0),
    0,
  );

  const filteredPosts = posts.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const username = p.instagram_accounts?.username?.toLowerCase() || "";
    const cap = p.caption?.toLowerCase() || "";
    return username.includes(q) || cap.includes(q);
  });

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-300 pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Gerenciar & Excluir Reels</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Acompanhe a fila de disparos, consulte o histórico de publicações e limpe agendamentos ou logs antigos.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Bulk Delete Popover Button */}
          {accounts.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="justify-between border-destructive/40 hover:bg-destructive/10 hover:border-destructive/60 rounded-xl text-xs font-bold h-11 px-4 flex items-center bg-card gap-2 shadow-sm cursor-pointer"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Trash2 className="size-4 text-destructive shrink-0" />
                    {deleteSelectedAccounts.length === 0 ? (
                      <span className="text-foreground">Excluir em Massa</span>
                    ) : (
                      <span className="text-destructive font-extrabold">
                        {deleteSelectedAccounts.length} conta(s) selecionada(s)
                      </span>
                    )}
                  </div>
                  <ChevronDown className="size-4 text-muted-foreground opacity-60 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-96 bg-popover border border-border/80 p-4 shadow-card rounded-2xl z-50 space-y-3"
              >
                {/* Mode Selector Tabs inside Popover */}
                <div className="flex p-1 bg-secondary/40 border border-border/40 rounded-xl gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteMode("pending");
                      setDeleteSelectedAccounts([]);
                    }}
                    className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      deleteMode === "pending"
                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    ⏳ Agendados (Fila)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteMode("published");
                      setDeleteSelectedAccounts([]);
                    }}
                    className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      deleteMode === "published"
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    ✅ Publicados (Logs)
                  </button>
                </div>

                {/* Subtitle & Selection helpers */}
                <div className="text-xs text-muted-foreground font-semibold flex items-center justify-between pb-1 border-b border-border/40">
                  <span>
                    {deleteMode === "pending" ? "Excluir Fila Pendente" : "Limpar Logs de Publicados"}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteSelectedAccounts(accounts.map((a) => a.id));
                      }}
                      className="text-[11px] text-primary hover:underline font-bold bg-transparent border-0 cursor-pointer"
                    >
                      Todas
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteSelectedAccounts([]);
                      }}
                      className="text-[11px] text-destructive hover:underline font-bold bg-transparent border-0 cursor-pointer"
                    >
                      Limpar
                    </button>
                  </div>
                </div>

                {/* Accounts List with Accurate Counts */}
                <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
                  {accounts.map((a) => {
                    const isChecked = deleteSelectedAccounts.includes(a.id);
                    const counts = accountCounts[a.id];
                    const count = deleteMode === "pending" ? counts?.pending || 0 : counts?.published || 0;

                    return (
                      <label
                        key={a.id}
                        className="flex items-center justify-between px-2.5 py-2 rounded-xl hover:bg-secondary/60 cursor-pointer text-xs font-semibold select-none transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setDeleteSelectedAccounts((prev) => [...prev, a.id]);
                              } else {
                                setDeleteSelectedAccounts((prev) => prev.filter((id) => id !== a.id));
                              }
                            }}
                          />
                          <span className="flex items-center gap-1.5 truncate">
                            {a.account_categories && (
                              <span
                                className="size-2 rounded-full shrink-0 ring-1 ring-white/10"
                                style={{ backgroundColor: a.account_categories.color }}
                              />
                            )}
                            <span className="text-foreground">@{a.username}</span>
                          </span>
                        </div>

                        {count > 0 ? (
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded-md font-bold shrink-0 ml-2 border ${
                              deleteMode === "pending"
                                ? "text-amber-400 bg-amber-500/15 border-amber-500/30"
                                : "text-emerald-400 bg-emerald-500/15 border-emerald-500/30"
                            }`}
                          >
                            {count} {deleteMode === "pending" ? "na fila" : "publicados"}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground bg-secondary/80 border border-border/40 px-1.5 py-0.5 rounded-md shrink-0 ml-2">
                            0
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>

                {/* Delete action button */}
                <div className="pt-3 border-t border-border/40 space-y-2">
                  {totalSelectedCount > 0 && (
                    <p className="text-[11px] text-destructive flex items-center gap-1">
                      <AlertTriangle className="size-3.5 shrink-0" />
                      {totalSelectedCount}{" "}
                      {deleteMode === "pending" ? "agendamento(s) pendente(s)" : "log(s) de posts publicados"}{" "}
                      serão excluídos.
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="w-full rounded-xl text-xs font-extrabold h-10 shadow-sm"
                    disabled={deleteSelectedAccounts.length === 0 || bulkDeleting}
                    onClick={handleBulkDelete}
                  >
                    {bulkDeleting ? (
                      <>
                        <Loader2 className="size-4 animate-spin mr-1.5" />
                        Excluindo...
                      </>
                    ) : (
                      <>
                        <Trash2 className="size-4 mr-1.5" />
                        {deleteMode === "pending"
                          ? `Excluir ${totalSelectedCount} Agendamentos Pendentes`
                          : `Limpar ${totalSelectedCount} Logs Publicados`}
                      </>
                    )}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}

          <Link to="/schedule">
            <Button className="bg-gradient-brand text-primary-foreground border-0 hover:opacity-90 h-11 rounded-xl font-bold shadow-glow text-xs">
              <Plus className="size-4 mr-1.5" /> Novo Reel
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter Tabs & Account Selector Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 rounded-2xl bg-card/60 border border-border/60 shadow-sm">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {[
            { id: "all", label: "Todos" },
            { id: "pending", label: "⏳ Agendados (Fila)" },
            { id: "published", label: "✅ Publicados (Logs)" },
            { id: "failed", label: "❌ Falhas" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id as any)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border shrink-0 ${
                statusFilter === tab.id
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card text-muted-foreground hover:text-foreground border-border/50 hover:bg-secondary/40"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Account and Search Filter */}
        <div className="flex items-center gap-2">
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="bg-card border border-border/60 rounded-xl px-3 py-1.5 text-xs font-bold text-foreground cursor-pointer h-9"
          >
            <option value="all">Todas as contas ({accounts.length})</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                @{a.username}
              </option>
            ))}
          </select>

          <div className="relative flex-1 sm:w-52">
            <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar legenda..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-card border border-border/60 rounded-xl pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary h-9"
            />
          </div>
        </div>
      </div>

      {/* Main Posts Feed */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-card/60 animate-pulse border border-border/40" />
          ))}
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/80 p-16 text-center bg-card/30 space-y-3">
          <div className="size-14 rounded-2xl bg-secondary/80 grid place-items-center mx-auto mb-2 text-muted-foreground shadow-inner">
            <CalendarClock className="size-7" />
          </div>
          <h3 className="font-extrabold text-lg text-foreground">Nenhum post encontrado</h3>
          <p className="text-muted-foreground text-xs max-w-sm mx-auto leading-relaxed">
            {statusFilter === "pending"
              ? "Não há nenhum post agendado na fila com os filtros selecionados."
              : statusFilter === "published"
                ? "Nenhum post publicado no histórico recente com os filtros selecionados."
                : "Nenhum agendamento encontrado para esta exibição."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-3">
            {filteredPosts.map((p) => {
              const meta = statusMeta[p.status] || statusMeta.pending;
              const Icon = meta.icon;

              return (
                <div
                  key={p.id}
                  className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm p-4 flex gap-4 shadow-card hover:bg-card/90 transition-colors"
                >
                  {p.cover_url ? (
                    <img
                      src={p.cover_url}
                      alt="Capa"
                      className="size-24 rounded-xl object-cover bg-background shrink-0 ring-1 ring-border/40 shadow-sm"
                      loading="lazy"
                    />
                  ) : p.video_url ? (
                    <video
                      src={p.video_url}
                      className="size-24 rounded-xl object-cover bg-background shrink-0 ring-1 ring-border/40 shadow-sm"
                      muted
                      preload="none"
                    />
                  ) : (
                    <div
                      className="size-24 rounded-xl bg-secondary/60 flex flex-col items-center justify-center shrink-0 border border-border/40 shadow-inner gap-1.5"
                      title="Vídeo limpo para economia de espaço"
                    >
                      <Video className="size-6 text-muted-foreground/60" />
                      <span className="text-[9px] text-muted-foreground/80 font-bold">Limpo</span>
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                          <span className="font-bold text-foreground flex items-center gap-1.5">
                            {p.instagram_accounts?.account_categories?.color && (
                              <span
                                className="size-2 rounded-full shrink-0 ring-1 ring-white/10"
                                style={{
                                  backgroundColor: p.instagram_accounts.account_categories.color,
                                }}
                              />
                            )}
                            @{p.instagram_accounts?.username ?? "—"}
                          </span>
                          <span>•</span>
                          <span className="font-mono">
                            {new Date(p.scheduled_at).toLocaleString("pt-BR", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </span>
                          {p.is_trial && (
                            <>
                              <span>•</span>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-primary/15 text-primary border border-primary/30">
                                🧪 Teste
                              </span>
                            </>
                          )}
                        </div>

                        <p className="mt-1.5 text-xs line-clamp-2 text-foreground/90 leading-relaxed font-normal">
                          {p.caption || (
                            <span className="text-muted-foreground italic">Sem legenda</span>
                          )}
                        </p>

                        {(() => {
                          const parsed = parseErrorMessage(p.error_message);
                          if (!parsed) return null;
                          return (
                            <div className="mt-2 flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-2.5 py-1.5">
                              <span className="text-sm leading-none mt-0.5 shrink-0">{parsed.icon}</span>
                              <div className="min-w-0">
                                <span className="text-xs font-bold text-destructive">{parsed.label}</span>
                                <p className="text-[11px] text-foreground/70 leading-snug mt-0.5">{parsed.description}</p>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-bold ${meta.cls}`}
                        >
                          <Icon className="size-3" /> {meta.label}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => remove(p.id)}
                          className="hover:bg-destructive/10 hover:text-destructive text-muted-foreground size-8 rounded-lg cursor-pointer"
                          title="Excluir este post"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => load(false)}
                disabled={loadingMore}
                className="font-bold text-xs border-border/80 hover:bg-secondary h-10 px-6 rounded-xl cursor-pointer"
              >
                {loadingMore ? "Carregando mais..." : "Carregar mais posts"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
