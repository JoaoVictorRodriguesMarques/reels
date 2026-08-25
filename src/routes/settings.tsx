import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Shield, User, Loader2, Key, Info, HelpCircle } from "lucide-react";
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
  const [profile, setProfile] = useState<"guilherme" | "matheus" | "pedro" | "antonio" | "greg">(
    "guilherme",
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [appIds, setAppIds] = useState<{
    guilherme: string | null;
    matheus: string | null;
    pedro: string | null;
    antonio: string | null;
    greg: string | null;
  }>({
    guilherme: null,
    matheus: null,
    pedro: null,
    antonio: null,
    greg: null,
  });

  const fetchAppIds = useServerFn(getAvailableMetaAppIds);

  async function loadSettings() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("user_settings")
        .select("meta_credential_profile")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setProfile(data.meta_credential_profile as "guilherme" | "matheus" | "pedro" | "antonio" | "greg");
      }

      const ids = await fetchAppIds();
      setAppIds(ids as any);
    } catch (err: any) {
      console.error("Erro ao carregar configurações:", err);
      toast.error("Erro ao carregar configurações.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  async function handleSave(selectedProfile: "guilherme" | "matheus" | "pedro" | "antonio" | "greg") {
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado.");

      const { error } = await supabase.from("user_settings").upsert(
        {
          user_id: user.id,
          meta_credential_profile: selectedProfile,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" } as any,
      );

      if (error) throw error;
      setProfile(selectedProfile);
      const profileNames = {
        guilherme: "Guilherme",
        matheus: "Matheus",
        pedro: "Pedro",
        antonio: "Antonio",
        greg: "Greg",
      };
      toast.success(`Perfil de credenciais "${profileNames[selectedProfile]}" selecionado!`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar configurações.");
    } finally {
      setSaving(false);
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
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground mt-1">
          Gerencie as credenciais da Meta Developers para conexões do Instagram
        </p>
      </div>

      <div className="space-y-6">
        {/* Escolha do Perfil */}
        <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-card">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <Shield className="size-5 text-primary" /> Selecione o Painel da Meta Developers
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            Escolha qual aplicativo de desenvolvedor da Meta será responsável pelo fluxo de login e
            conexão do Instagram.
          </p>

          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {/* Card Guilherme */}
            <button
              onClick={() => handleSave("guilherme")}
              disabled={saving}
              className={`text-left rounded-2xl border p-5 transition-all duration-300 relative overflow-hidden group cursor-pointer flex flex-col justify-between ${
                profile === "guilherme"
                  ? "border-primary bg-primary/5 shadow-glow"
                  : "border-border/60 bg-secondary/10 hover:bg-secondary/40 hover:border-border-hover"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="size-10 rounded-xl bg-primary/10 grid place-items-center group-hover:scale-105 transition-transform">
                    <User className="size-5 text-primary" />
                  </div>
                  {profile === "guilherme" && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-success/20 text-success border border-success/30">
                      <Check className="size-3" /> ATIVO
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-base text-foreground mb-1">Painel: Guilherme</h3>
                <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                  Configuração padrão do projeto utilizando as credenciais principais da Meta do
                  Guilherme.
                </p>
              </div>

              <div className="border-t border-border/40 pt-3 mt-auto">
                <span className="text-[10px] text-muted-foreground font-mono block truncate">
                  App ID: {appIds.guilherme || "Não configurado no servidor"}
                </span>
              </div>
            </button>

            {/* Card Matheus */}
            <button
              onClick={() => handleSave("matheus")}
              disabled={saving}
              className={`text-left rounded-2xl border p-5 transition-all duration-300 relative overflow-hidden group cursor-pointer flex flex-col justify-between ${
                profile === "matheus"
                  ? "border-primary bg-primary/5 shadow-glow"
                  : "border-border/60 bg-secondary/10 hover:bg-secondary/40 hover:border-border-hover"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="size-10 rounded-xl bg-accent/10 grid place-items-center group-hover:scale-105 transition-transform">
                    <User className="size-5 text-accent" />
                  </div>
                  {profile === "matheus" && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-success/20 text-success border border-success/30">
                      <Check className="size-3" /> ATIVO
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-base text-foreground mb-1">Painel: Matheus</h3>
                <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                  Configuração secundária utilizando as credenciais da Meta do Matheus para testes
                  ou produção própria.
                </p>
              </div>

              <div className="border-t border-border/40 pt-3 mt-auto">
                <span
                  className={`text-[10px] font-mono block truncate ${!appIds.matheus ? "text-warning" : "text-muted-foreground"}`}
                >
                  App ID: {appIds.matheus || "Configuração pendente no .env"}
                </span>
              </div>
            </button>

            {/* Card Pedro */}
            <button
              onClick={() => handleSave("pedro")}
              disabled={saving}
              className={`text-left rounded-2xl border p-5 transition-all duration-300 relative overflow-hidden group cursor-pointer flex flex-col justify-between ${
                profile === "pedro"
                  ? "border-primary bg-primary/5 shadow-glow"
                  : "border-border/60 bg-secondary/10 hover:bg-secondary/40 hover:border-border-hover"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="size-10 rounded-xl bg-violet-500/10 grid place-items-center group-hover:scale-105 transition-transform">
                    <User className="size-5 text-violet-500" />
                  </div>
                  {profile === "pedro" && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-success/20 text-success border border-success/30">
                      <Check className="size-3" /> ATIVO
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-base text-foreground mb-1">Painel: Pedro</h3>
                <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                  Configuração utilizando as credenciais da Meta do Pedro.
                </p>
              </div>

              <div className="border-t border-border/40 pt-3 mt-auto">
                <span
                  className={`text-[10px] font-mono block truncate ${!appIds.pedro ? "text-warning" : "text-muted-foreground"}`}
                >
                  App ID: {appIds.pedro || "Configuração pendente no .env"}
                </span>
              </div>
            </button>

            {/* Card Antonio */}
            <button
              onClick={() => handleSave("antonio")}
              disabled={saving}
              className={`text-left rounded-2xl border p-5 transition-all duration-300 relative overflow-hidden group cursor-pointer flex flex-col justify-between ${
                profile === "antonio"
                  ? "border-primary bg-primary/5 shadow-glow"
                  : "border-border/60 bg-secondary/10 hover:bg-secondary/40 hover:border-border-hover"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="size-10 rounded-xl bg-sky-500/10 grid place-items-center group-hover:scale-105 transition-transform">
                    <User className="size-5 text-sky-500" />
                  </div>
                  {profile === "antonio" && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-success/20 text-success border border-success/30">
                      <Check className="size-3" /> ATIVO
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-base text-foreground mb-1">Painel: Antonio</h3>
                <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                  Configuração utilizando as credenciais da Meta do Antonio.
                </p>
              </div>

              <div className="border-t border-border/40 pt-3 mt-auto">
                <span
                  className={`text-[10px] font-mono block truncate ${!appIds.antonio ? "text-warning" : "text-muted-foreground"}`}
                >
                  App ID: {appIds.antonio || "Configuração pendente no .env"}
                </span>
              </div>
            </button>

            {/* Card Greg */}
            <button
              onClick={() => handleSave("greg")}
              disabled={saving}
              className={`text-left rounded-2xl border p-5 transition-all duration-300 relative overflow-hidden group cursor-pointer flex flex-col justify-between ${
                profile === "greg"
                  ? "border-primary bg-primary/5 shadow-glow"
                  : "border-border/60 bg-secondary/10 hover:bg-secondary/40 hover:border-border-hover"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="size-10 rounded-xl bg-emerald-500/10 grid place-items-center group-hover:scale-105 transition-transform">
                    <User className="size-5 text-emerald-500" />
                  </div>
                  {profile === "greg" && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-success/20 text-success border border-success/30">
                      <Check className="size-3" /> ATIVO
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-base text-foreground mb-1">Painel: Greg</h3>
                <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                  Configuração utilizando as credenciais da Meta do Greg.
                </p>
              </div>

              <div className="border-t border-border/40 pt-3 mt-auto">
                <span
                  className={`text-[10px] font-mono block truncate ${!appIds.greg ? "text-warning" : "text-muted-foreground"}`}
                >
                  App ID: {appIds.greg || "Configuração pendente no .env"}
                </span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
