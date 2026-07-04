/**
 * game.js — Orchestration d'une partie : manches, tick serveur, spawn des
 * commandes, péremption, échantillonnage du CFD et fin de manche.
 *
 * Le temps (`maintenant`) est passé en paramètre partout : la logique reste
 * testable sans horloge réelle.
 */

import { MODES, STATUTS } from '../shared/constants.js';
import { CONFIG, tirerTypeSushi, tirerCanal } from '../shared/game-config.js';
import {
  creerCarte, perimerCartes, pousserFinies, libererCartesDuJoueur,
} from './flow.js';
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
  partie.debutManche = maintenant;
  partie.finManche = maintenant + partie.manche.duree;
  partie.cartes.clear();
  partie.stats = creerStats(numero, partie.manche.mode, maintenant);

  // Tout le monde repart les mains vides
  for (const joueur of salle.joueurs.values()) libererCartesDuJoueur(partie, joueur);

  salle.prochaineCommande = maintenant + 1500; // première commande presque immédiate
  salle.dernierCFD = 0;
  salle.goulot = null;
  echantillonnerCFD(partie.stats, maintenant); // point (0,0) du diagramme
  return { ok: true };
}

/** Termine la manche en cours et bascule sur l'écran de débrief. */
export function arreterManche(salle, maintenant) {
  const { partie } = salle;
  if (partie.statut !== STATUTS.MANCHE) return { ok: false, erreur: 'Aucune manche en cours.' };
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
  if (partie.statut !== STATUTS.MANCHE) return evenements;

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

  // 4. Échantillon du diagramme de flux cumulé
  if (maintenant - salle.dernierCFD >= CONFIG.moteur.periodeCFD) {
    echantillonnerCFD(partie.stats, maintenant);
    salle.dernierCFD = maintenant;
  }

  // 5. Détection du goulot (affichée au facilitateur uniquement)
  salle.goulot = detecterGoulot(partie.cartes, maintenant);

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
    goulot: salle.goulot,             // le client ne l'affiche qu'au facilitateur
    reglages: salle.reglages,
    joueurs: [...salle.joueurs.values()].map((j) => ({
      id: j.id, pseudo: j.pseudo, avatar: j.avatar, poste: j.poste,
      carteActive: j.carteActive, connecte: j.connecte,
      estFacilitateur: j.id === salle.facilitateurId,
    })),
    manche: partie.manche && {
      numero: partie.manche.numero,
      titre: partie.manche.titre,
      mode: partie.manche.mode,
      finA: partie.finManche,
      limitesWip: partie.manche.limitesWip,
      expediteActives: partie.manche.expediteActives,
      maxCartesParJoueur: partie.manche.maxCartesParJoueur,
    },
    cartes: [...partie.cartes.values()].map((c) => ({
      id: c.id, type: c.type, expedite: c.expedite, creeLe: c.creeLe,
      canal: c.canal, table: c.table,
      colonne: c.colonne, etat: c.etat, proprietaire: c.proprietaire,
      travailDebut: c.travailDebut, retours: c.retours,
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
