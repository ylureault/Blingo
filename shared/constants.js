/**
 * Constantes structurelles du jeu — partagées entre le serveur et le client.
 * Ce fichier ne contient AUCUN réglage de difficulté : les paramètres
 * ajustables (durées, débits, limites…) vivent dans game-config.js.
 */

/** Les colonnes du tableau Kanban, dans l'ordre du flux. */
export const COLONNES = [
  { id: 'commandes',  nom: 'Commandes',        poste: false },
  { id: 'riz',        nom: 'Préparation riz',   poste: true  },
  { id: 'decoupe',    nom: 'Découpe poisson',   poste: true  },
  { id: 'assemblage', nom: 'Assemblage',        poste: true  },
  { id: 'qualite',    nom: 'Contrôle qualité',  poste: true  },
  { id: 'service',    nom: 'Service',           poste: true  },
  { id: 'livre',      nom: 'Livré',             poste: false },
];

/** Index rapide id de colonne → définition. */
export const COLONNE_PAR_ID = Object.fromEntries(COLONNES.map((c) => [c.id, c]));

/** Les colonnes où l'on travaille (les « postes »). */
export const POSTES = COLONNES.filter((c) => c.poste).map((c) => c.id);

/** Modes de flux d'une manche. */
export const MODES = {
  PUSH: 'push', // manche 1 : flux poussé, aucune limite
  WIP:  'wip',  // manche 2 : limites WIP, on pousse mais l'aval plein bloque
  PULL: 'pull', // manche 3 : flux tiré, seul l'aval déclenche le mouvement
};

/** États possibles d'une carte à l'intérieur d'une colonne. */
export const ETATS_CARTE = {
  ATTENTE: 'attente', // en file, personne ne travaille dessus
  ENCOURS: 'encours', // prise par un joueur (dans sa pile)
  FINI:    'fini',    // travail terminé, prête à passer à la colonne suivante
};

/** Statuts d'une partie. */
export const STATUTS = {
  LOBBY:   'lobby',
  MANCHE:  'manche',
  DEBRIEF: 'debrief',
  FIN:     'fin',
};

/** Raisons de gâchis. */
export const RAISONS_GACHIS = {
  PERIME: 'perime', // la fraîcheur est tombée à zéro
  RATE:   'rate',   // sushi défectueux livré au client (raté au contrôle qualité)
};

/** Avatars proposés aux joueurs (émojis système, rien à télécharger). */
export const AVATARS = ['🍣', '🍙', '🍤', '🍱', '🥢', '🐟', '🦐', '🍜', '🍶', '🐙', '🥑', '🌊'];

/**
 * Noms des événements Socket.io.
 * Convention : c2s = client → serveur, s2c = serveur → client.
 */
export const EVT = {
  // Client → serveur (toutes les réponses passent par le callback d'accusé de réception)
  CREER_SALLE:       'c2s:creerSalle',
  REJOINDRE_SALLE:   'c2s:rejoindreSalle',
  CHOISIR_POSTE:     'c2s:choisirPoste',
  PRENDRE_CARTE:     'c2s:prendreCarte',
  COMMENCER_TRAVAIL: 'c2s:commencerTravail',
  TERMINER_TRAVAIL:  'c2s:terminerTravail',
  // Actions réservées au facilitateur
  FACIL_DEMARRER:    'c2s:facil:demarrerManche',
  FACIL_ARRETER:     'c2s:facil:arreterManche',
  FACIL_WIP:         'c2s:facil:reglerWip',
  FACIL_DEBIT:       'c2s:facil:reglerDebit',
  FACIL_EXPEDITE:    'c2s:facil:injecterExpedite',
  // Serveur → client
  ETAT:              's2c:etat',      // état complet de la salle (autoritatif)
  EVENEMENT:         's2c:evenement', // notification ponctuelle (toast + son)
  SALLE_FERMEE:      's2c:salleFermee',
};
