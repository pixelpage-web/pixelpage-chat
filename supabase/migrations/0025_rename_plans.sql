-- Renomeia os planos ativos para nomes definitivos (Grátis/Plano 2/Plano 3 → Free/Starter/Pro).
-- Os legados arquivados são renomeados primeiro para evitar colisão com plans.name (unique).
update public.plans set name = 'Trial (legado)' where name = 'Trial';
update public.plans set name = 'Starter (legado)' where name = 'Starter';
update public.plans set name = 'Pro (legado)' where name = 'Pro';
update public.plans set name = 'Business (legado)' where name = 'Business';

update public.plans set name = 'Free' where name = 'Grátis';
update public.plans set name = 'Starter' where name = 'Plano 2';
update public.plans set name = 'Pro' where name = 'Plano 3';
