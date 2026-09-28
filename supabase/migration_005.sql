-- À coller dans Supabase : SQL Editor > New query > Run.
-- Compte les messages envoyés au coach IA, par personne et par jour, pour appliquer une limite quotidienne
-- (protège le quota Gemini et la facture quand il y aura beaucoup d'utilisateurs).
-- Sans danger : ajoute seulement une table et une fonction ; aucune donnée existante n'est touchée.
-- Peut être exécuté plusieurs fois. Tant qu'il n'est pas appliqué, la fonction coach-ai marche sans limite.

create table if not exists ia_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  count int not null default 0,
  primary key (user_id, day)
);

-- Aucune règle de lecture/écriture : seule la fonction coach-ai (clé service_role) y a accès.
alter table ia_usage enable row level security;

-- Ajoute 1 au compteur du jour et renvoie le total (en une seule opération, même si deux messages arrivent en même temps).
create or replace function ia_compter(uid uuid) returns int
language sql security definer set search_path = public as $$
  insert into ia_usage (user_id, day, count) values (uid, current_date, 1)
  on conflict (user_id, day) do update set count = ia_usage.count + 1
  returning count;
$$;

-- Par défaut, toute fonction est appelable par tout le monde : on réserve celle-ci au serveur.
revoke execute on function ia_compter(uuid) from public, anon, authenticated;
grant execute on function ia_compter(uuid) to service_role;

notify pgrst, 'reload schema';
