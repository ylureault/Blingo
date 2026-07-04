/**
 * Tests des métriques de flux : lead time, throughput, cycle time, CFD,
 * détection du goulot, et machine à états des manches (game.js).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUTS, ETATS_CARTE } from '../shared/constants.js';
import { CONFIG } from '../shared/game-config.js';
import {
  creerStats, statsLeadTime, throughputParMinute, cycleTimeParColonne,
  echantillonnerCFD, detecterGoulot, resumerManche, wipParColonne,
} from '../server/metrics.js';
import { creerPartie, creerCarte } from '../server/flow.js';
import { demarrerManche, arreterManche, tick, reglerWip, reglerDebit } from '../server/game.js';

// ---------------------------------------------------------------------------
// Lead time
// ---------------------------------------------------------------------------

test('lead time : moyenne, médiane et max', () => {
  const livrees = [{ leadTime: 1000 }, { leadTime: 3000 }, { leadTime: 8000 }];
  const s = statsLeadTime(livrees);
  assert.equal(s.moyenne, 4000);
  assert.equal(s.mediane, 3000);
  assert.equal(s.max, 8000);
});

test('lead time : médiane sur un nombre pair de valeurs', () => {
  const s = statsLeadTime([{ leadTime: 1000 }, { leadTime: 2000 }, { leadTime: 4000 }, { leadTime: 9000 }]);
  assert.equal(s.mediane, 3000);
});

test('lead time : liste vide → zéros, pas de division par zéro', () => {
  const s = statsLeadTime([]);
  assert.equal(s.moyenne, 0);
  assert.equal(s.max, 0);
});

// ---------------------------------------------------------------------------
// Throughput
// ---------------------------------------------------------------------------

test('throughput : 6 sushis en 3 minutes = 2 par minute', () => {
  const stats = creerStats(1, 'push', 0);
  for (let i = 0; i < 6; i += 1) stats.livrees.push({ leadTime: 1000 });
  assert.equal(throughputParMinute(stats, 180_000), 2);
});

test('throughput : figé une fois la manche terminée', () => {
  const stats = creerStats(1, 'push', 0);
  stats.livrees.push({ leadTime: 1000 });
  stats.fin = 60_000;
  // Même consulté bien plus tard, le calcul se base sur la durée réelle
  assert.equal(throughputParMinute(stats, 999_999), 1);
});

// ---------------------------------------------------------------------------
// Cycle time
// ---------------------------------------------------------------------------

test('cycle time moyen par colonne à partir des séjours', () => {
  const livrees = [
    { sejours: { riz: 2000, decoupe: 4000 } },
    { sejours: { riz: 4000 } },
  ];
  const ct = cycleTimeParColonne(livrees);
  assert.equal(ct.riz, 3000);
  assert.equal(ct.decoupe, 4000);
});

// ---------------------------------------------------------------------------
// CFD
// ---------------------------------------------------------------------------

test('le CFD échantillonne des cumuls croissants par colonne', () => {
  const partie = creerPartie(() => 0.5);
  partie.stats = creerStats(1, 'push', 0);
  echantillonnerCFD(partie.stats, 0);
  creerCarte(partie, 'maki', false, 1000);
  creerCarte(partie, 'maki', false, 2000);
  echantillonnerCFD(partie.stats, 2000);
  const [avant, apres] = partie.stats.cfd;
  assert.equal(avant.cumuls.commandes, 0);
  assert.equal(apres.cumuls.commandes, 2);
  assert.equal(apres.t, 2000);
  // Les cumuls ne redescendent jamais : c'est la définition d'un CFD
  assert.ok(apres.cumuls.commandes >= avant.cumuls.commandes);
});

// ---------------------------------------------------------------------------
// WIP et goulot
// ---------------------------------------------------------------------------

test('WIP instantané par colonne', () => {
  const partie = creerPartie(() => 0.5);
  partie.stats = creerStats(1, 'push', 0);
  creerCarte(partie, 'maki', false, 0);
  const c = creerCarte(partie, 'maki', false, 0);
  c.colonne = 'riz';
  const wip = wipParColonne(partie.cartes);
  assert.equal(wip.commandes, 1);
  assert.equal(wip.riz, 1);
  assert.equal(wip.service, 0);
});

test('le goulot est la colonne où l’attente cumulée est la plus longue', () => {
  const partie = creerPartie(() => 0.5);
  partie.stats = creerStats(1, 'push', 0);
  const a = creerCarte(partie, 'maki', false, 0);
  a.colonne = 'assemblage'; a.etat = ETATS_CARTE.ATTENTE; a.dernierMouvement = 0;
  const b = creerCarte(partie, 'maki', false, 0);
  b.colonne = 'riz'; b.etat = ETATS_CARTE.ATTENTE; b.dernierMouvement = 25_000;
  assert.equal(detecterGoulot(partie.cartes, 30_000), 'assemblage');
});

test('pas de goulot signalé sous le seuil d’attente', () => {
  const partie = creerPartie(() => 0.5);
  const c = creerCarte(partie, 'maki', false, 0);
  c.colonne = 'riz'; c.etat = ETATS_CARTE.ATTENTE; c.dernierMouvement = 0;
  assert.equal(detecterGoulot(partie.cartes, 2000), null);
});

// ---------------------------------------------------------------------------
// Machine à états des manches (game.js)
// ---------------------------------------------------------------------------

/** Fausse salle minimale pour tester l'orchestration. */
function salleDeTest() {
  return {
    code: 'TEST',
    joueurs: new Map(),
    partie: creerPartie(() => 0.5),
    reglages: { debit: 1 },
    prochaineCommande: null,
    dernierCFD: 0,
    goulot: null,
  };
}

