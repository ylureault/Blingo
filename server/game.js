/**
 * game.js — Orchestration d'une partie : manches, tick serveur, spawn des
 * commandes, péremption, échantillonnage du CFD et fin de manche.
 *
 * Le temps (`maintenant`) est passé en paramètre partout : la logique reste
 * testable sans horloge réelle.
 */

import { ETATS_CARTE, MODES, POSTES, STATUTS } from '../shared/constants.js';
import { CONFIG, tirerTypeSushi, tirerCanal } from '../shared/game-config.js';
import {
  creerCarte, perimerCartes, pousserFinies, libererCartesDuJoueur,
  prendreCarte, commencerTravail, terminerTravail, routeDe,
} from './flow.js';
import { creerBot } from './rooms.js';
import {
  creerStats, echantillonnerCFD, detecterGoulot, resumerManche,
  wipParColonne, throughputParMinute,
} from './metrics.js';

// ---------------------------------------------------------------------------
// Cycle de vie des manches
// ---------------------------------------------------------------------------

/**
 * Démarre la manche `numero` (1 à 3). Le tableau est vidé, les statistiques
 * repartent de zéro, la configuration de la manche est copiée (le
 * facilitateur peut la modifier en direct sans toucher au fichier de config).
 */
export function demarrerManche(salle, numero, maintenant) {
  const modele = CONFIG.manches[numero - 1];
  if (!modele) return { ok: false, erreur: 'Numéro de manche invalide.' };
  const { partie } = salle;
  if (partie.statut === STATUTS.MANCHE) return { ok: false, erreur: 'Une manche est déjà en cours.' };

  partie.manche = {
    ...modele,
    // Copie défensive des limites : le facilitateur les modifie en direct
    limitesWip: modele.limitesWip ? { ...modele.limitesWip } : null,
  };
  partie.mancheJouee = numero;
  partie.statut = STATUTS.MANCHE;
  partie.enPause = null;
  partie.debutManche = maintenant;
  partie.finManche = maintenant + partie.manche.duree;
  partie.cartes.clear();
  partie.stats = creerStats(numero, partie.manche.mode, maintenant);

  // Tout le monde repart les mains vides
  for (const joueur of salle.joueurs.values()) libererCartesDuJoueur(partie, joueur);

  // Rôles prédéfinis : chaque humain reçoit un poste selon la taille de
  // l'équipe (l'ordre d'arrivée fait foi). On démarre organisé — et les
  // postes vides sont la première question du débrief.
  const humains = [...salle.joueurs.values()].filter((j) => j.connecte && !j.estBot);
  const repartition = CONFIG.roles.repartition[Math.min(humains.length, 8)] || [];
  humains.forEach((joueur, i) => {
    joueur.poste = repartition[i] || null;
    joueur.enDeplacementJusqua = 0; // pas de délai sur l'affectation initiale
  });

  salle.prochaineCommande = maintenant + 1500; // première commande presque immédiate
  salle.dernierCFD = 0;
  salle.goulot = null;
  partie.evenement = null;
  // Les événements aléatoires n'arrivent qu'à partir de la manche configurée
  salle.prochainEvenement = (CONFIG.evenements.actifs && numero >= CONFIG.evenements.aPartirDeManche)
    ? maintenant + CONFIG.evenements.premierApres
    : Infinity;
  echantillonnerCFD(partie.stats, maintenant); // point (0,0) du diagramme
  return { ok: true };
}

/**
 * Met la manche en pause : plus rien ne bouge, ni le chrono, ni le spawn,
 * ni la fraîcheur. À la reprise, toutes les horloges sont décalées de la
 * durée de la pause — comme si elle n'avait jamais existé.
 */
export function pauserManche(salle, maintenant) {
  const { partie } = salle;
  if (partie.statut !== STATUTS.MANCHE) return { ok: false, erreur: 'Aucune manche en cours.' };
  if (partie.enPause) return { ok: false, erreur: 'La manche est déjà en pause.' };
  partie.enPause = maintenant;
  return { ok: true };
}

