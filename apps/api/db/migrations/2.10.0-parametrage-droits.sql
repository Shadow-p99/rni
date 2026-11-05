-- =============================================================================
-- RNI 2.10.0 — Paramétrage en base de ce qui était codé dans @rni/shared.
--   * droits par profil (ref_droit, t_profil_droit) : remplacent les listes de profils codées ;
--   * gestion du personnel : profils listés / gérés par profil (t_profil_gestion) ;
--   * profils : port d'un planning (ref_profil.has_planning), création de profils ;
--   * positions de service : position restreinte (BR-PLA-4), priorité des clusters (BR-CAR-4) ;
--   * fiche de crise : types de crise, libellés / obligation / ordre des champs et des sections ;
--   * couleur d'un personnel sans planning (t_param_app).
-- Les valeurs initiales reproduisent exactement le comportement de la version précédente.
-- Idempotent ; n'écrase jamais un paramétrage existant.
-- =============================================================================

-- --- Droits ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ref_droit (
  code         varchar(64)  PRIMARY KEY,
  module       varchar(16)  NOT NULL,
  libelle      varchar(128) NOT NULL,
  description  varchar(512),
  portees      varchar(16)[] NOT NULL DEFAULT ARRAY['oui']::varchar(16)[],
  ordre        integer      NOT NULL DEFAULT 0
);

INSERT INTO ref_droit (code, module, libelle, description, portees, ordre) VALUES
  ('carte.voir',      'carte', 'Voir la carte opérationnelle', 'Accès à la carte et aux positions du personnel (dans le périmètre carte du profil).', ARRAY['oui'], 10),
  ('carte.geoloc',    'carte', 'Voir la géolocalisation des terminaux', 'Positions GEOLOC des terminaux NEO déclarés.', ARRAY['oui'], 20),
  ('carte.isochrone', 'carte', 'Calculer des isochrones', 'Zones atteignables en 30 / 60 / 90 minutes autour d''un point.', ARRAY['oui'], 30),
  ('planning.voir',   'planning', 'Voir le planning', 'Consultation des plannings (dans le périmètre planning du profil).', ARRAY['oui'], 10),
  ('planning.ecrire', 'planning', 'Modifier le planning', 'Pose, modification, insertion et suppression de créneaux.', ARRAY['national', 'region', 'soi'], 20),
  ('planning.positions_restreintes', 'planning', 'Utiliser les positions restreintes', 'Poser ou retirer les positions marquées « restreintes » (Alerte, Formateur…).', ARRAY['oui'], 30),
  ('formulaire.voir',      'formulaire', 'Voir les fiches de crise', 'Liste et consultation des fiches (toutes ou celles des auteurs de sa région).', ARRAY['national', 'region'], 10),
  ('formulaire.creer',     'formulaire', 'Créer une fiche de crise', NULL, ARRAY['oui'], 20),
  ('formulaire.modifier',  'formulaire', 'Modifier une fiche de crise', 'Fiche non clôturée uniquement.', ARRAY['perimetre', 'auteur'], 30),
  ('formulaire.cloturer',  'formulaire', 'Clôturer une fiche de crise', 'Irréversible : la fiche n''est plus modifiable.', ARRAY['perimetre', 'auteur'], 40),
  ('formulaire.supprimer', 'formulaire', 'Supprimer une fiche de crise', 'Suppression définitive.', ARRAY['perimetre', 'auteur'], 50),
  ('gestion.acces', 'gestion', 'Gérer le personnel', 'Écran Gestion : comptes, profils, téléphones (profils listés et gérés : écran Profils).', ARRAY['national', 'region'], 10),
  ('admin.acces',   'admin', 'Administrer l''application', 'Écran Administration : tableau de bord, journaux, droits, profils, paramètres.', ARRAY['oui'], 10)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS t_profil_droit (
  id_profil   integer     NOT NULL REFERENCES ref_profil (id_profil) ON DELETE CASCADE,
  code_droit  varchar(64) NOT NULL REFERENCES ref_droit (code) ON DELETE CASCADE,
  portee      varchar(16) NOT NULL CHECK (portee IN ('oui', 'national', 'region', 'soi', 'perimetre', 'auteur')),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  varchar(8),
  PRIMARY KEY (id_profil, code_droit)
);

