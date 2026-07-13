-- Policies do bucket "logos" eram amplas demais (qualquer usuário autenticado
-- podia subir/atualizar arquivo em qualquer caminho, sem escopo por org).
-- Restringe por org_id no 1º segmento do caminho: {org_id}/logo.{ext}

drop policy if exists "logos: upload autenticado" on storage.objects;
drop policy if exists "logos: atualização autenticada" on storage.objects;

create policy "logos: upload por org" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles
      where id = auth.uid() limit 1
    )
  );

create policy "logos: atualização por org" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles
      where id = auth.uid() limit 1
    )
  );

create policy "logos: delete por org" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles
      where id = auth.uid() limit 1
    )
  );
