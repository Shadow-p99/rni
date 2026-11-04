/**
 * Catalogue des codes d'erreur métier (`t_admin_messages`), cf. §3.3.
 * Les libellés de référence sont en base ; ceux-ci servent de repli si la base est
 * indisponible (dette §9.10) et pour l'initialisation du catalogue.
 */
export const ErrorCode = {
  TECHNIQUE: 'RNI-0000',
  BASE_INDISPONIBLE: 'RNI-0001',
  NON_AUTHENTIFIE: 'RNI-0401',
  PARAMETRE_MANQUANT: 'RNI-1001',
  PARAMETRE_INVALIDE: 'RNI-1002',
  UTILISATEUR_INCONNU: 'RNI-1003',
  RESSOURCE_INTROUVABLE: 'RNI-1004',
  CHEVAUCHEMENT: 'RNI-1005',
  INSERTION_HORS_BORNES: 'RNI-1006',
  INSERTION_INTERDITE: 'RNI-1007',
  ACTION_NON_AUTORISEE: 'RNI-1008',
  HORS_PERIMETRE: 'RNI-1009',
  FICHE_INALTERABLE: 'RNI-1010',
  CONFIG_GEOLOC: 'RNI-2002',
  CONFIG_GEOCODEUR: 'RNI-2003',
  CONFIG_ISOCHRONE: 'RNI-2004',
  CONFIG_REMOP: 'RNI-2005',
  SERVICE_EXTERNE: 'RNI-2010',
  AUCUNE_ADRESSE: 'RNI-3001',
  AUCUNE_LIGNE_NEO: 'RNI-3002',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export type MessageType = 'ERREUR' | 'AVERTISSEMENT' | 'INFO';

export const DEFAULT_MESSAGES: Record<ErrorCode, { libelle: string; type: MessageType }> = {
  'RNI-0000': { libelle: 'Une erreur technique est survenue.', type: 'ERREUR' },
  'RNI-0001': { libelle: 'La base de données RNI est indisponible.', type: 'ERREUR' },
  'RNI-0401': { libelle: 'Utilisateur non authentifié ou non habilité à RNI.', type: 'ERREUR' },
  'RNI-1001': { libelle: 'Un paramètre obligatoire est manquant.', type: 'ERREUR' },
  'RNI-1002': { libelle: 'Un paramètre est invalide.', type: 'ERREUR' },
  'RNI-1003': { libelle: 'Utilisateur ou personnel inconnu.', type: 'ERREUR' },
  'RNI-1004': { libelle: "L'élément demandé est introuvable.", type: 'ERREUR' },
  'RNI-1005': { libelle: 'Un créneau existe déjà sur la période demandée.', type: 'AVERTISSEMENT' },
  'RNI-1006': { libelle: "L'insertion dépasse la plage du planning initial.", type: 'AVERTISSEMENT' },
  'RNI-1007': {
    libelle:
      "Insertion impossible : plage identique à l'initiale, position inchangée ou date figée du planning.",
    type: 'AVERTISSEMENT',
  },
  'RNI-1008': { libelle: "Vous n'êtes pas autorisé à effectuer cette action.", type: 'ERREUR' },
  'RNI-1009': { libelle: 'Cet élément est hors de votre périmètre.', type: 'ERREUR' },
  'RNI-1010': { libelle: 'Cette fiche est clôturée ou ne vous appartient pas.', type: 'ERREUR' },
  'RNI-2002': { libelle: 'Configuration GEOLOC absente.', type: 'ERREUR' },
  'RNI-2003': { libelle: 'Configuration du géocodeur (Facade) absente.', type: 'ERREUR' },
  'RNI-2004': { libelle: 'Configuration du calcul d’isochrones (Facade) absente.', type: 'ERREUR' },
  'RNI-2005': { libelle: 'Configuration REMOP absente.', type: 'ERREUR' },
  'RNI-2010': { libelle: 'Le service externe ne répond pas.', type: 'ERREUR' },
  'RNI-3001': { libelle: 'Aucune adresse trouvée.', type: 'AVERTISSEMENT' },
  'RNI-3002': { libelle: 'Aucune ligne NEO trouvée pour cet agent.', type: 'AVERTISSEMENT' },
};

/** Corps JSON renvoyé par l'API en cas d'erreur. */
export interface ApiError {
  code: ErrorCode | string;
  message: string;
  type: MessageType;
  details?: string;
}
