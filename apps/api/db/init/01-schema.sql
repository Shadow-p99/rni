-- =============================================================================
-- RNI — Répertoire National des Négociateurs
-- Schéma PostgreSQL (tables, contraintes, vues)
-- =============================================================================
SET client_encoding = 'UTF8';

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- -----------------------------------------------------------------------------
-- Référentiels
-- -----------------------------------------------------------------------------
CREATE TABLE ref_profil (
  id_profil   integer PRIMARY KEY,
  code        varchar(4),
  libelle     varchar(64) NOT NULL
);

CREATE TABLE t_profil_classement (
  id_profil   integer PRIMARY KEY REFERENCES ref_profil (id_profil),
  classement  integer NOT NULL
);

CREATE TABLE ref_pos_service (
  id_pos_service integer PRIMARY KEY,
  libelle        varchar(64) NOT NULL,
  color          varchar(9)  NOT NULL,
  is_actif       boolean     NOT NULL DEFAULT true
);

CREATE TABLE ref_creneaux (
  id_creneau  integer PRIMARY KEY,
  libelle     varchar(32) NOT NULL,
  heure_debut smallint    NOT NULL,
  heure_fin   smallint    NOT NULL
);

CREATE TABLE ref_grade_personnel (
  id_grade_personnel integer PRIMARY KEY,
  libelle            varchar(128) NOT NULL,
  abreviation        varchar(16),
  poids              integer      NOT NULL DEFAULT 0
);

CREATE TABLE ref_regions (
  id_region integer PRIMARY KEY,           -- code INSEE de la région
  libelle   varchar(128) NOT NULL
);

-- Régions voisines (halo des référents, BR-AUTH-6)
CREATE TABLE ref_nrb_region_r22 (
  id_region         integer NOT NULL REFERENCES ref_regions (id_region),
  id_region_voisine integer NOT NULL REFERENCES ref_regions (id_region),
  PRIMARY KEY (id_region, id_region_voisine),
  CHECK (id_region <> id_region_voisine)
);

CREATE TABLE t_region_center (
  id_region integer PRIMARY KEY REFERENCES ref_regions (id_region),
  x         double precision NOT NULL,      -- longitude WGS84
  y         double precision NOT NULL,      -- latitude WGS84
  zoom      smallint NOT NULL DEFAULT 7
);

CREATE TABLE lien_departement_region (
  id_departement           varchar(3) PRIMARY KEY,
  libelle_departement      varchar(128) NOT NULL,
  id_region                integer NOT NULL REFERENCES ref_regions (id_region),
  dept_time_zone_database  varchar(64) NOT NULL DEFAULT 'Europe/Paris'
);

CREATE TABLE ref_unite (
  code_unite     varchar(10) PRIMARY KEY,
  libelle        varchar(255) NOT NULL,
  adresse        varchar(512),
  x              double precision,          -- longitude WGS84
  y              double precision,          -- latitude WGS84
  id_departement varchar(3) REFERENCES lien_departement_region (id_departement),
  tel_unite      varchar(32)
);

