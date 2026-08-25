import { createFileRoute } from "@tanstack/react-router";
import { parseErrorMessage } from "@/lib/error-messages";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Trash2,
  UserMinus,
  Video,
  Calendar,
  AlertOctagon,
  HelpCircle,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/failed")({
  head: () => ({ meta: [{ title: "Vídeos com Falha — Reelary" }] }),
  component: () => (
    <AppShell>
      <FailedPostsPage />
    </AppShell>
  ),
});

type FailedPost = {
  id: string;
  caption: string;
  video_url: string;
  cover_url: string | null;
  scheduled_at: string;
  status: "pending" | "published" | "failed";
  error_message: string | null;
  instagram_account_id: string;
  instagram_accounts: {
    id: string;
    username: string;
  } | null;
};

function FailedPostsPage() {
  const [posts, setPosts] = useState<FailedPost[]>([]);
  const [bannedAccounts, setBannedAccounts] = useState<{ id: string; username: string }[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const { data: postsData, error: postsError } = await supabase
        .from("scheduled_posts")
        .select(
          "id, caption, video_url, cover_url, scheduled_at, status, error_message, instagram_account_id, instagram_accounts(id, username)",
        )
        .eq("status", "failed")
        .order("scheduled_at", { ascending: false });

      if (postsError) throw postsError;
      setPosts((postsData as any) ?? []);

      const { data: bannedData, error: bannedError } = await supabase
        .from("instagram_accounts")
        .select("id, username")
        .eq("token_invalid", true);

      if (bannedError) throw bannedError;
      setBannedAccounts(bannedData ?? []);
    } catch (err: any) {
      toast.error(err.message || "Erro ao carregar dados de falhas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function deleteAccount(accountId: string, username: string) {
    if (
      !confirm(
        `Tem certeza que deseja EXCLUIR permanentemente a conta @${username} do Reelary? Todos os agendamentos dela serão removidos.`,
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase.from("instagram_accounts").delete().eq("id", accountId);
      if (error) throw error;

      toast.success(`Conta @${username} excluída com sucesso!`);

      // If the deleted account was the active one, clear it
      const storedActiveId = localStorage.getItem("active_ig_account_id");
      if (storedActiveId === accountId) {
        localStorage.removeItem("active_ig_account_id");
        window.dispatchEvent(new Event("active-account-changed"));
      }

      load();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir conta");
    }
  }

  async function deleteFailedPost(postId: string) {
    if (!confirm("Excluir este vídeo com falha do sistema?")) return;

    try {
      const { error } = await supabase.from("scheduled_posts").delete().eq("id", postId);
      if (error) throw error;

      toast.success("Vídeo com falha excluído com sucesso!");
      load();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir vídeo");
    }
  }

  async function deleteAllFailedPosts() {
    if (
      !confirm(
        `Tem certeza que deseja excluir TODOS os ${posts.length} vídeos com falha? Essa ação é permanente.`
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase.from("scheduled_posts").delete().eq("status", "failed");
      if (error) throw error;

      toast.success("Todas as falhas foram excluídas com sucesso!");
      load();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir falhas");
    }
  }

  async function deleteAllBannedAccounts() {
    if (bannedAccounts.length === 0) {
      toast.info("Nenhuma conta banida para excluir.");
      return;
    }

    const usernames = bannedAccounts.map((a) => `@${a.username}`).join(", ");
    if (
      !confirm(
        `Tem certeza que deseja EXCLUIR permanentemente as seguintes ${bannedAccounts.length} contas banidas: ${usernames}? Todos os agendamentos delas serão removidos.`
      )
    ) {
      return;
    }

    try {
      const accountIds = bannedAccounts.map((a) => a.id);
      const { error } = await supabase
        .from("instagram_accounts")
        .delete()
        .in("id", accountIds);

      if (error) throw error;

      toast.success("Todas as contas banidas foram excluídas com sucesso!");

      // If any of the deleted accounts was the active one, clear it
      const storedActiveId = localStorage.getItem("active_ig_account_id");
      if (storedActiveId && accountIds.includes(storedActiveId)) {
        localStorage.removeItem("active_ig_account_id");
        window.dispatchEvent(new Event("active-account-changed"));
      }

      load();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir contas banidas");
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <AlertTriangle className="size-8 text-destructive animate-pulse" />
            Análise de Falhas
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie e resolva problemas de vídeos que falharam ao publicar no Instagram.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 sm:self-center">
          {bannedAccounts.length > 0 && (
            <Button
              variant="destructive"
              onClick={deleteAllBannedAccounts}
              className="font-semibold gap-1.5 hover:opacity-90 transition rounded-xl cursor-pointer"
            >
              <UserMinus className="size-4" />
              Excluir Contas Banidas ({bannedAccounts.length})
            </Button>
          )}
          {posts.length > 0 && (
            <Button
              variant="outline"
              onClick={deleteAllFailedPosts}
              className="font-semibold gap-1.5 text-muted-foreground hover:text-foreground border-border hover:bg-secondary rounded-xl cursor-pointer"
            >
              <Trash2 className="size-4" />
              Excluir Todas as Falhas
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-card animate-pulse" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/80 p-16 text-center bg-card/30">
          <div className="size-14 rounded-2xl bg-success/15 grid place-items-center mx-auto mb-4 border border-success/30">
            <AlertOctagon className="size-7 text-success" />
          </div>
          <h3 className="font-semibold text-lg text-foreground">Nenhuma falha identificada</h3>
          <p className="text-muted-foreground text-sm mt-2 max-w-sm mx-auto">
            Excelente! Nenhum de seus Reels agendados falhou recentemente ou todos os erros já foram
            resolvidos.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {posts.map((p) => {
            const username = p.instagram_accounts?.username ?? "Conta desconhecida";
            const accountId = p.instagram_account_id;

            return (
              <div
                key={p.id}
                className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl p-5 flex flex-col md:flex-row gap-5 shadow-card hover:border-border transition-all duration-300"
              >
                {/* Video Column */}
                <div className="shrink-0 flex items-center justify-center">
                  {p.video_url ? (
                    <video
                      src={p.video_url}
                      className="w-24 h-36 md:w-28 md:h-40 rounded-xl object-cover bg-background border border-border/40 shadow-md"
                      muted
                      controls
                      preload="metadata"
                    />
                  ) : (
                    <div
                      className="w-24 h-36 md:w-28 md:h-40 rounded-xl bg-secondary/60 flex flex-col items-center justify-center border border-border/40 shadow-inner gap-1.5"
                      title="Vídeo removido para economizar espaço"
                    >
                      <Video className="size-8 text-muted-foreground/60" />
                      <span className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider">
                        Limpo
                      </span>
                    </div>
                  )}
                </div>

                {/* Details Column */}
                <div className="flex-1 flex flex-col justify-between min-w-0">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground text-sm px-2.5 py-0.5 rounded-full bg-secondary/80 border border-border/50">
                        @{username}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1.5">
                        <Calendar className="size-3.5" />
                        {new Date(p.scheduled_at).toLocaleString("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>

                    <p className="text-sm line-clamp-2 text-foreground/90 font-medium">
                      {p.caption || (
                        <span className="text-muted-foreground italic">Sem legenda</span>
                      )}
                    </p>

                    {/* Error Callout */}
                    {(() => {
                      const parsed = parseErrorMessage(p.error_message);
                      if (!parsed) return null;
                      return (
                        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 mt-3 flex items-start gap-3">
                          <span className="text-lg leading-none mt-0.5 shrink-0">{parsed.icon}</span>
                          <div className="space-y-1.5 min-w-0">
                            <span className="text-xs font-bold text-destructive uppercase tracking-wider">
                              {parsed.label}
                            </span>
                            <p className="text-xs text-foreground/80 leading-relaxed">
                              {parsed.description}
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Actions Row */}
                  <div className="flex flex-wrap gap-3 mt-5 border-t border-border/40 pt-4">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteAccount(accountId, username)}
                      disabled={!p.instagram_accounts}
                      className="font-semibold gap-1.5 hover:opacity-90 transition rounded-xl cursor-pointer"
                    >
                      <UserMinus className="size-4" />
                      Excluir Conta Banida
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteFailedPost(p.id)}
                      className="font-semibold gap-1.5 text-muted-foreground hover:text-foreground border-border hover:bg-secondary rounded-xl cursor-pointer"
                    >
                      <Trash2 className="size-4" />
                      Excluir Reel Falho
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
