-- =============================================================================
-- RNI 2.6.0 — Supervision : journal applicatif, métriques des requêtes, activité des utilisateurs.
-- Alimentées par chaque processus de l'API (écriture par lots), lues par le tableau de bord
-- d'administration. Purge automatique selon rni.log.retention_days / rni.metrics.retention_days.
-- =============================================================================

-- Journal applicatif (à partir du niveau rni.log.db_level)
CREATE TABLE IF NOT EXISTS t_app_logs (
  id_log      bigserial    PRIMARY KEY,
  horodatage  timestamptz  NOT NULL DEFAULT now(),
  niveau      varchar(8)   NOT NULL,
  contexte    varchar(80),
  message     text         NOT NULL,
  pile        text,
  request_id  varchar(128),
  nigend      varchar(8),
  pid         integer,
  hote        varchar(128)
);
CREATE INDEX IF NOT EXISTS ix_app_logs_horodatage ON t_app_logs (horodatage DESC);
CREATE INDEX IF NOT EXISTS ix_app_logs_niveau ON t_app_logs (niveau, horodatage DESC);
CREATE INDEX IF NOT EXISTS ix_app_logs_request ON t_app_logs (request_id) WHERE request_id IS NOT NULL;

-- Métriques HTTP agrégées par minute, route (motif) et méthode
CREATE TABLE IF NOT EXISTS t_request_metrics (
  minute           timestamptz  NOT NULL,
  route            varchar(256) NOT NULL,
  methode          varchar(8)   NOT NULL,
  nb               integer      NOT NULL DEFAULT 0,
  nb_4xx           integer      NOT NULL DEFAULT 0,
  nb_5xx           integer      NOT NULL DEFAULT 0,
  nb_lentes        integer      NOT NULL DEFAULT 0,
  duree_totale_ms  bigint       NOT NULL DEFAULT 0,
  duree_max_ms     integer      NOT NULL DEFAULT 0,
  -- Répartition des durées (percentiles approchés) : < 100, < 300, < 1000, < 3000 ms (le reste au-delà)
  nb_lt100         integer      NOT NULL DEFAULT 0,
  nb_lt300         integer      NOT NULL DEFAULT 0,
  nb_lt1000        integer      NOT NULL DEFAULT 0,
  nb_lt3000        integer      NOT NULL DEFAULT 0,
  PRIMARY KEY (minute, route, methode)
);
CREATE INDEX IF NOT EXISTS ix_request_metrics_minute ON t_request_metrics (minute);

-- Dernière activité de chaque utilisateur (« connectés » = activité récente : pas de session, SSO)
CREATE TABLE IF NOT EXISTS t_user_activity (
  nigend             varchar(8)   PRIMARY KEY,
  derniere_activite  timestamptz  NOT NULL,
  derniere_route     varchar(256),
  jour               date         NOT NULL,
  nb_requetes_jour   integer      NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_user_activity_derniere ON t_user_activity (derniere_activite DESC);

INSERT INTO t_param_app (cle_param_app, valeur, description, is_front) VALUES
  ('rni.log.db_level',          'log', 'Niveau à partir duquel les journaux sont conservés en base (tableau de bord) : error, warn, log, debug', false),
  ('rni.log.retention_days',    '14',  'Durée de conservation du journal applicatif en base (jours)', false),
  ('rni.metrics.retention_days','30',  'Durée de conservation des métriques de requêtes (jours)', false),
  ('rni.dashboard.active_minutes','5', 'Fenêtre (minutes) au-delà de laquelle un utilisateur n''est plus compté comme connecté', false)
ON CONFLICT (cle_param_app) DO NOTHING;
