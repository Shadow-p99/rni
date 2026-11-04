-- =============================================================================
-- RNI — Jeu de données FICTIF de développement
-- Toutes les identités, unités et numéros sont fictifs.
-- =============================================================================
SET client_encoding = 'UTF8';

-- Unités (coordonnées WGS84 approximatives des chefs-lieux)
INSERT INTO ref_unite (code_unite, libelle, adresse, x, y, id_departement, tel_unite) VALUES
  ('00001', 'GIGN - Satory',                       '1 avenue de Satory, 78000 Versailles',          2.1100, 48.7836, '78',  '01 00 00 00 01'),
  ('10078', 'Groupement de gendarmerie des Yvelines', '12 rue de l''Exemple, 78000 Versailles',      2.1204, 48.8049, '78',  '01 00 00 78 00'),
  ('10091', 'Groupement de gendarmerie de l''Essonne', '5 boulevard Fictif, 91000 Évry-Courcouronnes', 2.4290, 48.6239, '91', '01 00 00 91 00'),
  ('10045', 'Groupement de gendarmerie du Loiret',  '3 rue Modèle, 45000 Orléans',                   1.9093, 47.9029, '45',  '02 00 00 45 00'),
  ('10037', 'Groupement de gendarmerie d''Indre-et-Loire', '8 avenue Test, 37000 Tours',              0.6848, 47.3941, '37',  '02 00 00 37 00'),
  ('10021', 'Groupement de gendarmerie de la Côte-d''Or', '2 rue Exemple, 21000 Dijon',              5.0415, 47.3220, '21',  '03 00 00 21 00'),
  ('10025', 'Groupement de gendarmerie du Doubs',   '4 rue Exemple, 25000 Besançon',                 6.0241, 47.2378, '25',  '03 00 00 25 00'),
  ('10014', 'Groupement de gendarmerie du Calvados', '6 rue Exemple, 14000 Caen',                   -0.3707, 49.1829, '14',  '02 00 00 14 00'),
  ('10076', 'Groupement de gendarmerie de Seine-Maritime', '7 rue Exemple, 76000 Rouen',             1.0999, 49.4432, '76',  '02 00 00 76 00'),
  ('10059', 'Groupement de gendarmerie du Nord',    '9 rue Exemple, 59000 Lille',                    3.0573, 50.6292, '59',  '03 00 00 59 00'),
  ('10080', 'Groupement de gendarmerie de la Somme', '10 rue Exemple, 80000 Amiens',                 2.2958, 49.8941, '80',  '03 00 00 80 00'),
  ('10067', 'Groupement de gendarmerie du Bas-Rhin', '11 rue Exemple, 67000 Strasbourg',             7.7521, 48.5734, '67',  '03 00 00 67 00'),
  ('10054', 'Groupement de gendarmerie de Meurthe-et-Moselle', '13 rue Exemple, 54000 Nancy',        6.1844, 48.6921, '54',  '03 00 00 54 00'),
  ('10051', 'Groupement de gendarmerie de la Marne', '14 rue Exemple, 51100 Reims',                  4.0317, 49.2583, '51',  '03 00 00 51 00'),
  ('10044', 'Groupement de gendarmerie de Loire-Atlantique', '15 rue Exemple, 44000 Nantes',        -1.5536, 47.2184, '44',  '02 00 00 44 00'),
  ('10049', 'Groupement de gendarmerie de Maine-et-Loire', '16 rue Exemple, 49000 Angers',          -0.5632, 47.4784, '49',  '02 00 00 49 00'),
  ('10035', 'Groupement de gendarmerie d''Ille-et-Vilaine', '17 rue Exemple, 35000 Rennes',         -1.6778, 48.1173, '35',  '02 00 00 35 00'),
  ('10029', 'Groupement de gendarmerie du Finistère', '18 rue Exemple, 29200 Brest',                -4.4861, 48.3904, '29',  '02 00 00 29 00'),
  ('10033', 'Groupement de gendarmerie de la Gironde', '19 rue Exemple, 33000 Bordeaux',            -0.5792, 44.8378, '33',  '05 00 00 33 00'),
  ('10086', 'Groupement de gendarmerie de la Vienne', '20 rue Exemple, 86000 Poitiers',              0.3404, 46.5802, '86',  '05 00 00 86 00'),
  ('10087', 'Groupement de gendarmerie de la Haute-Vienne', '21 rue Exemple, 87000 Limoges',         1.2611, 45.8336, '87',  '05 00 00 87 00'),
  ('10031', 'Groupement de gendarmerie de la Haute-Garonne', '22 rue Exemple, 31000 Toulouse',       1.4442, 43.6047, '31',  '05 00 00 31 00'),
  ('10034', 'Groupement de gendarmerie de l''Hérault', '23 rue Exemple, 34000 Montpellier',          3.8767, 43.6108, '34',  '04 00 00 34 00'),
  ('10069', 'Groupement de gendarmerie du Rhône',   '24 rue Exemple, 69000 Lyon',                    4.8357, 45.7640, '69',  '04 00 00 69 00'),
  ('10038', 'Groupement de gendarmerie de l''Isère', '25 rue Exemple, 38000 Grenoble',               5.7245, 45.1885, '38',  '04 00 00 38 00'),
  ('10063', 'Groupement de gendarmerie du Puy-de-Dôme', '26 rue Exemple, 63000 Clermont-Ferrand',    3.0870, 45.7772, '63',  '04 00 00 63 00'),
  ('10013', 'Groupement de gendarmerie des Bouches-du-Rhône', '27 rue Exemple, 13000 Marseille',     5.3698, 43.2965, '13',  '04 00 00 13 00'),
  ('10006', 'Groupement de gendarmerie des Alpes-Maritimes', '28 rue Exemple, 06000 Nice',           7.2620, 43.7102, '06',  '04 00 00 06 00'),
  ('1002A', 'Groupement de gendarmerie de Corse-du-Sud', '29 rue Exemple, 20000 Ajaccio',            8.7386, 41.9192, '2A',  '04 00 00 20 00'),
  ('1002B', 'Groupement de gendarmerie de Haute-Corse', '30 rue Exemple, 20200 Bastia',              9.4509, 42.6970, '2B',  '04 00 00 20 01'),
  ('10971', 'Commandement de gendarmerie de Guadeloupe', '31 rue Exemple, 97100 Basse-Terre',      -61.7255, 15.9985, '971', '05 90 00 00 00'),
  ('10972', 'Commandement de gendarmerie de Martinique', '32 rue Exemple, 97200 Fort-de-France',   -61.0588, 14.6161, '972', '05 96 00 00 00'),
  ('10973', 'Commandement de gendarmerie de Guyane', '33 rue Exemple, 97300 Cayenne',              -52.3135,  4.9224, '973', '05 94 00 00 00'),
  ('10974', 'Commandement de gendarmerie de La Réunion', '34 rue Exemple, 97400 Saint-Denis',       55.4504, -20.8823, '974', '02 62 00 00 00'),
  ('10976', 'Commandement de gendarmerie de Mayotte', '35 rue Exemple, 97600 Mamoudzou',            45.2279, -12.7806, '976', '02 69 00 00 00');

