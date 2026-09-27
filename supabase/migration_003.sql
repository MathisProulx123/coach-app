-- À coller dans Supabase : SQL Editor > New query > Run.
-- Ajoute la case « jour d'entraînement / jour de repos » du journal quotidien (cycle glucidique).
-- Sans danger : n'efface aucune donnée existante, et peut être exécuté plusieurs fois.

alter table daily_logs add column if not exists day_type text;

notify pgrst, 'reload schema';
