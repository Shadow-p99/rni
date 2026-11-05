-- =============================================================================
-- RNI 2.11.0 — Consultation de l'audit des requêtes (Administration › Audit des requêtes).
-- Index des recherches usuelles : par utilisateur, par identifiant de corrélation, refus / erreurs.
-- Lignes parcourues du plus récent au plus ancien (id_log décroissant).
-- =============================================================================
CREATE INDEX IF NOT EXISTS ix_log_splunk_rio_user ON t_admin_log_splunk (rio_user, id_log DESC);
CREATE INDEX IF NOT EXISTS ix_log_splunk_request_id ON t_admin_log_splunk (request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_log_splunk_echecs ON t_admin_log_splunk (statut, id_log DESC) WHERE statut >= 400;
