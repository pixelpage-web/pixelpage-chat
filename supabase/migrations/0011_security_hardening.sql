-- ==============================================================================
-- PIXELPAGE CHAT — Endurecimento de segurança (security advisors)
-- Corrige vetores de abuso entre organizações e exposição desnecessária na
-- API REST. Não altera o comportamento legítimo do app.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) increment_ai_usage: SECURITY DEFINER que incrementa o uso de IA de QUALQUER
--    org_id passado. Era chamável por qualquer usuário logado via /rest/v1/rpc,
--    permitindo inflar o consumo (quota) de outra organização. Passa a ser
--    executável apenas pelo servidor (service_role) — que é quem o chama no
--    pipeline do bot.
-- ------------------------------------------------------------------------------
revoke execute on function public.increment_ai_usage(uuid) from public, anon, authenticated;
grant execute on function public.increment_ai_usage(uuid) to service_role;

-- ------------------------------------------------------------------------------
-- 2) Funções de gatilho/manutenção não devem ser chamáveis diretamente pela API
--    REST. Os triggers continuam funcionando normalmente (disparam pela tabela).
-- ------------------------------------------------------------------------------
revoke execute on function public.on_message_inserted() from public, anon, authenticated;
revoke execute on function public.on_conversation_resolved() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3) Buckets públicos (logos, media): a política ampla de SELECT em
--    storage.objects permite LISTAR/enumerar todos os arquivos de todas as
--    organizações. O acesso por URL pública (/object/public/...) NÃO depende
--    dessa política, então removê-la mantém a exibição de imagens funcionando e
--    elimina a enumeração entre tenants.
-- ------------------------------------------------------------------------------
drop policy if exists "logos: leitura pública" on storage.objects;
drop policy if exists "media: leitura pública" on storage.objects;

-- Observações (não corrigíveis por SQL — fazer no painel do Supabase):
--   • Authentication > Policies: habilitar "Leaked password protection"
--     (checa senhas vazadas no HaveIBeenPwned).
--   • scheduled_jobs tem RLS sem policies DE PROPÓSITO (acesso só via
--     service_role) — o aviso "RLS enabled no policy" é esperado e seguro.
