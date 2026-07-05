/**
 * flow.js — Logique de flux PURE du tableau Kanban.
 *
 * Aucune dépendance à Socket.io ni au temps réel : toutes les fonctions
 * reçoivent l'objet `partie` et l'horodatage `maintenant` en paramètres,
 * ce qui rend la logique entièrement testable (voir test/flow.test.js).
 *
 * Règles de flux selon le mode de la manche :
 *  - push (manche 1) : une carte finie est poussée automatiquement vers
 *    la colonne suivante, sans aucune limite. Le chaos est garanti.
 *  - wip  (manche 2) : idem, mais l'entrée dans une colonne pleine est
 *    refusée : la carte finie reste sur place et bloque l'amont.
 *  - pull (manche 3) : plus aucune poussée automatique. Une carte finie
 *    attend qu'un joueur de l'aval la TIRE quand il a de la capacité.
 */

import { ETATS_CARTE, MODES, RAISONS_GACHIS, STATUTS } from '../shared/constants.js';
import { CONFIG, dureeTravail, dureeVie } from '../shared/game-config.js';

// ---------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------

/** Crée l'objet `partie` vierge d'une salle. */
export function creerPartie(aleatoire = Math.random) {
  return {
    statut: STATUTS.LOBBY,
    manche: null,            // config de la manche en cours (copie modifiable)
    mancheJouee: 0,          // numéro de la dernière manche lancée (0 = aucune)
    debutManche: null,
    finManche: null,
    cartes: new Map(),       // id → carte, uniquement les cartes vivantes sur le tableau
    compteurCartes: 0,
    stats: null,             // statistiques de la manche en cours (voir metrics.js)
    historique: [],          // stats des manches terminées, pour le débrief comparatif
    aleatoire,               // injectable pour des tests déterministes
  };
}

/** Crée une carte de commande et la place dans la colonne « Commandes ». */
export function creerCarte(partie, type, expedite, maintenant, canal = 'salle') {
  partie.compteurCartes += 1;
  const carte = {
    id: `c${partie.compteurCartes}`,
    type,
    expedite,
    canal,                   // 'salle' (table du resto) ou 'livraison' (Yatta Eats)
    table: canal === 'salle'
      ? 1 + Math.floor(partie.aleatoire() * (CONFIG.canaux.salle.nbTables || 12))
      : null,
    creeLe: maintenant,
    colonne: 'commandes',
    etat: ETATS_CARTE.FINI,  // « finie » dans Commandes = prête à entrer dans le flux
    proprietaire: null,
    travailDebut: null,
    entrees: {},             // colonne → horodatage de première entrée (pour le CFD)
    sejours: {},             // colonne → temps cumulé passé (pour le cycle time)
    dernierMouvement: maintenant,
    defaut: false,           // défaut caché, révélé au contrôle qualité
    retours: 0,              // nombre de retours en arrière (rework)
  };
  enregistrerEntree(partie, carte, 'commandes', maintenant);
  partie.cartes.set(carte.id, carte);
  return carte;
}

// ---------------------------------------------------------------------------
// Aides de lecture
// ---------------------------------------------------------------------------

/** Route (liste ordonnée de colonnes) suivie par une carte selon son type. */
export function routeDe(carte) {
  return CONFIG.typesSushi[carte.type].route;
}

/** Colonne suivante sur la route de la carte, ou null si elle est au bout. */
export function colonneSuivante(carte) {
  const route = routeDe(carte);
  const i = route.indexOf(carte.colonne);
  return i >= 0 && i < route.length - 1 ? route[i + 1] : null;
}

/** Nombre de cartes présentes dans une colonne (tous états confondus). */
export function compterColonne(partie, colonne) {
  let n = 0;
  for (const carte of partie.cartes.values()) if (carte.colonne === colonne) n += 1;
  return n;
}

/** Limite WIP effective d'une colonne (null = illimité). */
export function limiteWip(partie, colonne) {
  return partie.manche?.limitesWip?.[colonne] ?? null;
}

/**
 * Une carte peut-elle entrer dans `colonne` ?
 * Les cartes expedite ignorent les limites WIP (classe de service urgente),
 * de même que le rework renvoyé par le contrôle qualité (sinon interblocage).
 */
export function peutEntrer(partie, carte, colonne, { ignorerLimite = false } = {}) {
  if (colonne === 'livre') return true;
  if (partie.manche?.mode === MODES.PUSH) return true; // manche 1 : aucune limite
  if (carte.expedite || ignorerLimite) return true;
  const limite = limiteWip(partie, colonne);
  if (limite == null) return true;
  return compterColonne(partie, colonne) < limite;
}

/** Cartes que possède un joueur (état « en cours » dans sa pile). */
export function cartesDuJoueur(partie, joueurId) {
  return [...partie.cartes.values()].filter((c) => c.proprietaire === joueurId);
}

