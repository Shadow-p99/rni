-- =============================================================================
-- RNI 2.3.0 — Planning figé selon un nombre de jours glissants (BR-PLA-3).
-- Idempotent : à appliquer sur une base existante (les nouvelles bases l'ont via init/).
--   pnpm db:migrate
-- Les dates antérieures à « aujourd'hui − N jours » ne peuvent plus être créées, modifiées ni
-- supprimées. Modifier la valeur (pris en compte sous 60 s, sans redémarrage) :
--   UPDATE t_param_app SET valeur = '15' WHERE cle_param_app = 'rni.planning.jours_glissants';
-- Valeur vide : règle historique (premier jour du mois précédent).
-- =============================================================================
INSERT INTO t_param_app (cle_param_app, valeur, description, is_front) VALUES
  ('rni.planning.jours_glissants', '30',
   'Planning figé au-delà de N jours passés (fenêtre glissante). Vide = premier jour du mois précédent', true)
ON CONFLICT (cle_param_app) DO NOTHING;

UPDATE t_admin_messages SET libelle = 'Insertion impossible : plage identique à l''initiale, position inchangée ou date figée du planning.'
WHERE code_message = 'RNI-1007';
