-- Tela de Conexões ficava presa em "nenhum número conectado" até F5: o
-- componente nunca escutava mudanças em whatsapp_connections (nem existia
-- listener, nem a tabela estava na publicação supabase_realtime — as duas
-- coisas precisam existir pro Realtime funcionar).
alter publication supabase_realtime add table public.whatsapp_connections;