/**
 * Une carte expedite est-elle disponible pour le poste du joueur ?
 * (dans son poste en attente, ou finie dans la colonne juste en amont)
 * Si oui, le serveur refuse la prise d'une carte normale : politique explicite
 * de la classe de service urgente.
 */
export function expediteDisponible(partie, poste) {
  for (const carte of partie.cartes.values()) {
    if (!carte.expedite) continue;
    if (carte.colonne === poste && carte.etat === ETATS_CARTE.ATTENTE) return true;
    const route = routeDe(carte);
    const i = route.indexOf(poste);
    if (i > 0 && carte.colonne === route[i - 1] && carte.etat === ETATS_CARTE.FINI) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Mouvement interne (mise à jour des traces pour les métriques)
// ---------------------------------------------------------------------------

/** Note la première entrée d'une carte dans une colonne (alimente le CFD). */
function enregistrerEntree(partie, carte, colonne, maintenant) {
  if (carte.entrees[colonne] == null) {
    carte.entrees[colonne] = maintenant;
    if (partie.stats) {
      partie.stats.cumulEntrees[colonne] = (partie.stats.cumulEntrees[colonne] || 0) + 1;
    }
  }
}

/** Ajoute le temps passé dans la colonne quittée (alimente le cycle time). */
function cloreSejour(carte, maintenant) {
  carte.sejours[carte.colonne] =
    (carte.sejours[carte.colonne] || 0) + (maintenant - carte.dernierMouvement);
}

/** Déplace physiquement la carte vers `colonne` avec l'état donné. */
function deplacer(partie, carte, colonne, etat, maintenant) {
  if (carte.colonne !== colonne) {
    cloreSejour(carte, maintenant);
    carte.colonne = colonne;
    carte.dernierMouvement = maintenant;
    enregistrerEntree(partie, carte, colonne, maintenant);
  }
  carte.etat = etat;
}

// ---------------------------------------------------------------------------
// Actions des joueurs — chaque fonction renvoie { ok, erreur?, ...infos }
// ---------------------------------------------------------------------------

/**
 * Prendre (ou tirer) une carte vers le poste du joueur.
 * Cas acceptés :
 *  1. la carte est FINIE dans la colonne juste en amont du poste → transfert + prise
 *  2. la carte est EN ATTENTE dans le poste du joueur → simple prise
 */
export function prendreCarte(partie, joueur, carteId, maintenant) {
  if (partie.statut !== STATUTS.MANCHE) return { ok: false, erreur: 'La manche n’est pas en cours.' };
  if (partie.enPause) return { ok: false, erreur: 'La manche est en pause.' };
  const carte = partie.cartes.get(carteId);
  if (!carte) return { ok: false, erreur: 'Cette carte n’existe plus.' };
  const poste = joueur.poste;
  if (!poste) return { ok: false, erreur: 'Choisissez d’abord un poste.' };

  // Limite de cartes simultanées (8 en manche 1 pour vivre le multitâche, 1 ensuite)
  const maxCartes = partie.manche.maxCartesParJoueur;
  if (cartesDuJoueur(partie, joueur.id).length >= maxCartes) {
    return { ok: false, erreur: maxCartes === 1 ? 'Une seule carte à la fois !' : 'Votre pile est pleine.' };
  }

  // Politique expedite : si une commande VIP attend au poste, elle passe d'abord
  if (!carte.expedite && expediteDisponible(partie, poste)) {
    return { ok: false, erreur: 'Une commande VIP attend : servez-la d’abord !' };
  }

  const route = routeDe(carte);
  if (!route.includes(poste)) return { ok: false, erreur: `Ce sushi ne passe pas par ce poste.` };

  if (carte.colonne === poste && carte.etat === ETATS_CARTE.ATTENTE) {
    // Cas 2 : la carte attend déjà dans le poste
    carte.etat = ETATS_CARTE.ENCOURS;
    carte.proprietaire = joueur.id;
    return { ok: true };
  }

  const iPoste = route.indexOf(poste);
  const amont = iPoste > 0 ? route[iPoste - 1] : null;
  if (carte.colonne === amont && carte.etat === ETATS_CARTE.FINI) {
    // Cas 1 : tirage depuis l'amont — l'entrée doit respecter la limite WIP
    if (!peutEntrer(partie, carte, poste)) {
      return { ok: false, erreur: 'Colonne pleine : limite WIP atteinte.' };
    }
    deplacer(partie, carte, poste, ETATS_CARTE.ENCOURS, maintenant);
    carte.proprietaire = joueur.id;
    return { ok: true };
  }

  return { ok: false, erreur: 'Cette carte n’est pas disponible pour votre poste.' };
}

/**
 * Démarrer la mini-mécanique sur une carte possédée.
 * Changer de carte active abandonne la progression de l'ancienne :
 * c'est le COÛT DU CHANGEMENT DE CONTEXTE, rendu tangible en manche 1.
 * `entraide` : true si un autre joueur occupe le même poste — le geste est
 * alors plus rapide (aider le goulot paie, mécaniquement).
 */
export function commencerTravail(partie, joueur, carteId, maintenant, entraide = false) {
  if (partie.statut !== STATUTS.MANCHE) return { ok: false, erreur: 'La manche n’est pas en cours.' };
  if (partie.enPause) return { ok: false, erreur: 'La manche est en pause.' };
  const carte = partie.cartes.get(carteId);
  if (!carte || carte.proprietaire !== joueur.id || carte.etat !== ETATS_CARTE.ENCOURS) {
    return { ok: false, erreur: 'Cette carte n’est pas dans votre pile.' };
  }
  if (joueur.carteActive && joueur.carteActive !== carteId) {
    // Abandon de la carte précédente : sa progression est perdue
    const ancienne = partie.cartes.get(joueur.carteActive);
    if (ancienne) ancienne.travailDebut = null;
  }
  joueur.carteActive = carteId;
  carte.travailDebut = maintenant;
  const duree = Math.round(
    dureeTravail(carte.type, carte.colonne, carte.expedite)
    * (entraide ? CONFIG.entraide.facteur : 1),
  );
  carte.dureePrevue = duree; // mémorisée pour la validation anti-triche
  return {
    ok: true,
    duree,
    entraide,
    // Le contrôle qualité a besoin de savoir si l'assiette est défectueuse :
    // on le transmet dans la réponse (l'état diffusé peut arriver après)
    defaut: carte.colonne === 'qualite' ? carte.defaut : undefined,
  };
}

/**
 * Terminer la mini-mécanique. Le résultat vient du client mais le serveur
 * reste autoritatif : durée minimale vérifiée, conséquences décidées ici.
 * `resultat` : { reussi: bool, accepter?: bool (contrôle qualité) }
 */
export function terminerTravail(partie, joueur, carteId, resultat, maintenant) {
  if (partie.statut !== STATUTS.MANCHE) return { ok: false, erreur: 'La manche n’est pas en cours.' };
  if (partie.enPause) return { ok: false, erreur: 'La manche est en pause.' };
  const carte = partie.cartes.get(carteId);
  if (!carte || carte.proprietaire !== joueur.id || joueur.carteActive !== carteId) {
    return { ok: false, erreur: 'Vous ne travaillez pas sur cette carte.' };
  }
  if (carte.travailDebut == null) return { ok: false, erreur: 'Le travail n’a pas commencé.' };

  // Anti-triche : impossible de finir plus vite que la mécanique ne le permet
  // (dureePrevue tient compte du bonus d'entraide accordé au démarrage)
  const dureeMin = (carte.dureePrevue ?? dureeTravail(carte.type, carte.colonne, carte.expedite))
    * CONFIG.antiTriche.ratioDureeMinimale;
  if (maintenant - carte.travailDebut < dureeMin) {
    return { ok: false, erreur: 'Trop rapide pour être honnête ! Le travail continue.' };
  }

  const poste = carte.colonne;
  // Temps réellement travaillé : la matière première de l'efficience du flux
  // (temps de travail / lead time — le reste n'est que de l'attente)
  carte.tempsTravaille = (carte.tempsTravaille || 0) + (maintenant - carte.travailDebut);
  joueur.carteActive = null;
  carte.travailDebut = null;
  carte.proprietaire = null;

  // Échec de la mini-mécanique (riz brûlé, découpe ratée…) : la carte
  // retourne en file d'attente du même poste — du temps de perdu.
  if (resultat?.reussi === false && poste !== 'qualite') {
    carte.etat = ETATS_CARTE.ATTENTE;
    carte.retours += 1;
    return { ok: true, consequence: 'echec' };
  }

  // ----- Contrôle qualité : accepter ou renvoyer -----
  if (poste === 'qualite') {
    const accepter = resultat?.accepter === true;
    if (!accepter) {
      // Renvoi à l'assemblage. Si la carte était défectueuse, elle est corrigée
      // (bonne décision) ; sinon c'est du temps perdu (fausse alerte).
      carte.retours += 1;
      carte.defaut = false;
      deplacer(partie, carte, 'assemblage', ETATS_CARTE.ATTENTE, maintenant);
      return { ok: true, consequence: 'renvoi' };
    }
    // Accepté : si le défaut est passé au travers, il éclatera à la livraison
    carte.etat = ETATS_CARTE.FINI;
  } else if (poste === 'service') {
    // Le service livre directement au client
    return livrer(partie, carte, maintenant);
  } else {
    // Postes de fabrication : petite probabilité d'introduire un défaut caché
    if (!carte.defaut && partie.aleatoire() < CONFIG.qualite.probaDefaut) {
      carte.defaut = true;
    }
    carte.etat = ETATS_CARTE.FINI;
  }

  // En flux poussé, la carte part immédiatement vers l'aval si possible.
  // En flux tiré, elle reste FINIE et attend d'être tirée.
  if (partie.manche.mode !== MODES.PULL) {
    pousserCarte(partie, carte, maintenant);
  }
  return { ok: true, consequence: 'fini' };
}

// ---------------------------------------------------------------------------
// Poussée automatique (modes push et wip)
// ---------------------------------------------------------------------------

/** Tente de pousser UNE carte finie vers sa colonne suivante. */
export function pousserCarte(partie, carte, maintenant) {
  if (carte.etat !== ETATS_CARTE.FINI) return { ok: false };
  const suivante = colonneSuivante(carte);
  if (!suivante) return { ok: false };
  if (suivante === 'livre') return { ok: false }; // seule la mécanique de service livre
  if (!peutEntrer(partie, carte, suivante)) return { ok: false, erreur: 'wip' };
  deplacer(partie, carte, suivante, ETATS_CARTE.ATTENTE, maintenant);
  return { ok: true };
}

/**
 * Appelée à chaque tick serveur en mode push/wip : pousse toutes les cartes
 * finies qui le peuvent (les plus anciennes d'abord — FIFO).
 * En mode pull, ne fait rien : c'est l'aval qui tire.
 */
export function pousserFinies(partie, maintenant) {
  if (!partie.manche || partie.manche.mode === MODES.PULL) return;
  const finies = [...partie.cartes.values()]
    .filter((c) => c.etat === ETATS_CARTE.FINI)
    .sort((a, b) => a.dernierMouvement - b.dernierMouvement);
  for (const carte of finies) pousserCarte(partie, carte, maintenant);
}

// ---------------------------------------------------------------------------
// Livraison, gâchis, péremption
// ---------------------------------------------------------------------------

/** Livre une carte au client (fin heureuse… sauf défaut passé inaperçu). */
export function livrer(partie, carte, maintenant) {
  cloreSejour(carte, maintenant);
  carte.colonne = 'livre';
  enregistrerEntree(partie, carte, 'livre', maintenant);
  partie.cartes.delete(carte.id);

  if (carte.defaut) {
    // Le contrôle qualité a laissé passer un défaut : le client refuse le plat
    partie.stats?.gachis.push({
      id: carte.id, type: carte.type, expedite: carte.expedite,
      colonne: 'livre', raison: RAISONS_GACHIS.RATE, quand: maintenant,
    });
    return { ok: true, consequence: 'rate' };
  }

  partie.stats?.livrees.push({
    id: carte.id, type: carte.type, expedite: carte.expedite, canal: carte.canal,
    creeLe: carte.creeLe, livreLe: maintenant,
    leadTime: maintenant - carte.creeLe,
    tempsTravaille: carte.tempsTravaille || 0,
    sejours: carte.sejours, retours: carte.retours,
  });
  return { ok: true, consequence: 'livre' };
}

/** Met une carte au gâchis (périmée) et la retire du tableau. */
export function gaspiller(partie, carte, raison, maintenant, joueurs = []) {
  partie.stats?.gachis.push({
    id: carte.id, type: carte.type, expedite: carte.expedite,
    colonne: carte.colonne, raison, quand: maintenant,
  });
  partie.cartes.delete(carte.id);
  // Si un joueur travaillait dessus, on libère sa main
  for (const joueur of joueurs) {
    if (joueur.carteActive === carte.id) joueur.carteActive = null;
  }
}

/** Fait périmer toutes les cartes dont la fraîcheur est tombée à zéro. */
export function perimerCartes(partie, maintenant, joueurs = []) {
  const perimees = [];
  for (const carte of [...partie.cartes.values()]) {
    if (maintenant - carte.creeLe >= dureeVie(carte.type, carte.expedite, carte.canal)) {
      gaspiller(partie, carte, RAISONS_GACHIS.PERIME, maintenant, joueurs);
      perimees.push(carte);
    }
  }
  return perimees;
}

// ---------------------------------------------------------------------------
// Départ / déplacement de joueur
// ---------------------------------------------------------------------------

/**
 * Libère les cartes d'un joueur (déconnexion ou changement de poste) :
 * elles retournent en attente, personne ne travaille plus dessus.
 */
export function libererCartesDuJoueur(partie, joueur) {
  for (const carte of cartesDuJoueur(partie, joueur.id)) {
    carte.etat = ETATS_CARTE.ATTENTE;
    carte.proprietaire = null;
    carte.travailDebut = null;
  }
  joueur.carteActive = null;
}
