import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, AlertCircle, ShieldCheck, ExternalLink, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { connectFacebookAccount } from "@/lib/instagram.functions";
import { getFacebookRedirectUri } from "@/lib/instagram";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/facebook/callback")({
  head: () => ({ meta: [{ title: "Conectando via Facebook — Reelary" }] }),
  component: FacebookCallbackPage,
});

function FacebookCallbackPage() {
  const [state, setState] = useState<"loading" | "error" | "done">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isExternalFlow, setIsExternalFlow] = useState(false);
  const navigate = useNavigate();
  const connect = useServerFn(connectFacebookAccount);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error_description") ?? params.get("error");
    const code = params.get("code");
    const stateParam = params.get("state") || undefined;

    if (stateParam) {
      setIsExternalFlow(true);
    }

    console.log("[FB Callback] Params:", {
      error,
      code: code ? `${code.slice(0, 20)}...` : null,
      hasState: !!stateParam,
    });

    if (error) {
      console.error("[FB Callback] OAuth error from Meta:", error);
      setErrorMsg(error);
      setState("error");
      return;
    }
    if (!code) {
      console.error("[FB Callback] No code param in URL");
      setErrorMsg("Nenhum código de autorização recebido do Facebook.");
      setState("error");
      return;
    }

    (async () => {
      try {
        console.log("[FB Callback] Calling connectFacebookAccount...");
        const res = await connect({
          data: {
            code,
            redirectUri: getFacebookRedirectUri(),
            state: stateParam,
          },
        });
        console.log("[FB Callback] Success:", res);
        setUsername(res.username);
        setState("done");
        toast.success(`@${res.username} conectada via Facebook!`);

        // If not an external dolphin link, redirect automatically to accounts
        if (!stateParam) {
          setTimeout(() => navigate({ to: "/accounts" }), 1500);
        }
      } catch (e: any) {
        const msg = e?.message ?? e?.toString?.() ?? "Erro desconhecido";
        console.error("[FB Callback] Server function error:", msg, e);
        setErrorMsg(msg);
        setState("error");
      }
    })();
  }, [connect, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-lg rounded-3xl border border-border/60 bg-card/90 p-8 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-300">
        {state === "loading" && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="size-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Conectando Conta...</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Autenticando via Meta & vinculando ao Reelary…
              </p>
            </div>
          </div>
        )}

        {state === "error" && (
          <div className="text-center py-4">
            <div className="size-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="size-8 text-destructive" />
            </div>
            <h2 className="font-bold text-xl text-foreground">Erro na Conexão</h2>
            <p className="text-sm text-muted-foreground mt-2 break-words max-w-md mx-auto leading-relaxed">
              {errorMsg}
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                variant="outline"
                className="border-border rounded-xl"
                onClick={() => window.close()}
              >
                Fechar Aba
              </Button>
              <Button
                className="bg-primary text-primary-foreground font-bold rounded-xl"
                onClick={() => navigate({ to: "/accounts" })}
              >
                Ir para o Painel
              </Button>
            </div>
          </div>
        )}

        {state === "done" && (
          <div className="flex flex-col items-center text-center py-4">
            <div className="size-16 rounded-2xl bg-success/15 border border-success/30 flex items-center justify-center mb-4">
              <CheckCircle2 className="size-9 text-success animate-in zoom-in-75 duration-300" />
            </div>
            <h2 className="font-extrabold text-2xl text-foreground">Conta Conectada!</h2>
            <div className="inline-flex items-center gap-2 mt-2 px-3.5 py-1.5 rounded-full bg-secondary/80 border border-border/80 text-sm font-bold text-primary">
              @{username}
            </div>

            {isExternalFlow ? (
              <div className="mt-6 w-full rounded-2xl border border-success/30 bg-success/5 p-4 text-left space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-success uppercase tracking-wider">
                  <ShieldCheck className="size-4" /> Anti-Detect & Dolphin Integrado
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  A conta <strong>@{username}</strong> foi vinculada com segurança ao seu painel Reelary mantendo a sessão e o proxy deste perfil intactos.
                </p>
                <p className="text-xs font-semibold text-foreground pt-1">
                  💡 Você já pode fechar esta aba com tranquilidade.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mt-4">
                Redirecionando para o seu painel de contas…
              </p>
            )}

            <div className="mt-6 flex flex-col sm:flex-row gap-3 w-full">
              {isExternalFlow && (
                <Button
                  variant="outline"
                  className="flex-1 border-border/80 hover:bg-secondary rounded-xl font-bold h-11"
                  onClick={() => window.close()}
                >
                  <XCircle className="size-4 mr-2" /> Fechar Aba
                </Button>
              )}
              <Button
                className="flex-1 bg-gradient-brand text-primary-foreground font-bold rounded-xl h-11 shadow-glow"
                onClick={() => navigate({ to: "/accounts" })}
              >
                <ExternalLink className="size-4 mr-2" /> Ver Minhas Contas
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