-- Personnel RPSI : comptes « spéciaux » (GIGN, lecture seule, OMS, fiche de crise)
INSERT INTO rpsi_personnel (nigend, nom, prenom, id_grade_personnel, code_unite, tel_pro, tel_perso, numero_neo_1, numero_neo_2) VALUES
  ('100001', 'MARTIN',   'Hélène',  11, '00001', '01 00 00 10 01', '06 00 00 10 01', '07 00 00 10 01', '07 00 00 10 01,07 00 00 10 02'),
  ('100002', 'BERNARD',  'Louis',    8, '00001', '01 00 00 10 02', NULL,             '07 00 00 10 03', NULL),
  ('100003', 'THOMAS',   'Claire',   7, '10069', '04 00 00 10 03', NULL,             NULL,             NULL),
  ('100004', 'PETIT',    'Antoine',  4, '10013', '04 00 00 10 04', NULL,             NULL,             NULL),
  ('100005', 'ROBERT',   'Nadia',   10, '00001', '01 00 00 10 05', '06 00 00 10 05', '07 00 00 10 05', NULL);

-- Personnel RPSI régional généré : 3 personnes par unité (hors GIGN)
WITH noms AS (
  SELECT ARRAY['DUBOIS','MOREAU','LAURENT','SIMON','MICHEL','LEFEBVRE','LEROY','ROUX','DAVID','BERTRAND',
               'MOREL','FOURNIER','GIRARD','BONNET','DUPONT','LAMBERT','FONTAINE','ROUSSEAU','VINCENT','MULLER',
               'LEFEVRE','FAURE','ANDRE','MERCIER','BLANC','GUERIN','BOYER','GARNIER','CHEVALIER','FRANCOIS',
               'LEGRAND','GAUTHIER','GARCIA','PERRIN','ROBIN','CLEMENT','MORIN','NICOLAS','HENRY','ROUSSEL',
               'MATHIEU','GAUTIER','MASSON','MARCHAND','DUVAL','DENIS','DUMONT','MARIE','LEMAIRE','NOEL',
               'MEYER','DUFOUR','MEUNIER','BRUN','BLANCHARD','GIRAUD','JOLY','RIVIERE','LUCAS','BRUNET',
               'GAILLARD','BARBIER','ARNAUD','MARTINEZ','GERARD','ROCHE','RENARD','SCHMITT','ROY','LEROUX',
               'COLIN','VIDAL','CARON','PICARD','ROGER','FABRE','AUBERT','LEMOINE','RENAUD','DUMAS',
               'LACROIX','OLIVIER','PHILIPPE','BOURGEOIS','PIERRE','BENOIT','REY','LECLERC','PAYET','ROLLAND',
               'LECLERCQ','GUILLAUME','LECOMTE','LOPEZ','JEAN','DUPUY','GUILLOT','HUBERT','BERGER','CARPENTIER'] AS n,
         ARRAY['Julien','Camille','Nicolas','Sophie','Thomas','Laura','Maxime','Emma','Alexandre','Léa',
               'Romain','Chloé','Pierre','Manon','Kevin','Sarah','Guillaume','Marine','Florian','Julie',
               'Mathieu','Pauline','Benjamin','Céline','Jérémy','Anaïs','Adrien','Marion','Quentin','Elodie'] AS p
), unites AS (
  SELECT code_unite, row_number() OVER (ORDER BY code_unite) AS rn
    FROM ref_unite WHERE code_unite <> '00001'
), gen AS (
  SELECT u.code_unite, u.rn, k, ((u.rn - 1) * 3 + k) AS idx
    FROM unites u CROSS JOIN generate_series(1, 3) AS k
)
INSERT INTO rpsi_personnel (nigend, nom, prenom, id_grade_personnel, code_unite, tel_pro, tel_perso, numero_neo_1, numero_neo_2)
SELECT (200000 + g.idx)::text,
       noms.n[1 + (g.idx * 7) % array_length(noms.n, 1)],
       noms.p[1 + (g.idx * 11) % array_length(noms.p, 1)],
       CASE g.k WHEN 1 THEN 4 + (g.idx % 5) WHEN 2 THEN 2 + (g.idx % 4) ELSE 1 + (g.idx % 4) END,
       g.code_unite,
       '0' || (1 + g.idx % 5) || ' 00 00 ' || lpad((g.idx % 100)::text, 2, '0') || ' ' || lpad((g.k * 11)::text, 2, '0'),
       CASE WHEN g.idx % 3 = 0 THEN NULL ELSE '06 00 ' || lpad((g.idx % 100)::text, 2, '0') || ' 00 ' || lpad((g.k * 13)::text, 2, '0') END,
       CASE WHEN g.idx % 4 = 0 THEN NULL ELSE '07 00 ' || lpad((g.idx % 100)::text, 2, '0') || ' 01 ' || lpad((g.k * 17)::text, 2, '0') END,
       NULL
  FROM gen g CROSS JOIN noms;

