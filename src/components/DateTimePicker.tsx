import * as React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon, Clock } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DateTimePickerProps {
  value: string; // YYYY-MM-DDTHH:mm
  onChange: (value: string) => void;
  min?: string;
  className?: string;
}

export function DateTimePicker({ value, onChange, min, className }: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);

  // Parse current value
  const parsedDate = React.useMemo(() => {
    if (!value) return new Date();
    try {
      return new Date(value);
    } catch {
      return new Date();
    }
  }, [value]);

  const [datePart, timePart] = value.split("T");
  const [hoursStr, minutesStr] = timePart ? timePart.split(":") : ["12", "00"];

  const handleDateSelect = (newDate: Date | undefined) => {
    if (!newDate) return;
    const offset = newDate.getTimezoneOffset() * 60000;
    const localDateStr = new Date(newDate.getTime() - offset).toISOString().split("T")[0];
    onChange(`${localDateStr}T${hoursStr}:${minutesStr}`);
  };

  const handleTimeChange = (type: "hour" | "minute", val: string) => {
    const dPart = datePart || new Date().toISOString().split("T")[0];
    if (type === "hour") {
      onChange(`${dPart}T${val}:${minutesStr}`);
    } else {
      onChange(`${dPart}T${hoursStr}:${val}`);
    }
  };

  // Generate hours and minutes arrays
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

  // Format label for display
  const displayLabel = React.useMemo(() => {
    if (!value) return "Selecione data e hora";
    try {
      const d = new Date(value);
      return format(d, "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return value;
    }
  }, [value]);

  // Scroll active elements into view on open
  const hoursRef = React.useRef<HTMLDivElement>(null);
  const minutesRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (open) {
      setTimeout(() => {
        const activeHour = hoursRef.current?.querySelector("[data-active=true]");
        if (activeHour) {
          activeHour.scrollIntoView({ block: "center", behavior: "auto" });
        }
        const activeMinute = minutesRef.current?.querySelector("[data-active=true]");
        if (activeMinute) {
          activeMinute.scrollIntoView({ block: "center", behavior: "auto" });
        }
      }, 50);
    }
  }, [open, hoursStr, minutesStr]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          type="button"
          className={cn(
            "w-full justify-between border-border/60 bg-secondary/45 hover:bg-secondary/60 rounded-xl text-left font-medium h-10 px-3.5 text-xs text-foreground transition-colors flex items-center",
            className,
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <CalendarIcon className="size-4 text-muted-foreground shrink-0" />
            <span className="truncate">{displayLabel}</span>
          </span>
          <Clock className="size-4 text-muted-foreground opacity-60 shrink-0 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-4 flex flex-col md:flex-row gap-4 bg-popover/95 border border-border/60 shadow-xl rounded-2xl z-[100] backdrop-blur-md"
      >
        {/* Calendar Side */}
        <div className="border-r border-border/40 pr-2">
          <Calendar
            mode="single"
            selected={parsedDate}
            onSelect={handleDateSelect}
            initialFocus
            className="p-0 pointer-events-auto bg-transparent border-0"
          />
        </div>

        {/* Time Picker Side */}
        <div className="flex flex-col gap-2 min-w-[120px]">
          <div className="text-xs font-bold text-muted-foreground flex items-center gap-1 pb-1 border-b border-border/40 pl-1">
            <Clock className="size-3" />
            <span>Horário</span>
          </div>
          <div className="flex gap-2 h-[260px]">
            {/* Hours list */}
            <div
              ref={hoursRef}
              className="flex-1 overflow-y-auto space-y-1 scrollbar-none pr-1 h-full max-h-[260px]"
            >
              {hours.map((h) => {
                const isActive = h === hoursStr;
                return (
                  <button
                    key={h}
                    type="button"
                    data-active={isActive}
                    onClick={() => handleTimeChange("hour", h)}
                    className={cn(
                      "w-full text-center py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-colors block",
                      isActive
                        ? "bg-primary text-primary-foreground font-extrabold shadow-sm"
                        : "hover:bg-secondary text-foreground/80 hover:text-foreground",
                    )}
                  >
                    {h}h
                  </button>
                );
              })}
            </div>

            {/* Minutes list */}
            <div
              ref={minutesRef}
              className="flex-1 overflow-y-auto space-y-1 scrollbar-none pr-1 h-full max-h-[260px]"
            >
              {minutes.map((m) => {
                const isActive = m === minutesStr;
                return (
                  <button
                    key={m}
                    type="button"
                    data-active={isActive}
                    onClick={() => handleTimeChange("minute", m)}
                    className={cn(
                      "w-full text-center py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-colors block",
                      isActive
                        ? "bg-primary text-primary-foreground font-extrabold shadow-sm"
                        : "hover:bg-secondary text-foreground/80 hover:text-foreground",
                    )}
                  >
                    {m}m
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
