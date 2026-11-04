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
  ('rni.mentions_legales.url',             'mentions-legales.pdf', 'Mentions légales (PDF)', true);