/** Reprend la manche après une pause (décale toutes les horloges). */
export function reprendreManche(salle, maintenant) {
  const { partie } = salle;
  if (!partie.enPause) return { ok: false, erreur: 'La manche n’est pas en pause.' };
  const delta = maintenant - partie.enPause;
  partie.finManche += delta;
  partie.debutManche += delta;
  partie.stats.debut += delta;
  salle.prochaineCommande += delta;
  salle.dernierCFD += delta;
  for (const carte of partie.cartes.values()) {
    carte.creeLe += delta;
    carte.dernierMouvement += delta;
    if (carte.travailDebut != null) carte.travailDebut += delta;
  }
  partie.enPause = null;
  return { ok: true };
}

/** Prolonge la manche en cours (le débrief attendra une minute de plus). */
export function prolongerManche(salle, duree = CONFIG.affichage.prolongationManche) {
  const { partie } = salle;
  if (partie.statut !== STATUTS.MANCHE) return { ok: false, erreur: 'Aucune manche en cours.' };
  partie.finManche += duree;
  return { ok: true, duree };
}

/**
 * Vide la colonne Commandes (soupape de secours si le facilitateur a
 * laissé le débit trop haut). Les cartes retirées ne comptent pas au gâchis.
 */
export function viderCommandes(salle) {
  const { partie } = salle;
  let retirees = 0;
  for (const carte of [...partie.cartes.values()]) {
    if (carte.colonne === 'commandes') { partie.cartes.delete(carte.id); retirees += 1; }
  }
  return { ok: true, retirees };
}

/** Transfère le rôle de facilitateur à un autre joueur connecté (humain !). */
export function transfererRole(salle, joueurId) {
  const cible = salle.joueurs.get(joueurId);
  if (!cible || !cible.connecte) return { ok: false, erreur: 'Ce joueur n’est pas connecté.' };
  if (cible.estBot) return { ok: false, erreur: 'Un commis ne peut pas faciliter l’atelier !' };
  for (const j of salle.joueurs.values()) j.estFacilitateur = false;
  cible.estFacilitateur = true;
  salle.facilitateurId = cible.id;
  return { ok: true, pseudo: cible.pseudo };
}

