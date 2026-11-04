-- =============================================================================
-- RNI 2.8.0 — Accès aux données par les modèles Sequelize : colonne `recherche` des vues.
-- Expression identique à celle des index trigrammes de la table d'origine (ix_ref_user_search,
-- ix_rpsi_search) : PostgreSQL déplie la vue et continue d'utiliser l'index pour
-- `recherche ILIKE '%…%'`. Colonnes ajoutées en fin de vue (CREATE OR REPLACE VIEW).
-- =============================================================================
CREATE OR REPLACE VIEW v_personnel_to_ref_user AS
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
       p.numero_neo_2,
       -- Même expression que ix_rpsi_search (index utilisé à travers la vue)
       (p.nigend || ' ' || p.nom || ' ' || p.prenom) AS recherche
  FROM rpsi_personnel p
  LEFT JOIN ref_grade_personnel g ON g.id_grade_personnel = p.id_grade_personnel
  LEFT JOIN ref_unite u ON u.code_unite = p.code_unite
  LEFT JOIN lien_departement_region d ON d.id_departement = u.id_departement
  LEFT JOIN ref_regions r ON r.id_region = d.id_region;

CREATE OR REPLACE VIEW v_user_detail AS
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
       r.libelle                          AS libelle_region,
       -- Même expression que ix_ref_user_search (index utilisé à travers la vue)
       (ru.nigend || ' ' || ru.nom || ' ' || ru.prenom || ' ' || coalesce(ru.code_unite, '')) AS recherche
  FROM ref_user ru
  JOIN ref_profil p ON p.id_profil = ru.id_profil
  LEFT JOIN t_profil_classement pc ON pc.id_profil = ru.id_profil
  LEFT JOIN ref_grade_personnel g ON g.id_grade_personnel = ru.id_grade_personnel
  LEFT JOIN ref_unite u ON u.code_unite = ru.code_unite
  LEFT JOIN lien_departement_region d ON d.id_departement = u.id_departement
  LEFT JOIN ref_regions r ON r.id_region = ru.id_region;