-- Comptes RNI spéciaux
INSERT INTO ref_user (nigend, id_grade_personnel, grade, nom, prenom, code_unite, tel_pro, tel_perso, tel_unite,
                      numero_neo_1, numero_neo_2, id_profil, id_region, commentaire)
SELECT v.nigend, v.id_grade_personnel, v.grade, v.nom, v.prenom, v.code_unite, v.tel_pro, v.tel_perso, v.tel_unite,
       v.numero_neo_1, v.numero_neo_2, s.id_profil, v.id_region, s.commentaire
  FROM v_personnel_to_ref_user v
  JOIN (VALUES ('100001', 1, 'Cheffe de la cellule négociation'),
               ('100002', 2, 'Compte technique de consultation'),
               ('100003', 6, 'Observatrice région AURA'),
               ('100004', 5, NULL),
               ('100005', 1, NULL)) AS s(nigend, id_profil, commentaire) ON s.nigend = v.nigend;

-- Comptes RNI régionaux : 1er de chaque unité = référent (ou référent adjoint une unité sur trois),
-- les suivants = négociateurs ; une personne sur 8 n'a pas de compte (candidate à la création).
INSERT INTO ref_user (nigend, id_grade_personnel, grade, nom, prenom, code_unite, tel_pro, tel_perso, tel_unite,
                      numero_neo_1, numero_neo_2, id_profil, id_region)
