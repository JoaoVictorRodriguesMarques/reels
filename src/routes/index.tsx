import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, CalendarClock, Instagram, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/use-auth";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Reelary — Agende Reels do Instagram em segundos" },
      {
        name: "description",
        content:
          "Plataforma SaaS para agendar Reels do Instagram. Conecte sua conta, faça upload do vídeo e deixe que publicamos para você.",
      },
      { property: "og:title", content: "Reelary — Agende Reels do Instagram" },
      { property: "og:description", content: "Conecte, agende e publique Reels sem esforço." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute -top-40 -left-40 size-[600px] rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 size-[600px] rounded-full bg-accent/20 blur-3xl" />
      </div>

      <header className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-gradient-brand grid place-items-center shadow-glow">
            <Sparkles className="size-4 text-primary-foreground" />
          </div>
          <span className="font-display text-lg font-semibold">Reelary</span>
        </div>
        <Link to="/auth">
          <Button variant="ghost" size="sm">
            Entrar
          </Button>
        </Link>
      </header>

      <section className="mx-auto max-w-4xl px-6 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-3 py-1 text-xs text-muted-foreground mb-8">
          <span className="size-1.5 rounded-full bg-success" /> Beta privado aberto
        </div>
        <h1 className="text-5xl md:text-7xl font-bold leading-[1.05] tracking-tight">
          Agende seus <span className="text-gradient-brand">Reels</span>
          <br />
          sem abrir o Instagram.
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto">
          Conecte sua conta, faça upload do vídeo, escolha a hora — e a gente publica. Calendário de
          conteúdo profissional para criadores que vivem de Reels.
        </p>
        <div className="mt-10 flex items-center justify-center gap-3">
          <Link to="/auth">
            <Button
              size="lg"
              className="bg-gradient-brand text-primary-foreground border-0 shadow-glow hover:opacity-90 h-12 px-6"
            >
              Começar grátis <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>

        <div className="mt-24 grid gap-4 md:grid-cols-3 text-left">
          {[
            {
              icon: Instagram,
              title: "Conecte em 1 clique",
              desc: "Login direto via Meta. Sem complicações.",
            },
            {
              icon: CalendarClock,
              title: "Calendário inteligente",
              desc: "Visualize, edite e reorganize tudo.",
            },
            {
              icon: Zap,
              title: "Publicação automática",
              desc: "Configure e esqueça. Publicamos por você.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-border/60 bg-card/50 p-6 backdrop-blur shadow-card"
            >
              <div className="size-10 rounded-lg bg-secondary grid place-items-center mb-4">
                <f.icon className="size-5 text-primary" />
              </div>
              <h3 className="font-semibold mb-1">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
