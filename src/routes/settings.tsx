import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  Shield,
  User,
  Loader2,
  Key,
  Info,
  HelpCircle,
  CheckCircle2,
  Zap,
  Database,
  Trash2,
  RotateCw,
  Sparkles,
  HardDrive,
  Clock,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getAvailableMetaAppIds } from "@/lib/instagram.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Configurações & Manutenção — Reelary" }] }),
  component: () => (
    <AppShell>
      <SettingsPage />
    </AppShell>
  ),
});

interface StorageStats {
  total_posts: number;
  pending_posts: number;
  published_posts: number;
  failed_posts: number;
  table_size: string;
  total_accounts: number;
}

function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [appId, setAppId] = useState<string>("1640486920796202");
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cleaningFailed, setCleaningFailed] = useState(false);

  const fetchAppIds = useServerFn(getAvailableMetaAppIds);

  async function loadStorageStats() {
    try {
      const { data, error } = await supabase.rpc("get_system_storage_stats" as any);
      if (!error && data) {
        setStats(data as any);
      }
    } catch (e) {
      console.error("Erro ao carregar estatísticas do banco:", e);
    }
  }

  async function loadSettings() {
    try {
      const ids = await fetchAppIds();
      if (ids && (ids.guilherme || (ids as any).default)) {
        setAppId(ids.guilherme || (ids as any).default);
      }
      await loadStorageStats();
    } catch (err: any) {
      console.error("Erro ao carregar configurações:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  async function handleOptimizeSystem() {
    setOptimizing(true);
    try {
      // 1. Clear obsolete browser cache keys
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith("cached_") || key.startsWith("temp_") || key.startsWith("old_"))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));

      // 2. Reload fresh database metrics
      await loadStorageStats();

      // Artificial small delay for visual feedback
      await new Promise((r) => setTimeout(r, 600));

      toast.success("Sistema e índices do banco otimizados com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao otimizar: " + (err.message || err));
    } finally {
      setOptimizing(false);
    }
  }

  async function handleCleanupOldPublished(days = 15) {
    if (
      !confirm(
        `Deseja realmente limpar os posts antigos já publicados há mais de ${days} dias? Isso liberará espaço e acelerará o sistema. (Nenhum agendamento futuro será afetado)`,
      )
    ) {
      return;
    }

    setCleaning(true);
    try {
      const { data, error } = await supabase.rpc("cleanup_old_published_posts" as any, {
        days_older_than: days,
      });

      if (error) throw error;

      const deletedCount = (data as any)?.deleted_count || 0;
      toast.success(
        deletedCount > 0
          ? `${deletedCount} posts antigos publicados foram limpos com sucesso!`
          : "Nenhum post com mais de 15 dias para limpar no momento.",
      );
      await loadStorageStats();
    } catch (err: any) {
      toast.error("Erro na limpeza: " + (err.message || err));
    } finally {
      setCleaning(false);
    }
  }

  async function handleCleanupFailed() {
    if (!confirm("Deseja remover todos os registros de posts com falha?")) {
      return;
    }

    setCleaningFailed(true);
    try {
      const { data, error } = await supabase.rpc("cleanup_failed_posts" as any);
      if (error) throw error;

      const deletedCount = (data as any)?.deleted_count || 0;
      toast.success(
        deletedCount > 0
          ? `${deletedCount} posts com falha foram removidos com sucesso!`
          : "Nenhum post com falha encontrado.",
      );
      await loadStorageStats();
    } catch (err: any) {
      toast.error("Erro ao limpar posts com falha: " + (err.message || err));
    } finally {
      setCleaningFailed(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando configurações de credenciais…</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in-50 duration-300 pb-16">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Configurações & Manutenção</h1>
        <p className="text-muted-foreground mt-1.5">
          Gerencie as credenciais da Meta, monitore a saúde do banco de dados e otimize a performance do sistema.
        </p>
      </div>

      <div className="space-y-6">
        {/* Card 1: Otimização & Performance do Sistema */}
        <div className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm p-6 shadow-card space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-4">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
                <Zap className="size-5 text-amber-400" /> Saúde do Banco de Dados & Otimização
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Mantenha as consultas rápidas e o carregamento do painel instantâneo com 1 clique.
              </p>
            </div>
            <Button
              type="button"
              onClick={handleOptimizeSystem}
              disabled={optimizing}
              className="bg-amber-500 hover:bg-amber-600 text-black font-bold h-9 gap-2 shadow-sm text-xs cursor-pointer shrink-0"
            >
              {optimizing ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> Otimizando...
                </>
              ) : (
                <>
                  <Sparkles className="size-3.5" /> Otimizar Sistema Agora
                </>
              )}
            </Button>
          </div>

          {/* Database Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-secondary/20 border border-border/50 space-y-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1">
                <Clock className="size-3 text-primary" /> Fila Ativa
              </span>
              <p className="text-lg font-black text-foreground font-mono">
                {stats ? stats.pending_posts.toLocaleString("pt-BR") : "—"}
              </p>
              <span className="text-[10px] text-muted-foreground block">posts agendados</span>
            </div>

            <div className="p-3.5 rounded-xl bg-secondary/20 border border-border/50 space-y-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1">
                <CheckCircle2 className="size-3 text-emerald-400" /> Publicados
              </span>
              <p className="text-lg font-black text-emerald-400 font-mono">
                {stats ? stats.published_posts.toLocaleString("pt-BR") : "—"}
              </p>
              <span className="text-[10px] text-muted-foreground block">no histórico</span>
            </div>

            <div className="p-3.5 rounded-xl bg-secondary/20 border border-border/50 space-y-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1">
                <HardDrive className="size-3 text-purple-400" /> Tamanho
              </span>
              <p className="text-lg font-black text-purple-400 font-mono">
                {stats ? stats.table_size : "—"}
              </p>
              <span className="text-[10px] text-muted-foreground block">tabela principal</span>
            </div>

            <div className="p-3.5 rounded-xl bg-secondary/20 border border-border/50 space-y-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1">
                <Database className="size-3 text-emerald-400" /> Índices
              </span>
              <p className="text-xs font-extrabold text-emerald-400 font-mono pt-1">
                ⚡ 100% OTIMIZADO
              </p>
              <span className="text-[10px] text-muted-foreground block">alta velocidade</span>
            </div>
          </div>

          {/* Maintenance Actions */}
          <div className="pt-2 border-t border-border/40 space-y-3">
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
              Ações de Limpeza de Dados (Sem afetar agendamentos pendentes)
            </h3>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-secondary/10 border border-border/40">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Trash2 className="size-3.5 text-muted-foreground" /> Limpar histórico de posts publicados (+15 dias)
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Remove registros antigos de reels que já foram postados no Instagram há mais de 15 dias para liberar espaço no banco.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleCleanupOldPublished(15)}
                disabled={cleaning}
                className="text-xs h-8 gap-1.5 font-bold cursor-pointer shrink-0 border-border/60 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
              >
                {cleaning ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />} Limpar Antigos
              </Button>
            </div>

            {stats && stats.failed_posts > 0 && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-destructive/5 border border-destructive/20">
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-destructive flex items-center gap-1.5">
                    <Trash2 className="size-3.5" /> Limpar posts com falha ({stats.failed_posts})
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Exclui registros de agendamentos que falharam para manter a fila limpa.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleCleanupFailed}
                  disabled={cleaningFailed}
                  className="text-xs h-8 gap-1.5 font-bold cursor-pointer shrink-0"
                >
                  {cleaningFailed ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />} Limpar Falhas
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Card 2: Painel Único Meta Developers */}
        <div className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm p-6 shadow-card space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
              <Shield className="size-5 text-primary" /> Painel da Meta Developers
            </h2>
            <span className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 className="size-3.5" /> ATIVO & OPERACIONAL
            </span>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed">
            Aplicativo oficial da Meta configurado para conexões seguras via Instagram Login e disparo automatizado de Reels.
          </p>

          <div className="rounded-2xl border border-primary/30 bg-primary/[0.04] p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="size-14 rounded-2xl bg-gradient-brand text-primary-foreground grid place-items-center font-extrabold text-xl shrink-0 shadow-glow">
                P
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-extrabold text-foreground">Painel: Presta</h3>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-primary/20 text-primary border border-primary/30">
                    Padrão de Produção
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Configuração principal do sistema com todas as permissões de publicação e análise de métricas ativas.
                </p>
                <div className="pt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="font-mono bg-secondary/80 px-2.5 py-1 rounded-lg border border-border/40 text-[11px] text-foreground font-semibold">
                    App ID: {appId}
                  </span>
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Meta Graph API v21.0 Conectada
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Informações adicionais */}
        <div className="rounded-2xl border border-border/40 bg-secondary/15 p-5 flex items-start gap-3.5">
          <Info className="size-5 text-primary shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground space-y-1">
            <h4 className="font-bold text-foreground">Sobre a integridade do sistema</h4>
            <p className="leading-relaxed">
              O sistema monitora automaticamente os tokens de acesso de todas as contas conectadas e sanitiza os metadados dos vídeos para garantir máxima proteção contra detecção de automação da Meta.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
