-- À coller dans Supabase : SQL Editor > New query > Run.
-- Ajoute ce qu'il faut pour le plan de repas, les préférences alimentaires et les blessures.
-- Sans danger : tes données existantes ne sont pas touchées, et tu peux l'exécuter plusieurs fois.

alter table profiles add column if not exists food_prefs jsonb;
alter table profiles add column if not exists limitations text default '';
alter table plans add column if not exists meal_plan jsonb;

-- Demande à Supabase de reconnaître tout de suite les nouvelles colonnes
notify pgrst, 'reload schema';
