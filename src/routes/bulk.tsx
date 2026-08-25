import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import {
  Upload,
  Loader2,
  Video,
  ChevronDown,
  Instagram,
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  Clock,
  Shuffle,
  FileVideo,
  Sparkles,
  Info,
  Layers,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getUploadPresignedUrl } from "@/lib/r2.functions";

export const Route = createFileRoute("/bulk")({
  head: () => ({ meta: [{ title: "Postar em Massa — Reelary" }] }),
  component: () => (
    <AppShell>
      <BulkSchedulePage />
    </AppShell>
  ),
});

type Account = {
  id: string;
  username: string;
  category_id?: string | null;
  account_categories?: { id: string; name: string; color: string } | null;
};

function shuffleArray(arr: number[]): number[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
  delay = 2000,
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        return response;
      }
      console.warn(`Upload attempt ${i + 1} failed with status ${response.status}. Retrying...`);
    } catch (error) {
      console.warn(`Upload attempt ${i + 1} encountered network error:`, error);
      if (i === retries - 1) throw error;
    }
    if (i < retries - 1) {
      await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
  throw new Error(`Falha no upload após ${retries} tentativas.`);
}

function BulkSchedulePage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [videoFiles, setVideoFiles] = useState<File[]>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [uploadedVideoUrls, setUploadedVideoUrls] = useState<Record<string, string>>({});
  const [uploadedCoverState, setUploadedCoverState] = useState<{ key: string; url: string } | null>(
    null,
  );
  const [caption, setCaption] = useState("");

  // Start date default to today in local timezone YYYY-MM-DD
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  });

  // Posting times (HH:MM list)
  const [postingTimes, setPostingTimes] = useState<string[]>(["12:00", "18:00"]);
  const [newTime, setNewTime] = useState("");

  // Random time scheduling states
  const [isRandomTimeMode, setIsRandomTimeMode] = useState(false);
  const [randomStartHour, setRandomStartHour] = useState("11:00");
  const [randomEndHour, setRandomEndHour] = useState("22:00");
  const [randomCountPerDay, setRandomCountPerDay] = useState(2);
  const [stableRandomTimes, setStableRandomTimes] = useState<Record<string, string[][]>>({});
  const [randomTrigger, setRandomTrigger] = useState(0);

  // Randomize state
  const [randomize, setRandomize] = useState(false);
  const [accountVideoOrders, setAccountVideoOrders] = useState<Record<string, number[]>>({});
  const [lastScheduledDates, setLastScheduledDates] = useState<Record<string, string>>({});

  // Upload progress and submitting states
  const [submitting, setSubmitting] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [batchSize, setBatchSize] = useState(1);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Load visible accounts on mount
  useEffect(() => {
    supabase
      .from("instagram_accounts")
      .select("id, username, category_id, account_categories(id, name, color)")
      .eq("hidden", false)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const loadedAccounts = data ?? [];
        setAccounts(loadedAccounts);

        // Preselect the active account or the first one
        const activeId = localStorage.getItem("active_ig_account_id");
        if (activeId && loadedAccounts.some((a) => a.id === activeId)) {
          setSelectedAccounts([activeId]);
        } else if (loadedAccounts.length > 0) {
          setSelectedAccounts([loadedAccounts[0].id]);
        }
      });

    supabase
      .from("scheduled_posts")
      .select("instagram_account_id, scheduled_at")
      .eq("status", "pending")
      .order("scheduled_at", { ascending: false })
      .then(({ data }) => {
        const datesMap: Record<string, string> = {};
        if (data) {
          data.forEach((post) => {
            const accId = post.instagram_account_id;
            if (!datesMap[accId]) {
              datesMap[accId] = post.scheduled_at;
            }
          });
        }
        setLastScheduledDates(datesMap);
      });
  }, []);

  // Cleanup cover preview object url
  useEffect(() => {
    return () => {
      if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
    };
  }, [coverPreviewUrl]);

  // Synchronize and shuffle video orders per account reactively
  useEffect(() => {
    const newOrders: Record<string, number[]> = {};
    selectedAccounts.forEach((accId) => {
      const existing = accountVideoOrders[accId];
      if (existing && existing.length === videoFiles.length) {
        newOrders[accId] = existing;
      } else {
        const seq = Array.from({ length: videoFiles.length }, (_, i) => i);
        newOrders[accId] = randomize ? shuffleArray(seq) : seq;
      }
    });
    setAccountVideoOrders(newOrders);
  }, [videoFiles.length, selectedAccounts, randomize]);

  // Generate random posting times per account and day reactively in random mode
  useEffect(() => {
    if (!isRandomTimeMode || selectedAccounts.length === 0 || videoFiles.length === 0) {
      return;
    }

    const startMin = parseTimeToMinutes(randomStartHour);
    const endMin = parseTimeToMinutes(randomEndHour);
    const actualStartMin = Math.min(startMin, endMin);
    const actualEndMin = Math.max(startMin, endMin);

    const newRandomTimes: Record<string, string[][]> = {};

    selectedAccounts.forEach((accId) => {
      const accountTimes: string[][] = [];
      const totalSlots = Math.ceil(videoFiles.length / batchSize);
      const totalDays = Math.ceil(totalSlots / randomCountPerDay);

      for (let d = 0; d < totalDays; d++) {
        const dayTimes: number[] = [];
        for (let k = 0; k < randomCountPerDay; k++) {
          const rand =
            Math.floor(Math.random() * (actualEndMin - actualStartMin + 1)) + actualStartMin;
          dayTimes.push(rand);
        }
        dayTimes.sort((a, b) => a - b);

        accountTimes.push(
          dayTimes.map((t) => {
            const h = Math.floor(t / 60);
            const m = t % 60;
            return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
          }),
        );
      }
      newRandomTimes[accId] = accountTimes;
    });

    setStableRandomTimes(newRandomTimes);
  }, [
    isRandomTimeMode,
    selectedAccounts,
    videoFiles.length,
    randomStartHour,
    randomEndHour,
    randomCountPerDay,
    randomTrigger,
    batchSize,
  ]);

  const handleReshuffle = () => {
    const newOrders: Record<string, number[]> = {};
    selectedAccounts.forEach((accId) => {
      const seq = Array.from({ length: videoFiles.length }, (_, i) => i);
      newOrders[accId] = shuffleArray(seq);
    });
    setAccountVideoOrders(newOrders);
    toast.success("Ordem dos vídeos misturada novamente!");
  };

  const handleAddTime = () => {
    if (!newTime) return;
    if (postingTimes.includes(newTime)) {
      toast.error("Este horário já foi adicionado.");
      return;
    }
    setPostingTimes((prev) => [...prev, newTime].sort());
    setNewTime("");
  };

  const handleRemoveTime = (timeToRemove: string) => {
    setPostingTimes((prev) => prev.filter((t) => t !== timeToRemove));
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setVideoFiles((prev) => [...prev, ...filesArray]);
    }
  };

  const handleRemoveVideo = (index: number) => {
    const fileObj = videoFiles[index];
    if (fileObj) {
      const fileKey = `${fileObj.name}-${fileObj.size}-${fileObj.lastModified}`;
      setUploadedVideoUrls((prev) => {
        const next = { ...prev };
        delete next[fileKey];
        return next;
      });
    }
    setVideoFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearVideos = () => {
    setVideoFiles([]);
    setUploadedVideoUrls({});
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Helper to compute chronologically sorted schedule list
  interface ScheduleSlot {
    dateStr: string;
    timeStr: string;
    accountId: string;
    accountUsername: string;
    accountColor?: string;
    videoIndex: number;
    videoFileName: string;
  }

  const getScheduleSlots = (): ScheduleSlot[] => {
    if (videoFiles.length === 0 || selectedAccounts.length === 0 || !startDate) {
      return [];
    }
    if (!isRandomTimeMode && postingTimes.length === 0) {
      return [];
    }

    const slots: ScheduleSlot[] = [];
    const sortedTimes = [...postingTimes].sort();
    const [year, month, day] = startDate.split("-").map(Number);

    selectedAccounts.forEach((accId) => {
      const account = accounts.find((a) => a.id === accId);
      if (!account) return;

      const order =
        accountVideoOrders[accId] || Array.from({ length: videoFiles.length }, (_, i) => i);

      order.forEach((videoIdx, i) => {
        if (videoIdx >= videoFiles.length) return;

        let timeStr = "";
        let dayIndex = 0;

        const slotIndex = Math.floor(i / batchSize);

        if (isRandomTimeMode) {
          dayIndex = Math.floor(slotIndex / randomCountPerDay);
          const timeIndex = slotIndex % randomCountPerDay;
          timeStr = stableRandomTimes[accId]?.[dayIndex]?.[timeIndex] || "12:00";
        } else {
          dayIndex = Math.floor(slotIndex / sortedTimes.length);
          const timeIndex = slotIndex % sortedTimes.length;
          timeStr = sortedTimes[timeIndex];
        }

        const slotDate = new Date(year, month - 1, day + dayIndex);
        const formattedDate = slotDate.toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });

        slots.push({
          dateStr: formattedDate,
          timeStr,
          accountId: accId,
          accountUsername: account.username,
          accountColor: account.account_categories?.color,
          videoIndex: videoIdx,
          videoFileName: videoFiles[videoIdx].name,
        });
      });
    });

    return slots.sort((a, b) => {
      const [dA, mA, yA] = a.dateStr.split("/").map(Number);
      const [dB, mB, yB] = b.dateStr.split("/").map(Number);
      const dateA = new Date(yA, mA - 1, dA);
      const dateB = new Date(yB, mB - 1, dB);

      if (dateA.getTime() !== dateB.getTime()) {
        return dateA.getTime() - dateB.getTime();
      }
      if (a.timeStr !== b.timeStr) {
        return a.timeStr.localeCompare(b.timeStr);
      }
      if (a.videoIndex !== b.videoIndex) {
        return a.videoIndex - b.videoIndex;
      }
      return a.accountUsername.localeCompare(b.accountUsername);
    });
  };

  const slots = getScheduleSlots();

  // Group slots by date for preview
  const slotsByDate: Record<string, ScheduleSlot[]> = {};
  slots.forEach((slot) => {
    if (!slotsByDate[slot.dateStr]) {
      slotsByDate[slot.dateStr] = [];
    }
    slotsByDate[slot.dateStr].push(slot);
  });

  const totalCalculatedDays = slots.length > 0 ? Object.keys(slotsByDate).length : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedAccounts.length === 0) {
      toast.error("Selecione pelo menos uma conta do Instagram.");
      return;
    }
    if (videoFiles.length === 0) {
      toast.error("Adicione pelo menos um vídeo para agendar.");
      return;
    }
    if (!isRandomTimeMode && postingTimes.length === 0) {
      toast.error("Configure pelo menos um horário de postagem.");
      return;
    }
    if (!startDate) {
      toast.error("Selecione a data de início.");
      return;
    }

    setSubmitting(true);
    setUploadProgress(0);
    setUploadStatus("Iniciando uploads...");

    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Sessão expirada. Por favor faça login novamente.");

      const totalVideos = videoFiles.length;
      const uploadedUrls: string[] = [];

      // 1. Upload Video Files sequentially to prevent network congestion
      for (let i = 0; i < totalVideos; i++) {
        const fileObj = videoFiles[i];
        const fileKey = `${fileObj.name}-${fileObj.size}-${fileObj.lastModified}`;

        let publicUrl = uploadedVideoUrls[fileKey];

        if (publicUrl) {
          setUploadStatus(
            `Vídeo ${i + 1} de ${totalVideos} já enviado (usando cache): ${fileObj.name}...`,
          );
          uploadedUrls.push(publicUrl);
          setUploadProgress(Math.round(((i + 1) / totalVideos) * 90));
          continue;
        }

        setUploadStatus(`Enviando vídeo ${i + 1} de ${totalVideos}: ${fileObj.name}...`);

        const videoUpload = await getUploadPresignedUrl({
          data: {
            fileName: fileObj.name,
            contentType: fileObj.type || "video/mp4",
          },
        });

        await fetchWithRetry(videoUpload.uploadUrl, {
          method: "PUT",
          body: fileObj,
          headers: {
            "Content-Type": fileObj.type || "video/mp4",
          },
        });

        publicUrl = videoUpload.publicUrl;

        // Save to cache state
        setUploadedVideoUrls((prev) => ({ ...prev, [fileKey]: publicUrl }));
        uploadedUrls.push(publicUrl);
        setUploadProgress(Math.round(((i + 1) / totalVideos) * 90)); // 90% allocated for videos
      }

      // 2. Upload Cover File (if selected)
      let coverUrl = null;
      if (coverFile) {
        const coverKey = `${coverFile.name}-${coverFile.size}-${coverFile.lastModified}`;
        if (uploadedCoverState && uploadedCoverState.key === coverKey) {
          coverUrl = uploadedCoverState.url;
          setUploadStatus("Foto de capa comum já enviada (usando cache)...");
        } else {
          setUploadStatus("Enviando foto de capa comum...");
          const coverUpload = await getUploadPresignedUrl({
            data: {
              fileName: coverFile.name,
              contentType: coverFile.type || "image/jpeg",
            },
          });

          await fetchWithRetry(coverUpload.uploadUrl, {
            method: "PUT",
            body: coverFile,
            headers: {
              "Content-Type": coverFile.type || "image/jpeg",
            },
          });

          coverUrl = coverUpload.publicUrl;
          setUploadedCoverState({ key: coverKey, url: coverUrl });
        }
      }

      setUploadProgress(95);
      setUploadStatus("Criando agendamentos no banco de dados...");

      // 3. Prepare DB records
      const postsToInsert: any[] = [];
      const sortedTimes = [...postingTimes].sort();
      const [year, month, day] = startDate.split("-").map(Number);

      selectedAccounts.forEach((accId) => {
        const order =
          accountVideoOrders[accId] || Array.from({ length: totalVideos }, (_, idx) => idx);

        order.forEach((videoIdx, i) => {
          let dayIndex = 0;
          let hours = 12;
          let minutes = 0;

          const slotIndex = Math.floor(i / batchSize);

          if (isRandomTimeMode) {
            dayIndex = Math.floor(slotIndex / randomCountPerDay);
            const timeIndex = slotIndex % randomCountPerDay;
            const timeStr = stableRandomTimes[accId]?.[dayIndex]?.[timeIndex] || "12:00";
            const [h, m] = timeStr.split(":").map(Number);
            hours = h;
            minutes = m;
          } else {
            dayIndex = Math.floor(slotIndex / sortedTimes.length);
            const timeIndex = slotIndex % sortedTimes.length;
            const [h, m] = sortedTimes[timeIndex].split(":").map(Number);
            hours = h;
            minutes = m;
          }

          // Construct date time slot in local time representation
          const scheduledDate = new Date(year, month - 1, day + dayIndex, hours, minutes, 0, 0);

          postsToInsert.push({
            user_id: uid,
            instagram_account_id: accId,
            video_url: uploadedUrls[videoIdx],
            cover_url: coverUrl,
            caption,
            scheduled_at: scheduledDate.toISOString(),
            status: "pending",
          });
        });
      });

      // 4. Batch insert posts
      const { error: dbErr } = await supabase.from("scheduled_posts").insert(postsToInsert);
      if (dbErr) throw dbErr;

      setUploadProgress(100);
      setUploadStatus("Agendado com sucesso!");
      toast.success(`${postsToInsert.length} posts agendados com sucesso!`);
      navigate({ to: "/posts" });
    } catch (err: any) {
      console.error("Bulk scheduling error:", err);
      toast.error(err.message || "Ocorreu um erro ao realizar o agendamento em massa.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8 max-w-6xl pb-16">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
          <Sparkles className="size-8 text-primary" /> Postar em Massa (Reels)
        </h1>
        <p className="text-muted-foreground mt-1">
          Distribua vários vídeos em datas e horários sequenciais para múltiplas contas de uma só
          vez.
        </p>
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/80 p-12 text-center bg-card/30">
          <Instagram className="size-12 text-muted-foreground mx-auto mb-4" />
          <p className="font-semibold">Nenhuma conta conectada</p>
          <p className="text-sm text-muted-foreground mt-1">
            Conecte ao menos uma conta do Instagram antes de agendar.
          </p>
          <Button
            className="mt-4 bg-gradient-brand text-primary-foreground border-0"
            onClick={() => navigate({ to: "/accounts" })}
          >
            Gerenciar Contas
          </Button>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-12 items-start">
          {/* Form Column */}
          <form
            onSubmit={handleSubmit}
            className="space-y-6 lg:col-span-7 bg-card border border-border/50 p-6 rounded-2xl shadow-card"
          >
            {/* Step 1: Accounts */}
            <div className="space-y-3">
              <Label className="text-base font-bold text-foreground">1. Selecionar Contas</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between border-border/60 hover:bg-secondary/45 rounded-xl text-sm font-medium h-11 px-3.5 flex items-center bg-card"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Instagram className="size-4 text-muted-foreground shrink-0" />
                      {selectedAccounts.length === 0 ? (
                        <span className="text-muted-foreground text-sm font-normal">
                          Selecione as contas
                        </span>
                      ) : selectedAccounts.length === 1 ? (
                        <span className="flex items-center gap-1.5 truncate text-foreground font-semibold">
                          {(() => {
                            const acc = accounts.find((a) => a.id === selectedAccounts[0]);
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
                          {selectedAccounts.length} contas selecionadas
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
                          setSelectedAccounts(accounts.map((a) => a.id));
                        }}
                        className="text-[10px] text-primary hover:underline font-bold bg-transparent border-0 cursor-pointer"
                      >
                        Todas
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedAccounts([]);
                        }}
                        className="text-[10px] text-destructive hover:underline font-bold bg-transparent border-0 cursor-pointer"
                      >
                        Limpar
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                    {accounts.map((a) => {
                      const isChecked = selectedAccounts.includes(a.id);
                      const lastDate = lastScheduledDates[a.id];
                      return (
                        <label
                          key={a.id}
                          className="flex items-center justify-between px-2 py-2 rounded-lg hover:bg-secondary/60 cursor-pointer text-xs font-semibold select-none transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedAccounts((prev) => [...prev, a.id]);
                                } else {
                                  setSelectedAccounts((prev) => prev.filter((id) => id !== a.id));
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
                          </div>
                          {lastDate ? (
                            <span
                              className="text-[10px] text-muted-foreground bg-secondary/80 border border-border/40 px-1.5 py-0.5 rounded-md font-mono shrink-0 ml-2"
                              title="Último post agendado"
                            >
                              Até:{" "}
                              {new Date(lastDate).toLocaleDateString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                              })}
                            </span>
                          ) : (
                            <span className="text-[10px] text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-md shrink-0 ml-2">
                              Vazio
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Step 2: Upload Multiple Videos */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="text-base font-bold text-foreground">
                  2. Carregar Vídeos ({videoFiles.length})
                </Label>
                {videoFiles.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClearVideos}
                    className="text-xs text-destructive hover:bg-destructive/10"
                  >
                    Limpar tudo
                  </Button>
                )}
              </div>
              <label className="block cursor-pointer">
                <input
                  type="file"
                  multiple
                  accept="video/*"
                  ref={fileInputRef}
                  className="sr-only"
                  onChange={handleVideoSelect}
                />
                <div className="rounded-xl border-2 border-dashed border-border hover:border-primary/60 transition p-6 text-center bg-card/30">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Upload className="size-6 text-primary" />
                    <span className="text-sm font-semibold text-foreground">
                      Selecione ou arraste os vídeos
                    </span>
                    <span className="text-xs">
                      Você pode selecionar múltiplos arquivos MP4, MOV.
                    </span>
                  </div>
                </div>
              </label>

              {/* Uploaded videos list */}
              {videoFiles.length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-2 border border-border/40 p-3 rounded-xl bg-secondary/15">
                  {videoFiles.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-3 text-xs bg-card border border-border/30 rounded-lg p-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileVideo className="size-4 text-primary shrink-0" />
                        <span className="truncate font-semibold text-foreground/90">
                          {file.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          ({(file.size / 1024 / 1024).toFixed(1)} MB)
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveVideo(idx)}
                        className="size-7 hover:bg-destructive/15 text-muted-foreground hover:text-destructive rounded-md shrink-0"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Step 3: Common Cover and Caption */}
            <div className="space-y-3">
              <Label className="text-base font-bold text-foreground">
                3. Capa e Legenda Únicas
              </Label>

              {/* Optional Cover */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-muted-foreground">
                  Foto de Capa Comum (Opcional)
                </Label>
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
                        setUploadedCoverState(null);
                      }
                    }}
                  />
                  <div className="rounded-xl border border-border hover:border-primary/60 transition p-4 text-center bg-card flex flex-col items-center justify-center min-h-[80px]">
                    {coverFile ? (
                      <div className="flex items-center gap-4">
                        {coverPreviewUrl && (
                          <img
                            src={coverPreviewUrl}
                            alt="Capa comum preview"
                            className="w-10 h-14 object-cover rounded-lg border border-border/80"
                          />
                        )}
                        <div className="text-left">
                          <span className="font-semibold text-xs text-foreground block truncate max-w-[200px]">
                            {coverFile.name}
                          </span>
                          <span className="text-[10px] text-primary underline font-medium">
                            Trocar imagem
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold">
                        <Upload className="size-4 text-primary" />
                        <span>Escolher capa comum para todos os vídeos</span>
                      </div>
                    )}
                  </div>
                </label>
              </div>

              {/* Caption */}
              <div className="space-y-1">
                <Label htmlFor="caption" className="text-xs font-semibold text-muted-foreground">
                  Legenda dos Reels
                </Label>
                <Textarea
                  id="caption"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={3}
                  placeholder="Escreva a legenda que será usada para todos os Reels agendados nesta leva…"
                />
              </div>
            </div>

            {/* Step 4: Dates and Times */}
            <div className="space-y-4 pt-2 border-t border-border/40">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <Label className="text-base font-bold text-foreground">
                  4. Cronograma de Postagem
                </Label>
                <div className="flex bg-secondary/30 p-1 rounded-xl border border-border/30 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setIsRandomTimeMode(false)}
                    className={`flex-1 sm:flex-initial py-1 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      !isRandomTimeMode
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Horários Fixos
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsRandomTimeMode(true)}
                    className={`flex-1 sm:flex-initial py-1 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      isRandomTimeMode
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Horários Aleatórios
                  </button>
                </div>
              </div>

              {/* Start Date & Batch Size is common to both modes */}
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="startDate"
                    className="text-xs font-semibold text-muted-foreground"
                  >
                    Data de Início
                  </Label>
                  <Input
                    type="date"
                    id="startDate"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-10 bg-card w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="batchSize"
                    className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"
                  >
                    <Layers className="size-3.5 text-primary shrink-0" /> Lote de Reels Simultâneos
                  </Label>
                  <Input
                    type="number"
                    id="batchSize"
                    min={1}
                    max={20}
                    value={batchSize}
                    onChange={(e) => setBatchSize(Math.max(1, parseInt(e.target.value) || 1))}
                    className="h-10 bg-card w-full font-semibold"
                  />
                </div>
              </div>

              {!isRandomTimeMode ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground">
                      Adicionar Horário
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        type="time"
                        value={newTime}
                        onChange={(e) => setNewTime(e.target.value)}
                        className="h-10 bg-card"
                      />
                      <Button
                        type="button"
                        onClick={handleAddTime}
                        variant="secondary"
                        className="h-10 px-3 cursor-pointer shrink-0"
                      >
                        <Plus className="size-4" /> Adicionar
                      </Button>
                    </div>
                  </div>

                  {/* Added times list */}
                  {postingTimes.length > 0 ? (
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-muted-foreground">
                        Horários de Postagem Diária:
                      </Label>
                      <div className="flex flex-wrap gap-1.5 p-2 border border-border/30 rounded-xl bg-secondary/10">
                        {postingTimes.map((time) => (
                          <span
                            key={time}
                            className="inline-flex items-center gap-1 text-xs font-bold bg-secondary border border-border/40 px-2.5 py-1 rounded-full"
                          >
                            <Clock className="size-3 text-primary shrink-0" />
                            {time}
                            <button
                              type="button"
                              onClick={() => handleRemoveTime(time)}
                              className="hover:text-destructive ml-1 text-[10px] font-extrabold cursor-pointer border-0 bg-transparent"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground italic leading-relaxed">
                        Serão postados até {postingTimes.length} Reels por dia em cada conta,
                        repetindo esses horários nos dias seguintes até postar todos os vídeos.
                      </p>
                    </div>
                  ) : (
                    <div className="text-xs text-destructive flex items-center gap-1.5">
                      <Info className="size-4 shrink-0" /> Adicione pelo menos um horário de
                      postagem.
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 grid-cols-3">
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="randomStartHour"
                        className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider"
                      >
                        Início Janela
                      </Label>
                      <Input
                        type="time"
                        id="randomStartHour"
                        value={randomStartHour}
                        onChange={(e) => setRandomStartHour(e.target.value)}
                        className="h-10 bg-card"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="randomEndHour"
                        className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider"
                      >
                        Fim Janela
                      </Label>
                      <Input
                        type="time"
                        id="randomEndHour"
                        value={randomEndHour}
                        onChange={(e) => setRandomEndHour(e.target.value)}
                        className="h-10 bg-card"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="randomCountPerDay"
                        className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider"
                      >
                        Posts / Dia
                      </Label>
                      <Input
                        type="number"
                        id="randomCountPerDay"
                        min={1}
                        max={24}
                        value={randomCountPerDay}
                        onChange={(e) =>
                          setRandomCountPerDay(Math.max(1, parseInt(e.target.value) || 1))
                        }
                        className="h-10 bg-card"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2.5 border border-border/30 rounded-xl bg-secondary/10">
                    <p className="text-[10px] text-muted-foreground italic leading-relaxed max-w-md">
                      Vídeos serão distribuídos aleatoriamente entre{" "}
                      <strong>{randomStartHour}</strong> e <strong>{randomEndHour}</strong>,
                      garantindo horários diferentes por conta/dia.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setRandomTrigger((prev) => prev + 1)}
                      className="text-xs h-8 gap-1.5 font-bold shrink-0 cursor-pointer w-full sm:w-auto"
                    >
                      <Shuffle className="size-3 text-primary" /> Recalcular
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Randomize Option */}
            <div className="pt-4 border-t border-border/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label className="text-sm font-bold flex items-center gap-1.5 text-foreground">
                  <Shuffle className="size-4 text-primary" /> Randomizar ordem dos vídeos por conta
                </Label>
                <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">
                  Embaralha os vídeos de forma independente para cada conta. Evita postar o mesmo
                  vídeo no mesmo instante em perfis diferentes.
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {randomize && videoFiles.length > 1 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleReshuffle}
                    className="text-xs h-9 cursor-pointer"
                  >
                    Misturar de Novo
                  </Button>
                )}
                <Switch checked={randomize} onCheckedChange={setRandomize} />
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={
                submitting ||
                selectedAccounts.length === 0 ||
                videoFiles.length === 0 ||
                (!isRandomTimeMode && postingTimes.length === 0)
              }
              className="w-full bg-gradient-brand text-primary-foreground border-0 hover:opacity-90 h-12 shadow-glow text-sm font-extrabold cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" /> Agendando...
                </>
              ) : (
                `Agendar ${slots.length} Publicações`
              )}
            </Button>
          </form>

          {/* Preview Column */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-card/40 border border-border/40 p-5 rounded-2xl backdrop-blur-sm shadow-card space-y-4">
              <h3 className="font-extrabold text-lg text-foreground border-b border-border/40 pb-2">
                Prévia do Cronograma
              </h3>

              {slots.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-border/40 rounded-xl bg-card/20">
                  <CalendarIcon className="size-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground max-w-[200px] mx-auto leading-relaxed">
                    Selecione as contas, carregue vídeos e configure os horários para visualizar a
                    prévia do calendário.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Summary Indicators */}
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="p-2 border border-border/30 rounded-xl bg-secondary/15">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                        Total de Posts
                      </span>
                      <p className="text-xl font-black text-gradient-brand mt-0.5">
                        {slots.length}
                      </p>
                    </div>
                    <div className="p-2 border border-border/30 rounded-xl bg-secondary/15">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                        Período Estimado
                      </span>
                      <p className="text-xl font-black text-primary mt-0.5">
                        {totalCalculatedDays} {totalCalculatedDays === 1 ? "dia" : "dias"}
                      </p>
                    </div>
                  </div>

                  {/* Chronological Preview List */}
                  <div className="max-h-[500px] overflow-y-auto pr-1.5 space-y-4">
                    {Object.entries(slotsByDate).map(([date, dateSlots]) => (
                      <div key={date} className="space-y-2">
                        <h4 className="text-xs font-bold text-primary flex items-center gap-1.5 border-b border-border/30 pb-1 mt-3">
                          <CalendarIcon className="size-3.5" /> {date}
                        </h4>
                        <div className="space-y-1.5 pl-2">
                          {dateSlots.map((slot, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between text-xs py-2 px-3 rounded-xl bg-secondary/35 border border-border/25 gap-3 hover:bg-secondary/50 transition-colors"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-extrabold text-muted-foreground shrink-0">
                                  {slot.timeStr}
                                </span>
                                <span className="text-muted-foreground/50">•</span>
                                <span
                                  className="flex items-center gap-1.5 min-w-0 font-extrabold truncate"
                                  style={{ color: slot.accountColor }}
                                >
                                  {slot.accountColor && (
                                    <span
                                      className="size-1.5 rounded-full shrink-0 ring-1 ring-white/10"
                                      style={{ backgroundColor: slot.accountColor }}
                                    />
                                  )}
                                  @{slot.accountUsername}
                                </span>
                              </div>
                              <span
                                className="truncate max-w-[160px] text-muted-foreground/80 font-mono text-[10px]"
                                title={slot.videoFileName}
                              >
                                {slot.videoFileName}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Uploading Progress Overlay */}
      {submitting && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="max-w-md w-full bg-card border border-border/80 rounded-2xl p-6 shadow-glow text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="size-12 rounded-2xl bg-gradient-brand grid place-items-center mx-auto shadow-glow animate-bounce">
              <Video className="size-6 text-primary-foreground" />
            </div>
            <div className="space-y-2">
              <h3 className="font-extrabold text-lg">Enviando Publicações em Massa</h3>
              <p className="text-xs text-muted-foreground leading-relaxed animate-pulse">
                {uploadStatus}
              </p>
            </div>
            <div className="space-y-1">
              <Progress value={uploadProgress} className="h-2.5" />
              <div className="flex justify-between text-[10px] font-bold text-muted-foreground">
                <span>Progresso</span>
                <span>{uploadProgress}%</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