-- Attributions initiales = règles de la version 2.9 (seulement si la table est vide)
INSERT INTO t_profil_droit (id_profil, code_droit, portee)
SELECT v.id_profil, v.code, v.portee
  FROM (VALUES
    -- Carte et planning : consultation pour tous
    (1, 'carte.voir', 'oui'), (2, 'carte.voir', 'oui'), (3, 'carte.voir', 'oui'), (4, 'carte.voir', 'oui'),
    (5, 'carte.voir', 'oui'), (6, 'carte.voir', 'oui'), (7, 'carte.voir', 'oui'), (8, 'carte.voir', 'oui'),
    (1, 'planning.voir', 'oui'), (2, 'planning.voir', 'oui'), (3, 'planning.voir', 'oui'), (4, 'planning.voir', 'oui'),
    (5, 'planning.voir', 'oui'), (6, 'planning.voir', 'oui'), (7, 'planning.voir', 'oui'), (8, 'planning.voir', 'oui'),
    -- Administrateurs (GIGN, référents, super administrateur)
    (1, 'carte.geoloc', 'oui'), (3, 'carte.geoloc', 'oui'), (7, 'carte.geoloc', 'oui'), (8, 'carte.geoloc', 'oui'),
    (1, 'carte.isochrone', 'oui'), (3, 'carte.isochrone', 'oui'), (7, 'carte.isochrone', 'oui'), (8, 'carte.isochrone', 'oui'),
    -- BR-PLA-7
    (1, 'planning.ecrire', 'national'), (8, 'planning.ecrire', 'national'),
    (3, 'planning.ecrire', 'region'), (7, 'planning.ecrire', 'region'), (4, 'planning.ecrire', 'soi'),
    -- BR-PLA-4
    (1, 'planning.positions_restreintes', 'oui'), (3, 'planning.positions_restreintes', 'oui'),
    (7, 'planning.positions_restreintes', 'oui'), (8, 'planning.positions_restreintes', 'oui'),
    -- BR-FOR-1 / 2 / 5 / 6 : profils 2, 5, 6 exclus ; clôture et suppression par l'auteur
    (1, 'formulaire.voir', 'national'), (8, 'formulaire.voir', 'national'),
    (3, 'formulaire.voir', 'region'), (4, 'formulaire.voir', 'region'), (7, 'formulaire.voir', 'region'),
    (1, 'formulaire.creer', 'oui'), (3, 'formulaire.creer', 'oui'), (4, 'formulaire.creer', 'oui'), (7, 'formulaire.creer', 'oui'), (8, 'formulaire.creer', 'oui'),
    (1, 'formulaire.modifier', 'perimetre'), (3, 'formulaire.modifier', 'perimetre'), (4, 'formulaire.modifier', 'perimetre'),
    (7, 'formulaire.modifier', 'perimetre'), (8, 'formulaire.modifier', 'perimetre'),
    (1, 'formulaire.cloturer', 'auteur'), (3, 'formulaire.cloturer', 'auteur'), (4, 'formulaire.cloturer', 'auteur'),
    (7, 'formulaire.cloturer', 'auteur'), (8, 'formulaire.cloturer', 'auteur'),
    (1, 'formulaire.supprimer', 'auteur'), (3, 'formulaire.supprimer', 'auteur'), (4, 'formulaire.supprimer', 'auteur'),
    (7, 'formulaire.supprimer', 'auteur'), (8, 'formulaire.supprimer', 'auteur'),
    -- BR-AUTH-5 / BR-GPU
    (1, 'gestion.acces', 'national'), (8, 'gestion.acces', 'national'), (3, 'gestion.acces', 'region'), (7, 'gestion.acces', 'region'),
    (8, 'admin.acces', 'oui')
  ) AS v(id_profil, code, portee)
  JOIN ref_profil p ON p.id_profil = v.id_profil
 WHERE NOT EXISTS (SELECT 1 FROM t_profil_droit)
ON CONFLICT DO NOTHING;

-- Le super administrateur garde toujours l'administration
INSERT INTO t_profil_droit (id_profil, code_droit, portee)
SELECT 8, 'admin.acces', 'oui' WHERE EXISTS (SELECT 1 FROM ref_profil WHERE id_profil = 8)
ON CONFLICT DO NOTHING;

