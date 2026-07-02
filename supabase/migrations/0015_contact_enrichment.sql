-- Migration 0015: campos enriquecidos do contato
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS email      text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS avatar_url text;