test('démarrer une manche configure le mode et vide le tableau', () => {
  const salle = salleDeTest();
  const r = demarrerManche(salle, 2, 10_000);
  assert.equal(r.ok, true);
  assert.equal(salle.partie.statut, STATUTS.MANCHE);
  assert.equal(salle.partie.manche.mode, 'wip');
  assert.equal(salle.partie.finManche, 10_000 + CONFIG.manches[1].duree);
  assert.deepEqual(salle.partie.manche.limitesWip, CONFIG.manches[1].limitesWip);
});

test('le tick fait apparaître des commandes au rythme configuré', () => {
  const salle = salleDeTest();
  demarrerManche(salle, 1, 0);
  const evts = tick(salle, salle.prochaineCommande);
  assert.ok(evts.some((e) => e.type === 'commande'));
  assert.equal(salle.partie.cartes.size, 1);
});

test('la manche s’arrête au chrono et pousse ses stats dans l’historique', () => {
  const salle = salleDeTest();
  demarrerManche(salle, 1, 0);
  tick(salle, CONFIG.manches[0].duree + 1);
  assert.equal(salle.partie.statut, STATUTS.DEBRIEF);
  assert.equal(salle.partie.historique.length, 1);
  assert.equal(salle.partie.historique[0].numero, 1);
});

test('après la manche 3, la partie est finie', () => {
  const salle = salleDeTest();
  demarrerManche(salle, 3, 0);
  arreterManche(salle, 60_000);
  assert.equal(salle.partie.statut, STATUTS.FIN);
});

test('le facilitateur ne peut pas poser de limites WIP en manche 1', () => {
  const salle = salleDeTest();
  demarrerManche(salle, 1, 0);
  assert.equal(reglerWip(salle, 'riz', 2).ok, false);
});

test('le facilitateur règle les limites WIP en direct en manche 2', () => {
  const salle = salleDeTest();
  demarrerManche(salle, 2, 0);
  assert.equal(reglerWip(salle, 'riz', 4).ok, true);
  assert.equal(salle.partie.manche.limitesWip.riz, 4);
  reglerWip(salle, 'riz', 0); // 0 = illimité
  assert.equal(salle.partie.manche.limitesWip.riz, undefined);
});

test('le débit est borné entre les limites de la config', () => {
  const salle = salleDeTest();
  reglerDebit(salle, 99);
  assert.equal(salle.reglages.debit, CONFIG.commandes.debitMax);
  reglerDebit(salle, 0.01);
  assert.equal(salle.reglages.debit, CONFIG.commandes.debitMin);
});

// ---------------------------------------------------------------------------
// Résumé de manche (écran de débrief)
// ---------------------------------------------------------------------------

test('le résumé de manche agrège livraisons, gâchis et lead time', () => {
  const stats = creerStats(1, 'push', 0);
  stats.fin = 300_000;
  stats.livrees.push({ leadTime: 10_000, sejours: { riz: 4000 } });
  stats.livrees.push({ leadTime: 20_000, sejours: { riz: 6000 } });
  stats.gachis.push({ raison: 'perime' });
  stats.gachis.push({ raison: 'rate' });
  const r = resumerManche(stats, 300_000);
  assert.equal(r.livres, 2);
  assert.equal(r.leadTimeMoyen, 15_000);
  assert.equal(r.gachisPerimes, 1);
  assert.equal(r.gachisRates, 1);
  assert.equal(r.cycleTimes.riz, 5000);
  assert.equal(r.throughput, 2 / 5); // 2 sushis en 5 minutes
});
