-- =============================================================================
-- RNI 2.7.0 — Réglage de la journalisation depuis l'écran Administration.
-- rni.log.expires_at : fin de validité des réglages verbeux (niveau, contextes, SQL) ; au-delà,
-- retour automatique aux valeurs par défaut. rni.log.updated_by / updated_at : dernière modification.
-- =============================================================================
INSERT INTO t_param_app (cle_param_app, valeur, description, is_front) VALUES
  ('rni.log.expires_at', '', 'Fin de validité (ISO 8601) des réglages rni.log.level / contexts / sql ; vide = permanent', false),
  ('rni.log.updated_by', '', 'Nigend de la dernière modification des réglages de journalisation', false),
  ('rni.log.updated_at', '', 'Date (ISO 8601) de la dernière modification des réglages de journalisation', false)
ON CONFLICT (cle_param_app) DO NOTHING;
