import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef, useMemo } from "react";
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
  ShieldCheck,
  Image as ImageIcon,
  Check,
  CheckCircle2,
  X,
  Palette,
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
import { sanitizeMp4Metadata } from "@/lib/mp4-sanitizer";

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

export type CoverMode = "single" | "multi";

export interface CoverGroup {
  id: string;
  name: string;
  file: File | null;
  previewUrl: string | null;
  accountIds: string[];
}

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
  let lastError: any = null;
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        return response;
      }
      console.warn(`Upload attempt ${i + 1} failed with status ${response.status}. Retrying...`);
    } catch (error) {
      lastError = error;
      console.warn(`Upload attempt ${i + 1} encountered network error:`, error);
      if (i === retries - 1) {
        throw new Error(
          `Falha de conexão com Cloudflare R2: ${error instanceof Error ? error.message : "Failed to fetch"}`,
        );
      }
    }
    if (i < retries - 1) {
      await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
  throw new Error(`Falha no upload para o Cloudflare R2 após ${retries} tentativas.`);
}

function generateBurstSizes(totalVideos: number, minSize: number, maxSize: number): number[] {
  if (totalVideos <= 0) return [];
  const realMin = Math.max(1, Math.min(minSize, maxSize));
  const realMax = Math.max(realMin, maxSize);

  if (totalVideos <= realMin) return [totalVideos];

  const sizes: number[] = [];
  let remaining = totalVideos;

  while (remaining > 0) {
    if (remaining <= realMax) {
      sizes.push(remaining);
      break;
    }
    const currentMax = Math.min(realMax, remaining - 1);
    const currentMin = Math.min(realMin, currentMax);
    const chosen = Math.floor(Math.random() * (currentMax - currentMin + 1)) + currentMin;
    sizes.push(chosen);
    remaining -= chosen;
  }
  return sizes;
}

function getBurstSlotIndices(
  i: number,
  burstSizes: number[],
  fallbackBatchSize: number,
): { burstIndex: number; withinBurstIndex: number; burstSize: number; isFirstInBurst: boolean } {
  if (!burstSizes || burstSizes.length === 0) {
    const burstIndex = Math.floor(i / fallbackBatchSize);
    const withinBurstIndex = i % fallbackBatchSize;
    return {
      burstIndex,
      withinBurstIndex,
      burstSize: fallbackBatchSize,
      isFirstInBurst: withinBurstIndex === 0,
    };
  }

  let accumulated = 0;
  for (let b = 0; b < burstSizes.length; b++) {
    const bSize = burstSizes[b];
    if (i < accumulated + bSize) {
      const withinBurstIndex = i - accumulated;
      return {
        burstIndex: b,
        withinBurstIndex,
        burstSize: bSize,
        isFirstInBurst: withinBurstIndex === 0,
      };
    }
    accumulated += bSize;
  }

  const extraIndex = i - accumulated;
  return {
    burstIndex: burstSizes.length,
    withinBurstIndex: extraIndex,
    burstSize: fallbackBatchSize,
    isFirstInBurst: extraIndex === 0,
  };
}

