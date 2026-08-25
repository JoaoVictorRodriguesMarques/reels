import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles, AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/")({
  head: () => ({
    meta: [
      { title: "Acessar o Reelary — Agendador de Reels" },
      {
        name: "description",
        content: "Faça login ou crie sua conta para começar a agendar seus Reels do Instagram.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate({ to: "/dashboard" });
    }
  }, [user, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setVerificationRequired(false);

    try {
      if (mode === "signup") {
        if (password !== confirmPassword) {
          throw new Error("As senhas não coincidem. Digite a mesma senha nos dois campos.");
        }
        if (password.length < 6) {
          throw new Error("A senha precisa ter no mínimo 6 caracteres.");
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              phone: phone,
            },
            emailRedirectTo: window.location.origin + "/dashboard",
          },
        });

        if (error) throw error;

        // Sign up was successful, notify user they need to check email
        setVerificationRequired(true);
        toast.success("Conta criada! Verifique seu e-mail para ativar.", { duration: 6000 });

        // Reset fields
        setPassword("");
        setConfirmPassword("");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          // Check if error is related to unconfirmed email
          if (
            error.message.toLowerCase().includes("confirm") ||
            (error.status === 400 && error.message.toLowerCase().includes("verified"))
          ) {
            setVerificationRequired(true);
            throw new Error(
              "E-mail não verificado. Você precisa confirmar seu e-mail antes de fazer login.",
            );
          }
          throw error;
        }

        toast.success("Login realizado com sucesso!");
        navigate({ to: "/dashboard" });
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      setErrorMessage(err.message ?? "Ocorreu um erro ao processar sua solicitação.");
      toast.error(err.message ?? "Erro na autenticação.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Esquerda: Banner Visual */}
      <div className="hidden lg:block relative overflow-hidden bg-gradient-brand">
        <div className="absolute inset-0 bg-background/30 backdrop-blur-[2px]" />
        <div className="relative h-full flex flex-col justify-between p-12 text-primary-foreground">
          <Link to="/" className="flex items-center gap-2 max-w-max">
            <div className="size-9 rounded-xl bg-background/95 grid place-items-center shadow-glow">
              <Sparkles className="size-4.5 text-primary" />
            </div>
            <span className="font-display text-xl font-bold tracking-tight text-foreground">
              Reelary
            </span>
          </Link>
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs mb-6 backdrop-blur-md">
              <Sparkles className="size-3 text-accent" /> Agendamento Automatizado
            </div>
            <h2 className="font-display text-4xl lg:text-5xl font-bold leading-tight max-w-lg mb-4">
              Agende seus Reels e multiplique seu alcance no automático.
            </h2>
            <p className="text-sm opacity-90 max-w-md">
              "Agendo todo o conteúdo do mês em minutos. Reelary mudou completamente a forma como
              gerencio minhas marcas parceiras!"
            </p>
            <p className="mt-4 text-xs opacity-75">— Diretor de Social Media, +500k seguidores</p>
          </div>
          <div className="text-xs opacity-60">
            © {new Date().getFullYear()} Reelary. Todos os direitos reservados.
          </div>
        </div>
      </div>

      {/* Direita: Formulários */}
      <div className="flex items-center justify-center p-6 md:p-12 overflow-y-auto">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center lg:text-left">
            <Link to="/" className="lg:hidden flex items-center justify-center gap-2 mb-8">
              <div className="size-9 rounded-xl bg-gradient-brand grid place-items-center shadow-glow">
                <Sparkles className="size-4.5 text-primary-foreground" />
              </div>
              <span className="font-display text-xl font-bold">Reelary</span>
            </Link>
            <h1 className="text-3xl font-extrabold tracking-tight">
              {mode === "login" ? "Entrar na sua conta" : "Comece grátis agora"}
            </h1>
            <p className="text-muted-foreground mt-2">
              {mode === "login"
                ? "Insira suas credenciais para gerenciar seus agendamentos"
                : "Crie seu perfil em segundos e agende seu primeiro Reel"}
            </p>
          </div>

          {/* Banner de Verificação de E-mail Obrigatória */}
          {verificationRequired && (
            <Alert className="border-warning/30 bg-warning/10 text-foreground animate-in fade-in slide-in-from-top-4 duration-300">
              <AlertCircle className="size-5 text-warning shrink-0" />
              <div className="ml-3">
                <AlertTitle className="font-bold text-warning text-sm md:text-base flex items-center gap-1.5">
                  CONFIRMAÇÃO DE E-MAIL REQUERIDA
                </AlertTitle>
                <AlertDescription className="text-xs md:text-sm mt-1 leading-relaxed text-muted-foreground">
                  Enviamos um link de confirmação para o endereço{" "}
                  <strong className="text-foreground">{email}</strong>. Você{" "}
                  <span className="underline font-semibold text-foreground">
                    deve confirmar o e-mail
                  </span>{" "}
                  acessando o link na sua caixa de entrada (ou pasta de spam) para conseguir entrar
                  no Reelary.
                </AlertDescription>
              </div>
            </Alert>
          )}

          {/* Mensagens de Erro Gerais */}
          {errorMessage && !verificationRequired && (
            <Alert variant="destructive" className="animate-in fade-in duration-300">
              <AlertCircle className="size-4" />
              <AlertTitle>Erro na autenticação</AlertTitle>
              <AlertDescription className="text-xs">{errorMessage}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="fullName">Nome Completo</Label>
                    <Input
                      id="fullName"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Seu nome completo"
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Número de WhatsApp</Label>
                    <Input
                      id="phone"
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(DD) 99999-9999"
                      className="h-10"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">Endereço de E-mail</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@exemplo.com"
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-10 pr-10"
                  />
                </div>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-brand text-primary-foreground border-0 hover:opacity-95 font-semibold h-11 transition shadow-glow"
            >
              {loading ? (
                <span className="flex items-center gap-2 justify-center">
                  <span className="size-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  Carregando...
                </span>
              ) : mode === "login" ? (
                "Entrar"
              ) : (
                "Cadastrar-se & Confirmar E-mail"
              )}
            </Button>
          </form>

          <p className="text-sm text-muted-foreground text-center pt-2">
            {mode === "login" ? "Ainda não tem uma conta? " : "Já tem cadastro? "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setErrorMessage(null);
                setVerificationRequired(false);
              }}
              className="text-primary hover:underline font-semibold cursor-pointer"
            >
              {mode === "login" ? "Cadastre-se grátis" : "Faça Login"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
