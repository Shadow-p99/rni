-- =============================================================================
-- RNI 2.9.0 — Audit Splunk (BR-SEC-1) : table t_admin_log_splunk enrichie et vue d'export Talend.
-- Les colonnes historiques sont inchangées ; ajout de la corrélation, de la durée et du contexte.
-- Extraction Talend : cf. docs/SPLUNK-TALEND.md (filigrane sur id_log, délai de sécurité).
-- =============================================================================
ALTER TABLE t_admin_log_splunk
  ADD COLUMN IF NOT EXISTS authentifie     boolean,
  ADD COLUMN IF NOT EXISTS duree_ms        integer,
  ADD COLUMN IF NOT EXISTS taille_reponse  integer,
  ADD COLUMN IF NOT EXISTS request_id      varchar(128),
  ADD COLUMN IF NOT EXISTS user_agent      varchar(256),
  ADD COLUMN IF NOT EXISTS hote            varchar(128),
  ADD COLUMN IF NOT EXISTS pid             integer;

-- Vue lue par le job Talend : horodatage ISO 8601 UTC, champs prêts pour Splunk
CREATE OR REPLACE VIEW v_log_splunk_export AS
SELECT id_log,
       to_char(horodatage AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS horodatage,
       institution,
       ip,
       methode,
       route,
       statut,
       authentifie,
       rio_user,
       code_unite,
       role,
       duree_ms,
       taille_reponse,
       request_id,
       user_agent,
       hote,
       pid
  FROM t_admin_log_splunk;

INSERT INTO t_param_app (cle_param_app, valeur, description, is_front) VALUES
  ('rni.splunk.retention_days', '30', 'Conservation (jours) des lignes d''audit Splunk en base, après export Talend', false)
ON CONFLICT (cle_param_app) DO NOTHING;
