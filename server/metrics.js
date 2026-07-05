/**
 * metrics.js — Calcul des métriques de flux, en fonctions PURES.
 *
 * Le serveur alimente `stats` en continu pendant la manche ; ces fonctions
 * ne font que lire. Testées dans test/metrics.test.js.
 */

import { COLONNES, ETATS_CARTE } from '../shared/constants.js';

/** Crée l'objet de statistiques vierge d'une manche. */
export function creerStats(numeroManche, mode, maintenant) {
  return {
    numero: numeroManche,
    mode,
    debut: maintenant,
    fin: null,
    livrees: [],       // { id, type, leadTime, livreLe, sejours, retours, expedite }
    gachis: [],        // { id, type, colonne, raison, quand }
    cumulEntrees: {},  // colonne → nombre cumulé de cartes entrées (base du CFD)
    cfd: [],           // échantillons { t, cumuls: { colonne: n } }
  };
}

/** Débit : sushis livrés par minute sur la durée écoulée de la manche. */
export function throughputParMinute(stats, maintenant) {
  const duree = (stats.fin ?? maintenant) - stats.debut;
  if (duree <= 0) return 0;
  return stats.livrees.length / (duree / 60_000);
}

/** Statistiques de lead time : moyenne, médiane, max et distribution. */
export function statsLeadTime(livrees) {
  if (livrees.length === 0) return { moyenne: 0, mediane: 0, max: 0, valeurs: [] };
  const valeurs = livrees.map((l) => l.leadTime).sort((a, b) => a - b);
  const somme = valeurs.reduce((s, v) => s + v, 0);
  const milieu = Math.floor(valeurs.length / 2);
  const mediane = valeurs.length % 2 === 1
    ? valeurs[milieu]
    : (valeurs[milieu - 1] + valeurs[milieu]) / 2;
  return {
    moyenne: somme / valeurs.length,
    mediane,
    max: valeurs[valeurs.length - 1],
    min: valeurs[0],
    // p85 : la métrique de prévisibilité Kanban — « 85 % de nos sushis
    // sortent en moins de X » vaut mieux qu'une moyenne qui ment
    p85: valeurs[Math.min(valeurs.length - 1, Math.ceil(valeurs.length * 0.85) - 1)],
    valeurs,
  };
}

/**
 * Efficience du flux : part du lead time réellement passée à travailler.
 * Typiquement 5 à 15 % dans la vraie vie — le reste n'est que de l'attente.
 */
export function efficienceFlux(livrees) {
  const valides = livrees.filter((l) => l.leadTime > 0);
  if (valides.length === 0) return 0;
  const somme = valides.reduce((s, l) => s + Math.min(1, (l.tempsTravaille || 0) / l.leadTime), 0);
  return somme / valides.length;
}

/**
 * Cycle time moyen par colonne, à partir des séjours des cartes livrées.
 * Renvoie { colonne: msMoyennes } pour chaque colonne traversée.
 */
export function cycleTimeParColonne(livrees) {
  const totaux = {};
  const comptes = {};
  for (const carte of livrees) {
    for (const [colonne, ms] of Object.entries(carte.sejours || {})) {
      totaux[colonne] = (totaux[colonne] || 0) + ms;
      comptes[colonne] = (comptes[colonne] || 0) + 1;
    }
  }
  const resultat = {};
  for (const colonne of Object.keys(totaux)) {
    resultat[colonne] = totaux[colonne] / comptes[colonne];
  }
  return resultat;
}

/** WIP instantané : nombre de cartes par colonne. */
export function wipParColonne(cartes) {
  const wip = {};
  for (const { id } of COLONNES) wip[id] = 0;
  for (const carte of cartes.values()) {
    wip[carte.colonne] = (wip[carte.colonne] || 0) + 1;
  }
  return wip;
}

/**
 * Prend un échantillon pour le diagramme de flux cumulé.
 * Chaque courbe du CFD = nombre cumulé de cartes AYANT ATTEINT la colonne.
 * L'écart vertical entre deux courbes = WIP ; l'écart horizontal ≈ lead time.
 */
export function echantillonnerCFD(stats, maintenant) {
  const cumuls = {};
  for (const { id } of COLONNES) cumuls[id] = stats.cumulEntrees[id] || 0;
  stats.cfd.push({ t: maintenant - stats.debut, cumuls });
}

/**
 * Détecte le goulot d'étranglement : la colonne-poste dont les cartes en
 * attente cumulent le plus de temps d'attente. Visible du facilitateur
 * uniquement (aide d'animation, pas un spoiler pour les joueurs).
 * Renvoie null si aucune attente significative.
 */
export function detecterGoulot(cartes, maintenant, seuilMs = 8000) {
  const attentes = {};
  for (const carte of cartes.values()) {
    if (carte.etat === ETATS_CARTE.ENCOURS) continue;
    if (carte.colonne === 'commandes' || carte.colonne === 'livre') continue;
    attentes[carte.colonne] = (attentes[carte.colonne] || 0) + (maintenant - carte.dernierMouvement);
  }
  let pire = null;
  let max = seuilMs; // en dessous du seuil, pas de goulot à signaler
  for (const [colonne, total] of Object.entries(attentes)) {
    if (total > max) { max = total; pire = colonne; }
  }
  return pire;
}

/**
 * Résumé complet d'une manche pour l'écran de débrief.
 * C'est ce paquet qui est comparé côte à côte entre les manches.
 */
export function resumerManche(stats, maintenant) {
  const lead = statsLeadTime(stats.livrees);
  return {
    numero: stats.numero,
    mode: stats.mode,
    duree: (stats.fin ?? maintenant) - stats.debut,
    livres: stats.livrees.length,
    throughput: throughputParMinute(stats, maintenant),
    leadTimeMoyen: lead.moyenne,
    leadTimeMediane: lead.mediane,
    leadTimeMax: lead.max,
    leadTimeMin: lead.min ?? 0,
    leadTimeP85: lead.p85 ?? 0,
    leadTimes: lead.valeurs,
    efficience: efficienceFlux(stats.livrees),
    retoursTotal: stats.livrees.reduce((s, l) => s + (l.retours || 0), 0),
    gachisPerimes: stats.gachis.filter((g) => g.raison === 'perime').length,
    gachisRates: stats.gachis.filter((g) => g.raison === 'rate').length,
    // Répartition par canal : la salle et la livraison ne vivent pas le même SLA
    livresSalle: stats.livrees.filter((l) => l.canal !== 'livraison').length,
    livresLivraison: stats.livrees.filter((l) => l.canal === 'livraison').length,
    cycleTimes: cycleTimeParColonne(stats.livrees),
    cfd: stats.cfd,
  };
}
