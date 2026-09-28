-- Retour en arrière de migration_004.sql (seulement en cas de problème).
-- Remet l'ancienne règle : tout compte connecté peut lire toutes les données. N'efface aucune donnée.
-- Les tables « partages » et « invitations » sont gardées (inutilisées), pour pouvoir réappliquer la migration.

drop policy if exists "lecture" on profiles;
create policy "lecture" on profiles for select to authenticated using (true);

do $$
declare t text;
begin
  foreach t in array array['plans','workouts','daily_logs','checkins'] loop
    execute format('drop policy if exists "lecture" on %I', t);
    execute format('create policy "lecture" on %I for select to authenticated using (true)', t);
  end loop;
end $$;

drop policy if exists "photos lecture" on storage.objects;
create policy "photos lecture" on storage.objects for select to authenticated using (bucket_id = 'photos');

notify pgrst, 'reload schema';
