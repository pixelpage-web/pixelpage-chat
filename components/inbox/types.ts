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

/** Template rápido do composer ("/"). */
export interface QuickTemplate {
  id: string;
  name: string;
  content: string;
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
