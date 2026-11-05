-- =============================================================================
-- RNI — Paramétrage applicatif (t_param_app)
-- Valeurs de développement : les services externes sont simulés (RNI_MOCK_EXTERNAL=true).
-- Pour la préproduction / production, voir db/env/param-app.template.sql.
-- =============================================================================
SET client_encoding = 'UTF8';

INSERT INTO t_param_app (cle_param_app, valeur, description, is_front) VALUES
  ('rni.geoloc.hostname',                  'https://geoloc.mock.local', 'URL du service GEOLOC (back)', false),
  ('rni.geoloc.path',                      'localisation',              'Chemin de localisation GEOLOC', false),
  ('rni.geoloc.token',                     'dev-token',                 'Jeton GEOLOC (en-tête Token)', false),
  ('rni.remop.hostname',                   'https://remop.mock.local',  'URL du service REMOP (back)', false),
  ('rni.remop.path',                       '/neo',                      'Chemin des lignes NEO', false),
  ('rni.remop.token',                      'dev-token',                 'Jeton REMOP (en-tête Token)', false),
  ('rni.facade.hostname.back',             'https://facade.mock.local', 'URL Facade SIG appelée par l''API', false),
  ('rni.facade.hostname.front',            'https://facade.mock.local', 'URL Facade SIG appelée par le navigateur (tuiles)', true),
  ('rni.facade.token',                     'dev-token',                 'Jeton Facade (paramètre d''URL)', false),
  ('rni.facade.proxy',                     '',                          'Proxy HTTP(S) sortant vers la Facade (vide = aucun)', false),
  ('rni.facade.path.carto',                '/carto/baselayers',         'Liste des fonds cartographiques', false),
  ('rni.facade.path.geocodeur',            '/geocodeur/findAddressCandidates', 'Géocodeur d''adresses', false),
  ('rni.facade.path.isochrone',            '/routage/isochrone',        'Calcul d''isochrones', false),
  ('rni.facade.param.isochrone.timebreaks','30,60,90',                  'Rayons des isochrones (minutes)', true),
  ('rni.permanence.gign',                  '+33 6 12 12 12 12',         'Numéro de la permanence GIGN affiché dans l''en-tête', true),
  ('rni.matomo.url',                       '',                          'URL Matomo (vide = désactivé)', true),
  ('rni.matomo.site_id',                   '',                          'Identifiant de site Matomo', true),
  ('rni.mentions_legales.url',             'mentions-legales.pdf', 'Mentions légales (PDF)', true),
  ('rni.planning.jours_glissants',         '30',                        'Planning figé au-delà de N jours passés (fenêtre glissante). Vide = premier jour du mois précédent', true),
  ('rni.log.level',                        '',                          'Niveau de journalisation de l''API : error, warn, log, debug, verbose (vide = variable LOG_LEVEL)', false),
  ('rni.log.contexts',                     '',                          'Niveaux par contexte, ex. PlanningService=debug,HTTP=warn,SQL=debug (vide = aucun)', false),
  ('rni.log.sql',                          'false',                     'Journaliser chaque requête SQL (niveau debug, contexte SQL) : true / false', false),
  ('rni.log.slow_ms',                      '1000',                      'Seuil (ms) au-delà duquel une requête HTTP ou SQL est signalée comme lente (warn)', false),
  ('rni.log.db_level',                     'log',                       'Niveau à partir duquel les journaux sont conservés en base (tableau de bord) : error, warn, log, debug', false),
  ('rni.log.retention_days',               '14',                        'Durée de conservation du journal applicatif en base (jours)', false),
  ('rni.metrics.retention_days',           '30',                        'Durée de conservation des métriques de requêtes (jours)', false),
  ('rni.dashboard.active_minutes',         '5',                         'Fenêtre (minutes) au-delà de laquelle un utilisateur n''est plus compté comme connecté', false),
  ('rni.log.expires_at',                   '',                          'Fin de validité (ISO 8601) des réglages rni.log.level / contexts / sql ; vide = permanent', false),
  ('rni.log.updated_by',                   '',                          'Nigend de la dernière modification des réglages de journalisation', false),
  ('rni.log.updated_at',                   '',                          'Date (ISO 8601) de la dernière modification des réglages de journalisation', false),
  ('rni.splunk.retention_days',            '30',                        'Conservation (jours) des lignes d''audit Splunk en base, après export Talend', false);
