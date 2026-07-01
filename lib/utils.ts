import { clsx, type ClassValue } from "clsx";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";

/** Combina classes condicionalmente (atalho do clsx). */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/** Formata valor em centavos como moeda brasileira. Ex.: 9900 -> "R$ 99,00" */
export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Formata telefone E.164 brasileiro para exibição. Ex.: 5511999998888 -> "+55 (11) 99999-8888" */
export function formatPhone(phone: string): string {
  if (phone.startsWith("lid_")) return "WhatsApp ID";
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    const split = rest.length === 9 ? 5 : 4;
    return `+55 (${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`;
  }
  return phone.startsWith("+") ? phone : `+${digits}`;
}

/** Hora curta para bolhas de mensagem. Ex.: "14:32" */
export function formatMessageTime(date: string | Date): string {
  return format(new Date(date), "HH:mm", { locale: ptBR });
}

/** Data amigável para a lista de conversas: hora se hoje, "Ontem", ou data curta. */
export function formatConversationTime(date: string | Date): string {
  const d = new Date(date);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Ontem";
  return format(d, "dd/MM/yy");
}

/** Tempo relativo em pt-BR. Ex.: "há 5 minutos" */
export function timeAgo(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR });
}

/** Data completa em pt-BR. Ex.: "10 de junho de 2026 às 14:32" */
export function formatFullDate(date: string | Date): string {
  return format(new Date(date), "d 'de' MMMM 'de' yyyy 'às' HH:mm", {
    locale: ptBR,
  });
}

/** Iniciais para avatares. Ex.: "Maria Silva" -> "MS" */
export function initials(name: string | null | undefined): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Slug a partir de um nome. Ex.: "Pizzaria do Zé" -> "pizzaria-do-ze" */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

/** Número compacto pt-BR. Ex.: 12400 -> "12,4 mil" */
export function formatCompact(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}