-- -----------------------------------------------------------------------------
-- RPSI (alimenté par flux RH externe)
-- -----------------------------------------------------------------------------
CREATE TABLE rpsi_personnel (
  nigend             varchar(8) PRIMARY KEY,
  nom                varchar(128) NOT NULL,
  prenom             varchar(128) NOT NULL,
  id_grade_personnel integer REFERENCES ref_grade_personnel (id_grade_personnel),
  code_unite         varchar(10) REFERENCES ref_unite (code_unite),
  tel_pro            varchar(32),
  tel_perso          varchar(32),
  numero_neo_1       varchar(32),
  numero_neo_2       varchar(128),
  date_maj           timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Tables métier
-- -----------------------------------------------------------------------------
CREATE TABLE ref_user (
  id_user             serial PRIMARY KEY,
  nigend              varchar(8) NOT NULL UNIQUE,
  id_grade_personnel  integer REFERENCES ref_grade_personnel (id_grade_personnel),
  grade               varchar(128),
  nom                 varchar(128) NOT NULL,
  prenom              varchar(128) NOT NULL,
  code_unite          varchar(10) REFERENCES ref_unite (code_unite),
  tel_pro             varchar(32),
  tel_perso           varchar(32),
  tel_unite           varchar(32),
  numero_neo_1        varchar(32),
  numero_neo_2        varchar(128),
  id_profil           integer NOT NULL REFERENCES ref_profil (id_profil),
  id_region           integer REFERENCES ref_regions (id_region),
  commentaire         text,
  geoloc_id_geoloc    varchar(64),
  geoloc_indicatif    varchar(16),
  geoloc_bool_geoloc  boolean NOT NULL DEFAULT false,
  geoloc_bool_indispo boolean NOT NULL DEFAULT false,
  bool_user_inactif   boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_ref_user_region ON ref_user (id_region) WHERE NOT bool_user_inactif;

-- Une plage = [date_debut @ créneau, date_fin @ créneau].
-- slot_* : index de créneau (jours depuis 1970-01-01 × 2 + créneau − 1), cf. @rni/shared.
CREATE TABLE planning (
  id_planning        serial PRIMARY KEY,
  id_user            integer NOT NULL REFERENCES ref_user (id_user) ON DELETE CASCADE,
  date_debut         date    NOT NULL,
  id_creneaux_debut  integer NOT NULL REFERENCES ref_creneaux (id_creneau),
  date_fin           date    NOT NULL,
  id_creneaux_fin    integer NOT NULL REFERENCES ref_creneaux (id_creneau),
  id_pos_service     integer REFERENCES ref_pos_service (id_pos_service),
  adresse_temp       varchar(512),
  x_adresse_temp     double precision,
  y_adresse_temp     double precision,
  slot_debut         integer GENERATED ALWAYS AS (((date_debut - DATE '1970-01-01') * 2) + id_creneaux_debut - 1) STORED,
  slot_fin           integer GENERATED ALWAYS AS (((date_fin - DATE '1970-01-01') * 2) + id_creneaux_fin - 1) STORED,
  created_by         varchar(8),
  updated_by         varchar(8),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_planning_ordre CHECK (slot_fin >= slot_debut),
  -- BR-PLA-5 : unicité temporelle garantie par la base
  CONSTRAINT ex_planning_chevauchement EXCLUDE USING gist (
    id_user WITH =,
    int4range(slot_debut, slot_fin, '[]') WITH &&
  )
);
CREATE INDEX ix_planning_slots ON planning (slot_debut, slot_fin);

-- Fiche de crise / formulaire négociation
CREATE TABLE t_formulaire (
  id_formulaire                    serial PRIMARY KEY,
  id_user                          integer NOT NULL REFERENCES ref_user (id_user),
  -- Profil de l'individu
  nom                              varchar(128),
  prenom                           varchar(128),
  age                              varchar(16),
  crise                            varchar(64) NOT NULL DEFAULT 'Aucun',
  note_psychopathe                 smallint NOT NULL DEFAULT 0,
  note_paranoiaque                 smallint NOT NULL DEFAULT 0,
  note_schizophrene                smallint NOT NULL DEFAULT 0,
  note_dangerosite                 smallint NOT NULL DEFAULT 0,
  -- Situation
  situation_description            text,
  situation_heure                  varchar(64),
  situation_element_declencheur    text,
  situation_actualisee             text,
  situation_exigences              text,
  situation_troubles               text,
  situation_armes                  text,
  situation_cible                  text,
  situation_personnes_presentes    text,
  situation_personnes_blessees     text,
  situation_derniers_elements_vie  text,
  -- Terrain
  terrain_localisation             text,
  terrain_adresse                  varchar(512),
  terrain_x                        double precision,
  terrain_y                        double precision,
  terrain_residence                text,
  terrain_acces                    text,
  terrain_protection               text,
  terrain_vehicule                 text,
  terrain_voisinage                text,
  terrain_dispositif_gendarmerie   text,
  terrain_dispositif_secours       text,
  terrain_dangers                  text,
  terrain_autorite                 text,
  -- Renseignements auteur
  auteur_description               text,
  auteur_telephone                 varchar(32),
  auteur_profession                text,
  auteur_famille                   text,
  auteur_amis                      text,
  auteur_origine                   text,
  auteur_cursus                    text,
  auteur_lieu_vie                  text,
  auteur_religion                  text,
  auteur_reseaux_sociaux           text,
  auteur_activite                  text,
  auteur_taj                       text,
  auteur_addictions                text,
  auteur_medical                   text,
  -- Cycle de vie
  is_closed                        boolean NOT NULL DEFAULT false,
  closed_at                        timestamptz,
  created_at                       timestamptz NOT NULL DEFAULT now(),
  updated_at                       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_formulaire_updated ON t_formulaire (updated_at DESC);

-- -----------------------------------------------------------------------------
-- Paramétrage, messages et journaux
-- -----------------------------------------------------------------------------
CREATE TABLE t_param_app (
  cle_param_app varchar(128) PRIMARY KEY,
  valeur        text,
  description   varchar(512),
  is_front      boolean NOT NULL DEFAULT false   -- exposable au client via /service/configuration
);

CREATE TABLE t_admin_messages (
  code_message varchar(16) PRIMARY KEY,
  libelle      varchar(512) NOT NULL,
  type         varchar(16)  NOT NULL DEFAULT 'ERREUR'
);

CREATE TABLE t_admin_logs (
  id_log       bigserial PRIMARY KEY,
  horodatage   timestamptz NOT NULL DEFAULT now(),
  code_message varchar(16),
  nigend       varchar(8),
  methode      varchar(8),
  url          varchar(1024),
  body         text,
  description  varchar(4000)
);

CREATE TABLE t_admin_log_splunk (
  id_log       bigserial PRIMARY KEY,
  horodatage   timestamptz NOT NULL DEFAULT now(),
  ip           varchar(64),
  route        varchar(1024),
  methode      varchar(8),
  statut       integer,
  rio_user     varchar(8),
  code_unite   varchar(10),
  role         varchar(64),
  institution  varchar(8) NOT NULL DEFAULT 'GN'
);
CREATE INDEX ix_log_splunk_horodatage ON t_admin_log_splunk (horodatage);

-- -----------------------------------------------------------------------------
-- Vues
-- -----------------------------------------------------------------------------

-- Personnel RPSI candidat à l'habilitation RNI
CREATE VIEW v_personnel_to_ref_user AS
SELECT p.nigend,
       p.nom,
       p.prenom,
       p.id_grade_personnel,
       g.libelle      AS grade,
       g.abreviation  AS abreviation_grade,
       p.code_unite,
       u.libelle      AS libelle_unite,
       u.id_departement,
       d.id_region,
       r.libelle      AS libelle_region,
       p.tel_pro,
       p.tel_perso,
       u.tel_unite,
       p.numero_neo_1,
       p.numero_neo_2
  FROM rpsi_personnel p
  LEFT JOIN ref_grade_personnel g ON g.id_grade_personnel = p.id_grade_personnel
  LEFT JOIN ref_unite u ON u.code_unite = p.code_unite
  LEFT JOIN lien_departement_region d ON d.id_departement = u.id_departement
  LEFT JOIN ref_regions r ON r.id_region = d.id_region;

-- Comptes enrichis (profil, classement, grade, unité, département, fuseau)
CREATE VIEW v_user_detail AS
SELECT ru.*,
       p.libelle                          AS libelle_profil,
       COALESCE(pc.classement, 99)        AS classement,
       g.abreviation                      AS abreviation_grade,
       COALESCE(g.poids, 0)               AS poids_grade,
       u.libelle                          AS libelle_unite,
       u.adresse                          AS adresse_unite,
       u.x                                AS x_unite,
       u.y                                AS y_unite,
       u.id_departement,
       d.libelle_departement,
       COALESCE(d.dept_time_zone_database, 'Europe/Paris') AS time_zone,
       r.libelle                          AS libelle_region
  FROM ref_user ru
  JOIN ref_profil p ON p.id_profil = ru.id_profil
  LEFT JOIN t_profil_classement pc ON pc.id_profil = ru.id_profil
  LEFT JOIN ref_grade_personnel g ON g.id_grade_personnel = ru.id_grade_personnel
  LEFT JOIN ref_unite u ON u.code_unite = ru.code_unite
  LEFT JOIN lien_departement_region d ON d.id_departement = u.id_departement
  LEFT JOIN ref_regions r ON r.id_region = ru.id_region;