-- --- Gestion du personnel : profils listés / gérés -----------------------------
CREATE TABLE IF NOT EXISTS t_profil_gestion (
  id_profil        integer NOT NULL REFERENCES ref_profil (id_profil) ON DELETE CASCADE,
  id_profil_cible  integer NOT NULL REFERENCES ref_profil (id_profil) ON DELETE CASCADE,
  visible          boolean NOT NULL DEFAULT true,
  gerable          boolean NOT NULL DEFAULT false,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       varchar(8),
  PRIMARY KEY (id_profil, id_profil_cible),
  CONSTRAINT ck_profil_gestion CHECK (visible OR NOT gerable)
);

-- BR-GPU-1 / BR-GPU-3
INSERT INTO t_profil_gestion (id_profil, id_profil_cible, visible, gerable)
SELECT v.a, v.b, v.visible, v.gerable
  FROM (VALUES
    (8, 8, true, true), (8, 1, true, true), (8, 3, true, true), (8, 4, true, true), (8, 6, true, true), (8, 7, true, true),
    (1, 8, true, false), (1, 1, true, true), (1, 3, true, true), (1, 4, true, true), (1, 6, true, true), (1, 7, true, true),
    (3, 3, true, true), (3, 4, true, true), (3, 7, true, true),
    (7, 3, true, true), (7, 4, true, true), (7, 7, true, true)
  ) AS v(a, b, visible, gerable)
  JOIN ref_profil pa ON pa.id_profil = v.a
  JOIN ref_profil pb ON pb.id_profil = v.b
 WHERE NOT EXISTS (SELECT 1 FROM t_profil_gestion)
ON CONFLICT DO NOTHING;

-- --- Profils -----------------------------------------------------------------
ALTER TABLE ref_profil ADD COLUMN IF NOT EXISTS has_planning boolean NOT NULL DEFAULT false;
DO $$
BEGIN
  -- Première application uniquement : profils 3, 4, 7 (PLANNING_PROFILS de la version 2.9)
  IF NOT EXISTS (SELECT 1 FROM ref_profil WHERE has_planning) THEN
    UPDATE ref_profil SET has_planning = true WHERE id_profil IN (3, 4, 7);
  END IF;
END;
$$;
INSERT INTO t_profil_classement (id_profil, classement)
SELECT id_profil, 90 + id_profil FROM ref_profil
ON CONFLICT (id_profil) DO NOTHING;

-- --- Positions de service ----------------------------------------------------
ALTER TABLE ref_pos_service ADD COLUMN IF NOT EXISTS is_restreinte boolean NOT NULL DEFAULT false;
ALTER TABLE ref_pos_service ADD COLUMN IF NOT EXISTS priorite_cluster smallint;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ref_pos_service WHERE is_restreinte OR priorite_cluster IS NOT NULL) THEN
    UPDATE ref_pos_service SET is_restreinte = true WHERE id_pos_service IN (4, 5);   -- Alerte, Formateur
    UPDATE ref_pos_service SET priorite_cluster = 1 WHERE id_pos_service = 4;          -- Alerte
    UPDATE ref_pos_service SET priorite_cluster = 2 WHERE id_pos_service = 1;          -- Disponible
  END IF;
END;
$$;

-- --- Fiche de crise ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS ref_type_crise (
  id_type_crise  serial       PRIMARY KEY,
  libelle        varchar(128) NOT NULL UNIQUE,
  ordre          integer      NOT NULL DEFAULT 0,
  is_actif       boolean      NOT NULL DEFAULT true
);
INSERT INTO ref_type_crise (libelle, ordre)
SELECT v.libelle, v.ordre FROM (VALUES
  ('Aucun', 10),
  ('Terrorisme', 20),
  ('Prise d''otage', 30),
  ('Prise d''otage familiale', 40),
  ('Rétention familiale', 50),
  ('Forcené', 60),
  ('Retranché', 70),
  ('Suicidaire', 80)
) AS v(libelle, ordre)
 WHERE NOT EXISTS (SELECT 1 FROM ref_type_crise)
ON CONFLICT (libelle) DO NOTHING;

CREATE TABLE IF NOT EXISTS t_formulaire_section (
  id_section  varchar(16)  PRIMARY KEY,
  libelle     varchar(128) NOT NULL,
  imprimable  boolean      NOT NULL DEFAULT true,
  ordre       integer      NOT NULL DEFAULT 0
);
INSERT INTO t_formulaire_section (id_section, libelle, imprimable, ordre) VALUES
  ('profil', 'Profil de l''individu', false, 10),
  ('situation', 'Situation', true, 20),
  ('terrain', 'Terrain', true, 30),
  ('auteur', 'Renseignements auteur', true, 40)
