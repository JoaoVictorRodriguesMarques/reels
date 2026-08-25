import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
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
  const navigate = useNavigate();
  const connect = useServerFn(connectFacebookAccount);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error_description") ?? params.get("error");
    const code = params.get("code");
    console.log("[FB Callback] Params:", { error, code: code ? `${code.slice(0, 20)}...` : null });

    if (error) {
      console.error("[FB Callback] OAuth error from Meta:", error);
      setErrorMsg(error);
      setState("error");
      return;
    }
    if (!code) {
      console.error("[FB Callback] No code param in URL");
      setErrorMsg("Nenhum código recebido do Facebook.");
      setState("error");
      return;
    }

    (async () => {
      try {
        console.log("[FB Callback] Calling connectFacebookAccount...");
        const res = await connect({
          data: { code, redirectUri: getFacebookRedirectUri() },
        });
        console.log("[FB Callback] Success:", res);
        setUsername(res.username);
        setState("done");
        toast.success(`@${res.username} conectada via Facebook!`);
        setTimeout(() => navigate({ to: "/accounts" }), 1200);
      } catch (e: any) {
        const msg = e?.message ?? e?.toString?.() ?? "Erro desconhecido";
        console.error("[FB Callback] Server function error:", msg, e);
        setErrorMsg(msg);
        setState("error");
      }
    })();
  }, [connect, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-8 shadow-card">
        {state === "loading" && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Conectando sua conta via Facebook…</p>
          </div>
        )}

        {state === "error" && (
          <div className="text-center">
            <AlertCircle className="size-10 text-destructive mx-auto" />
            <h2 className="mt-4 font-semibold text-lg">Erro na conexão</h2>
            <p className="text-sm text-muted-foreground mt-2 break-words">{errorMsg}</p>
            <Button className="mt-6 w-full" onClick={() => navigate({ to: "/accounts" })}>
              Voltar às Contas
            </Button>
          </div>
        )}

        {state === "done" && (
          <div className="flex flex-col items-center gap-3 py-6">
            <CheckCircle2 className="size-10 text-success" />
            <p className="font-medium">@{username} conectada</p>
            <p className="text-sm text-muted-foreground">Redirecionando…</p>
          </div>
        )}
      </div>
    </div>
  );
}
