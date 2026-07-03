alter table public.whatsapp_connections
  drop constraint if exists whatsapp_connections_status_check;

alter table public.whatsapp_connections
  add constraint whatsapp_connections_status_check
  check (status in ('pending', 'connected', 'disconnected', 'error'));

alter table public.whatsapp_connections
  add column if not exists error_detail text;