SELECT v.nigend, v.id_grade_personnel, v.grade, v.nom, v.prenom, v.code_unite, v.tel_pro, v.tel_perso, v.tel_unite,
       v.numero_neo_1, v.numero_neo_2,
       CASE WHEN (v.nigend::int - 200000) % 3 = 1
            THEN CASE WHEN ((v.nigend::int - 200000) / 3) % 3 = 2 THEN 7 ELSE 3 END
            ELSE 4 END,
       v.id_region
  FROM v_personnel_to_ref_user v
 WHERE v.nigend::int > 200000
   AND (v.nigend::int % 8) <> 0;

-- Un compte inactif (suppression logique), réactivable par une nouvelle création
UPDATE ref_user SET bool_user_inactif = true WHERE nigend = '200005';

-- Indicatif GEOLOC (BR-REF-2) et géolocalisation activée pour une partie des agents
UPDATE ref_user
   SET geoloc_indicatif   = 'RNI' || lpad(id_user::text, 6, '0'),
       geoloc_id_geoloc   = 'NEO-' || replace(numero_neo_1, ' ', ''),
       geoloc_bool_geoloc = (id_user % 3 <> 0),
       geoloc_bool_indispo = (id_user % 5 = 0)
 WHERE numero_neo_1 IS NOT NULL AND id_profil IN (3, 4, 7);

-- Plannings : blocs hebdomadaires du début du mois précédent à la fin du mois suivant
WITH semaines AS (
  SELECT k, (date_trunc('week', date_trunc('month', CURRENT_DATE) - interval '1 month')::date + k * 7) AS lundi
    FROM generate_series(0, 13) AS k
), cible AS (
  SELECT u.id_user, u.code_unite, s.k, s.lundi, ((u.id_user * 7 + s.k * 3) % 10) AS r
    FROM ref_user u CROSS JOIN semaines s
   WHERE u.id_profil IN (3, 4, 7) AND NOT u.bool_user_inactif
)
INSERT INTO planning (id_user, date_debut, id_creneaux_debut, date_fin, id_creneaux_fin, id_pos_service,
                      adresse_temp, x_adresse_temp, y_adresse_temp, created_by)
SELECT c.id_user,
       c.lundi, 1,
       c.lundi + 6, 2,
       CASE WHEN c.r <= 3 THEN 1 WHEN c.r <= 5 THEN 3 WHEN c.r <= 7 THEN 2 WHEN c.r = 8 THEN 4 ELSE 5 END,
       CASE WHEN c.r = 4 THEN 'Mission - ' || un.adresse END,
       CASE WHEN c.r = 4 THEN un.x + 0.08 END,
       CASE WHEN c.r = 4 THEN un.y + 0.05 END,
       'seed'
  FROM cible c
  JOIN ref_unite un ON un.code_unite = c.code_unite
 WHERE (c.id_user + c.k) % 6 <> 0;

