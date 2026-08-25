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
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { deleteR2File } from "@/lib/r2.functions";

export const Route = createFileRoute("/posts")({
  head: () => ({ meta: [{ title: "Agendados — Reelary" }] }),
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
  instagram_account_id: string;
  instagram_accounts: {
    username: string;
    category_id: string | null;
    account_categories: { color: string } | null;
  } | null;
};

const statusMeta = {
  pending: { label: "Agendado", icon: Clock, cls: "bg-warning/15 text-warning border-warning/30" },
  published: {
    label: "Publicado",
    icon: CheckCircle2,
    cls: "bg-success/15 text-success border-success/30",
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

  // Bulk delete state
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [deleteSelectedAccounts, setDeleteSelectedAccounts] = useState<string[]>([]);
  const [pendingCountByAccount, setPendingCountByAccount] = useState<Record<string, number>>({});
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

  // Count pending posts per account
  useEffect(() => {
    supabase
      .from("scheduled_posts")
      .select("instagram_account_id")
      .eq("status", "pending")
      .then(({ data }) => {
        const counts: Record<string, number> = {};
        if (data) {
          data.forEach((row: any) => {
            const accId = row.instagram_account_id;
            counts[accId] = (counts[accId] || 0) + 1;
          });
        }
        setPendingCountByAccount(counts);
      });
  }, [posts]);

  async function load(isInitial = true) {
    if (isInitial) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    const startOffset = isInitial ? 0 : posts.length;
    const endOffset = startOffset + 49;

    const { data, error } = await supabase
      .from("scheduled_posts")
      .select(
        "id, caption, video_url, cover_url, scheduled_at, status, error_message, instagram_account_id, instagram_accounts(username, category_id, account_categories(color))",
      )
      .order("scheduled_at", { ascending: true })
      .range(startOffset, endOffset);

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
  }, []);

  async function remove(id: string) {
    if (!confirm("Excluir este agendamento?")) return;
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

      toast.success("Agendamento excluído");
      load();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir agendamento.");
    }
  }

  // Bulk delete handler
  async function handleBulkDelete() {
    if (deleteSelectedAccounts.length === 0) {
      toast.error("Selecione pelo menos uma conta para excluir agendamentos.");
      return;
    }

    const totalPending = deleteSelectedAccounts.reduce(
      (sum, accId) => sum + (pendingCountByAccount[accId] || 0),
      0,
    );

    if (totalPending === 0) {
      toast.info("Nenhum agendamento pendente para as contas selecionadas.");
      return;
    }

    const accountNames = deleteSelectedAccounts
      .map((id) => {
        const acc = accounts.find((a) => a.id === id);
        return acc ? `@${acc.username}` : id;
      })
      .join(", ");

    if (
      !confirm(
        `Excluir ${totalPending} agendamento(s) pendente(s) de ${accountNames}?\n\nEsta ação não pode ser desfeita.`,
      )
    )
      return;

    setBulkDeleting(true);

    try {
      // 1. Fetch all pending posts for selected accounts to delete R2 files
      const { data: postsToDelete, error: fetchErr } = await supabase
        .from("scheduled_posts")
        .select("id, video_url, cover_url")
        .eq("status", "pending")
        .in("instagram_account_id", deleteSelectedAccounts);

      if (fetchErr) throw fetchErr;

      // 2. Delete R2 files (best effort, don't block on failures)
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

      // 3. Delete from database
      const { error: deleteErr } = await supabase
        .from("scheduled_posts")
        .delete()
        .eq("status", "pending")
        .in("instagram_account_id", deleteSelectedAccounts);

      if (deleteErr) throw deleteErr;

      toast.success(
        `${postsToDelete?.length || totalPending} agendamento(s) excluído(s) com sucesso!`,
      );
      setDeleteSelectedAccounts([]);
      load(true);
    } catch (err: any) {
      console.error("Erro no bulk delete:", err);
      toast.error(err.message || "Erro ao excluir agendamentos em massa.");
    } finally {
      setBulkDeleting(false);
    }
  }

  const totalSelectedPending = deleteSelectedAccounts.reduce(
    (sum, accId) => sum + (pendingCountByAccount[accId] || 0),
    0,
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reels agendados</h1>
          <p className="text-muted-foreground mt-1">Acompanhe o status de cada publicação</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Bulk Delete Dropdown */}
          {accounts.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="justify-between border-destructive/30 hover:bg-destructive/10 hover:border-destructive/50 rounded-xl text-sm font-medium h-11 px-3.5 flex items-center bg-card gap-2"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Trash2 className="size-4 text-destructive shrink-0" />
                    {deleteSelectedAccounts.length === 0 ? (
                      <span className="text-muted-foreground text-sm font-normal">
                        Excluir agendamentos
                      </span>
                    ) : (
                      <span className="text-destructive font-semibold">
                        {deleteSelectedAccounts.length} conta(s)
                      </span>
                    )}
                  </div>
                  <ChevronDown className="size-4 text-muted-foreground opacity-60 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-80 bg-popover border border-border/60 p-3 shadow-card rounded-xl z-50"
              >
                <div className="text-xs text-muted-foreground font-semibold flex items-center justify-between pb-2 mb-2 border-b border-border/40">
                  <span>Excluir Agendamentos Pendentes</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteSelectedAccounts(accounts.map((a) => a.id));
                      }}
                      className="text-[10px] text-primary hover:underline font-bold bg-transparent border-0 cursor-pointer"
                    >
                      Todas
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteSelectedAccounts([]);
                      }}
                      className="text-[10px] text-destructive hover:underline font-bold bg-transparent border-0 cursor-pointer"
                    >
                      Limpar
                    </button>
                  </div>
                </div>
                <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                  {accounts.map((a) => {
                    const isChecked = deleteSelectedAccounts.includes(a.id);
                    const pendingCount = pendingCountByAccount[a.id] || 0;
                    return (
                      <label
                        key={a.id}
                        className="flex items-center justify-between px-2 py-2 rounded-lg hover:bg-secondary/60 cursor-pointer text-xs font-semibold select-none transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setDeleteSelectedAccounts((prev) => [...prev, a.id]);
                              } else {
                                setDeleteSelectedAccounts((prev) =>
                                  prev.filter((id) => id !== a.id),
                                );
                              }
                            }}
                          />
                          <span className="flex items-center gap-2 truncate">
                            {a.account_categories && (
                              <span
                                className="size-2.5 rounded-full shrink-0 ring-1 ring-white/10"
                                style={{ backgroundColor: a.account_categories.color }}
                              />
                            )}
                            <span className="text-foreground">@{a.username}</span>
                          </span>
                        </div>
                        {pendingCount > 0 ? (
                          <span className="text-[10px] text-warning bg-warning/10 border border-warning/20 px-1.5 py-0.5 rounded-md font-mono shrink-0 ml-2">
                            {pendingCount} pend.
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

                {/* Delete action */}
                <div className="mt-3 pt-3 border-t border-border/40">
                  {totalSelectedPending > 0 && (
                    <p className="text-[10px] text-destructive flex items-center gap-1 mb-2">
                      <AlertTriangle className="size-3 shrink-0" />
                      {totalSelectedPending} agendamento(s) pendente(s) serão excluídos
                      permanentemente.
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="w-full rounded-lg text-xs font-bold h-9"
                    disabled={deleteSelectedAccounts.length === 0 || bulkDeleting}
                    onClick={handleBulkDelete}
                  >
                    {bulkDeleting ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin mr-1.5" />
                        Excluindo...
                      </>
                    ) : (
                      <>
                        <Trash2 className="size-3.5 mr-1.5" />
                        Excluir Agendamentos
                      </>
                    )}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}

          <Link to="/schedule">
            <Button className="bg-gradient-brand text-primary-foreground border-0 hover:opacity-90">
              <Plus className="size-4" /> Novo Reel
            </Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-card animate-pulse" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/80 p-16 text-center bg-card/30">
          <div className="size-14 rounded-2xl bg-secondary grid place-items-center mx-auto mb-4">
            <CalendarClock className="size-7 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg">Nada agendado</h3>
          <p className="text-muted-foreground text-sm mt-2">
            Crie seu primeiro agendamento de Reel.
          </p>
          <Link to="/schedule">
            <Button className="mt-6 bg-gradient-brand text-primary-foreground border-0">
              <Plus className="size-4" /> Agendar Reel
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-3">
            {posts.map((p) => {
              const meta = statusMeta[p.status];
              const Icon = meta.icon;
              return (
                <div
                  key={p.id}
                  className="rounded-2xl border border-border/60 bg-card p-4 flex gap-4 shadow-card"
                >
                  {p.video_url ? (
                    <video
                      src={p.video_url}
                      className="size-24 rounded-xl object-cover bg-background shrink-0"
                      muted
                      preload="metadata"
                    />
                  ) : (
                    <div
                      className="size-24 rounded-xl bg-secondary/60 flex flex-col items-center justify-center shrink-0 border border-border/40 shadow-inner gap-1.5"
                      title="Vídeo removido para economizar espaço"
                    >
                      <Video className="size-6 text-muted-foreground/60" />
                      <span className="text-[9px] text-muted-foreground/80 font-bold">Limpo</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground flex items-center gap-1.5">
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
                          <span>
                            {new Date(p.scheduled_at).toLocaleString("pt-BR", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm line-clamp-2 text-foreground/90">
                          {p.caption || (
                            <span className="text-muted-foreground italic">Sem legenda</span>
                          )}
                        </p>
                        {(() => {
                          const parsed = parseErrorMessage(p.error_message);
                          if (!parsed) return null;
                          return (
                            <div className="mt-2 flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/8 px-2.5 py-1.5">
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
                          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${meta.cls}`}
                        >
                          <Icon className="size-3" /> {meta.label}
                        </span>
                        <Button variant="ghost" size="icon" onClick={() => remove(p.id)}>
                          <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
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
                className="font-bold text-xs border-border hover:bg-secondary h-11 px-6 rounded-xl cursor-pointer"
              >
                {loadingMore ? "Carregando..." : "Carregar mais"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
