-- À coller dans Supabase : SQL Editor > New query > Run.
-- Chaque compte ne voit plus que SES données + celles des amis qui les lui partagent.
-- Avant : tout compte connecté pouvait lire les données de tous les comptes (OK à deux, pas avec des clients).
-- Sans danger : aucune donnée n'est modifiée ni effacée ; seules les règles de LECTURE changent.
-- Peut être exécuté plusieurs fois. Pour revenir en arrière : migration_004_retour.sql.

-- 1. Qui voit qui : « owner » partage ses données avec « viewer ».
create table if not exists partages (
  owner uuid not null references auth.users(id) on delete cascade,
  viewer uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner, viewer),
  check (owner <> viewer)
);

-- Codes d'invitation à usage unique (donnés à un ami pour se relier).
create table if not exists invitations (
  code text primary key,
  owner uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 2. Vos 2 comptes actuels restent reliés, comme avant. Ne s'applique que s'il y a au plus 2 profils
--    (donc avant l'ouverture des inscriptions), pour ne jamais relier des inconnus entre eux.
do $$
begin
  if (select count(*) from profiles) <= 2 then
    insert into partages (owner, viewer)
      select a.id, b.id from profiles a cross join profiles b where a.id <> b.id
      on conflict do nothing;
  end if;
end $$;

-- 3. Fonctions d'accès (security definer : lisent « partages » sans dépendre de ses propres règles).
create or replace function peut_voir(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select uid = auth.uid()
      or exists (select 1 from partages where owner = uid and viewer = auth.uid());
$$;

-- Photos : dossier = identifiant du propriétaire. Un ami ne les voit que si « Partager mes photos » est coché.
create or replace function peut_voir_photo(dossier text) returns boolean
language sql stable security definer set search_path = public as $$
  select dossier = auth.uid()::text
      or exists (
        select 1 from partages s join profiles p on p.id = s.owner
        where s.owner::text = dossier and s.viewer = auth.uid() and p.share_photos
      );
$$;

-- Crée un code d'invitation (10 caractères 0-9 A-F, faciles à dicter). Un seul code actif par compte.
create or replace function creer_invitation() returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if auth.uid() is null then raise exception 'Connecte-toi d''abord.'; end if;
  delete from invitations where owner = auth.uid();
  c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into invitations (code, owner) values (c, auth.uid());
  return c;
end $$;

-- Accepte un code : les deux comptes se partagent leurs données (dans les deux sens), puis le code est détruit.
create or replace function accepter_invitation(code_saisi text) returns void
language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  if auth.uid() is null then raise exception 'Connecte-toi d''abord.'; end if;
  select owner into o from invitations where code = upper(trim(code_saisi)) and created_at > now() - interval '7 days';
  if o is null then raise exception 'Code invalide ou expiré.'; end if;
  if o = auth.uid() then raise exception 'C''est ton propre code : donne-le à ton ami.'; end if;
  insert into partages (owner, viewer) values (o, auth.uid()), (auth.uid(), o) on conflict do nothing;
  delete from invitations where code = upper(trim(code_saisi));
end $$;

-- Arrête de partager avec quelqu'un (dans les deux sens).
create or replace function retirer_partage(autre uuid) returns void
language sql security definer set search_path = public as $$
  delete from partages where (owner = auth.uid() and viewer = autre) or (owner = autre and viewer = auth.uid());
$$;

grant execute on function peut_voir(uuid), peut_voir_photo(text), creer_invitation(), accepter_invitation(text), retirer_partage(uuid) to authenticated;

-- 4. Règles de sécurité des nouvelles tables : on voit les partages qui nous concernent ; les changements
--    passent uniquement par les fonctions ci-dessus. Les invitations ne sont jamais lisibles directement.
alter table partages enable row level security;
alter table invitations enable row level security;
drop policy if exists "lecture" on partages;
create policy "lecture" on partages for select to authenticated using (owner = auth.uid() or viewer = auth.uid());

-- 5. Nouvelles règles de lecture (l'écriture ne change pas : chacun n'écrit que ses propres lignes).
drop policy if exists "lecture" on profiles;
create policy "lecture" on profiles for select to authenticated using (peut_voir(id));

do $$
declare t text;
begin
  foreach t in array array['plans','workouts','daily_logs','checkins'] loop
    execute format('drop policy if exists "lecture" on %I', t);
    execute format('create policy "lecture" on %I for select to authenticated using (peut_voir(user_id))', t);
  end loop;
end $$;

drop policy if exists "photos lecture" on storage.objects;
create policy "photos lecture" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and peut_voir_photo((storage.foldername(name))[1]));

notify pgrst, 'reload schema';
