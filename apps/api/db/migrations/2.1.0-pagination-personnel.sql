-- =============================================================================
-- RNI 2.1.0 — Pagination de la gestion du personnel : index de recherche.
-- Idempotent : à appliquer sur une base existante (les nouvelles bases l'ont via 01-schema.sql).
--   docker exec -i rni-db psql -U rni -d rni -v ON_ERROR_STOP=1 < apps/api/db/migrations/2.1.0-pagination-personnel.sql
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DROP INDEX IF EXISTS ix_ref_user_region;
CREATE INDEX IF NOT EXISTS ix_ref_user_region ON ref_user (id_region, id_profil) WHERE NOT bool_user_inactif;
DROP INDEX IF EXISTS ix_ref_user_nom;
CREATE INDEX ix_ref_user_nom ON ref_user (nom, prenom, id_user) WHERE NOT bool_user_inactif;
CREATE INDEX IF NOT EXISTS ix_ref_user_unite ON ref_user (code_unite);
CREATE INDEX IF NOT EXISTS ix_ref_user_search ON ref_user
  USING gin ((nigend || ' ' || nom || ' ' || prenom || ' ' || coalesce(code_unite, '')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_rpsi_search ON rpsi_personnel USING gin ((nigend || ' ' || nom || ' ' || prenom) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_unite_libelle ON ref_unite USING gin (libelle gin_trgm_ops);
