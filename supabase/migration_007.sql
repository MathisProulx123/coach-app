-- À coller dans Supabase : SQL Editor > New query > Run.
-- Ajoute la liste des repas cochés « Mangé » dans le journal du jour (onglet Repas) : l'app en déduit elle-même
-- les calories et les protéines mangées.
-- Sans danger : ajoute seulement une colonne ; aucune donnée existante n'est touchée. Peut être exécuté plusieurs fois.

alter table daily_logs add column if not exists eaten jsonb;

notify pgrst, 'reload schema';
