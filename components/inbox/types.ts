import type {
  ContactRow,
  ConversationRow,
  MessageRow,
  SenderType,
} from "@/types/database";

/** Filtros da lista de conversas. */
export type InboxFilter = "all" | "open" | "resolved" | "pending" | "mine";

/** Conexão resumida (para o filtro por número e o indicador de modo). */
export interface ConnectionSummary {
  id: string;
  label: string;
  phone_display: string | null;
  mode: string;
}

/** Template rápido do composer ("/") — inclui respostas prontas (org) e templates globais. */
export interface QuickTemplate {
  id: string;
  name: string;
  content: string;
  source?: "canned" | "template";
}

/** Resposta pronta por short_code. */
export interface CannedResponse {
  id: string;
  short_code: string;
  content: string;
}

/** Unidade/filial resumida (para o filtro de dono/admin no inbox). */
export interface UnitSummary {
  id: string;
  name: string;
}

/** Etiqueta colorida de conversa. */
export interface LabelRow {
  id: string;
  title: string;
  color: string;
  description: string | null;
  show_on_sidebar: boolean;
}

/** Prévia da última mensagem exibida na lista de conversas. */
export interface MessagePreview {
  content: string;
  sender_type: SenderType;
  message_type: string;
  created_at: string;
}

export interface TeamMember {
  id: string;
  name: string;
}

export type { ContactRow, ConversationRow, MessageRow };