function BulkSchedulePage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [videoFiles, setVideoFiles] = useState<File[]>([]);

  // Cover Configuration State
  const [coverMode, setCoverMode] = useState<CoverMode>("single");

  // Single Cover State
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);

  // Multi Cover Groups State
  const [coverGroups, setCoverGroups] = useState<CoverGroup[]>([
    { id: "group-1", name: "Capa Opção A", file: null, previewUrl: null, accountIds: [] },
    { id: "group-2", name: "Capa Opção B", file: null, previewUrl: null, accountIds: [] },
  ]);

  // Upload cache
  const [uploadedVideoUrls, setUploadedVideoUrls] = useState<Record<string, string>>({});
  const [uploadedCoverCache, setUploadedCoverCache] = useState<Record<string, string>>({});

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
  const [distributionMode, setDistributionMode] = useState<"normal" | "trial_only" | "both">("normal");
  const [cleanMetadata, setCleanMetadata] = useState(true);
  const [accountVideoOrders, setAccountVideoOrders] = useState<Record<string, number[]>>({});
  const [lastScheduledDates, setLastScheduledDates] = useState<Record<string, string>>({});

  // Upload progress and submitting states
  const [submitting, setSubmitting] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [batchSize, setBatchSize] = useState(1);
  const [slotSpacingMinutes, setSlotSpacingMinutes] = useState(2);
  const [isBurstRandomMode, setIsBurstRandomMode] = useState(true);
  const [burstTrigger, setBurstTrigger] = useState(0);
  const [stableBurstDelays, setStableBurstDelays] = useState<Record<string, number[]>>({});
  const [isRandomBatchSize, setIsRandomBatchSize] = useState(false);
  const [minBatchSize, setMinBatchSize] = useState(10);
  const [maxBatchSize, setMaxBatchSize] = useState(18);
  const [stableBurstSizes, setStableBurstSizes] = useState<Record<string, number[]>>({});

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

        // Preselect all accounts or active one
        const activeId = localStorage.getItem("active_ig_account_id");
        if (activeId && loadedAccounts.some((a) => a.id === activeId)) {
          setSelectedAccounts([activeId]);
        } else if (loadedAccounts.length > 0) {
          setSelectedAccounts(loadedAccounts.map((a) => a.id));
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

  // Cleanup object urls on unmount
  useEffect(() => {
    return () => {
      if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
      coverGroups.forEach((g) => {
        if (g.previewUrl) URL.revokeObjectURL(g.previewUrl);
      });
    };
  }, []);

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

  // Generate organic random burst delays per account in burst mode
  useEffect(() => {
    if (!isBurstRandomMode || selectedAccounts.length === 0 || videoFiles.length === 0) {
      return;
    }

    const newDelays: Record<string, number[]> = {};
    selectedAccounts.forEach((accId) => {
      const delays: number[] = [];
      // Initial second offset for the first video (between 10s and 45s) so it doesn't post at exact :00
      delays.push(Math.floor(Math.random() * 35) + 10);

      // Subsequent videos have organic delays (+10s to +105s, weighted around 35-45s)
      for (let i = 1; i < videoFiles.length; i++) {
        const rand = Math.random();
        let delta = 36;
        if (rand < 0.15) {
          // Quick burst: 11s - 22s (e.g. 11s, 19s)
          delta = Math.floor(Math.random() * 12) + 11;
        } else if (rand < 0.65) {
          // Typical burst: 26s - 49s (e.g. 28s, 36s, 48s)
          delta = Math.floor(Math.random() * 24) + 26;
        } else if (rand < 0.88) {
          // Medium-long burst: 50s - 75s (e.g. 62s)
          delta = Math.floor(Math.random() * 26) + 50;
        } else {
          // Occasional pause: 80s - 110s (e.g. 104s)
          delta = Math.floor(Math.random() * 31) + 80;
        }
        delays.push(delta);
      }
      newDelays[accId] = delays;
    });

    setStableBurstDelays(newDelays);
  }, [isBurstRandomMode, selectedAccounts, videoFiles.length, burstTrigger]);

  // Generate burst sizes per account (fixed batch size or randomized burst sizes)
  useEffect(() => {
    if (selectedAccounts.length === 0 || videoFiles.length === 0) {
      return;
    }

    const newBurstSizes: Record<string, number[]> = {};
    selectedAccounts.forEach((accId) => {
      if (isRandomBatchSize) {
        // Random sizes between minBatchSize and maxBatchSize (e.g. 13, 17, 14)
        newBurstSizes[accId] = generateBurstSizes(videoFiles.length, minBatchSize, maxBatchSize);
      } else {
        const count = Math.ceil(videoFiles.length / batchSize);
        const sizes: number[] = [];
        let rem = videoFiles.length;
        for (let b = 0; b < count; b++) {
          const s = Math.min(batchSize, rem);
          sizes.push(s);
          rem -= s;
        }
        newBurstSizes[accId] = sizes;
      }
    });

    setStableBurstSizes(newBurstSizes);
  }, [
    isRandomBatchSize,
    minBatchSize,
    maxBatchSize,
    batchSize,
    selectedAccounts,
    videoFiles.length,
    burstTrigger,
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

  // Multi-cover group handlers
  const handleAddCoverGroup = () => {
    const nextIndex = coverGroups.length + 1;
    const nextLetter = String.fromCharCode(64 + nextIndex); // A, B, C, D...
    const newGroup: CoverGroup = {
      id: `group-${Date.now()}`,
      name: `Capa Opção ${nextLetter}`,
      file: null,
      previewUrl: null,
      accountIds: [],
    };
    setCoverGroups((prev) => [...prev, newGroup]);
  };

  const handleRemoveCoverGroup = (groupId: string) => {
    if (coverGroups.length <= 1) {
      toast.error("Você precisa manter ao menos um grupo de capa.");
      return;
    }
    const groupToRemove = coverGroups.find((g) => g.id === groupId);
    if (groupToRemove?.previewUrl) {
      URL.revokeObjectURL(groupToRemove.previewUrl);
    }
    setCoverGroups((prev) => prev.filter((g) => g.id !== groupId));
  };

  const handleCoverGroupFileChange = (groupId: string, file: File | null) => {
    setCoverGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        if (g.previewUrl) URL.revokeObjectURL(g.previewUrl);
        return {
          ...g,
          file,
          previewUrl: file ? URL.createObjectURL(file) : null,
        };
      }),
    );
  };

  const handleCoverGroupNameChange = (groupId: string, name: string) => {
    setCoverGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, name } : g)),
    );
  };

  const handleToggleAccountInCoverGroup = (groupId: string, accountId: string) => {
    setCoverGroups((prev) =>
      prev.map((g) => {
        if (g.id === groupId) {
          const isAlreadyIn = g.accountIds.includes(accountId);
          return {
            ...g,
            accountIds: isAlreadyIn
              ? g.accountIds.filter((id) => id !== accountId)
              : [...g.accountIds, accountId],
          };
        } else {
          // Remove from other groups to maintain 1:1 cover mapping per account
          return {
            ...g,
            accountIds: g.accountIds.filter((id) => id !== accountId),
          };
        }
      }),
    );
  };

  const handleAssignAllToCoverGroup = (groupId: string) => {
    setCoverGroups((prev) =>
      prev.map((g) => ({
        ...g,
        accountIds: g.id === groupId ? [...selectedAccounts] : [],
      })),
    );
  };

  // Helper to get assigned cover info for a given account
  const getCoverForAccount = (accId: string) => {
    if (coverMode === "single") {
      return {
        previewUrl: coverPreviewUrl,
        name: coverFile ? "Capa Comum" : "Miniatura do Vídeo",
        hasCustomCover: !!coverFile,
      };
    }

    const group = coverGroups.find((g) => g.accountIds.includes(accId));
    if (group) {
      return {
        previewUrl: group.previewUrl,
        name: group.name,
        hasCustomCover: !!group.file,
      };
    }

    return {
      previewUrl: null,
      name: "Sem capa atribuída",
      hasCustomCover: false,
    };
  };

  // Helper to compute chronologically sorted schedule list
  // Helper to compute chronologically sorted schedule list
  interface ScheduleSlot {
    dateStr: string;
    timeStr: string;
    accountId: string;
    accountUsername: string;
    accountColor?: string;
    videoIndex: number;
    videoFileName: string;
    coverPreviewUrl: string | null;
    coverName: string;
    burstDelta?: number;
    burstIndex?: number;
    burstSize?: number;
    isFirstInBurst?: boolean;
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

      const coverInfo = getCoverForAccount(accId);

      order.forEach((videoIdx, i) => {
        if (videoIdx >= videoFiles.length) return;

        let timeStr = "";
        let dayIndex = 0;
        let burstDelta: number | undefined = undefined;

        const { burstIndex, withinBurstIndex, burstSize, isFirstInBurst } = getBurstSlotIndices(
          i,
          stableBurstSizes[accId] || [],
          batchSize,
        );

        let baseTime = "12:00";
        if (isRandomTimeMode) {
          dayIndex = Math.floor(burstIndex / randomCountPerDay);
          const timeIndex = burstIndex % randomCountPerDay;
          baseTime = stableRandomTimes[accId]?.[dayIndex]?.[timeIndex] || "12:00";
        } else {
          dayIndex = Math.floor(burstIndex / sortedTimes.length);
          const timeIndex = burstIndex % sortedTimes.length;
          baseTime = sortedTimes[timeIndex];
        }

        const baseMin = parseTimeToMinutes(baseTime);

        if (isBurstRandomMode) {
          const accountDelays = stableBurstDelays[accId] || [];
          let cumulativeSec = accountDelays[0] || 15;
          for (let k = 1; k <= withinBurstIndex; k++) {
            const d = accountDelays[k] || 36;
            cumulativeSec += d;
            if (k === withinBurstIndex) {
              burstDelta = d;
            }
          }
          const totalSec = baseMin * 60 + cumulativeSec;
          const h = Math.floor(totalSec / 3600) % 24;
          const m = Math.floor((totalSec % 3600) / 60);
          const s = totalSec % 60;
          timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
        } else {
          const offsetMinutes = withinBurstIndex * slotSpacingMinutes;
          const totalMin = baseMin + offsetMinutes;
          const h = Math.floor(totalMin / 60) % 24;
          const m = totalMin % 60;
          timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
          coverPreviewUrl: coverInfo.previewUrl,
          coverName: coverInfo.name,
          burstDelta,
          burstIndex,
          burstSize,
          isFirstInBurst,
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

      // 1. Upload Video Files sequentially
      for (let i = 0; i < totalVideos; i++) {
        const fileObj = videoFiles[i];
        const fileKey = `${fileObj.name}-${fileObj.size}-${fileObj.lastModified}`;

        let publicUrl = uploadedVideoUrls[fileKey];

        if (publicUrl) {
          setUploadStatus(
            `Vídeo ${i + 1} de ${totalVideos} já enviado (usando cache): ${fileObj.name}...`,
          );
          uploadedUrls.push(publicUrl);
          setUploadProgress(Math.round(((i + 1) / totalVideos) * 80));
          continue;
        }

        let fileToUpload = fileObj;
        if (cleanMetadata) {
          setUploadStatus(
            `Higienizando metadados e gerando hash único para o vídeo ${i + 1} de ${totalVideos}...`,
          );
          fileToUpload = await sanitizeMp4Metadata(fileObj, { uniqueSeed: i });
        }

        setUploadStatus(`Enviando vídeo ${i + 1} de ${totalVideos}: ${fileToUpload.name}...`);

        const videoUpload = await getUploadPresignedUrl({
          data: {
            fileName: fileToUpload.name,
            contentType: fileToUpload.type || "video/mp4",
          },
        });

        await fetchWithRetry(videoUpload.uploadUrl, {
          method: "PUT",
          body: fileToUpload,
          headers: {
            "Content-Type": fileToUpload.type || "video/mp4",
          },
        });

        publicUrl = videoUpload.publicUrl;

        // Save to cache state
        setUploadedVideoUrls((prev) => ({ ...prev, [fileKey]: publicUrl }));
        uploadedUrls.push(publicUrl);
        setUploadProgress(Math.round(((i + 1) / totalVideos) * 80));
      }

      // 2. Upload Covers based on CoverMode
      const accountCoverUrlMap: Record<string, string | null> = {};

      if (coverMode === "single") {
        let singleCoverUrl: string | null = null;
        if (coverFile) {
          const coverKey = `${coverFile.name}-${coverFile.size}-${coverFile.lastModified}`;
          if (uploadedCoverCache[coverKey]) {
            singleCoverUrl = uploadedCoverCache[coverKey];
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
              headers: { "Content-Type": coverFile.type || "image/jpeg" },
            });

            singleCoverUrl = coverUpload.publicUrl;
            setUploadedCoverCache((prev) => ({ ...prev, [coverKey]: singleCoverUrl! }));
          }
        }
        selectedAccounts.forEach((accId) => {
          accountCoverUrlMap[accId] = singleCoverUrl;
        });
      } else {
        // Multi-Cover Groups Upload
        const groupUrlMap: Record<string, string | null> = {};

        for (let gIdx = 0; gIdx < coverGroups.length; gIdx++) {
          const group = coverGroups[gIdx];
          if (group.file) {
            const coverKey = `${group.file.name}-${group.file.size}-${group.file.lastModified}`;
            if (uploadedCoverCache[coverKey]) {
              groupUrlMap[group.id] = uploadedCoverCache[coverKey];
            } else {
              setUploadStatus(`Enviando ${group.name} (${gIdx + 1} de ${coverGroups.length})...`);
              const coverUpload = await getUploadPresignedUrl({
                data: {
                  fileName: group.file.name,
                  contentType: group.file.type || "image/jpeg",
                },
              });

              await fetchWithRetry(coverUpload.uploadUrl, {
                method: "PUT",
                body: group.file,
                headers: { "Content-Type": group.file.type || "image/jpeg" },
              });

              const uploadedUrl = coverUpload.publicUrl;
              groupUrlMap[group.id] = uploadedUrl;
              setUploadedCoverCache((prev) => ({ ...prev, [coverKey]: uploadedUrl }));
            }
          } else {
            groupUrlMap[group.id] = null;
          }

          // Map accounts in this group
          group.accountIds.forEach((accId) => {
            accountCoverUrlMap[accId] = groupUrlMap[group.id] || null;
          });
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

        const assignedCoverUrl = accountCoverUrlMap[accId] || null;

        order.forEach((videoIdx, i) => {
          let dayIndex = 0;
          let hours = 12;
          let minutes = 0;
          let seconds = 0;

          const { burstIndex, withinBurstIndex } = getBurstSlotIndices(
            i,
            stableBurstSizes[accId] || [],
            batchSize,
          );

          let baseTime = "12:00";
          if (isRandomTimeMode) {
            dayIndex = Math.floor(burstIndex / randomCountPerDay);
            const timeIndex = burstIndex % randomCountPerDay;
            baseTime = stableRandomTimes[accId]?.[dayIndex]?.[timeIndex] || "12:00";
          } else {
            dayIndex = Math.floor(burstIndex / sortedTimes.length);
            const timeIndex = burstIndex % sortedTimes.length;
            baseTime = sortedTimes[timeIndex];
          }

          const baseMin = parseTimeToMinutes(baseTime);

          if (isBurstRandomMode) {
            const accountDelays = stableBurstDelays[accId] || [];
            let cumulativeSec = accountDelays[0] || 15;
            for (let k = 1; k <= withinBurstIndex; k++) {
              cumulativeSec += accountDelays[k] || 36;
            }
            const totalSec = baseMin * 60 + cumulativeSec;
            hours = Math.floor(totalSec / 3600) % 24;
            minutes = Math.floor((totalSec % 3600) / 60);
            seconds = totalSec % 60;
          } else {
            const offsetMinutes = withinBurstIndex * slotSpacingMinutes;
            const totalMin = baseMin + offsetMinutes;
            hours = Math.floor(totalMin / 60) % 24;
            minutes = totalMin % 60;
            seconds = 0;
          }

          // Construct date time slot in local time representation with exact seconds
          const scheduledDate = new Date(year, month - 1, day + dayIndex, hours, minutes, seconds, 0);

          // Post distribution logic based on distributionMode
          if (distributionMode === "normal") {
            postsToInsert.push({
              user_id: uid,
              instagram_account_id: accId,
              video_url: uploadedUrls[videoIdx],
              cover_url: assignedCoverUrl,
              caption,
              scheduled_at: scheduledDate.toISOString(),
              status: "pending",
              is_trial: false,
            });
          } else if (distributionMode === "trial_only") {
            postsToInsert.push({
              user_id: uid,
              instagram_account_id: accId,
              video_url: uploadedUrls[videoIdx],
              cover_url: assignedCoverUrl,
              caption,
              scheduled_at: scheduledDate.toISOString(),
              status: "pending",
              is_trial: true,
            });
          } else if (distributionMode === "both") {
            // Post 1: Normal
            postsToInsert.push({
              user_id: uid,
              instagram_account_id: accId,
              video_url: uploadedUrls[videoIdx],
              cover_url: assignedCoverUrl,
              caption,
              scheduled_at: scheduledDate.toISOString(),
              status: "pending",
              is_trial: false,
            });
            // Post 2: Teste (Não-seguidores)
            postsToInsert.push({
              user_id: uid,
              instagram_account_id: accId,
              video_url: uploadedUrls[videoIdx],
              cover_url: assignedCoverUrl,
              caption,
              scheduled_at: scheduledDate.toISOString(),
              status: "pending",
              is_trial: true,
            });
          }
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

  // Count assigned accounts in multi-mode
  const assignedAccountsCount = useMemo(() => {
    const set = new Set<string>();
    coverGroups.forEach((g) => {
      if (g.file) {
        g.accountIds.forEach((id) => set.add(id));
      }
    });
    return set.size;
  }, [coverGroups]);

  return (
    <div className="space-y-8 max-w-6xl pb-16">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
          <Sparkles className="size-8 text-primary" /> Postar em Massa (Reels)
        </h1>
        <p className="text-muted-foreground mt-1">
          Distribua vários vídeos em datas e horários sequenciais para múltiplas contas de uma só
          vez, com suporte a fotos de capa diferenciadas por conta.
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
        <div className="grid gap-8 lg:grid-cols-12">
          {/* Main Configuration Form */}
          <form onSubmit={handleSubmit} className="lg:col-span-7 space-y-6">
            {/* Step 1: Select Accounts */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="text-base font-bold text-foreground">
                  1. Selecionar Contas de Destino
                </Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedAccounts(accounts.map((a) => a.id))}
                    className="text-xs h-7 px-2.5 font-bold"
                  >
                    Marcar Todas ({accounts.length})
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedAccounts([])}
                    className="text-xs h-7 px-2 text-destructive hover:bg-destructive/10"
                  >
                    Desmarcar
                  </Button>
                </div>
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between h-12 bg-card border-border/60 hover:bg-card/80 text-left px-4 rounded-xl shadow-sm"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Instagram className="size-4 text-pink-500 shrink-0" />
                      {selectedAccounts.length === 0 ? (
                        <span className="text-muted-foreground">Nenhuma conta selecionada</span>
                      ) : selectedAccounts.length === 1 ? (
                        <span className="text-foreground font-semibold flex items-center gap-1.5 truncate">
                          {(() => {
                            const acc = accounts.find((a) => a.id === selectedAccounts[0]);
                            return (
                              <>
                                {acc?.account_categories && (
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
                          {selectedAccounts.length} de {accounts.length} contas selecionadas
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
                        className="size-7 hover:bg-destructive/15 text-muted-foreground hover:text-destructive rounded-md shrink-0 cursor-pointer"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Step 3: Cover Configuration (Single or Multi-Account Cover) */}
            <div className="space-y-4 rounded-2xl border border-border/60 bg-card/50 p-5 shadow-card">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
                <div>
                  <Label className="text-base font-bold text-foreground flex items-center gap-2">
                    <ImageIcon className="size-4 text-primary" /> 3. Gerenciamento de Fotos de Capa
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Escolha se deseja uma capa comum ou capas diferentes para cada grupo de contas.
                  </p>
                </div>

                {/* Mode Selector Buttons */}
                <div className="flex items-center p-1 bg-secondary/60 rounded-xl border border-border/40 shrink-0">
                  <button
                    type="button"
                    onClick={() => setCoverMode("single")}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      coverMode === "single"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Capa Única
                  </button>
                  <button
                    type="button"
                    onClick={() => setCoverMode("multi")}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                      coverMode === "multi"
                        ? "bg-gradient-brand text-primary-foreground shadow-glow"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Palette className="size-3.5" /> Capas Diferenciadas
                  </button>
                </div>
              </div>

              {/* MODE 1: SINGLE COVER */}
              {coverMode === "single" ? (
                <div className="space-y-2 animate-in fade-in-50 duration-200">
                  <Label className="text-xs font-semibold text-muted-foreground">
                    Foto de Capa Comum para Todas as Contas (Opcional)
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
                              className="w-12 h-16 object-cover rounded-lg border border-border/80 shadow-sm"
                            />
                          )}
                          <div className="text-left">
                            <span className="font-bold text-xs text-foreground block truncate max-w-[240px]">
                              {coverFile.name}
                            </span>
                            <span className="text-[11px] text-primary underline font-medium mt-0.5 block">
                              Clique para trocar imagem
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold">
                          <Upload className="size-4 text-primary" />
                          <span>Clique para escolher uma foto de capa para todas as contas</span>
                        </div>
                      )}
                    </div>
                  </label>
                </div>
              ) : (
                /* MODE 2: MULTI-COVER BY ACCOUNT GROUP */
                <div className="space-y-4 animate-in fade-in-50 duration-200">
                  <div className="flex items-center justify-between bg-primary/[0.06] border border-primary/20 p-3 rounded-xl">
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-primary" />
                      <span className="text-xs font-bold text-foreground">
                        {assignedAccountsCount} de {selectedAccounts.length} contas com capa configurada
                      </span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddCoverGroup}
                      className="text-xs h-7 font-bold bg-primary text-primary-foreground rounded-lg gap-1 cursor-pointer"
                    >
                      <Plus className="size-3.5" /> Adicionar Outra Capa
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {coverGroups.map((group, gIdx) => {
                      return (
                        <div
                          key={group.id}
                          className="rounded-xl border border-border/60 bg-secondary/15 p-4 space-y-3.5"
                        >
                          {/* Group Header & Title */}
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 flex-1">
                              <span className="size-6 rounded-lg bg-primary/15 text-primary text-xs font-extrabold grid place-items-center shrink-0">
                                {gIdx + 1}
                              </span>
                              <Input
                                value={group.name}
                                onChange={(e) =>
                                  handleCoverGroupNameChange(group.id, e.target.value)
                                }
                                placeholder="Nome da capa (ex: Capa Variante 1)"
                                className="h-8 text-xs font-bold bg-card max-w-[200px]"
                              />
                            </div>

                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleAssignAllToCoverGroup(group.id)}
                                className="text-[11px] h-7 px-2.5 font-semibold cursor-pointer"
                                title="Atribuir todas as contas selecionadas a esta capa"
                              >
                                Todas as Contas
                              </Button>

                              {coverGroups.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveCoverGroup(group.id)}
                                  className="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg cursor-pointer"
                                  title="Excluir este grupo de capa"
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Image Upload for this Group */}
                          <div className="flex items-center gap-3">
                            <label className="block cursor-pointer flex-1">
                              <input
                                type="file"
                                accept="image/png, image/jpeg, image/jpg"
                                className="sr-only"
                                onChange={(e) =>
                                  handleCoverGroupFileChange(
                                    group.id,
                                    e.target.files?.[0] ?? null,
                                  )
                                }
                              />
                              <div className="rounded-xl border border-dashed border-border/80 hover:border-primary/60 transition p-3 text-center bg-card flex items-center justify-center gap-3 min-h-[64px]">
                                {group.file && group.previewUrl ? (
                                  <div className="flex items-center gap-3">
                                    <img
                                      src={group.previewUrl}
                                      alt={group.name}
                                      className="size-10 object-cover rounded-lg border border-border/80"
                                    />
                                    <div className="text-left">
                                      <span className="font-bold text-xs text-foreground block truncate max-w-[200px]">
                                        {group.file.name}
                                      </span>
                                      <span className="text-[10px] text-primary underline font-medium">
                                        Trocar imagem
                                      </span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold">
                                    <Upload className="size-3.5 text-primary" />
                                    <span>Carregar foto de capa para este grupo</span>
                                  </div>
                                )}
                              </div>
                            </label>
                          </div>

                          {/* Account Assignment Chips */}
                          <div className="space-y-1.5 pt-1">
                            <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                              Contas que receberão esta capa ({group.accountIds.length}):
                            </Label>

                            {selectedAccounts.length === 0 ? (
                              <p className="text-xs text-muted-foreground italic">
                                Selecione as contas de destino no Passo 1 primeiro.
                              </p>
                            ) : (
                              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1 bg-background/50 rounded-xl border border-border/30">
                                {selectedAccounts.map((accId) => {
                                  const acc = accounts.find((a) => a.id === accId);
                                  if (!acc) return null;
                                  const isSelected = group.accountIds.includes(accId);

                                  return (
                                    <button
                                      key={accId}
                                      type="button"
                                      onClick={() =>
                                        handleToggleAccountInCoverGroup(group.id, accId)
                                      }
                                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer border ${
                                        isSelected
                                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                          : "bg-secondary/40 text-muted-foreground hover:text-foreground border-border/40 hover:bg-secondary"
                                      }`}
                                    >
                                      {acc.account_categories && (
                                        <span
                                          className="size-2 rounded-full"
                                          style={{
                                            backgroundColor: acc.account_categories.color,
                                          }}
                                        />
                                      )}
                                      @{acc.username}
                                      {isSelected && <Check className="size-3 ml-0.5 stroke-[3]" />}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Caption Input */}
              <div className="space-y-1 pt-2 border-t border-border/40">
                <Label htmlFor="caption" className="text-xs font-bold text-foreground">
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

                {/* Mode Switcher */}
                <div className="flex items-center p-1 bg-secondary/60 rounded-xl border border-border/40">
                  <button
                    type="button"
                    onClick={() => setIsRandomTimeMode(false)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      !isRandomTimeMode
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Horários Fixos
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsRandomTimeMode(true)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      isRandomTimeMode
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Horários Aleatórios
                  </button>
                </div>
              </div>

              {/* Start Date */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="startDate"
                  className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider"
                >
                  Data de Início
                </Label>
                <Input
                  type="date"
                  id="startDate"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-10 bg-card"
                />
              </div>

              {/* Mode Specific Configuration */}
              {!isRandomTimeMode ? (
                <div className="space-y-3">
                  <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                    Horários de Postagem Fixos
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      type="time"
                      value={newTime}
                      onChange={(e) => setNewTime(e.target.value)}
                      className="h-10 w-36 bg-card"
                    />
                    <Button
                      type="button"
                      onClick={handleAddTime}
                      variant="outline"
                      className="h-10 font-bold text-xs"
                    >
                      <Plus className="size-4 mr-1.5" /> Adicionar Horário
                    </Button>
                  </div>

                  {postingTimes.length > 0 ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2 pt-1">
                        {postingTimes.map((time) => (
                          <span
                            key={time}
                            className="inline-flex items-center gap-1.5 bg-primary/10 border border-primary/25 text-primary px-2.5 py-1 rounded-lg text-xs font-bold shadow-sm"
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

              {/* Quantity of videos per time slot (Container / Batch Size) */}
              {/* Quantity of videos per time slot (Container / Batch Size) */}
              <div className="space-y-3 p-4 rounded-xl border border-border/60 bg-secondary/15">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Layers className="size-4 text-primary" /> Quantidade de Vídeos por Horário (Container / Lote)
                    </Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {isRandomBatchSize
                        ? "A quantidade de vídeos por horário será sorteada aleatoriamente dentro da faixa definida."
                        : "Defina quantos vídeos você quer que sejam postados em cada um dos horários configurados."}
                    </p>
                  </div>

                  {/* Switch to enable Random Quantity per Burst */}
                  <div className="flex items-center gap-2 shrink-0 bg-card/60 px-2.5 py-1 rounded-lg border border-border/60">
                    <Label htmlFor="random-burst-switch" className="text-xs font-bold text-muted-foreground cursor-pointer">
                      🎲 Quantidade Aleatória
                    </Label>
                    <Switch
                      id="random-burst-switch"
                      checked={isRandomBatchSize}
                      onCheckedChange={setIsRandomBatchSize}
                    />
                  </div>
                </div>

                {!isRandomBatchSize ? (
                  <>
                    {/* Free custom number input with +/- controls */}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-xs font-semibold text-muted-foreground">Vídeos por horário fixo:</span>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center bg-card border border-border/80 rounded-lg p-0.5 shadow-sm">
                          <button
                            type="button"
                            onClick={() => setBatchSize((prev) => Math.max(1, prev - 1))}
                            className="size-8 rounded-md hover:bg-secondary flex items-center justify-center text-base font-bold text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            -
                          </button>
                          <Input
                            type="number"
                            min={1}
                            max={500}
                            value={batchSize}
                            onChange={(e) => setBatchSize(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-16 h-8 text-center font-extrabold text-sm border-0 bg-transparent focus-visible:ring-0 p-0"
                          />
                          <button
                            type="button"
                            onClick={() => setBatchSize((prev) => prev + 1)}
                            className="size-8 rounded-md hover:bg-secondary flex items-center justify-center text-base font-bold text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                        <span className="text-xs font-semibold text-muted-foreground">vídeos / horário</span>
                      </div>
                    </div>

                    {/* Quick preset buttons */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mr-1">
                        Atalhos:
                      </span>
                      {[1, 2, 3, 4, 5, 10, 20].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setBatchSize(num)}
                          className={`px-2.5 py-1 text-xs rounded-lg font-bold transition-all cursor-pointer border ${
                            batchSize === num
                              ? "bg-primary text-primary-foreground border-primary shadow-sm"
                              : "bg-card text-muted-foreground hover:text-foreground border-border/50 hover:bg-secondary/40"
                          }`}
                        >
                          {num} {num === 1 ? "vídeo" : "vídeos"}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="space-y-3 pt-1">
                    {/* Range Inputs: Min & Max per Burst */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5 bg-card/60 p-2.5 rounded-xl border border-border/50">
                        <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          Mínimo por Rajada
                        </Label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setMinBatchSize((prev) => Math.max(1, prev - 1))}
                            className="size-7 rounded hover:bg-secondary flex items-center justify-center text-sm font-bold cursor-pointer"
                          >
                            -
                          </button>
                          <Input
                            type="number"
                            min={1}
                            max={maxBatchSize}
                            value={minBatchSize}
                            onChange={(e) => {
                              const val = Math.max(1, parseInt(e.target.value) || 1);
                              setMinBatchSize(val);
                              if (val > maxBatchSize) setMaxBatchSize(val);
                            }}
                            className="h-7 text-center font-black text-sm border-border/50 p-0"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const val = minBatchSize + 1;
                              setMinBatchSize(val);
                              if (val > maxBatchSize) setMaxBatchSize(val);
                            }}
                            className="size-7 rounded hover:bg-secondary flex items-center justify-center text-sm font-bold cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5 bg-card/60 p-2.5 rounded-xl border border-border/50">
                        <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          Máximo por Rajada
                        </Label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setMaxBatchSize((prev) => Math.max(minBatchSize, prev - 1))}
                            className="size-7 rounded hover:bg-secondary flex items-center justify-center text-sm font-bold cursor-pointer"
                          >
                            -
                          </button>
                          <Input
                            type="number"
                            min={minBatchSize}
                            max={500}
                            value={maxBatchSize}
                            onChange={(e) => {
                              const val = Math.max(minBatchSize, parseInt(e.target.value) || minBatchSize);
                              setMaxBatchSize(val);
                            }}
                            className="h-7 text-center font-black text-sm border-border/50 p-0"
                          />
                          <button
                            type="button"
                            onClick={() => setMaxBatchSize((prev) => prev + 1)}
                            className="size-7 rounded hover:bg-secondary flex items-center justify-center text-sm font-bold cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Quick Range Presets */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mr-1">
                        Exemplos Virais:
                      </span>
                      {[
                        { label: "10 a 18 (Ex: 13, 17, 14)", min: 10, max: 18 },
                        { label: "5 a 12", min: 5, max: 12 },
                        { label: "12 a 20", min: 12, max: 20 },
                        { label: "3 a 7", min: 3, max: 7 },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => {
                            setMinBatchSize(preset.min);
                            setMaxBatchSize(preset.max);
                          }}
                          className={`px-2 py-0.5 text-[11px] rounded-lg font-bold transition-all cursor-pointer border ${
                            minBatchSize === preset.min && maxBatchSize === preset.max
                              ? "bg-amber-500/15 text-amber-400 border-amber-500/40 shadow-sm"
                              : "bg-card text-muted-foreground hover:text-foreground border-border/50 hover:bg-secondary/40"
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>

                    {/* Dynamic summary of generated bursts */}
                    {selectedAccounts.length > 0 && stableBurstSizes[selectedAccounts[0]] && (
                      <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs text-amber-300/90 leading-relaxed flex items-center gap-2">
                        <Sparkles className="size-4 text-amber-400 shrink-0" />
                        <span>
                          Rajadas sorteadas:{" "}
                          <strong>
                            {stableBurstSizes[selectedAccounts[0]]
                              .map((sz, idx) => `${sz} vídeos (${idx + 1}º horário)`)
                              .join(" → ")}
                          </strong>
                          . (Total: {videoFiles.length} vídeos)
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Viral Burst Random Delay Switch */}
                <div className="pt-3 border-t border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs font-bold text-foreground flex items-center gap-1.5 cursor-pointer">
                        <Sparkles className="size-3.5 text-amber-400" />
                        🔥 Modo Rajada Viral (Intervalos Aleatórios Anti-Spam)
                      </Label>
                      <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        Estratégia Viral
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed max-w-lg">
                      Espaça os vídeos com intervalos imprevisíveis em segundos (+36s, +48s, +19s, +62s...), simulando ação 100% humana para blindar suas contas contra detecção da Meta.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isBurstRandomMode && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setBurstTrigger((p) => p + 1);
                          toast.success("Novos intervalos aleatórios sorteados!");
                        }}
                        className="text-xs h-8 gap-1.5 font-bold cursor-pointer border-amber-500/30 hover:bg-amber-500/10 text-amber-400"
                      >
                        <Shuffle className="size-3 text-amber-400" /> Sortear Novos
                      </Button>
                    )}
                    <Switch
                      checked={isBurstRandomMode}
                      onCheckedChange={setIsBurstRandomMode}
                    />
                  </div>
                </div>

                {/* Spacing option between videos in the same slot (when burst random is OFF) */}
                {batchSize > 1 && !isBurstRandomMode && (
                  <div className="pt-2 border-t border-border/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">
                      Intervalo de segurança regular entre vídeos do mesmo horário:
                    </span>
                    <select
                      value={slotSpacingMinutes}
                      onChange={(e) => setSlotSpacingMinutes(Number(e.target.value))}
                      className="bg-card border border-border/60 rounded-lg px-2.5 py-1 text-xs font-semibold text-foreground cursor-pointer"
                    >
                      <option value={0}>No mesmo instante (0 min)</option>
                      <option value={1}>1 minuto de intervalo</option>
                      <option value={2}>2 minutos de intervalo</option>
                      <option value={5}>5 minutos de intervalo</option>
                      <option value={10}>10 minutos de intervalo</option>
                      <option value={15}>15 minutos de intervalo</option>
                    </select>
                  </div>
                )}

                {/* Dynamic Live Explanation Alert */}
                {videoFiles.length > 0 && (() => {
                  const timesPerDay = isRandomTimeMode ? randomCountPerDay : Math.max(1, postingTimes.length);
                  if (isRandomBatchSize && selectedAccounts.length > 0 && stableBurstSizes[selectedAccounts[0]]) {
                    const burstList = stableBurstSizes[selectedAccounts[0]];
                    const totalBursts = burstList.length;
                    const totalDays = Math.max(1, Math.ceil(totalBursts / timesPerDay));
                    const avgPerDay = Math.round(videoFiles.length / totalDays);
                    return (
                      <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 leading-relaxed flex items-center gap-2">
                        <Info className="size-4 text-amber-400 shrink-0" />
                        <span>
                          Com <strong>{videoFiles.length} vídeos</strong> divididos em <strong>{totalBursts} rajadas aleatórias</strong> (de {minBatchSize} a {maxBatchSize} vídeos) em{" "}
                          <strong>{timesPerDay} {timesPerDay === 1 ? "horário/dia" : "horários/dia"}</strong>: cada conta postará em média{" "}
                          <strong>~{avgPerDay} vídeos por dia</strong>. Todo o lote será concluído em{" "}
                          <strong>
                            {totalDays} {totalDays === 1 ? "dia" : "dias"}
                          </strong>.
                        </span>
                      </div>
                    );
                  }

                  const totalDays = Math.ceil(videoFiles.length / (batchSize * timesPerDay));
                  return (
                    <div className="p-2.5 rounded-lg bg-primary/[0.06] border border-primary/20 text-[11px] text-muted-foreground leading-relaxed flex items-center gap-2">
                      <Info className="size-4 text-primary shrink-0" />
                      <span>
                        Com <strong>{videoFiles.length} vídeos</strong> e <strong>{batchSize} {batchSize === 1 ? "vídeo" : "vídeos"} por horário</strong> em{" "}
                        <strong>{timesPerDay} {timesPerDay === 1 ? "horário/dia" : "horários/dia"}</strong>: cada conta postará{" "}
                        <strong>{batchSize * timesPerDay} vídeos por dia</strong>. Todo o lote será concluído em{" "}
                        <strong>
                          {totalDays} {totalDays === 1 ? "dia" : "dias"}
                        </strong>.
                      </span>
                    </div>
                  );
                })()}
              </div>
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

            {/* Distribution Mode Option (Normal, Trial Only, Both) */}
            <div className="pt-4 border-t border-border/40 space-y-3">
              <div>
                <Label className="text-sm font-bold flex items-center gap-2 text-foreground">
                  <Sparkles className="size-4 text-primary" /> Modo de Distribuição do Reel
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Escolha como os vídeos serão entregues pela Meta para cada conta agendada.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Option 1: Normal Only */}
                <button
                  type="button"
                  onClick={() => setDistributionMode("normal")}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
                    distributionMode === "normal"
                      ? "border-primary bg-primary/10 shadow-sm"
                      : "border-border/60 bg-secondary/15 hover:bg-secondary/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      🎬 Apenas Normal
                    </span>
                    {distributionMode === "normal" && (
                      <CheckCircle2 className="size-4 text-primary shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Postagem tradicional entregue para seus seguidores e aba Reels.
                  </p>
                  <span className="text-[10px] font-mono text-muted-foreground block pt-1">
                    1 post por agendamento
                  </span>
                </button>

                {/* Option 2: Trial Only */}
                <button
                  type="button"
                  onClick={() => setDistributionMode("trial_only")}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
                    distributionMode === "trial_only"
                      ? "border-purple-500 bg-purple-500/10 shadow-sm"
                      : "border-border/60 bg-secondary/15 hover:bg-secondary/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
                      🧪 Apenas Teste
                    </span>
                    {distributionMode === "trial_only" && (
                      <CheckCircle2 className="size-4 text-purple-400 shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Entregue exclusivamente para <strong>não-seguidores</strong> para teste de público.
                  </p>
                  <span className="text-[10px] font-mono text-purple-400/80 block pt-1">
                    1 post por agendamento
                  </span>
                </button>

                {/* Option 3: Normal + Trial */}
                <button
                  type="button"
                  onClick={() => setDistributionMode("both")}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
                    distributionMode === "both"
                      ? "border-emerald-500 bg-emerald-500/10 shadow-sm"
                      : "border-border/60 bg-secondary/15 hover:bg-secondary/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      ⚡ Normal + Teste
                    </span>
                    {distributionMode === "both" && (
                      <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Gera <strong>2 publicações</strong>: o Reel normal no feed + o Reel de teste.
                  </p>
                  <span className="text-[10px] font-mono text-emerald-400/80 block pt-1">
                    2 posts por agendamento
                  </span>
                </button>
              </div>
            </div>

            {/* Clean Metadata Option */}
            <div className="pt-4 border-t border-border/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label className="text-sm font-bold flex items-center gap-1.5 text-foreground">
                  <ShieldCheck className="size-4 text-emerald-400" /> Limpeza de Metadados & Hash Único (Anti-Detecção)
                </Label>
                <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">
                  Remove tags de câmera/edição, renova timestamps do vídeo e gera uma assinatura binária (hash) 100% exclusiva para cada post, dificultando que o Instagram identifique o mesmo vídeo.
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Switch checked={cleanMetadata} onCheckedChange={setCleanMetadata} />
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
                `Agendar ${slots.length * (distributionMode === "both" ? 2 : 1)} Publicações${
                  distributionMode === "trial_only"
                    ? " (Apenas Teste 🧪)"
                    : distributionMode === "both"
                      ? " (Normais + Testes ⚡)"
                      : " (Normais 🎬)"
                }`
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
                  <div className="max-h-[550px] overflow-y-auto pr-1.5 space-y-4">
                    {Object.entries(slotsByDate).map(([date, dateSlots]) => (
                      <div key={date} className="space-y-2">
                        <h4 className="text-xs font-bold text-primary flex items-center gap-1.5 border-b border-border/30 pb-1 mt-3">
                          <CalendarIcon className="size-3.5" /> {date}
                        </h4>
                        <div className="space-y-2 pl-1">
                          {dateSlots.map((slot, index) => (
                            <div key={index} className="space-y-1">
                              {slot.isFirstInBurst && (
                                <div className="pt-2 pb-0.5 flex items-center gap-2">
                                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                                    <Sparkles className="size-3" />
                                    Rajada {(slot.burstIndex || 0) + 1} • {slot.burstSize} {slot.burstSize === 1 ? "vídeo" : "vídeos"}
                                  </span>
                                </div>
                              )}
                              <div className="flex items-center justify-between text-xs py-2.5 px-3 rounded-xl bg-secondary/35 border border-border/25 gap-3 hover:bg-secondary/50 transition-colors">
                                {/* Left: Time, Account & Cover Thumb */}
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="font-extrabold text-foreground text-[11px] font-mono">
                                      {slot.timeStr}
                                    </span>
                                    {slot.burstDelta !== undefined && (
                                      <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/15 border border-amber-500/30 px-1 py-0.5 rounded">
                                        (+{slot.burstDelta}s)
                                      </span>
                                    )}
                                  </div>

                                  {/* Assigned Cover Thumbnail */}
                                  {slot.coverPreviewUrl ? (
                                    <img
                                      src={slot.coverPreviewUrl}
                                      alt="Capa"
                                      className="size-7 rounded-md object-cover ring-1 ring-border/50 shrink-0 shadow-sm"
                                      title={`Capa: ${slot.coverName}`}
                                    />
                                  ) : (
                                    <div
                                      className="size-7 rounded-md bg-secondary/80 grid place-items-center shrink-0 border border-border/40 text-muted-foreground"
                                      title="Miniatura automática do vídeo"
                                    >
                                      <Video className="size-3.5" />
                                    </div>
                                  )}

                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <span
                                        className="font-extrabold truncate"
                                        style={{ color: slot.accountColor }}
                                      >
                                        @{slot.accountUsername}
                                      </span>
                                    </div>
                                    <span
                                      className="truncate text-muted-foreground/80 font-mono text-[10px] block"
                                      title={slot.videoFileName}
                                    >
                                      {slot.videoFileName}
                                    </span>
                                  </div>
                                </div>

                                {/* Right: Cover badge */}
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-background/80 border border-border/40 text-muted-foreground shrink-0 truncate max-w-[100px]">
                                  {slot.coverName}
                                </span>
                              </div>
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
