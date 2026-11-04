-- =============================================================================
-- RNI 2.4.0 — Invalidation du cache applicatif partagée (cluster, plusieurs instances).
-- Toute écriture sur une table mise en cache — par l'API, un import RPSI ou un script SQL —
-- émet, à la validation de la transaction, une notification `rni_cache` portant les familles
-- de données concernées. Chaque processus de l'API écoute (LISTEN) et invalide son cache.
-- Déclencheurs « par instruction » : une notification par requête, pas par ligne.
-- =============================================================================
CREATE OR REPLACE FUNCTION rni_cache_notify() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('rni_cache', json_build_object('tags', TG_ARGV)::text);
  RETURN NULL;
END;
$$;

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('planning',                'planning'),
      ('ref_user',                'users,planning'),
      ('ref_unite',               'users,planning'),
      ('t_param_app',             'param'),
      ('t_perimetre_profil',      'param,users'),
      ('ref_pos_service',         'referentiel,planning'),
      ('ref_creneaux',            'referentiel'),
      ('ref_profil',              'referentiel,users'),
      ('t_profil_classement',     'referentiel,users'),
      ('ref_grade_personnel',     'referentiel,users'),
      ('lien_departement_region', 'referentiel,users,planning'),
      ('ref_regions',             'referentiel,planning'),
      ('t_region_center',         'referentiel'),
      ('ref_nrb_region_r22',      'referentiel,users')
    ) AS v(tbl, tags)
  LOOP
    IF to_regclass(t.tbl) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_rni_cache_notify ON %I', t.tbl);
      EXECUTE format(
        'CREATE TRIGGER trg_rni_cache_notify AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON %I
           FOR EACH STATEMENT EXECUTE FUNCTION rni_cache_notify(%s)',
        t.tbl, (SELECT string_agg(quote_literal(x), ', ') FROM unnest(string_to_array(t.tags, ',')) x));
    END IF;
  END LOOP;
END;
$$;
