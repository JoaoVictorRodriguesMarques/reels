import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Clock,
  Trash2,
  Video,
  Upload,
  X,
  Loader2,
  Sparkles,
  Instagram,
  Calendar as CalendarIcon,
  Play,
  Pause,
  AlertCircle,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { DateTimePicker } from "@/components/DateTimePicker";
import { getUploadPresignedUrl, deleteR2File } from "@/lib/r2.functions";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/calendar")({
  head: () => ({ meta: [{ title: "Calendário Editorial — Reelary" }] }),
  component: () => (
    <AppShell>
      <CalendarPage />
    </AppShell>
  ),
});

interface Account {
  id: string;
  username: string;
  category_id: string | null;
  account_categories: { id: string; name: string; color: string } | null;
}

interface Post {
  id: string;
  caption: string;
  video_url: string;
  cover_url: string | null;
  scheduled_at: string;
  status: "pending" | "published" | "failed";
  instagram_account_id: string;
  instagram_accounts: {
    username: string;
    category_id?: string | null;
    account_categories?: { id: string; name: string; color: string } | null;
  } | null;
}

function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [publishMode, setPublishMode] = useState<"now" | "schedule">(() => {
    const saved = localStorage.getItem("last_scheduled_publish_mode");
    return saved === "now" || saved === "schedule" ? saved : "now";
  });
  const [scheduledAt, setScheduledAt] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);

  // Player state
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    return () => {
      if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
    };
  }, [coverPreviewUrl]);

  const navigate = useNavigate();

  // Load Accounts
  async function loadData() {
    try {
      // Load accounts - only visible (non-hidden) ones!
      const { data: accs } = await supabase
        .from("instagram_accounts")
        .select("id, username, category_id, account_categories(id, name, color)")
        .eq("hidden", false)
        .order("created_at", { ascending: false });

      const loadedAccounts = accs || [];
      setAccounts(loadedAccounts);

      // Pre-fill selectedAccountIds with loaded visible accounts on first load
      setSelectedAccountIds((prev) => {
        if (prev.length === 0) {
          return loadedAccounts.map((a) => a.id);
        }
        return prev.filter((id) => loadedAccounts.some((a) => a.id === id));
      });

      // Load last scheduled accounts or active account from local storage to pre-select
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
    } catch (err: any) {
      toast.error(err.message || "Erro ao carregar dados do calendário");
    }
  }

  // Load Posts for the currently visible month
  async function loadPosts() {
    setLoading(true);
    try {
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth();

      // Calculate a range that safely covers all days shown on a monthly calendar grid (including leading/trailing days)
      const startOfMonth = new Date(year, month - 1, 20).toISOString();
      const endOfMonth = new Date(year, month + 1, 10).toISOString();

      let allPosts: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from("scheduled_posts")
          .select(
            "id, caption, video_url, cover_url, scheduled_at, status, instagram_account_id, instagram_accounts(username, category_id, account_categories(id, name, color))",
          )
          .gte("scheduled_at", startOfMonth)
          .lte("scheduled_at", endOfMonth)
          .order("scheduled_at", { ascending: true })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (selectedAccountIds.length > 0) {
          query = query.in("instagram_account_id", selectedAccountIds);
        }

        const { data: postsData, error } = await query;
        if (error) throw error;

        if (postsData && postsData.length > 0) {
          allPosts = [...allPosts, ...postsData];
          if (postsData.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }

        // Safety limit to prevent infinite loop (caps at 10k posts)
        if (page >= 10) {
          hasMore = false;
        }
      }

      setPosts(allPosts);
    } catch (err: any) {
      toast.error(err.message || "Erro ao carregar posts do calendário");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();

    const syncActiveAccount = () => {
      const activeId = localStorage.getItem("active_ig_account_id");
      if (activeId) setAccountIds([activeId]);
    };
    window.addEventListener("active-account-changed", syncActiveAccount);
    return () => window.removeEventListener("active-account-changed", syncActiveAccount);
  }, []);

  useEffect(() => {
    if (accounts.length > 0) {
      loadPosts();
    }
  }, [accounts, currentMonth, selectedAccountIds]);

  // Cleanup object URL
  useEffect(() => {
    return () => {
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    };
  }, [videoPreviewUrl]);

  // Video selection handler
  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
      setVideoFile(file);
      setVideoPreviewUrl(URL.createObjectURL(file));
      setIsPlaying(false);
      toast.success("Vídeo carregado com sucesso para visualização.");
    }
  };

  // Toggle Video Playback
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch((err) => console.error("Error playing video:", err));
    }
    setIsPlaying(!isPlaying);
  };

  // Form submission handler
  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoFile || accountIds.length === 0 || (publishMode === "schedule" && !scheduledAt)) {
      toast.error("Por favor, preencha todos os campos e selecione pelo menos uma conta.");
      return;
    }

    setSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Sessão expirada. Faça login novamente.");

      // 1. Upload Video to Cloudflare R2
      const videoUpload = await getUploadPresignedUrl({
        data: {
          fileName: videoFile.name,
          contentType: videoFile.type || "video/mp4",
        },
      });

      let videoPutRes;
      try {
        videoPutRes = await fetch(videoUpload.uploadUrl, {
          method: "PUT",
          body: videoFile,
          headers: {
            "Content-Type": videoFile.type || "video/mp4",
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

      // Insert scheduled post record
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
        toast.success(`Reel agendado com sucesso para ${accountIds.length} conta(s)!`);
      }

      // Reset form
      setCaption("");
      setVideoFile(null);
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
      setVideoPreviewUrl(null);
      setCoverFile(null);
      if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
      setCoverPreviewUrl(null);

      // Close modal & reload data
      setShowModal(false);
      loadData();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Ocorreu um erro ao agendar o Reel.");
    } finally {
      setSubmitting(false);
    }
  };

  const deletePost = async (id: string) => {
    if (!confirm("Excluir este agendamento de Reel definitivamente?")) return;
    try {
      const post = posts.find((p) => p.id === id);
      if (post) {
        if (post.video_url) {
          try {
            await deleteR2File({ data: { url: post.video_url } });
          } catch (err) {
            console.error("Erro ao deletar vídeo do R2:", err);
          }
        }
        if (post.cover_url) {
          try {
            await deleteR2File({ data: { url: post.cover_url } });
          } catch (err) {
            console.error("Erro ao deletar capa do R2:", err);
          }
        }
      }

      const { error } = await supabase.from("scheduled_posts").delete().eq("id", id);
      if (error) throw error;
      toast.success("Agendamento excluído.");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir agendamento.");
    }
  };

  // Calendar Math Helpers
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const firstDayOfWeek = new Date(year, month, 1).getDay(); // Sunday=0, Monday=1 etc.
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  // Pad previous month days (adjusting Sunday start)
  const prevMonthPadding = Array.from({ length: firstDayOfWeek }, (_, i) => {
    const day = prevMonthDays - firstDayOfWeek + i + 1;
    return {
      day,
      isCurrentMonth: false,
      date: new Date(year, month - 1, day),
    };
  });

  // Current month days
  const currentMonthDays = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    return {
      day,
      isCurrentMonth: true,
      date: new Date(year, month, day),
    };
  });

  // Pad next month days to align grid (7 cols)
  const totalSlots = prevMonthPadding.length + currentMonthDays.length;
  const remainingSlots = (7 - (totalSlots % 7)) % 7;
  const nextMonthPadding = Array.from({ length: remainingSlots }, (_, i) => {
    const day = i + 1;
    return {
      day,
      isCurrentMonth: false,
      date: new Date(year, month + 1, day),
    };
  });

  const allCalendarDays = [...prevMonthPadding, ...currentMonthDays, ...nextMonthPadding];

  const navigateMonth = (direction: "prev" | "next") => {
    const newMonth = new Date(currentMonth);
    if (direction === "prev") {
      newMonth.setMonth(currentMonth.getMonth() - 1);
    } else {
      newMonth.setMonth(currentMonth.getMonth() + 1);
    }
    setCurrentMonth(newMonth);
  };

  // Month names
  const monthNames = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];

  const dayOfWeekNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  // Utility to check date equality
  const isSameDay = (d1: Date, d2: Date) => {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  };

  // Filter posts for selected day and selected accounts
  const postsOnSelectedDay = posts.filter(
    (p) =>
      isSameDay(new Date(p.scheduled_at), selectedDate) &&
      selectedAccountIds.includes(p.instagram_account_id),
  );

  // Minimum date-time for scheduling picker
  const tzOffset = new Date().getTimezoneOffset() * 60_000;
  const minDateTime = new Date(Date.now() + 5 * 60_000 - tzOffset).toISOString().slice(0, 16);

  // Trigger modal for a day
  const openScheduleForDay = (date: Date) => {
    setSelectedDate(date);

    // Set scheduledAt input to selected day with last scheduled time or current time + 1 hour
    const futureDate = new Date(date);
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
      const nowTime = new Date();
      futureDate.setHours(nowTime.getHours() + 1, 0, 0, 0);
    }

    // Adjust timezone offset to match local input string format
    const timezoneOffset = futureDate.getTimezoneOffset() * 60000;
    const localISODate = new Date(futureDate.getTime() - timezoneOffset).toISOString().slice(0, 16);

    setScheduledAt(localISODate);
    setShowModal(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Calendário Editorial</h1>
          <p className="text-muted-foreground mt-1.5">
            Visualize o fluxo do seu conteúdo e agende novas postagens clicando nos dias
            correspondentes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {accounts.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="border-border/60 hover:bg-secondary rounded-xl text-xs font-semibold h-10 gap-2 cursor-pointer"
                >
                  <Instagram className="size-4 text-muted-foreground" />
                  <span>
                    Filtrar Contas ({selectedAccountIds.length}/{accounts.length})
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-card border border-border/60">
                <DropdownMenuLabel className="text-xs text-muted-foreground font-semibold flex items-center justify-between">
                  <span>Selecionar Contas</span>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAccountIds(accounts.map((a) => a.id));
                      }}
                      className="text-[10px] text-primary hover:underline font-bold cursor-pointer"
                    >
                      Todas
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAccountIds([]);
                      }}
                      className="text-[10px] text-destructive hover:underline font-bold cursor-pointer"
                    >
                      Limpar
                    </button>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {accounts.map((a) => {
                  const isChecked = selectedAccountIds.includes(a.id);
                  return (
                    <DropdownMenuCheckboxItem
                      key={a.id}
                      checked={isChecked}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedAccountIds((prev) => [...prev, a.id]);
                        } else {
                          setSelectedAccountIds((prev) => prev.filter((id) => id !== a.id));
                        }
                      }}
                      onSelect={(e) => e.preventDefault()} // Mantém o dropdown aberto
                      className="cursor-pointer font-medium text-xs py-2"
                    >
                      <span className="flex items-center gap-2">
                        {a.account_categories && (
                          <span
                            className="size-2.5 rounded-full shrink-0 ring-1 ring-white/10"
                            style={{ backgroundColor: a.account_categories.color }}
                          />
                        )}
                        @{a.username}
                      </span>
                    </DropdownMenuCheckboxItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {accounts.length > 0 && (
            <Button
              onClick={() => openScheduleForDay(selectedDate)}
              className="bg-gradient-brand text-primary-foreground border-0 hover:opacity-95 font-semibold shadow-glow h-10"
            >
              <Plus className="size-4 mr-2" /> Agendar Reel
            </Button>
          )}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Lado Esquerdo: Calendário */}
        <div className="lg:col-span-2 rounded-2xl border border-border/50 bg-card/45 p-5 shadow-card flex flex-col justify-between">
          <div>
            {/* Header do Calendário */}
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-extrabold text-lg flex items-center gap-2">
                <CalendarIcon className="size-5 text-primary" />
                {monthNames[month]} {year}
              </h3>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => navigateMonth("prev")}
                  className="size-8 rounded-lg hover:bg-secondary cursor-pointer"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => navigateMonth("next")}
                  className="size-8 rounded-lg hover:bg-secondary cursor-pointer"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>

            {/* Dias da semana */}
            <div className="grid grid-cols-7 gap-1 text-center mb-2">
              {dayOfWeekNames.map((name) => (
                <div key={name} className="text-xs font-bold text-muted-foreground py-1.5">
                  {name}
                </div>
              ))}
            </div>

            {/* Dias do calendário */}
            <div className="grid grid-cols-7 gap-2">
              {allCalendarDays.map((cell, idx) => {
                const dayPosts = posts.filter(
                  (p) =>
                    isSameDay(new Date(p.scheduled_at), cell.date) &&
                    selectedAccountIds.includes(p.instagram_account_id),
                );
                const isSelected = isSameDay(cell.date, selectedDate);
                const isTodayDate = isSameDay(cell.date, new Date());

                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedDate(cell.date)}
                    className={`min-h-[105px] md:min-h-[125px] aspect-auto rounded-2xl p-2.5 flex flex-col justify-between items-start transition-all duration-300 cursor-pointer border relative active:scale-[0.97] hover:scale-[1.03] hover:shadow-md ${
                      !cell.isCurrentMonth
                        ? "text-muted-foreground/35 border-transparent bg-transparent cursor-default pointer-events-none"
                        : isSelected
                          ? "bg-primary/[0.07] border-primary text-primary font-bold shadow-sm shadow-primary/10 ring-1 ring-primary/30"
                          : isTodayDate
                            ? "bg-secondary/60 border-primary/45 font-bold shadow-sm ring-1 ring-primary/15"
                            : "bg-card border-border/40 hover:border-primary/30 hover:bg-card/85"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span
                        className={`text-xs md:text-sm font-semibold ${isTodayDate ? "text-primary bg-primary/10 px-1.5 py-0.5 rounded-md" : ""}`}
                      >
                        {cell.day}
                      </span>
                      {isTodayDate && <span className="size-1.5 rounded-full bg-primary" />}
                    </div>

                    {/* Visual post badges inside the cell */}
                    {dayPosts.length > 0 && (
                      <div className="w-full space-y-1 mt-2.5 overflow-hidden text-left">
                        {dayPosts.slice(0, 2).map((p) => {
                          const categoryColor =
                            p.instagram_accounts?.account_categories?.color || "#6366f1";
                          const postTime = new Date(p.scheduled_at).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          });
                          return (
                            <div
                              key={p.id}
                              className="w-full text-[9px] font-bold px-1.5 py-1 rounded-lg truncate flex items-center gap-1 hover:brightness-105 border transition-all"
                              style={{
                                backgroundColor: `${categoryColor}12`,
                                borderColor: `${categoryColor}25`,
                                color: categoryColor,
                                borderLeft: `3px solid ${categoryColor}`,
                              }}
                              title={`@${p.instagram_accounts?.username}: ${p.status}`}
                            >
                              <span className="shrink-0 text-[8px] opacity-75">{postTime}</span>
                              <span className="truncate">@{p.instagram_accounts?.username}</span>
                            </div>
                          );
                        })}
                        {dayPosts.length > 2 && (
                          <div className="text-[9px] font-extrabold text-muted-foreground/80 pl-1 mt-0.5 animate-pulse">
                            + {dayPosts.length - 2} postagens
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Lado Direito: Reels Agendados do Dia Selecionado */}
        <div className="rounded-2xl border border-border/50 bg-card/45 p-5 shadow-card flex flex-col justify-between">
          <div>
            <h3 className="font-extrabold text-lg border-b border-border/40 pb-4 mb-5">
              Reels para o dia {selectedDate.toLocaleDateString("pt-BR", { dateStyle: "medium" })}
            </h3>

            {loading ? (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <div key={i} className="h-20 bg-secondary animate-pulse rounded-xl" />
                ))}
              </div>
            ) : postsOnSelectedDay.length === 0 ? (
              <div className="text-center py-12 px-4 border border-dashed border-border/60 rounded-xl bg-card/10">
                <Video className="size-8 text-muted-foreground/60 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Nenhum Reel agendado para este dia.</p>
                {accounts.length > 0 ? (
                  <Button
                    onClick={() => openScheduleForDay(selectedDate)}
                    size="sm"
                    className="mt-4 border-primary text-primary hover:bg-primary/5 bg-transparent border rounded-lg text-xs"
                  >
                    Agendar para este dia
                  </Button>
                ) : (
                  <Button
                    onClick={() => navigate({ to: "/accounts" })}
                    size="sm"
                    className="mt-4 border-dashed border-muted-foreground text-muted-foreground bg-transparent border rounded-lg text-xs"
                  >
                    Vincular conta primeiro
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-5 max-h-[500px] overflow-y-auto pr-1.5 relative pl-4 border-l border-border/30">
                {postsOnSelectedDay.map((post) => {
                  const statusLabel = {
                    pending: {
                      text: "Agendado",
                      cls: "bg-warning/15 text-warning border-warning/30",
                      dotCls: "bg-warning ring-warning/20",
                    },
                    published: {
                      text: "Publicado",
                      cls: "bg-success/15 text-success border-success/30",
                      dotCls: "bg-success ring-success/20",
                    },
                    failed: {
                      text: "Falhou",
                      cls: "bg-destructive/15 text-destructive border-destructive/30",
                      dotCls: "bg-destructive ring-destructive/20",
                    },
                  };
                  const st = statusLabel[post.status] || {
                    text: "Pendente",
                    cls: "bg-secondary text-foreground",
                    dotCls: "bg-muted ring-muted/20",
                  };
                  const categoryColor =
                    post.instagram_accounts?.account_categories?.color || "#6366f1";

                  return (
                    <div
                      key={post.id}
                      className="relative group transition-all duration-300 hover:-translate-y-0.5"
                    >
                      {/* Timeline dot */}
                      <span
                        className={`absolute -left-[21.5px] top-4 size-2.5 rounded-full ring-4 ${st.dotCls} z-10 transition-transform group-hover:scale-125`}
                      />

                      <div className="p-4 rounded-2xl bg-card border border-border/50 hover:border-primary/20 hover:bg-card/75 transition-all shadow-sm flex gap-4 relative">
                        {post.video_url ? (
                          <video
                            src={post.video_url}
                            className="w-16 h-20 rounded-xl object-cover bg-background shrink-0 shadow-inner"
                            muted
                            preload="metadata"
                          />
                        ) : (
                          <div
                            className="w-16 h-20 rounded-xl bg-secondary/60 flex flex-col items-center justify-center shrink-0 border border-border/40 shadow-inner gap-1"
                            title="Vídeo removido para economizar espaço"
                          >
                            <Video className="size-5 text-muted-foreground/60" />
                            <span className="text-[8px] text-muted-foreground/80 font-bold">
                              Limpo
                            </span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1 flex flex-col justify-between py-0.5">
                          <div>
                            <div className="flex items-center gap-1.5 text-xs">
                              <span
                                className="size-2 rounded-full shrink-0 ring-1 ring-white/10"
                                style={{ backgroundColor: categoryColor }}
                              />
                              <strong className="text-foreground truncate font-bold text-xs">
                                @{post.instagram_accounts?.username || "instagram"}
                              </strong>
                              <span className="text-muted-foreground">•</span>
                              <span className="text-muted-foreground font-bold text-xs">
                                {new Date(post.scheduled_at).toLocaleTimeString("pt-BR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            <p className="text-xs text-foreground/80 mt-2 line-clamp-2 leading-relaxed">
                              {post.caption || (
                                <span className="text-muted-foreground italic">Sem legenda</span>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-border/20">
                            <span
                              className={`inline-flex items-center text-[10px] font-bold border px-2 py-0.5 rounded-full ${st.cls}`}
                            >
                              {st.text}
                            </span>

                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deletePost(post.id)}
                              className="size-7 text-muted-foreground hover:text-destructive rounded-lg hover:bg-destructive/10 transition cursor-pointer"
                              title="Excluir"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {accounts.length === 0 && (
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 flex gap-3 text-xs mt-6">
              <AlertCircle className="size-4 text-warning shrink-0 mt-0.5" />
              <p className="text-muted-foreground">
                Você deve{" "}
                <Link to="/accounts" className="text-warning underline font-semibold">
                  conectar uma conta do Instagram
                </Link>{" "}
                na aba de Contas antes de poder agendar seus Reels.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Pop-up de Agendamento (Modal Dialog) */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-4xl bg-card border border-border/60 max-h-[90vh] overflow-y-auto rounded-2xl grid md:grid-cols-2 gap-6 p-6">
          <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
            <X className="size-4" />
            <span className="sr-only">Fechar</span>
          </DialogClose>

          {/* Coluna Esquerda: Formulário de Agendamento */}
          <div className="space-y-5">
            <div>
              <DialogTitle className="text-xl font-extrabold flex items-center gap-2 text-foreground">
                <Sparkles className="size-5 text-primary animate-pulse" />
                Agendar Novo Reel
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-1">
                Forneça o arquivo de vídeo (.mp4/mov), escreva a legenda e selecione o horário
                ideal.
              </DialogDescription>
            </div>

            <form onSubmit={handleScheduleSubmit} className="space-y-4">
              {/* Seletor de Arquivo */}
              <div className="space-y-2">
                <Label className="text-sm font-bold">Arquivo de Vídeo</Label>
                <label className="block cursor-pointer">
                  <input
                    type="file"
                    accept="video/*"
                    className="sr-only"
                    required
                    onChange={handleVideoChange}
                  />
                  <div className="rounded-xl border-2 border-dashed border-border/80 hover:border-primary/60 bg-secondary/10 hover:bg-secondary/20 transition-all p-5 text-center flex flex-col items-center justify-center min-h-[120px]">
                    {videoFile ? (
                      <div className="flex flex-col items-center gap-2 text-foreground">
                        <Video className="size-6 text-primary" />
                        <span className="font-semibold text-xs truncate max-w-[250px]">
                          {videoFile.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {(videoFile.size / 1024 / 1024).toFixed(1)} MB
                        </span>
                        <span className="text-[10px] text-primary underline mt-1 font-medium">
                          Trocar arquivo
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                        <Upload className="size-6 text-muted-foreground/60" />
                        <span className="text-xs font-semibold text-foreground">
                          Clique para enviar um vídeo
                        </span>
                        <span className="text-[10px]">MP4, MOV (até 100MB)</span>
                      </div>
                    )}
                  </div>
                </label>
              </div>

              {/* Foto de Capa (Opcional) */}
              <div className="space-y-2">
                <Label className="text-sm font-bold">Foto de Capa (Opcional)</Label>
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
                  <div className="rounded-xl border-2 border-dashed border-border/80 hover:border-primary/60 bg-secondary/10 hover:bg-secondary/20 transition-all p-4 text-center flex flex-col items-center justify-center min-h-[90px]">
                    {coverFile ? (
                      <div className="flex flex-col items-center gap-1.5 text-foreground">
                        {coverPreviewUrl && (
                          <img
                            src={coverPreviewUrl}
                            alt="Capa preview"
                            className="w-12 h-16 object-cover rounded border border-border/80 shadow-sm mb-1"
                          />
                        )}
                        <div className="flex items-center gap-1 text-xs">
                          <span className="font-semibold truncate max-w-[180px]">
                            {coverFile.name}
                          </span>
                          <span className="text-[9px] text-muted-foreground">
                            {(coverFile.size / 1024 / 1024).toFixed(1)} MB
                          </span>
                        </div>
                        <span className="text-[9px] text-primary underline font-medium">
                          Trocar imagem
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-muted-foreground">
                        <Upload className="size-5 text-muted-foreground/60" />
                        <span className="text-xs font-semibold text-foreground">
                          Escolher Foto de Capa
                        </span>
                        <span className="text-[9px]">JPG, PNG (Aspecto 9:16 recomendado)</span>
                      </div>
                    )}
                  </div>
                </label>
              </div>

              {/* Seletor de Conta */}
              <div className="space-y-2">
                <Label htmlFor="modalAccount" className="text-sm font-bold">
                  Contas do Instagram
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="modalAccount"
                      variant="outline"
                      className="w-full justify-between border-border/60 hover:bg-secondary/45 rounded-xl text-sm font-medium h-10 px-3.5 cursor-pointer flex items-center bg-secondary/40 font-medium"
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
                    <div className="text-xs text-muted-foreground font-semibold flex items-center justify-between pb-2 mb-2 border-b border-border/40 font-semibold">
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

              {/* Método de Publicação */}
              <div className="space-y-2">
                <Label className="text-sm font-bold">Método de Publicação</Label>
                <Tabs
                  value={publishMode}
                  onValueChange={(val) => setPublishMode(val as "now" | "schedule")}
                  className="w-full"
                >
                  <TabsList className="grid w-full grid-cols-2 bg-secondary/60">
                    <TabsTrigger
                      value="now"
                      className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs"
                    >
                      Postar Agora
                    </TabsTrigger>
                    <TabsTrigger
                      value="schedule"
                      className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs"
                    >
                      Agendar
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {/* Data e Hora de Publicação */}
              {publishMode === "schedule" && (
                <div className="space-y-2 flex flex-col">
                  <Label className="text-sm font-bold">Data e Hora de Publicação</Label>
                  <DateTimePicker value={scheduledAt} onChange={setScheduledAt} min={minDateTime} />
                </div>
              )}

              {/* Legenda (Caption) */}
              <div className="space-y-2">
                <Label htmlFor="modalCaption" className="text-sm font-bold">
                  Legenda do Post
                </Label>
                <Textarea
                  id="modalCaption"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={4}
                  placeholder="Escreva a legenda incrível para o seu Reels... Insira #hashtags e marque @amigos."
                  className="bg-secondary/40 border-border/60 rounded-xl"
                />
              </div>

              {/* Botão de Submit */}
              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-gradient-brand text-primary-foreground border-0 hover:opacity-95 font-bold h-11 transition shadow-glow rounded-xl"
              >
                {submitting ? (
                  <span className="flex items-center gap-2 justify-center">
                    <Loader2 className="size-4 animate-spin" />{" "}
                    {publishMode === "now"
                      ? "Uploading & Publicando..."
                      : "Uploading & Agendando..."}
                  </span>
                ) : publishMode === "now" ? (
                  "Publicar Agora"
                ) : (
                  "Concluir Agendamento"
                )}
              </Button>
            </form>
          </div>

          {/* Coluna Direita: Mockup do Instagram Reels - Preview Live */}
          <div className="flex flex-col items-center justify-center border-t md:border-t-0 md:border-l border-border/50 pt-6 md:pt-0 md:pl-6">
            <h4 className="text-xs font-bold text-muted-foreground mb-4 uppercase tracking-wider">
              PRÉ-VISUALIZAÇÃO EM TEMPO REAL
            </h4>

            {/* Telefone Mockup */}
            <div className="w-[280px] h-[550px] rounded-[40px] border-[10px] border-secondary bg-black shadow-2xl relative overflow-hidden flex flex-col select-none ring-4 ring-card-foreground/5">
              {/* Speaker e Câmera */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-28 h-4.5 bg-black rounded-full z-20 flex justify-center items-center gap-1.5">
                <span className="size-1 rounded-full bg-neutral-800" />
                <span className="w-10 h-1 bg-neutral-900 rounded-full" />
              </div>

              {/* Conteúdo do Tela */}
              {videoPreviewUrl ? (
                <div className="relative w-full h-full bg-neutral-950 flex items-center justify-center group/video">
                  <video
                    ref={videoRef}
                    src={videoPreviewUrl}
                    className="w-full h-full object-cover"
                    loop
                    playsInline
                    onClick={togglePlay}
                  />

                  {coverPreviewUrl && !isPlaying && (
                    <img
                      src={coverPreviewUrl}
                      alt="Capa preview"
                      className="absolute inset-0 w-full h-full object-cover z-5 pointer-events-none"
                    />
                  )}

                  {/* Overlay Escuro com Gradiente no Instagram Reels */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/25 pointer-events-none z-10" />

                  {/* Informações Simuladas do Instagram */}
                  <div className="absolute bottom-5 left-4 right-10 text-white z-15 space-y-2 pointer-events-none">
                    <div className="flex items-center gap-2">
                      <div className="size-7 rounded-full bg-gradient-brand grid place-items-center font-bold text-[10px] text-white">
                        R
                      </div>
                      <span className="font-semibold text-xs">
                        @{accounts.find((a) => a.id === accountIds[0])?.username || "usuario"}
                      </span>
                      <span className="text-[10px] bg-white/20 border border-white/30 px-1.5 py-0.5 rounded-md font-bold">
                        Seguir
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed line-clamp-3 text-neutral-100/90 font-medium">
                      {caption ||
                        "A legenda do seu Reels aparecerá aqui quando você começar a digitar no formulário ao lado..."}
                    </p>
                  </div>

                  {/* Botões do Reels (Lado Direito) */}
                  <div className="absolute bottom-16 right-2 text-white z-15 flex flex-col gap-4 items-center pointer-events-none">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-base">❤️</span>
                      <span className="text-[8px]">Curtir</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-base">💬</span>
                      <span className="text-[8px]">Comentar</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-base">✈️</span>
                      <span className="text-[8px]">Enviar</span>
                    </div>
                  </div>

                  {/* Floating Play/Pause Button Indicator */}
                  <button
                    onClick={togglePlay}
                    className="absolute inset-0 flex items-center justify-center z-15 cursor-pointer bg-black/10 hover:bg-black/25"
                  >
                    {!isPlaying && (
                      <div className="size-14 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white scale-90 hover:scale-100 transition animate-in zoom-in-50 duration-200">
                        <Play className="size-6 fill-white text-white translate-x-0.5" />
                      </div>
                    )}
                  </button>
                </div>
              ) : (
                <div className="w-full h-full bg-neutral-900/95 flex flex-col items-center justify-center text-center p-6 space-y-4">
                  <div className="size-16 rounded-full bg-secondary/80 flex items-center justify-center text-muted-foreground animate-pulse">
                    <Video className="size-8" />
                  </div>
                  <div className="space-y-1">
                    <h5 className="font-bold text-sm text-foreground">Aguardando Vídeo</h5>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Faça o upload de um arquivo de vídeo para vê-lo tocar ao vivo neste mockup do
                      Instagram.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {videoPreviewUrl && (
              <span className="text-[10px] text-muted-foreground mt-3 flex items-center gap-1">
                💡 Clique em qualquer lugar no vídeo para reproduzir/pausar localmente.
              </span>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
