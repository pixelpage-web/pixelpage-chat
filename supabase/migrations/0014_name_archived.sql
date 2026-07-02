-- Migration 0014: name_manually_set + archived
-- Aplicada via MCP em 2026-07-01; arquivo local para rastreamento
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS name_manually_set boolean NOT NULL DEFAULT false;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_conversations_active
  ON public.conversations (org_id, archived, last_message_at DESC)
  WHERE archived = false;
