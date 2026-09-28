-- À coller dans Supabase : SQL Editor > New query > Run.
-- Permet à une personne de supprimer SON compte depuis l'app (Réglages > Mes données), comme l'exige la loi
-- (Loi 25 au Québec). Supprimer le compte efface aussi, automatiquement, son profil, ses plans, séances,
-- journaux, check-ins, partages, invitations et compteur IA (« on delete cascade »). L'app efface ses photos juste avant.
-- Sans danger : ajoute seulement une fonction ; aucune donnée existante n'est touchée. Peut être exécuté plusieurs fois.

create or replace function supprimer_mon_compte() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Connecte-toi d''abord.'; end if;
  delete from auth.users where id = auth.uid(); -- seulement la personne connectée, jamais quelqu'un d'autre
end $$;

revoke execute on function supprimer_mon_compte() from public, anon;
grant execute on function supprimer_mon_compte() to authenticated;

notify pgrst, 'reload schema';
