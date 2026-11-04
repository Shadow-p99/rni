-- =============================================================================
-- RNI — Paramétrage préproduction / production (modèle)
-- Remplacer les valeurs <...> puis exécuter : psql -f param-app.template.sql
-- =============================================================================
UPDATE t_param_app SET valeur = '<https://geoloc.xxx.gendarmerie.fr>' WHERE cle_param_app = 'rni.geoloc.hostname';
UPDATE t_param_app SET valeur = '<jeton>'                             WHERE cle_param_app = 'rni.geoloc.token';
UPDATE t_param_app SET valeur = '<https://remop.xxx.gendarmerie.fr>'  WHERE cle_param_app = 'rni.remop.hostname';
UPDATE t_param_app SET valeur = '<jeton>'                             WHERE cle_param_app = 'rni.remop.token';
UPDATE t_param_app SET valeur = '<https://facade.xxx.psi.minint.fr>'  WHERE cle_param_app = 'rni.facade.hostname.back';
UPDATE t_param_app SET valeur = '<https://facade.xxx.psi.minint.fr>'  WHERE cle_param_app = 'rni.facade.hostname.front';
UPDATE t_param_app SET valeur = '<jeton>'                             WHERE cle_param_app = 'rni.facade.token';
UPDATE t_param_app SET valeur = '<http://10.227.8.46:3128>'           WHERE cle_param_app = 'rni.facade.proxy';
UPDATE t_param_app SET valeur = '<+33 X XX XX XX XX>'                 WHERE cle_param_app = 'rni.permanence.gign';
UPDATE t_param_app SET valeur = '<https://matomo.xxx/>'               WHERE cle_param_app = 'rni.matomo.url';
UPDATE t_param_app SET valeur = '<id>'                                WHERE cle_param_app = 'rni.matomo.site_id';
