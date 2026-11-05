/**
 * Fiche de crise (« formulaire négociation ») — catalogue **technique** des champs, cf. §6.2 :
 * clé (colonne de `t_formulaire`), nature et section. Libellés, caractère obligatoire, ordre,
 * libellés et impression des sections se règlent en base (`t_formulaire_champ`,
 * `t_formulaire_section`) ; les valeurs ci-dessous sont celles livrées (et le repli).
 */

/**
 * Types de crise livrés : la liste de référence est en base (`ref_type_crise`, Administration ›
 * Fiche de crise). Le premier (« Aucun ») est la valeur par défaut.
 */
export const DEFAULT_CRISES = [
  'Aucun',
  'Terrorisme',
  "Prise d'otage",
  "Prise d'otage familiale",
  'Rétention familiale',
  'Forcené',
  'Retranché',
  'Suicidaire',
] as const;
export const CRISE_PAR_DEFAUT = 'Aucun';

export const NOTE_MIN = 0;
export const NOTE_MAX = 10;

export type SectionId = 'profil' | 'situation' | 'terrain' | 'auteur';

export const SECTIONS: { id: SectionId; libelle: string; imprimable: boolean }[] = [
  { id: 'profil', libelle: "Profil de l'individu", imprimable: false },
  { id: 'situation', libelle: 'Situation', imprimable: true },
  { id: 'terrain', libelle: 'Terrain', imprimable: true },
  { id: 'auteur', libelle: 'Renseignements auteur', imprimable: true },
];

export type FieldKind = 'text' | 'textarea' | 'number' | 'note' | 'select' | 'phone' | 'address';

export interface FieldDef {
  key: string;
  label: string;
  section: SectionId;
  kind: FieldKind;
  /** Obligatoire côté client (le nom / prénom suivent la règle BR-FOR-3). */
  required: boolean;
}

const f = (section: SectionId, key: string, label: string, kind: FieldKind = 'textarea', required = true): FieldDef => ({
  key,
  label,
  section,
  kind,
  required,
});

export const FORMULAIRE_FIELDS: FieldDef[] = [
  // 1. Profil de l'individu
  f('profil', 'nom', 'Nom', 'text', false),
  f('profil', 'prenom', 'Prénom', 'text', false),
  f('profil', 'age', 'Âge', 'number'),
  f('profil', 'crise', 'Type de crise', 'select'),
  f('profil', 'note_psychopathe', 'Psychopathe', 'note', false),
  f('profil', 'note_paranoiaque', 'Paranoïaque', 'note', false),
  f('profil', 'note_schizophrene', 'Schizophrène', 'note', false),
  f('profil', 'note_dangerosite', 'Dangerosité', 'note', false),
  // 2. Situation
  f('situation', 'situation_description', 'Description'),
  f('situation', 'situation_heure', 'Heure', 'text'),
  f('situation', 'situation_element_declencheur', 'Élément déclencheur'),
  f('situation', 'situation_actualisee', 'Situation actualisée'),
  f('situation', 'situation_exigences', 'Exigences'),
  f('situation', 'situation_troubles', 'Troubles'),
  f('situation', 'situation_armes', 'Arme(s)'),
  f('situation', 'situation_cible', 'Cible'),
  f('situation', 'situation_personnes_presentes', 'Personnes présentes'),
  f('situation', 'situation_personnes_blessees', 'Personnes blessées'),
  f('situation', 'situation_derniers_elements_vie', 'Derniers éléments de vie'),
  // 3. Terrain
  f('terrain', 'terrain_localisation', 'Localisation'),
  f('terrain', 'terrain_adresse', 'Adresse', 'address'),
  f('terrain', 'terrain_residence', 'Résidence'),
  f('terrain', 'terrain_acces', 'Accès'),
  f('terrain', 'terrain_protection', 'Protection'),
  f('terrain', 'terrain_vehicule', 'Véhicule'),
  f('terrain', 'terrain_voisinage', 'Voisinage'),
  f('terrain', 'terrain_dispositif_gendarmerie', 'Dispositif gendarmerie'),
  f('terrain', 'terrain_dispositif_secours', 'Dispositif secours'),
  f('terrain', 'terrain_dangers', 'Dangers'),
  f('terrain', 'terrain_autorite', 'Autorité sur place'),
  // 4. Renseignements auteur
  f('auteur', 'auteur_description', 'Description'),
  f('auteur', 'auteur_telephone', 'Téléphone', 'phone'),
  f('auteur', 'auteur_profession', 'Profession'),
  f('auteur', 'auteur_famille', 'Famille'),
  f('auteur', 'auteur_amis', 'Amis'),
  f('auteur', 'auteur_origine', 'Origine'),
  f('auteur', 'auteur_cursus', 'Cursus'),
  f('auteur', 'auteur_lieu_vie', 'Lieu de vie'),
  f('auteur', 'auteur_religion', 'Religion'),
  f('auteur', 'auteur_reseaux_sociaux', 'Réseaux sociaux'),
  f('auteur', 'auteur_activite', 'Activité'),
  f('auteur', 'auteur_taj', 'TAJ'),
  f('auteur', 'auteur_addictions', 'Addictions'),
  f('auteur', 'auteur_medical', 'Médical'),
];

/** Champs techniques complémentaires (coordonnées de l'adresse terrain). */
export const FORMULAIRE_COORD_FIELDS = ['terrain_x', 'terrain_y'] as const;

export const NOTE_FIELDS = FORMULAIRE_FIELDS.filter((d) => d.kind === 'note').map((d) => d.key);

export type FormulaireContent = Record<string, string | number | boolean | null | undefined>;