ON CONFLICT (id_section) DO NOTHING;

CREATE TABLE IF NOT EXISTS t_formulaire_champ (
  cle          varchar(64)  PRIMARY KEY,
  libelle      varchar(128) NOT NULL,
  obligatoire  boolean      NOT NULL DEFAULT true,
  ordre        integer      NOT NULL DEFAULT 0
);
INSERT INTO t_formulaire_champ (cle, libelle, obligatoire, ordre) VALUES
  ('nom', 'Nom', false, 10),
  ('prenom', 'Prénom', false, 20),
  ('age', 'Âge', true, 30),
  ('crise', 'Type de crise', true, 40),
  ('note_psychopathe', 'Psychopathe', false, 50),
  ('note_paranoiaque', 'Paranoïaque', false, 60),
  ('note_schizophrene', 'Schizophrène', false, 70),
  ('note_dangerosite', 'Dangerosité', false, 80),
  ('situation_description', 'Description', true, 10),
  ('situation_heure', 'Heure', true, 20),
  ('situation_element_declencheur', 'Élément déclencheur', true, 30),
  ('situation_actualisee', 'Situation actualisée', true, 40),
  ('situation_exigences', 'Exigences', true, 50),
  ('situation_troubles', 'Troubles', true, 60),
  ('situation_armes', 'Arme(s)', true, 70),
  ('situation_cible', 'Cible', true, 80),
  ('situation_personnes_presentes', 'Personnes présentes', true, 90),
  ('situation_personnes_blessees', 'Personnes blessées', true, 100),
  ('situation_derniers_elements_vie', 'Derniers éléments de vie', true, 110),
  ('terrain_localisation', 'Localisation', true, 10),
  ('terrain_adresse', 'Adresse', true, 20),
  ('terrain_residence', 'Résidence', true, 30),
  ('terrain_acces', 'Accès', true, 40),
  ('terrain_protection', 'Protection', true, 50),
  ('terrain_vehicule', 'Véhicule', true, 60),
  ('terrain_voisinage', 'Voisinage', true, 70),
  ('terrain_dispositif_gendarmerie', 'Dispositif gendarmerie', true, 80),
  ('terrain_dispositif_secours', 'Dispositif secours', true, 90),
  ('terrain_dangers', 'Dangers', true, 100),
  ('terrain_autorite', 'Autorité sur place', true, 110),
  ('auteur_description', 'Description', true, 10),
  ('auteur_telephone', 'Téléphone', true, 20),
  ('auteur_profession', 'Profession', true, 30),
  ('auteur_famille', 'Famille', true, 40),
  ('auteur_amis', 'Amis', true, 50),
  ('auteur_origine', 'Origine', true, 60),
  ('auteur_cursus', 'Cursus', true, 70),
  ('auteur_lieu_vie', 'Lieu de vie', true, 80),
  ('auteur_religion', 'Religion', true, 90),
  ('auteur_reseaux_sociaux', 'Réseaux sociaux', true, 100),
  ('auteur_activite', 'Activité', true, 110),
  ('auteur_taj', 'TAJ', true, 120),
  ('auteur_addictions', 'Addictions', true, 130),
  ('auteur_medical', 'Médical', true, 140)
ON CONFLICT (cle) DO NOTHING;

-- --- Paramètres --------------------------------------------------------------
INSERT INTO t_param_app (cle_param_app, valeur, description, is_front) VALUES
  ('rni.carte.couleur_sans_planning', '#808080', 'Couleur (#rrggbb) d''un personnel sans planning sur la carte et le planning (BR-CAR-3)', true)
ON CONFLICT (cle_param_app) DO NOTHING;

-- --- Invalidation du cache (cf. 2.4.0) ----------------------------------------
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('ref_droit',            'param'),
      ('t_profil_droit',       'param'),
      ('t_profil_gestion',     'param'),
      ('t_admin_messages',     'param'),
      ('ref_type_crise',       'referentiel'),
      ('t_formulaire_section', 'referentiel'),
      ('t_formulaire_champ',   'referentiel')
    ) AS v(tbl, tags)
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_rni_cache_notify ON %I', t.tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_rni_cache_notify AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON %I
         FOR EACH STATEMENT EXECUTE FUNCTION rni_cache_notify(%s)',
      t.tbl, (SELECT string_agg(quote_literal(x), ', ') FROM unnest(string_to_array(t.tags, ',')) x));
  END LOOP;
END;
$$;