-- Fiches de crise d'exemple
INSERT INTO t_formulaire (id_user, nom, prenom, age, crise, note_psychopathe, note_paranoiaque, note_schizophrene, note_dangerosite,
                          situation_description, situation_heure, situation_element_declencheur, situation_actualisee,
                          situation_exigences, situation_troubles, situation_armes, situation_cible, situation_personnes_presentes,
                          situation_personnes_blessees, situation_derniers_elements_vie,
                          terrain_localisation, terrain_adresse, terrain_x, terrain_y, terrain_residence, terrain_acces,
                          terrain_protection, terrain_vehicule, terrain_voisinage, terrain_dispositif_gendarmerie,
                          terrain_dispositif_secours, terrain_dangers, terrain_autorite,
                          auteur_description, auteur_telephone, auteur_profession, auteur_famille, auteur_amis, auteur_origine,
                          auteur_cursus, auteur_lieu_vie, auteur_religion, auteur_reseaux_sociaux, auteur_activite, auteur_taj,
                          auteur_addictions, auteur_medical, is_closed, closed_at, created_at, updated_at)
SELECT u.id_user, f.nom, f.prenom, f.age, f.crise, f.n1, f.n2, f.n3, f.n4, f.s1, f.s2, f.s3, f.s4, f.s5, f.s6, f.s7, f.s8, f.s9, f.s10, f.s11, f.t1, f.t2, f.tx, f.ty, f.t3, f.t4, f.t5, f.t6, f.t7, f.t8, f.t9, f.t10, f.t11, f.a1, f.a2, f.a3, f.a4, f.a5, f.a6, f.a7, f.a8, f.a9, f.a10, f.a11, f.a12, f.a13, f.a14, f.closed, f.closed_at, f.created_at, f.updated_at
  FROM (VALUES
    ('200001', 'EXEMPLE', 'Jean', '42', 'Retranché', 2, 4, 1, 6,
     'Individu retranché à son domicile après une dispute conjugale (données fictives).', '21h30', 'Séparation annoncée', 'Contact téléphonique établi',
     'Voir ses enfants', 'Agitation', 'Fusil de chasse déclaré', 'Lui-même', 'Aucune', 'Aucune', 'Message vocal à sa sœur',
     'Pavillon en lotissement', '12 rue de l''Exemple, 78000 Versailles', 2.1204, 48.8049, 'Maison individuelle R+1', 'Portail avant, jardin arrière',
     'Volets fermés', 'Véhicule utilitaire blanc', 'Voisins évacués', 'PSIG + négociateurs', 'SDIS en attente', 'Arme longue', 'Commandant de groupement',
     'Homme, 1m80, calme par intermittence', '06 00 00 00 01', 'Artisan', 'Marié, 2 enfants', 'Peu', 'Région parisienne',
     'CAP', 'Versailles', 'Non renseigné', 'Aucun', 'Indépendant', 'Néant', 'Alcool', 'Suivi généraliste', false, NULL::timestamptz,
     now() - interval '2 hours', now() - interval '20 minutes'),
    ('200004', 'TEST', 'Paul', '35', 'Suicidaire', 0, 1, 0, 3,
     'Personne menaçant de se jeter d''un pont (données fictives).', '14h00', 'Perte d''emploi', 'Situation résolue',
     'Aucune', 'Dépression', 'Aucune', 'Lui-même', 'Passants', 'Aucune', 'Publication sur réseau social',
     'Pont routier', '3 rue Modèle, 45000 Orléans', 1.9093, 47.9029, 'Sans objet', 'Bretelle fermée',
     'Néant', 'Néant', 'Circulation coupée', 'Brigade + négociateur', 'SDIS sur place', 'Chute', 'OPJ',
     'Homme, 35 ans', '+33 6 00 00 00 02', 'Commercial', 'Célibataire', 'Collègues', 'Loiret',
     'BTS', 'Orléans', 'Non renseigné', 'Compte public', 'Sans emploi', 'Néant', 'Néant', 'Néant', true, now() - interval '9 days',
     now() - interval '10 days', now() - interval '9 days')
  ) AS f(nigend, nom, prenom, age, crise, n1, n2, n3, n4,
         s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11,
         t1, t2, tx, ty, t3, t4, t5, t6, t7, t8, t9, t10, t11,
         a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13, a14, closed, closed_at, created_at, updated_at)
  JOIN ref_user u ON u.nigend = f.nigend;
