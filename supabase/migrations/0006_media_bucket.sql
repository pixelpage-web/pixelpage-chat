-- Bucket público para anexos do inbox (imagens/documentos enviados)
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

create policy "media: leitura pública" on storage.objects
  for select using (bucket_id = 'media');
create policy "media: upload autenticado" on storage.objects
  for insert with check (bucket_id = 'media' and auth.uid() is not null);
