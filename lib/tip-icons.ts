import {
  BarChart3,
  Bell,
  Bot,
  CheckCircle2,
  Gift,
  Lightbulb,
  Rocket,
  Smartphone,
  Target,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Ícones disponíveis para dicas (client_tips.emoji guarda a CHAVE, não mais
 * um emoji cru — emoji de fonte do sistema podia renderizar com um "quadro"
 * claro visível em alguns SOs/navegadores; ícone SVG resolve isso de vez).
 */
export const TIP_ICONS: Record<string, LucideIcon> = {
  lightbulb: Lightbulb,
  rocket: Rocket,
  bot: Bot,
  chart: BarChart3,
  check: CheckCircle2,
  bell: Bell,
  target: Target,
  smartphone: Smartphone,
  zap: Zap,
  gift: Gift,
};

export const TIP_ICON_KEYS = Object.keys(TIP_ICONS);

export function getTipIcon(key: string): LucideIcon {
  return TIP_ICONS[key] ?? Lightbulb;
}