/** Termine la manche en cours et bascule sur l'écran de débrief. */
export function arreterManche(salle, maintenant) {
  const { partie } = salle;
  if (partie.statut !== STATUTS.MANCHE) return { ok: false, erreur: 'Aucune manche en cours.' };
  if (partie.enPause) reprendreManche(salle, maintenant); // on solde la pause avant les stats
  partie.stats.fin = maintenant;
  echantillonnerCFD(partie.stats, maintenant); // dernier point du CFD
  partie.historique.push(resumerManche(partie.stats, maintenant));
  partie.statut = partie.mancheJouee >= CONFIG.manches.length ? STATUTS.FIN : STATUTS.DEBRIEF;
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Tick serveur
// ---------------------------------------------------------------------------

/**
 * Avance la simulation d'une salle. Appelée toutes les `periodeTick` ms.
 * Renvoie la liste des événements notables (pour les sons et les toasts).
 */
export function tick(salle, maintenant) {
  const { partie } = salle;
  const evenements = [];
  if (partie.statut !== STATUTS.MANCHE || partie.enPause) return evenements;

  // 1. Arrivée des commandes : la salle et les scooters Yatta Eats
  if (maintenant >= salle.prochaineCommande) {
    const type = tirerTypeSushi(partie.aleatoire);
    const canal = tirerCanal(partie.aleatoire);
    creerCarte(partie, type, false, maintenant, canal);
    salle.prochaineCommande = maintenant + prochainIntervalle(salle);
    evenements.push({ type: 'commande', canal });
  }

  // 2. Péremption : la fraîcheur matérialise le lead time
  const joueurs = [...salle.joueurs.values()];
  const perimees = perimerCartes(partie, maintenant, joueurs);
  if (perimees.length > 0) {
    evenements.push({ type: 'perime', nombre: perimees.length, colonnes: perimees.map((c) => c.colonne) });
  }

  // 3. Flux poussé : les cartes finies avancent seules (sauf en mode pull)
  pousserFinies(partie, maintenant);

  // 3 bis. Les commis 🤖 travaillent (mêmes règles que les humains)
  tickCommis(salle, maintenant);

  // 4. Échantillon du diagramme de flux cumulé
  if (maintenant - salle.dernierCFD >= CONFIG.moteur.periodeCFD) {
    echantillonnerCFD(partie.stats, maintenant);
    salle.dernierCFD = maintenant;
  }

  // 5. Détection du goulot (affichée au facilitateur uniquement)
  salle.goulot = detecterGoulot(partie.cartes, maintenant);

  // 5 bis. Événements aléatoires de cuisine : la variabilité incarnée
  if (partie.evenement && maintenant >= partie.evenement.finA) {
    partie.evenement = null;
    evenements.push({ type: 'finEvenementCuisine' });
  }
  if (!partie.evenement && maintenant >= salle.prochainEvenement) {
    const declenche = declencherEvenement(salle, maintenant);
    if (declenche) evenements.push({ type: 'evenementCuisine', evenement: declenche });
  }

  // 6. Fin de manche au chrono
  if (maintenant >= partie.finManche) {
    arreterManche(salle, maintenant);
    evenements.push({ type: 'finManche' });
  }
  return evenements;
}

/** Intervalle avant la prochaine commande : débit réglable + aléa ±30 %. */
function prochainIntervalle(salle) {
  const base = salle.partie.manche.intervalleCommandes / salle.reglages.debit;
  const variation = CONFIG.commandes.variationIntervalle;
  const alea = 1 + (salle.partie.aleatoire() * 2 - 1) * variation;
  return Math.round(base * alea);
}

// ---------------------------------------------------------------------------
// Événements aléatoires de cuisine
// ---------------------------------------------------------------------------

/**
 * Déclenche un événement (tiré au sort selon les poids, ou forcé).
 * Les événements instantanés (rush, critique) agissent tout de suite ;
 * les autres posent un effet temporaire que flow.js fait respecter.
 */
export function declencherEvenement(salle, maintenant, typeForce = null) {
  const { partie } = salle;
  if (partie.statut !== STATUTS.MANCHE) return null;

  const types = Object.entries(CONFIG.evenements.liste);
  let type = typeForce;
  if (!type) {
    const total = types.reduce((s, [, e]) => s + e.poids, 0);
    let seuil = partie.aleatoire() * total;
    for (const [id, e] of types) { seuil -= e.poids; if (seuil <= 0) { type = id; break; } }
  }
  const def = CONFIG.evenements.liste[type];
  if (!def) return null;

  // Prochain tirage programmé dans la foulée
  const { intervalleMin, intervalleMax } = CONFIG.evenements;
  salle.prochainEvenement = maintenant + intervalleMin
    + partie.aleatoire() * (intervalleMax - intervalleMin);

  // Effets instantanés
  if (type === 'rush') {
    for (let i = 0; i < 3; i += 1) {
      creerCarte(partie, tirerTypeSushi(partie.aleatoire), false, maintenant, tirerCanal(partie.aleatoire));
    }
    return { type, finA: maintenant };
  }
  if (type === 'critique') {
    creerCarte(partie, tirerTypeSushi(partie.aleatoire), true, maintenant, 'salle');
    return { type, finA: maintenant };
  }

  // Effets à durée : mémorisés sur la partie, appliqués par flow.js
  partie.evenement = { type, finA: maintenant + def.duree };
  return partie.evenement;
}

// ---------------------------------------------------------------------------
// Commis virtuels 🤖 — le mode solo (et le renfort des petites équipes)
// ---------------------------------------------------------------------------

/** Ajoute un commis, affecté au poste le moins couvert. */
export function ajouterCommis(salle) {
  const bots = [...salle.joueurs.values()].filter((j) => j.estBot);
  if (bots.length >= CONFIG.commis.max) {
    return { ok: false, erreur: `${CONFIG.commis.max} commis maximum : la cuisine est petite !` };
  }
  // Poste le moins occupé (humains + commis confondus)
  const couverture = Object.fromEntries(POSTES.map((p) => [p, 0]));
  for (const j of salle.joueurs.values()) {
    if (j.connecte && j.poste) couverture[j.poste] = (couverture[j.poste] || 0) + 1;
  }
  const poste = POSTES.reduce((min, p) => (couverture[p] < couverture[min] ? p : min), POSTES[0]);
  const bot = creerBot(bots.length + 1, poste);
  salle.joueurs.set(bot.id, bot);
  return { ok: true, pseudo: bot.pseudo, poste };
}

/** Retire le dernier commis ajouté (ses cartes retournent en file). */
export function retirerCommis(salle) {
  const bots = [...salle.joueurs.values()].filter((j) => j.estBot);
  const dernier = bots[bots.length - 1];
  if (!dernier) return { ok: false, erreur: 'Aucun commis en cuisine.' };
  libererCartesDuJoueur(salle.partie, dernier);
  salle.joueurs.delete(dernier.id);
  return { ok: true, pseudo: dernier.pseudo };
}

/**
 * Fait vivre les commis à chaque tick : prendre une carte, la travailler
 * (plus lentement qu'un humain), la finir — et, s'ils s'ennuient, aller
 * spontanément aider le poste qui déborde. Ils passent par les MÊMES
 * fonctions de flux que les joueurs : aucune triche possible.
 */
function tickCommis(salle, maintenant) {
  const { partie } = salle;
  for (const bot of salle.joueurs.values()) {
    if (!bot.estBot) continue;

    // 1. Un geste en cours ? On le termine quand le temps (ralenti) est écoulé.
    if (bot.carteActive) {
      const carte = partie.cartes.get(bot.carteActive);
      if (!carte) { bot.carteActive = null; continue; }
      const dureeBot = (carte.dureePrevue || 3000) * CONFIG.commis.facteurLenteur;
      if (carte.travailDebut != null && maintenant - carte.travailDebut >= dureeBot) {
        const resultat = { reussi: true };
        if (carte.colonne === 'qualite') {
          // Un commis n'a pas l'œil du chef : il rate 30 % des défauts
          const detecte = carte.defaut && partie.aleatoire() < CONFIG.commis.tauxDetectionDefaut;
          resultat.accepter = !detecte;
        }
        terminerTravail(partie, bot, bot.carteActive, resultat, maintenant);
        bot.inactifDepuis = maintenant;
      }
      continue;
    }

    // 2. Chercher du travail à son poste (VIP d'abord, puis les plus anciennes)
    const candidates = [...partie.cartes.values()]
      .filter((c) => !c.proprietaire)
      .sort((a, b) => (b.expedite - a.expedite) || (a.creeLe - b.creeLe));
    let servi = false;
    for (const carte of candidates) {
      if (prendreCarte(partie, bot, carte.id, maintenant).ok) {
        const entraide = [...salle.joueurs.values()]
          .some((j) => j.id !== bot.id && j.connecte && j.poste === bot.poste);
        commencerTravail(partie, bot, carte.id, maintenant, entraide);
        bot.inactifDepuis = maintenant;
        servi = true;
        break;
      }
    }

    // 3. Rien à faire ici depuis un moment ? Le commis va aider le goulot.
    if (!servi && maintenant - (bot.inactifDepuis || 0) > CONFIG.commis.delaiReaffectation) {
      const meilleur = posteLePlusCharge(partie, bot.poste);
      if (meilleur && meilleur !== bot.poste) {
        bot.poste = meilleur;
        bot.inactifDepuis = maintenant;
      }
    }
  }
}

/** Poste avec le plus de travail disponible (en attente ou tirable de l'amont). */
function posteLePlusCharge(partie, posteActuel) {
  const charge = Object.fromEntries(POSTES.map((p) => [p, 0]));
  for (const carte of partie.cartes.values()) {
    if (carte.proprietaire) continue;
    if (POSTES.includes(carte.colonne) && carte.etat === ETATS_CARTE.ATTENTE) {
      charge[carte.colonne] += 1;
    } else if (carte.etat === ETATS_CARTE.FINI) {
      // Une carte finie profite au poste suivant sur sa route
      const route = routeDe(carte);
      const suivante = route[route.indexOf(carte.colonne) + 1];
      if (POSTES.includes(suivante)) charge[suivante] += 1;
    }
  }
  const meilleur = POSTES.reduce((max, p) => (charge[p] > charge[max] ? p : max), POSTES[0]);
  return charge[meilleur] > 0 ? meilleur : posteActuel;
}

// ---------------------------------------------------------------------------
// Actions du facilitateur
// ---------------------------------------------------------------------------

/** Modifie une limite WIP en direct (null ou 0 = illimité). */
export function reglerWip(salle, colonne, limite) {
  const { partie } = salle;
  if (!partie.manche) return { ok: false, erreur: 'Aucune manche configurée.' };
  if (partie.manche.mode === MODES.PUSH) {
    return { ok: false, erreur: 'Pas de limites WIP en manche 1 : c’est le chaos voulu !' };
  }
  if (!partie.manche.limitesWip) partie.manche.limitesWip = {};
  const valeur = Number(limite);
  if (!Number.isFinite(valeur) || valeur <= 0) delete partie.manche.limitesWip[colonne];
  else partie.manche.limitesWip[colonne] = Math.min(20, Math.round(valeur));
  return { ok: true };
}

/** Règle le multiplicateur de débit d'arrivée des commandes. */
export function reglerDebit(salle, debit) {
  const valeur = Number(debit);
  const { debitMin, debitMax } = CONFIG.commandes;
  if (!Number.isFinite(valeur)) return { ok: false, erreur: 'Débit invalide.' };
  salle.reglages.debit = Math.min(debitMax, Math.max(debitMin, valeur));
  return { ok: true };
}

/** Injecte une commande expedite (client VIP) dans le flux. */
export function injecterExpedite(salle, maintenant) {
  const { partie } = salle;
  if (partie.statut !== STATUTS.MANCHE) return { ok: false, erreur: 'Aucune manche en cours.' };
  if (!partie.manche.expediteActives) {
    return { ok: false, erreur: 'Les commandes VIP ne sont actives qu’en manche 3.' };
  }
  const type = tirerTypeSushi(partie.aleatoire);
  creerCarte(partie, type, true, maintenant, 'salle'); // le VIP est à table, il regarde
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Sérialisation de l'état pour les clients
// ---------------------------------------------------------------------------

/**
 * Construit l'instantané JSON envoyé à tous les clients de la salle.
 * C'est la SEULE source de vérité : le client ne fait que l'afficher
 * (avec un peu d'optimisme local, réconcilié à chaque diffusion).
 */
export function serialiserEtat(salle, maintenant = Date.now()) {
  const { partie } = salle;
  return {
    code: salle.code,
    maintenant,                       // pour synchroniser l'horloge du client
    statut: partie.statut,
    facilitateurId: salle.facilitateurId,
    evenement: (partie.evenement && partie.evenement.finA > maintenant) ? partie.evenement : null,
    goulot: salle.goulot,             // le client ne l'affiche qu'au facilitateur
    reglages: salle.reglages,
    joueurs: [...salle.joueurs.values()].map((j) => ({
      id: j.id, pseudo: j.pseudo, avatar: j.avatar, poste: j.poste,
      carteActive: j.carteActive, connecte: j.connecte,
      estFacilitateur: j.id === salle.facilitateurId,
      estBot: !!j.estBot,
      enDeplacementJusqua: j.enDeplacementJusqua || 0,
    })),
    manche: partie.manche && {
      numero: partie.manche.numero,
      titre: partie.manche.titre,
      mode: partie.manche.mode,
      finA: partie.finManche,
      enPause: !!partie.enPause,
      limitesWip: partie.manche.limitesWip,
      expediteActives: partie.manche.expediteActives,
      maxCartesParJoueur: partie.manche.maxCartesParJoueur,
    },
    cartes: [...partie.cartes.values()].map((c) => ({
      id: c.id, type: c.type, expedite: c.expedite, creeLe: c.creeLe,
      canal: c.canal, table: c.table,
      colonne: c.colonne, etat: c.etat, proprietaire: c.proprietaire,
      travailDebut: c.travailDebut, retours: c.retours,
      dernierMouvement: c.dernierMouvement, // pour le sablier ⏳ des cartes bloquées
      // Le défaut n'est révélé qu'au moment du contrôle qualité
      defaut: c.colonne === 'qualite' ? c.defaut : undefined,
    })),
    statsLive: partie.stats && {
      livres: partie.stats.livrees.length,
      gachis: partie.stats.gachis.length,
      throughput: throughputParMinute(partie.stats, maintenant),
      // Lead time moyen en direct : la pression du temps, chiffrée
      leadTimeMoyen: partie.stats.livrees.length
        ? partie.stats.livrees.reduce((s, l) => s + l.leadTime, 0) / partie.stats.livrees.length
        : 0,
      wip: wipParColonne(partie.cartes),
      cfd: partie.stats.cfd,
    },
    historique: partie.historique,
  };
}
