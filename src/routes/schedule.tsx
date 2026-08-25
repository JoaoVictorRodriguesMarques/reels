import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Upload, Loader2, Video, ChevronDown, Instagram } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DateTimePicker } from "@/components/DateTimePicker";
import { getUploadPresignedUrl } from "@/lib/r2.functions";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/schedule")({
  head: () => ({ meta: [{ title: "Novo Reel — Reelary" }] }),
  component: () => (
    <AppShell>
      <SchedulePage />
    </AppShell>
  ),
});

type Account = {
  id: string;
  username: string;
  category_id?: string | null;
  account_categories?: { id: string; name: string; color: string } | null;
};

function SchedulePage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [publishMode, setPublishMode] = useState<"now" | "schedule">(() => {
    const saved = localStorage.getItem("last_scheduled_publish_mode");
    return saved === "now" || saved === "schedule" ? saved : "now";
  });
  const [scheduledAt, setScheduledAt] = useState(() => {
    const futureDate = new Date();
    const savedTime = localStorage.getItem("last_scheduled_time");
    let timeSet = false;

    if (savedTime) {
      const parts = savedTime.split(":");
      if (parts.length === 2) {
        const hours = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);
        if (!isNaN(hours) && !isNaN(minutes)) {
          futureDate.setHours(hours, minutes, 0, 0);
          timeSet = true;
        }
      }
    }

    if (!timeSet) {
      futureDate.setHours(futureDate.getHours() + 1, 0, 0, 0);
    }

    if (futureDate.getTime() < Date.now()) {
      futureDate.setDate(futureDate.getDate() + 1);
    }

    const timezoneOffset = futureDate.getTimezoneOffset() * 60000;
    return new Date(futureDate.getTime() - timezoneOffset).toISOString().slice(0, 16);
  });
  const [file, setFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase
      .from("instagram_accounts")
      .select("id, username, category_id, account_categories(id, name, color)")
      .eq("hidden", false)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const loadedAccounts = data ?? [];
        setAccounts(loadedAccounts);
        const savedAccountsStr = localStorage.getItem("last_scheduled_accounts");
        let initialAccountIds: string[] = [];
        if (savedAccountsStr) {
          try {
            const parsed = JSON.parse(savedAccountsStr);
            if (Array.isArray(parsed)) {
              initialAccountIds = parsed.filter((id) => loadedAccounts.some((a) => a.id === id));
            }
          } catch (e) {
            console.error("Error parsing last_scheduled_accounts:", e);
          }
        }

        if (initialAccountIds.length > 0) {
          setAccountIds(initialAccountIds);
        } else {
          const activeId = localStorage.getItem("active_ig_account_id");
          if (activeId && loadedAccounts.some((a) => a.id === activeId)) {
            setAccountIds([activeId]);
          } else if (loadedAccounts.length > 0) {
            setAccountIds([loadedAccounts[0].id]);
          }
        }
      });
  }, []);

  useEffect(() => {
    return () => {
      if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
    };
  }, [coverPreviewUrl]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || accountIds.length === 0 || (publishMode === "schedule" && !scheduledAt)) {
      toast.error("Por favor, preencha todos os campos e selecione pelo menos uma conta.");
      return;
    }
    setSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Sessão expirada");

      // 1. Upload Video to Cloudflare R2
      const videoUpload = await getUploadPresignedUrl({
        data: {
          fileName: file.name,
          contentType: file.type || "video/mp4",
        },
      });

      let videoPutRes;
      try {
        videoPutRes = await fetch(videoUpload.uploadUrl, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type || "video/mp4",
          },
        });
      } catch (fetchErr: any) {
        console.error("Erro de rede ao fazer upload para o Cloudflare R2:", fetchErr);
        throw new Error(
          "Falha de rede ao enviar o vídeo para o Cloudflare R2. Se você está em ambiente de desenvolvimento (localhost), por favor verifique se a política de CORS do seu bucket R2 está configurada para aceitar requisições de origem local (PUT de localhost).",
        );
      }

      if (!videoPutRes.ok) {
        throw new Error(`Falha ao fazer upload do vídeo no Cloudflare R2 (${videoPutRes.status})`);
      }

      const videoUrl = videoUpload.publicUrl;

      // 2. Upload Cover to Cloudflare R2 (if exists)
      let coverUrl = null;
      if (coverFile) {
        const coverUpload = await getUploadPresignedUrl({
          data: {
            fileName: coverFile.name,
            contentType: coverFile.type || "image/jpeg",
          },
        });

        let coverPutRes;
        try {
          coverPutRes = await fetch(coverUpload.uploadUrl, {
            method: "PUT",
            body: coverFile,
            headers: {
              "Content-Type": coverFile.type || "image/jpeg",
            },
          });
        } catch (fetchErr: any) {
          console.error("Erro de rede ao fazer upload da capa para o Cloudflare R2:", fetchErr);
          throw new Error(
            "Falha de rede ao enviar a capa do Reel para o Cloudflare R2. Verifique as configurações de CORS do seu bucket R2.",
          );
        }

        if (!coverPutRes.ok) {
          throw new Error(`Falha ao fazer upload da capa no Cloudflare R2 (${coverPutRes.status})`);
        }

        coverUrl = coverUpload.publicUrl;
      }

      const scheduledDate =
        publishMode === "now" ? new Date().toISOString() : new Date(scheduledAt).toISOString();

      const postsToInsert = accountIds.map((accId) => ({
        user_id: uid,
        instagram_account_id: accId,
        video_url: videoUrl,
        cover_url: coverUrl,
        caption,
        scheduled_at: scheduledDate,
        status: "pending" as const,
      }));

      const { error } = await supabase.from("scheduled_posts").insert(postsToInsert);
      if (error) throw error;

      // Save settings to localStorage on success
      localStorage.setItem("last_scheduled_accounts", JSON.stringify(accountIds));
      localStorage.setItem("last_scheduled_publish_mode", publishMode);
      if (publishMode === "schedule" && scheduledAt) {
        const timePart = scheduledAt.split("T")[1];
        if (timePart) {
          localStorage.setItem("last_scheduled_time", timePart);
        }
      }

      if (publishMode === "now") {
        toast.info("Publicando Reel imediatamente nas contas selecionadas...");
        try {
          await supabase.functions.invoke("publish-reels");
          toast.success("Reel enviado com sucesso!");
        } catch (fnErr) {
          console.error("Erro ao disparar publicação imediata:", fnErr);
          toast.success("Reel enviado para processamento!");
        }
      } else {
        toast.success(`Reel agendado para ${accountIds.length} conta(s)!`);
      }
      navigate({ to: "/posts" });
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao agendar");
    } finally {
      setSubmitting(false);
    }
  }

  const tzOffset = new Date().getTimezoneOffset() * 60_000;
  const minDateTime = new Date(Date.now() + 5 * 60_000 - tzOffset).toISOString().slice(0, 16);

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Agendar Reel</h1>
        <p className="text-muted-foreground mt-1">Envie o vídeo, escolha quando publicar.</p>
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/80 p-12 text-center bg-card/30">
          <p className="font-medium">Nenhuma conta conectada</p>
          <p className="text-sm text-muted-foreground mt-1">
            Conecte uma conta do Instagram primeiro.
          </p>
          <Button className="mt-4" onClick={() => navigate({ to: "/dashboard" })}>
            Ir para contas
          </Button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-2xl border border-border/60 bg-card p-6 shadow-card"
        >
          <div className="space-y-2">
            <Label>Vídeo</Label>
            <label className="block cursor-pointer">
              <input
                type="file"
                accept="video/*"
                className="sr-only"
                required
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <div className="rounded-xl border-2 border-dashed border-border hover:border-primary/60 transition p-8 text-center">
                {file ? (
                  <div className="flex items-center justify-center gap-3">
                    <Video className="size-5 text-primary" />
                    <span className="font-medium text-sm">{file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Upload className="size-6" />
                    <span className="text-sm">Clique para enviar um vídeo</span>
                    <span className="text-xs">MP4, MOV — até 100MB</span>
                  </div>
                )}
              </div>
            </label>
          </div>

          <div className="space-y-2">
            <Label>Foto de Capa (Opcional)</Label>
            <label className="block cursor-pointer">
              <input
                type="file"
                accept="image/png, image/jpeg, image/jpg"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setCoverFile(f);
                  if (f) {
                    const url = URL.createObjectURL(f);
                    setCoverPreviewUrl(url);
                  } else {
                    setCoverPreviewUrl(null);
                  }
                }}
              />
              <div className="rounded-xl border-2 border-dashed border-border hover:border-primary/60 transition p-6 text-center bg-card/50 flex flex-col items-center justify-center min-h-[100px]">
                {coverFile ? (
                  <div className="flex flex-col items-center gap-2">
                    {coverPreviewUrl && (
                      <img
                        src={coverPreviewUrl}
                        alt="Capa preview"
                        className="w-20 h-28 object-cover rounded-lg border border-border/80 shadow-md"
                      />
                    )}
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-foreground truncate max-w-[200px]">
                        {coverFile.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {(coverFile.size / 1024 / 1024).toFixed(1)} MB
                      </span>
                    </div>
                    <span className="text-[10px] text-primary underline font-medium">
                      Trocar imagem
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Upload className="size-5" />
                    <span className="text-xs font-semibold text-foreground">
                      Escolher Foto de Capa
                    </span>
                    <span className="text-[10px]">Formato JPG, PNG (Aspecto 9:16 recomendado)</span>
                  </div>
                )}
              </div>
            </label>
          </div>

          <div className="space-y-2">
            <Label>Contas do Instagram</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between border-border/60 hover:bg-secondary/45 rounded-xl text-sm font-medium h-11 px-3.5 cursor-pointer flex items-center bg-card"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Instagram className="size-4 text-muted-foreground shrink-0" />
                    {accountIds.length === 0 ? (
                      <span className="text-muted-foreground text-sm font-normal">
                        Selecione as contas de postagem
                      </span>
                    ) : accountIds.length === 1 ? (
                      <span className="flex items-center gap-1.5 truncate text-foreground font-semibold">
                        {(() => {
                          const acc = accounts.find((a) => a.id === accountIds[0]);
                          return (
                            <>
                              {acc?.account_categories?.color && (
                                <span
                                  className="size-2 rounded-full shrink-0 ring-1 ring-white/10"
                                  style={{ backgroundColor: acc.account_categories.color }}
                                />
                              )}
                              @{acc?.username || "usuario"}
                            </>
                          );
                        })()}
                      </span>
                    ) : (
                      <span className="text-foreground font-semibold">
                        {accountIds.length} contas selecionadas
                      </span>
                    )}
                  </div>
                  <ChevronDown className="size-4 text-muted-foreground opacity-60 shrink-0 ml-2" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-80 bg-popover border border-border/60 p-3 shadow-card rounded-xl z-50"
              >
                <div className="text-xs text-muted-foreground font-semibold flex items-center justify-between pb-2 mb-2 border-b border-border/40">
                  <span>Selecionar Contas</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAccountIds(accounts.map((a) => a.id));
                      }}
                      className="text-[10px] text-primary hover:underline font-bold cursor-pointer bg-transparent border-0"
                    >
                      Todas
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAccountIds([]);
                      }}
                      className="text-[10px] text-destructive hover:underline font-bold cursor-pointer bg-transparent border-0"
                    >
                      Limpar
                    </button>
                  </div>
                </div>
                <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                  {accounts.map((a) => {
                    const isChecked = accountIds.includes(a.id);
                    return (
                      <label
                        key={a.id}
                        className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-secondary/60 cursor-pointer text-xs font-semibold select-none transition-colors"
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setAccountIds((prev) => [...prev, a.id]);
                            } else {
                              setAccountIds((prev) => prev.filter((id) => id !== a.id));
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
                      </label>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label htmlFor="caption">Legenda</Label>
            <Textarea
              id="caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              placeholder="Escreva a legenda do seu Reel… #hashtags"
            />
          </div>

          <div className="space-y-2">
            <Label>Método de Publicação</Label>
            <Tabs
              value={publishMode}
              onValueChange={(val) => setPublishMode(val as "now" | "schedule")}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2 bg-secondary/60">
                <TabsTrigger
                  value="now"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  Postar Agora
                </TabsTrigger>
                <TabsTrigger
                  value="schedule"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  Agendar
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {publishMode === "schedule" && (
            <div className="space-y-2 flex flex-col">
              <Label className="text-sm font-bold">Data e hora</Label>
              <DateTimePicker value={scheduledAt} onChange={setScheduledAt} min={minDateTime} />
            </div>
          )}

          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-gradient-brand text-primary-foreground border-0 hover:opacity-90 h-11"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Enviando…
              </>
            ) : publishMode === "now" ? (
              "Publicar agora"
            ) : (
              "Agendar publicação"
            )}
          </Button>
        </form>
      )}
    </div>
  );
}
