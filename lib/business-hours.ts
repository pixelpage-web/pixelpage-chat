import type { Json } from "@/types/database";

export interface BusinessHoursConfig {
  enabled: boolean;
  days: number[];
  open: string; // "09:00"
  close: string; // "18:00"
}

export function parseBusinessHoursConfig(value: Json): BusinessHoursConfig {
  const v = (value ?? {}) as Partial<BusinessHoursConfig>;
  return {
    enabled: v.enabled === true,
    days: Array.isArray(v.days)
      ? v.days.filter((d): d is number => typeof d === "number")
      : [1, 2, 3, 4, 5],
    open: typeof v.open === "string" ? v.open : "09:00",
    close: typeof v.close === "string" ? v.close : "18:00",
  };
}

/**
 * Verifica se "agora" está dentro do horário de funcionamento.
 * Fuso fixo America/Sao_Paulo (clientes BR).
 */
export function isWithinBusinessHours(config: BusinessHoursConfig): boolean {
  if (!config.enabled) return true;

  const formatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = formatter.formatToParts(new Date());
  const weekdayPart = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";

  // Intl pt-BR: dom., seg., ter., qua., qui., sex., sáb.
  const dayMap: Record<string, number> = {
    dom: 0,
    seg: 1,
    ter: 2,
    qua: 3,
    qui: 4,
    sex: 5,
    sáb: 6,
    sab: 6,
  };
  const dayKey = weekdayPart.toLowerCase().replace(".", "").slice(0, 3);
  const day = dayMap[dayKey];
  if (day === undefined || !config.days.includes(day)) return false;

  const nowMinutes = Number(hour) * 60 + Number(minute);
  const [openH, openM] = config.open.split(":").map(Number);
  const [closeH, closeM] = config.close.split(":").map(Number);
  const openMinutes = (openH || 0) * 60 + (openM || 0);
  const closeMinutes = (closeH || 0) * 60 + (closeM || 0);

  return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
}
