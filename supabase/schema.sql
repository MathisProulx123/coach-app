-- À coller dans Supabase : SQL Editor > New query > Run.
-- Crée les tables, les règles de sécurité et le stockage privé des photos.
-- Règle d'accès : tout utilisateur connecté peut LIRE les données (toi et ton ami),
-- mais chacun ne peut ÉCRIRE que les siennes. Désactive les inscriptions publiques une fois vos 2 comptes créés (voir README).

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  sex text not null,
  birth_year int not null,
  height_cm numeric not null,
  start_weight numeric not null,
  goal text not null,
  days_per_week int not null,
  equipment text not null,
  activity text not null default 'medium',
  share_photos boolean not null default true,
  food_prefs jsonb,
  limitations text default '',
  created_at timestamptz not null default now()
);

create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  calories int not null,
  protein int not null,
  carbs int not null,
  fat int not null,
  program jsonb not null,
  deload boolean not null default false,
  hold boolean not null default false,
  reasons jsonb not null default '[]',
  meal_plan jsonb
);

create table if not exists workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  date date not null,
  day_label text not null,
  exercises jsonb not null,
  unique (user_id, date, day_label)
);

create table if not exists daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  date date not null,
  weight numeric,
  calories int,
  protein int,
  unique (user_id, date)
);

create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  week_start date not null,
  weight numeric not null,
  waist numeric,
  sleep int, energy int, soreness int, stress int,
  adherence_training int, adherence_nutrition int,
  notes text default '',
  photos jsonb not null default '{}',
  coach jsonb not null default '{}',
  unique (user_id, week_start)
);

-- Sécurité (RLS)
do $$
declare t text;
begin
  foreach t in array array['profiles','plans','workouts','daily_logs','checkins'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "lecture" on %I', t);
    execute format('create policy "lecture" on %I for select to authenticated using (true)', t);
  end loop;
end $$;

-- Écriture : uniquement ses propres lignes
drop policy if exists "ecriture" on profiles;
create policy "ecriture" on profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['plans','workouts','daily_logs','checkins'] loop
    execute format('drop policy if exists "ecriture" on %I', t);
    execute format('create policy "ecriture" on %I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- Photos : bucket privé, lisible par les 2 comptes, écriture dans son propre dossier
insert into storage.buckets (id, name, public) values ('photos', 'photos', false) on conflict (id) do nothing;

drop policy if exists "photos lecture" on storage.objects;
create policy "photos lecture" on storage.objects for select to authenticated using (bucket_id = 'photos');

drop policy if exists "photos ecriture" on storage.objects;
create policy "photos ecriture" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "photos maj" on storage.objects;
create policy "photos maj" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "photos suppression" on storage.objects;
create policy "photos suppression" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
