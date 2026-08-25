import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Instagram,
  Plus,
  Trash2,
  AlertCircle,
  Star,
  Eye,
  EyeOff,
  Tag,
  Pencil,
  X,
  Palette,
  Check,
  Search,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { buildInstagramAuthUrl, buildFacebookAuthUrl } from "@/lib/instagram";
import { getMetaAppId } from "@/lib/instagram.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/accounts")({
  head: () => ({ meta: [{ title: "Contas do Instagram — Reelary" }] }),
  component: () => (
    <AppShell>
      <AccountsPage />
    </AppShell>
  ),
});

// ─── Types ──────────────────────────────────────────────────────────────────────

type Category = {
  id: string;
  name: string;
  color: string;
  user_id: string;
  created_at: string;
};

type IgAccount = {
  id: string;
  username: string;
  instagram_user_id: string;
  token_expires_at: string | null;
  created_at: string;
  hidden: boolean;
  category_id: string | null;
  account_categories: { id: string; name: string; color: string } | null;
  token_invalid?: boolean;
};

// ─── Color Palette ──────────────────────────────────────────────────────────────

const CATEGORY_COLORS = [
  { value: "#ef4444", label: "Vermelho" },
  { value: "#f97316", label: "Laranja" },
  { value: "#f59e0b", label: "Âmbar" },
  { value: "#22c55e", label: "Verde" },
  { value: "#14b8a6", label: "Teal" },
  { value: "#06b6d4", label: "Ciano" },
  { value: "#3b82f6", label: "Azul" },
  { value: "#6366f1", label: "Índigo" },
  { value: "#8b5cf6", label: "Violeta" },
  { value: "#d946ef", label: "Fúcsia" },
  { value: "#ec4899", label: "Rosa" },
  { value: "#f43f5e", label: "Coral" },
];

// ─── Category Dot Component ─────────────────────────────────────────────────────

