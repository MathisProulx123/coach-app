// Réglages de connexion. Laisse les deux premières valeurs vides pour tester en MODE DÉMO
// (les données restent dans ton navigateur). Voir le README pour les remplir.
export const CONFIG = {
  SUPABASE_URL: 'https://gwctaindwgmcjdqxuiae.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_h8bjhQu6gIWs6J5N7m_Mxg_XcubE3-i',  // clé publique : elle peut être visible, c'est normal
  AI_ENABLED: true,       // true = coach IA actif (fonction coach-ai déployée dans Supabase, voir README)
  AI_FUNCTION: 'coach-ai',
  FOOD_SEARCH_FUNCTION: 'quick-function', // nom donné à la fonction food-search dans Supabase (Edge Functions)
};
