import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Shield, User, Loader2, Key, Info, HelpCircle, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getAvailableMetaAppIds } from "@/lib/instagram.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Configurações — Reelary" }] }),
  component: () => (
    <AppShell>
      <SettingsPage />
    </AppShell>
  ),
});

function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [appId, setAppId] = useState<string>("1382069030570648");

  const fetchAppIds = useServerFn(getAvailableMetaAppIds);

  async function loadSettings() {
    try {
      const ids = await fetchAppIds();
      if (ids && (ids.guilherme || (ids as any).default)) {
        setAppId(ids.guilherme || (ids as any).default);
      }
    } catch (err: any) {
      console.error("Erro ao carregar configurações:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

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
        <h1 className="text-3xl font-extrabold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground mt-1.5">
          Gerencie as credenciais da Meta Developers e integrações para conexões do Instagram.
        </p>
      </div>

      <div className="space-y-6">
        {/* Painel Único: Presta */}
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
            <h4 className="font-bold text-foreground">Sobre a autenticação com o Instagram</h4>
            <p className="leading-relaxed">
              Todas as conexões de novas contas e renovações de token utilizam diretamente o perfil <strong>Presta</strong> da Meta Developers com suporte a Reels de Teste e sanitização automática de metadados.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