function CategoryBadge({ category }: { category: { name: string; color: string } | null }) {
  if (!category) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border transition"
      style={{
        backgroundColor: `${category.color}18`,
        borderColor: `${category.color}40`,
        color: category.color,
      }}
    >
      <span
        className="size-1.5 rounded-full shrink-0"
        style={{ backgroundColor: category.color }}
      />
      {category.name}
    </span>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

function AccountsPage() {
  const [accounts, setAccounts] = useState<IgAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [appId, setAppId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectingFacebook, setConnectingFacebook] = useState(false);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [showHiddenList, setShowHiddenList] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Category modal state
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryColor, setCategoryColor] = useState(CATEGORY_COLORS[0].value);
  const [savingCategory, setSavingCategory] = useState(false);

  // Manual connection modal state
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualIgUserId, setManualIgUserId] = useState("");
  const [manualUsername, setManualUsername] = useState("");
  const [manualAccessToken, setManualAccessToken] = useState("");
  const [savingManual, setSavingManual] = useState(false);

  const fetchAppId = useServerFn(getMetaAppId);

  // ─── Data Loading ───────────────────────────────────────────────────────────

  async function loadCategories() {
    const { data, error } = await supabase
      .from("account_categories")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw error;
    setCategories(data ?? []);
  }

  async function load() {
    try {
      const { data, error } = await supabase
        .from("instagram_accounts")
        .select(
          "id, username, instagram_user_id, token_expires_at, created_at, hidden, category_id, token_invalid, account_categories(id, name, color)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;

      setAccounts((data as any) ?? []);

      // Load current active account
      const storedId = localStorage.getItem("active_ig_account_id");
      if (storedId) {
        setActiveAccountId(storedId);
      } else if (data && data.length > 0) {
        setActiveAccountId(data[0].id);
        localStorage.setItem("active_ig_account_id", data[0].id);
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao carregar contas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    Promise.all([load(), loadCategories()]);
    fetchAppId()
      .then((r) => setAppId(r.appId))
      .catch(() => setAppId(null));

    // Sync active account if changed elsewhere (e.g. topbar)
    const handleActiveAccountChange = () => {
      const storedId = localStorage.getItem("active_ig_account_id");
      if (storedId) {
        setActiveAccountId(storedId);
      }
    };
    window.addEventListener("active-account-changed", handleActiveAccountChange);
    return () => window.removeEventListener("active-account-changed", handleActiveAccountChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Account Actions ────────────────────────────────────────────────────────

  async function hideAccount(id: string, username: string) {
    try {
      const { error } = await supabase
        .from("instagram_accounts")
        .update({ hidden: true })
        .eq("id", id);
      if (error) throw error;

      toast.success(`Conta @${username} oculta com sucesso!`);

      const storedActiveId = localStorage.getItem("active_ig_account_id");
      if (storedActiveId === id) {
        const nextActive = accounts.find((a) => a.id !== id && !a.hidden);
        if (nextActive) {
          localStorage.setItem("active_ig_account_id", nextActive.id);
          setActiveAccountId(nextActive.id);
        } else {
          localStorage.removeItem("active_ig_account_id");
          setActiveAccountId(null);
        }
        window.dispatchEvent(new Event("active-account-changed"));
      }

      load();
    } catch (err: any) {
      toast.error(err.message || "Erro ao ocultar conta");
    }
  }

  async function unhideAccount(id: string, username: string) {
    try {
      const { error } = await supabase
        .from("instagram_accounts")
        .update({ hidden: false })
        .eq("id", id);
      if (error) throw error;

      toast.success(`Conta @${username} visível novamente!`);

      const storedActiveId = localStorage.getItem("active_ig_account_id");
      if (!storedActiveId) {
        localStorage.setItem("active_ig_account_id", id);
        setActiveAccountId(id);
        window.dispatchEvent(new Event("active-account-changed"));
      }

      load();
    } catch (err: any) {
      toast.error(err.message || "Erro ao reexibir conta");
    }
  }

  async function disconnect(id: string) {
    if (
      !confirm(
        "Desconectar esta conta do Instagram? Os agendamentos pendentes dela serão removidos.",
      )
    )
      return;
    try {
      const { error } = await supabase.from("instagram_accounts").delete().eq("id", id);
      if (error) throw error;

      toast.success("Conta desconectada com sucesso!");

      const storedId = localStorage.getItem("active_ig_account_id");
      if (storedId === id) {
        localStorage.removeItem("active_ig_account_id");
        window.dispatchEvent(new Event("active-account-changed"));
      }

      load();
    } catch (err: any) {
      toast.error(err.message || "Erro ao desconectar conta");
    }
  }

  function makeActive(account: IgAccount) {
    localStorage.setItem("active_ig_account_id", account.id);
    setActiveAccountId(account.id);
    window.dispatchEvent(new Event("active-account-changed"));
    toast.success(`Conta ativa alterada para @${account.username}`);
  }

  function connect() {
    if (!appId) {
      toast.error("Meta App ID não configurado no servidor");
      return;
    }
    setConnecting(true);
    window.location.href = buildInstagramAuthUrl(appId);
  }

  function connectFacebook() {
    if (!appId) {
      toast.error("Meta App ID não configurado no servidor");
      return;
    }
    setConnectingFacebook(true);
    window.location.href = buildFacebookAuthUrl(appId);
  }

  async function handleManualConnectSubmit(e: FormEvent) {
    e.preventDefault();
    if (!manualUsername.trim() || !manualIgUserId.trim() || !manualAccessToken.trim()) {
      toast.error("Todos os 3 campos são obrigatórios.");
      return;
    }

    setSavingManual(true);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        throw new Error("Sessão expirada ou usuário não autenticado.");
      }
      const uid = userData.user.id;

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 60);
      const tokenExpiresAt = expiresAt.toISOString();

      const { data: upsertData, error: upsertErr } = await supabase
        .from("instagram_accounts")
        .upsert(
          {
            user_id: uid,
            instagram_user_id: manualIgUserId.trim(),
            username: manualUsername.trim(),
            access_token: manualAccessToken.trim(),
            token_expires_at: tokenExpiresAt,
            token_invalid: false,
          },
          { onConflict: "user_id,instagram_user_id" } as any,
        )
        .select("id");

      if (upsertErr) {
        // Fallback simple insert if upsert fails
        const { data: insData, error: insErr } = await supabase
          .from("instagram_accounts")
          .insert({
            user_id: uid,
            instagram_user_id: manualIgUserId.trim(),
            username: manualUsername.trim(),
            access_token: manualAccessToken.trim(),
            token_expires_at: tokenExpiresAt,
            token_invalid: false,
          })
          .select("id");

        if (insErr) {
          throw insErr;
        }

        if (insData && insData[0]) {
          const storedActiveId = localStorage.getItem("active_ig_account_id");
          if (!storedActiveId) {
            localStorage.setItem("active_ig_account_id", insData[0].id);
            setActiveAccountId(insData[0].id);
          }
        }
      } else if (upsertData && upsertData[0]) {
        const storedActiveId = localStorage.getItem("active_ig_account_id");
        if (!storedActiveId) {
          localStorage.setItem("active_ig_account_id", upsertData[0].id);
          setActiveAccountId(upsertData[0].id);
        }
      }

      toast.success(`Conta @${manualUsername.trim()} conectada manualmente com sucesso!`);

      // Reset form
      setManualUsername("");
      setManualIgUserId("");
      setManualAccessToken("");
      setShowManualModal(false);

      // Reload lists and dispatch event for updating UI elsewhere
      await load();
      window.dispatchEvent(new Event("active-account-changed"));
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar conexão manual");
    } finally {
      setSavingManual(false);
    }
  }

  // ─── Category CRUD ──────────────────────────────────────────────────────────

  function openCreateCategory() {
    setEditingCategory(null);
    setCategoryName("");
    setCategoryColor(CATEGORY_COLORS[0].value);
    setShowCategoryModal(true);
  }

  function openEditCategory(cat: Category) {
    setEditingCategory(cat);
    setCategoryName(cat.name);
    setCategoryColor(cat.color);
    setShowCategoryModal(true);
  }

  async function saveCategory() {
    if (!categoryName.trim()) {
      toast.error("Digite um nome para a categoria");
      return;
    }

    setSavingCategory(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Sessão expirada");

      if (editingCategory) {
        // Update
        const { error } = await supabase
          .from("account_categories")
          .update({ name: categoryName.trim(), color: categoryColor })
          .eq("id", editingCategory.id);
        if (error) throw error;
        toast.success(`Categoria "${categoryName.trim()}" atualizada!`);
      } else {
        // Create
        const { error } = await supabase.from("account_categories").insert({
          user_id: uid,
          name: categoryName.trim(),
          color: categoryColor,
        });
        if (error) throw error;
        toast.success(`Categoria "${categoryName.trim()}" criada!`);
      }

      setShowCategoryModal(false);
      await Promise.all([loadCategories(), load()]);
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar categoria");
    } finally {
      setSavingCategory(false);
    }
  }

  async function deleteCategory(cat: Category) {
    if (!confirm(`Excluir a categoria "${cat.name}"? As contas associadas ficarão sem categoria.`))
      return;
    try {
      const { error } = await supabase.from("account_categories").delete().eq("id", cat.id);
      if (error) throw error;
      toast.success(`Categoria "${cat.name}" excluída`);
      await Promise.all([loadCategories(), load()]);
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir categoria");
    }
  }

  async function assignCategory(accountId: string, categoryId: string | null) {
    try {
      const { error } = await supabase
        .from("instagram_accounts")
        .update({ category_id: categoryId })
        .eq("id", accountId);
      if (error) throw error;

      const catName = categoryId ? categories.find((c) => c.id === categoryId)?.name : null;
      toast.success(catName ? `Categoria "${catName}" atribuída` : "Categoria removida");
      load();
    } catch (err: any) {
      toast.error(err.message || "Erro ao atribuir categoria");
    }
  }

  // ─── Derived Data ───────────────────────────────────────────────────────────

  const configured = !!appId;
  const visibleAccounts = accounts.filter((a) => !a.hidden);
  const hiddenAccounts = accounts.filter((a) => a.hidden);

  const filteredVisibleAccounts = visibleAccounts.filter((a) => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    return (
      a.username.toLowerCase().includes(term) ||
      a.instagram_user_id.toLowerCase().includes(term) ||
      (a.account_categories?.name.toLowerCase().includes(term) ?? false)
    );
  });

  const filteredHiddenAccounts = hiddenAccounts.filter((a) => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    return (
      a.username.toLowerCase().includes(term) ||
      a.instagram_user_id.toLowerCase().includes(term) ||
      (a.account_categories?.name.toLowerCase().includes(term) ?? false)
    );
  });

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Contas do Instagram</h1>
          <p className="text-muted-foreground mt-1.5">
            Conecte suas contas comerciais do Instagram para agendar Reels automaticamente.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            onClick={openCreateCategory}
            variant="outline"
            className="border-border/60 hover:bg-secondary font-semibold rounded-xl h-10 gap-2"
          >
            <Palette className="size-4 text-primary" /> Categorias
          </Button>
          <Button
            onClick={connectFacebook}
            disabled={connectingFacebook}
            className="bg-[#1877F2] text-white border-0 hover:bg-[#166FE5] font-semibold rounded-xl h-10 gap-2 shadow-md"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            Conectar via Facebook
          </Button>
          <Button
            onClick={() => setShowManualModal(true)}
            variant="outline"
            className="border-border/60 hover:bg-secondary font-semibold rounded-xl h-10 gap-2"
          >
            Conectar Manualmente
          </Button>
        </div>
      </div>

      {/* Category pills row */}
      {categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 animate-in fade-in duration-300">
          <span className="text-xs text-muted-foreground font-semibold mr-1">Categorias:</span>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => openEditCategory(cat)}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border transition hover:scale-105 cursor-pointer"
              style={{
                backgroundColor: `${cat.color}18`,
                borderColor: `${cat.color}40`,
                color: cat.color,
              }}
              title={`Editar categoria "${cat.name}"`}
            >
              <span
                className="size-2 rounded-full shrink-0"
                style={{ backgroundColor: cat.color }}
              />
              {cat.name}
              <span className="text-[9px] opacity-60 ml-0.5">
                ({accounts.filter((a) => a.category_id === cat.id).length})
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Search Input */}
      {accounts.length > 0 && (
        <div className="max-w-md w-full relative animate-in fade-in duration-300">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Pesquisar contas por nome, ID ou categoria..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-10 h-11 bg-card border-border/60 rounded-xl"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      )}

      {!configured && (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 p-5 flex gap-4 animate-in fade-in duration-300">
          <AlertCircle className="size-5 text-warning shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold text-foreground">Configuração da Meta pendente</p>
            <p className="text-muted-foreground mt-1.5 leading-relaxed">
              Adicione os secrets{" "}
              <code className="text-xs bg-secondary px-1.5 py-0.5 rounded text-foreground font-mono">
                META_APP_ID
              </code>{" "}
              e{" "}
              <code className="text-xs bg-secondary px-1.5 py-0.5 rounded text-foreground font-mono">
                META_APP_SECRET
              </code>{" "}
              nas variáveis de ambiente da Lovable Cloud para ativar o login do Instagram.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-44 rounded-2xl bg-card border border-border/50 animate-pulse"
            />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border/80 p-16 text-center bg-card/25 backdrop-blur-sm max-w-2xl mx-auto">
          <div className="size-16 rounded-2xl bg-gradient-brand grid place-items-center mx-auto mb-6 shadow-glow">
            <Instagram className="size-8 text-primary-foreground" />
          </div>
          <h3 className="font-bold text-xl">Nenhuma conta vinculada</h3>
          <p className="text-muted-foreground text-sm mt-2.5 max-w-md mx-auto leading-relaxed">
            Vincule sua primeira conta do Instagram para desbloquear o agendamento de Reels e
            acompanhar suas publicações em nosso calendário integrado.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              onClick={connect}
              className="bg-gradient-brand text-primary-foreground border-0 font-semibold shadow-glow w-full sm:w-auto"
            >
              <Instagram className="size-4 mr-2" /> Conectar Conta Comercial
            </Button>
            <Button
              onClick={() => setShowManualModal(true)}
              variant="outline"
              className="border-border hover:bg-secondary font-semibold rounded-xl w-full sm:w-auto h-10 px-4"
            >
              Conectar Manualmente
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in duration-300">
          {visibleAccounts.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border/80 p-12 text-center bg-card/25 backdrop-blur-sm max-w-2xl mx-auto">
              <div className="size-16 rounded-2xl bg-secondary grid place-items-center mx-auto mb-6 shadow-sm">
                <EyeOff className="size-8 text-muted-foreground animate-pulse" />
              </div>
              <h3 className="font-bold text-xl">Todas as contas estão ocultas</h3>
              <p className="text-muted-foreground text-sm mt-2.5 max-w-md mx-auto leading-relaxed">
                Você ocultou todas as suas contas do Instagram deste painel. Você pode gerenciá-las
                ou reexibi-las na seção de contas ocultas abaixo.
              </p>
            </div>
          ) : filteredVisibleAccounts.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border/80 p-12 text-center bg-card/25 backdrop-blur-sm max-w-2xl mx-auto">
              <div className="size-16 rounded-2xl bg-secondary grid place-items-center mx-auto mb-6 shadow-sm">
                <Search className="size-8 text-muted-foreground" />
              </div>
              <h3 className="font-bold text-xl">Nenhuma conta ativa encontrada</h3>
              <p className="text-muted-foreground text-sm mt-2.5 max-w-md mx-auto leading-relaxed">
                Não encontramos nenhuma conta ativa correspondente a "<strong>{searchTerm}</strong>".
              </p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredVisibleAccounts.map((a) => {
                const isActive = activeAccountId === a.id;
                return (
                  <div
                    key={a.id}
                    className={`rounded-2xl border transition-all duration-300 p-5 shadow-card group bg-card/45 relative flex flex-col justify-between ${
                      isActive
                        ? "border-primary/80 ring-1 ring-primary/45 bg-primary/[0.02]"
                        : "border-border/50 hover:border-muted-foreground/40 hover:bg-card/75"
                    }`}
                    style={
                      a.account_categories
                        ? { borderTopColor: a.account_categories.color, borderTopWidth: "3px" }
                        : undefined
                    }
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="size-12 rounded-2xl bg-gradient-brand grid place-items-center shrink-0">
                            <Instagram className="size-6 text-primary-foreground" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-base truncate flex items-center gap-1.5">
                              @{a.username}
                              {isActive && (
                                <span
                                  className="size-2 rounded-full bg-success animate-pulse"
                                  title="Conta ativa"
                                />
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5 truncate">
                              ID: {a.instagram_user_id}
                            </div>
                            {(a.token_invalid || (a.token_expires_at && new Date(a.token_expires_at) <= new Date())) && (
                              <div className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border border-destructive/30 bg-destructive/10 text-destructive mt-1.5 animate-pulse">
                                <AlertCircle className="size-3 shrink-0" /> Token Expirado
                              </div>
                            )}
                            {a.account_categories && (
                              <div className="mt-1.5">
                                <CategoryBadge category={a.account_categories} />
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-0.5 shrink-0">
                          {/* Category assignment dropdown */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition"
                                title="Atribuir categoria"
                              >
                                <Tag className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="w-52 bg-card border border-border/60"
                            >
                              <DropdownMenuLabel className="text-xs text-muted-foreground font-semibold">
                                Categoria da Conta
                              </DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => assignCategory(a.id, null)}
                                className="cursor-pointer text-xs py-2 flex items-center justify-between"
                              >
                                <span className="text-muted-foreground">Sem categoria</span>
                                {!a.category_id && <Check className="size-3.5 text-success" />}
                              </DropdownMenuItem>
                              {categories.map((cat) => (
                                <DropdownMenuItem
                                  key={cat.id}
                                  onClick={() => assignCategory(a.id, cat.id)}
                                  className="cursor-pointer text-xs py-2 flex items-center justify-between"
                                >
                                  <span className="flex items-center gap-2 font-medium">
                                    <span
                                      className="size-3 rounded-full shrink-0 ring-1 ring-white/10"
                                      style={{ backgroundColor: cat.color }}
                                    />
                                    {cat.name}
                                  </span>
                                  {a.category_id === cat.id && (
                                    <Check className="size-3.5 text-success" />
                                  )}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={openCreateCategory}
                                className="cursor-pointer text-xs py-2 text-primary font-semibold"
                              >
                                <Plus className="size-3.5 mr-1.5" /> Nova Categoria
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => hideAccount(a.id, a.username)}
                            className="size-8 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition"
                            title="Ocultar conta do painel"
                          >
                            <EyeOff className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => disconnect(a.id)}
                            className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition"
                            title="Desconectar conta"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="mt-4 pt-4 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          Vinculada em {new Date(a.created_at).toLocaleDateString("pt-BR")}
                        </span>
                        {a.token_invalid || (a.token_expires_at && new Date(a.token_expires_at) <= new Date()) ? (
                          <span className="text-destructive font-bold flex items-center gap-1">
                            <AlertCircle className="size-3.5" /> Reconectar
                          </span>
                        ) : a.token_expires_at && (
                          <span className="text-warning">
                            Expira em {new Date(a.token_expires_at).toLocaleDateString("pt-BR")}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-6 pt-3 border-t border-border/40 flex gap-2">
                      {isActive ? (
                        <Button
                          disabled
                          className="flex-1 bg-primary/10 text-primary hover:bg-primary/10 border border-primary/20 h-9 font-semibold text-xs rounded-xl"
                        >
                          <Star className="size-3.5 mr-1.5 fill-primary text-primary" /> Conta
                          Selecionada
                        </Button>
                      ) : (
                        <Button
                          onClick={() => makeActive(a)}
                          variant="outline"
                          className="flex-1 border-border hover:border-primary/50 text-muted-foreground hover:text-foreground h-9 font-semibold text-xs rounded-xl transition cursor-pointer"
                        >
                          <Star className="size-3.5 mr-1.5 text-muted-foreground" /> Tornar Ativa
                        </Button>
                      )}
                      <Link to="/calendar" className="shrink-0">
                        <Button
                          size="icon"
                          className="size-9 bg-secondary hover:bg-secondary/70 text-foreground border border-border/60 rounded-xl"
                          title="Ir para o calendário de postagens"
                        >
                          <Plus className="size-4 text-primary" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {hiddenAccounts.length > 0 && (
            <div className="pt-6 border-t border-border/40">
              <Button
                variant="ghost"
                onClick={() => setShowHiddenList(!showHiddenList)}
                className="text-muted-foreground hover:text-foreground text-sm font-semibold flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition cursor-pointer"
              >
                {showHiddenList ? (
                  <>
                    <Eye className="size-4 text-primary" />
                    <span>Ocultar contas ocultas ({filteredHiddenAccounts.length})</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="size-4 text-muted-foreground" />
                    <span>Mostrar contas ocultas ({filteredHiddenAccounts.length})</span>
                  </>
                )}
              </Button>

              {showHiddenList && (
                filteredHiddenAccounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground mt-4 italic pl-4">
                    Nenhuma conta oculta corresponde à pesquisa.
                  </p>
                ) : (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-in slide-in-from-top-2 fade-in duration-300">
                    {filteredHiddenAccounts.map((a) => (
                      <div
                        key={a.id}
                        className="rounded-2xl border border-border/50 bg-card/30 p-4 flex items-center justify-between gap-3 shadow-sm hover:border-border transition"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="size-9 rounded-xl bg-secondary grid place-items-center shrink-0">
                            <Instagram className="size-5 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-sm truncate">@{a.username}</p>
                            <div className="flex items-center gap-2">
                              <p className="text-[10px] text-muted-foreground truncate">
                                ID: {a.instagram_user_id}
                              </p>
                              {a.account_categories && (
                                <CategoryBadge category={a.account_categories} />
                              )}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => unhideAccount(a.id, a.username)}
                          className="h-8 text-xs font-semibold px-3 rounded-xl border border-border/80 hover:border-primary/50 text-muted-foreground hover:text-foreground transition flex items-center gap-1.5 shrink-0"
                          title="Tornar conta visível no painel"
                        >
                          <Eye className="size-3.5 text-primary" />
                          <span>Reexibir</span>
                        </Button>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Category Management Dialog ──────────────────────────────────────── */}
      <Dialog open={showCategoryModal} onOpenChange={setShowCategoryModal}>
        <DialogContent className="sm:max-w-lg bg-card border border-border/60 rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-extrabold flex items-center gap-2">
              <Palette className="size-5 text-primary" />
              {editingCategory ? "Editar Categoria" : "Nova Categoria"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              {editingCategory
                ? "Altere o nome ou a cor desta categoria."
                : "Crie uma categoria colorida para organizar suas contas."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 mt-4">
            {/* Name Input */}
            <div className="space-y-2">
              <Label className="text-sm font-bold">Nome da Categoria</Label>
              <Input
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="Ex: Pessoal, Negócios, Clientes..."
                className="bg-secondary/40 border-border/60 rounded-xl h-10"
                maxLength={30}
                autoFocus
              />
            </div>

            {/* Color Selector */}
            <div className="space-y-2">
              <Label className="text-sm font-bold">Cor da Categoria</Label>
              <div className="grid grid-cols-6 gap-2.5">
                {CATEGORY_COLORS.map((c) => {
                  const isSelected = categoryColor === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCategoryColor(c.value)}
                      className={`group/color relative size-10 rounded-xl transition-all duration-200 cursor-pointer flex items-center justify-center ${
                        isSelected
                          ? "ring-2 ring-offset-2 ring-offset-card scale-110"
                          : "hover:scale-110"
                      }`}
                      style={{
                        backgroundColor: c.value,
                        boxShadow: isSelected ? `0 0 0 2px ${c.value}` : undefined,
                      }}
                      title={c.label}
                    >
                      {isSelected && (
                        <Check className="size-5 text-white drop-shadow-md animate-in zoom-in-50 duration-200" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Preview */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground font-semibold">Preview</Label>
              <div className="p-4 rounded-xl bg-secondary/20 border border-border/40 flex items-center gap-3">
                <span
                  className="size-4 rounded-full shrink-0 ring-1 ring-white/10"
                  style={{ backgroundColor: categoryColor }}
                />
                <span className="font-bold text-sm">
                  {categoryName.trim() || "Nome da categoria"}
                </span>
                <span className="ml-auto">
                  <CategoryBadge
                    category={{
                      name: categoryName.trim() || "Preview",
                      color: categoryColor,
                    }}
                  />
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Button
                onClick={saveCategory}
                disabled={savingCategory || !categoryName.trim()}
                className="flex-1 bg-gradient-brand text-primary-foreground border-0 hover:opacity-95 font-bold h-11 shadow-glow rounded-xl"
              >
                {savingCategory
                  ? "Salvando..."
                  : editingCategory
                    ? "Salvar Alterações"
                    : "Criar Categoria"}
              </Button>
              {editingCategory && (
                <Button
                  variant="outline"
                  onClick={() => deleteCategory(editingCategory)}
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 h-11 rounded-xl font-semibold px-5"
                >
                  <Trash2 className="size-4 mr-1.5" /> Excluir
                </Button>
              )}
            </div>
          </div>

          {/* Existing Categories List (shown when creating) */}
          {!editingCategory && categories.length > 0 && (
            <div className="mt-6 pt-5 border-t border-border/40">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                Categorias Existentes
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {categories.map((cat) => (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-secondary/20 border border-border/30 hover:bg-secondary/40 transition group"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="size-3.5 rounded-full shrink-0 ring-1 ring-white/10"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="text-sm font-semibold">{cat.name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        ({accounts.filter((a) => a.category_id === cat.id).length} contas)
                      </span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditCategory(cat)}
                        className="size-7 text-muted-foreground hover:text-primary rounded-lg"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteCategory(cat)}
                        className="size-7 text-muted-foreground hover:text-destructive rounded-lg"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Manual Connection Dialog ────────────────────────────────────────── */}
      <Dialog open={showManualModal} onOpenChange={setShowManualModal}>
        <DialogContent className="sm:max-w-lg bg-card/95 border border-border/60 rounded-2xl p-6 backdrop-blur-xl shadow-glow">
          <DialogHeader>
            <DialogTitle className="text-xl font-extrabold flex items-center gap-2 text-foreground">
              <Instagram className="size-5 text-primary" />
              Conectar Instagram Manualmente
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              Insira as credenciais da conta do Instagram para realizar a conexão manual como
              alternativa temporária ao OAuth.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleManualConnectSubmit} className="space-y-5 mt-4">
            {/* username */}
            <div className="space-y-2">
              <Label className="text-sm font-bold flex items-center gap-1">
                Nome de Usuário (username) <span className="text-destructive">*</span>
              </Label>
              <Input
                value={manualUsername}
                onChange={(e) => setManualUsername(e.target.value)}
                placeholder="Ex: meu_perfil_comercial"
                className="bg-secondary/40 border-border/60 rounded-xl h-10"
                required
              />
              <p className="text-[10px] text-muted-foreground">
                O nome de usuário do perfil do Instagram (sem o @).
              </p>
            </div>

            {/* instagram_user_id */}
            <div className="space-y-2">
              <Label className="text-sm font-bold flex items-center gap-1">
                ID do Usuário do Instagram <span className="text-destructive">*</span>
              </Label>
              <Input
                value={manualIgUserId}
                onChange={(e) => setManualIgUserId(e.target.value)}
                placeholder="Ex: 17841401234567890"
                className="bg-secondary/40 border-border/60 rounded-xl h-10"
                required
              />
              <p className="text-[10px] text-muted-foreground">
                O identificador numérico exclusivo da conta comercial do Instagram.
              </p>
            </div>

            {/* access_token */}
            <div className="space-y-2">
              <Label className="text-sm font-bold flex items-center gap-1">
                Token de Acesso (access_token) <span className="text-destructive">*</span>
              </Label>
              <Input
                value={manualAccessToken}
                onChange={(e) => setManualAccessToken(e.target.value)}
                placeholder="Insira o access_token da API de Gráficos do Instagram"
                className="bg-secondary/40 border-border/60 rounded-xl h-10 font-mono text-xs"
                required
              />
              <p className="text-[10px] text-muted-foreground">
                Token de acesso (geralmente gerado na Meta para Desenvolvedores).
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowManualModal(false)}
                className="flex-1 border-border rounded-xl font-semibold h-11"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  savingManual ||
                  !manualUsername.trim() ||
                  !manualIgUserId.trim() ||
                  !manualAccessToken.trim()
                }
                className="flex-1 bg-gradient-brand text-primary-foreground border-0 hover:opacity-95 font-bold h-11 shadow-glow rounded-xl"
              >
                {savingManual ? "Conectando..." : "Salvar Conexão"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
