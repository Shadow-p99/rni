-- =============================================================================
-- RNI 2.5.0 — Niveau de journalisation de l'API piloté par la base.
-- Pris en compte à chaud par tous les processus (notification PostgreSQL, ≤ 60 s sinon).
-- Exemples :
--   UPDATE t_param_app SET valeur = 'debug' WHERE cle_param_app = 'rni.log.level';
--   UPDATE t_param_app SET valeur = 'PlanningService=debug,HTTP=warn' WHERE cle_param_app = 'rni.log.contexts';
--   UPDATE t_param_app SET valeur = 'true' WHERE cle_param_app = 'rni.log.sql';
-- =============================================================================
INSERT INTO t_param_app (cle_param_app, valeur, description, is_front) VALUES
  ('rni.log.level',    '',     'Niveau de journalisation de l''API : error, warn, log, debug, verbose (vide = variable LOG_LEVEL)', false),
  ('rni.log.contexts', '',     'Niveaux par contexte, ex. PlanningService=debug,HTTP=warn,SQL=debug (vide = aucun)', false),
  ('rni.log.sql',      'false','Journaliser chaque requête SQL (niveau debug, contexte SQL) : true / false', false),
  ('rni.log.slow_ms',  '1000', 'Seuil (ms) au-delà duquel une requête HTTP ou SQL est signalée comme lente (warn)', false)
ON CONFLICT (cle_param_app) DO NOTHING;
