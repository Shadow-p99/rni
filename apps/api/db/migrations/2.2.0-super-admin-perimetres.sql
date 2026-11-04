-- =============================================================================
-- RNI 2.2.0 — Profil super administrateur et périmètres de visualisation paramétrables.
-- Idempotent : à appliquer sur une base existante (les nouvelles bases l'ont via init/).
--   pnpm db:migrate
-- Le premier super administrateur s'attribue ensuite en base, par exemple :
--   UPDATE ref_user SET id_profil = 8 WHERE nigend = '<nigend>';
-- =============================================================================
INSERT INTO ref_profil (id_profil, code, libelle) VALUES (8, 'SA', 'Super administrateur')
ON CONFLICT (id_profil) DO NOTHING;
INSERT INTO t_profil_classement (id_profil, classement) VALUES (8, 0)
ON CONFLICT (id_profil) DO NOTHING;

CREATE TABLE IF NOT EXISTS t_perimetre_profil (
  id_profil   integer     NOT NULL REFERENCES ref_profil (id_profil),
  module      varchar(16) NOT NULL CHECK (module IN ('carte', 'planning')),
  perimetre   varchar(16) NOT NULL CHECK (perimetre IN ('national', 'region_voisines', 'region')),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  varchar(8),
  PRIMARY KEY (id_profil, module)
);

-- Valeurs initiales (n'écrase pas un paramétrage existant)
INSERT INTO t_perimetre_profil (id_profil, module, perimetre) VALUES
  (8, 'carte', 'national'),        (8, 'planning', 'national'),
  (1, 'carte', 'national'),        (1, 'planning', 'national'),
  (2, 'carte', 'national'),        (2, 'planning', 'region'),
  (3, 'carte', 'region_voisines'), (3, 'planning', 'region'),
  (4, 'carte', 'region_voisines'), (4, 'planning', 'region'),
  (5, 'carte', 'region_voisines'), (5, 'planning', 'region'),
  (6, 'carte', 'region'),          (6, 'planning', 'region'),
  (7, 'carte', 'region_voisines'), (7, 'planning', 'region')
ON CONFLICT (id_profil, module) DO NOTHING;
