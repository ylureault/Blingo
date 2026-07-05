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
import {
  demarrerManche, arreterManche, tick, reglerWip, reglerDebit,
  pauserManche, reprendreManche, prolongerManche, viderCommandes, transfererRole,
  ajouterCommis, retirerCommis, declencherEvenement,
} from '../server/game.js';
import { nettoyerPseudo, creerSalle, rejoindreSalle, nettoyerSalles, salles } from '../server/rooms.js';

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
// Pause, prolongation, soupape et transfert de rôle
// ---------------------------------------------------------------------------

test('la pause gèle tout et la reprise décale toutes les horloges', () => {
  const salle = salleDeTest();
  demarrerManche(salle, 1, 0);
  const carte = creerCarte(salle.partie, 'maki', false, 1000);
  const finAvant = salle.partie.finManche;

  assert.equal(pauserManche(salle, 10_000).ok, true);
  assert.deepEqual(tick(salle, 20_000), []); // rien ne bouge pendant la pause
  assert.equal(salle.partie.cartes.size, 1); // pas de spawn, pas de péremption

  assert.equal(reprendreManche(salle, 40_000).ok, true); // 30 s de pause
  assert.equal(salle.partie.finManche, finAvant + 30_000);
  assert.equal(carte.creeLe, 31_000); // la fraîcheur n'a pas vieilli pendant la pause
});

test('impossible de jouer pendant la pause', async () => {
  const salle = salleDeTest();
  demarrerManche(salle, 1, 0);
  pauserManche(salle, 5000);
  const { prendreCarte } = await import('../server/flow.js');
  const carte = creerCarte(salle.partie, 'maki', false, 0);
  const joueur = { id: 'j1', poste: 'riz', carteActive: null };
  assert.equal(prendreCarte(salle.partie, joueur, carte.id, 6000).ok, false);
});

test('prolonger la manche repousse la fin d’une minute', () => {
  const salle = salleDeTest();
  demarrerManche(salle, 1, 0);
  const finAvant = salle.partie.finManche;
  assert.equal(prolongerManche(salle).ok, true);
  assert.equal(salle.partie.finManche, finAvant + 60_000);
});

test('vider les commandes ne touche qu’à la colonne Commandes', () => {
  const salle = salleDeTest();
  demarrerManche(salle, 1, 0);
  creerCarte(salle.partie, 'maki', false, 0);
  const enRiz = creerCarte(salle.partie, 'maki', false, 0);
  enRiz.colonne = 'riz';
  const r = viderCommandes(salle);
  assert.equal(r.retirees, 1);
  assert.equal(salle.partie.cartes.size, 1);
});

test('le transfert de rôle change le facilitateur', () => {
  const { salle } = creerSalle('Yoan', '🍣');
  const { joueur } = rejoindreSalle(salle.code, 'Kenji', '🍤');
  const r = transfererRole(salle, joueur.id);
  assert.equal(r.ok, true);
  assert.equal(salle.facilitateurId, joueur.id);
});

// ---------------------------------------------------------------------------
// Rôles prédéfinis et déplacement
// ---------------------------------------------------------------------------

test('au lancement, chacun reçoit un poste selon la taille de l’équipe', () => {
  const salle = salleDeTest();
  for (const [id, pseudo] of [['a', 'Ana'], ['b', 'Bob'], ['c', 'Chloé']]) {
    salle.joueurs.set(id, { id, pseudo, poste: null, carteActive: null, connecte: true });
  }
  demarrerManche(salle, 1, 0);
  const postes = [...salle.joueurs.values()].map((j) => j.poste);
  assert.deepEqual(postes, CONFIG.roles.repartition[3]);
});

test('en déplacement entre deux postes, on ne peut pas prendre de carte', async () => {
  const { prendreCarte: prendre } = await import('../server/flow.js');
  const salle = salleDeTest();
  demarrerManche(salle, 1, 0);
  const carte = creerCarte(salle.partie, 'maki', false, 0);
  carte.colonne = 'riz'; carte.etat = 'attente';
  const joueur = { id: 'j1', poste: 'riz', carteActive: null, enDeplacementJusqua: 5000 };
  assert.match(prendre(salle.partie, joueur, carte.id, 3000).erreur, /traversez/);
  assert.equal(prendre(salle.partie, joueur, carte.id, 5001).ok, true);
});

// ---------------------------------------------------------------------------
// Événements aléatoires de cuisine
// ---------------------------------------------------------------------------

test('le contrôle d’hygiène bloque tout nouveau geste, la panne ne bloque que le riz', async () => {
  const { prendreCarte: prendre } = await import('../server/flow.js');
  const salle = salleDeTest();
  demarrerManche(salle, 2, 0);
  const enRiz = creerCarte(salle.partie, 'maki', false, 0);
  enRiz.colonne = 'riz'; enRiz.etat = 'attente';
  const enDecoupe = creerCarte(salle.partie, 'maki', false, 0);
  enDecoupe.colonne = 'decoupe'; enDecoupe.etat = 'attente';
  const cuisinier = { id: 'j1', poste: 'riz', carteActive: null };
  const poissonnier = { id: 'j2', poste: 'decoupe', carteActive: null };

  declencherEvenement(salle, 1000, 'hygiene');
  assert.match(prendre(salle.partie, cuisinier, enRiz.id, 2000).erreur, /hygiène/);
  assert.match(prendre(salle.partie, poissonnier, enDecoupe.id, 2000).erreur, /hygiène/);

  salle.partie.evenement = null;
  declencherEvenement(salle, 20_000, 'panneRiz');
  assert.match(prendre(salle.partie, cuisinier, enRiz.id, 21_000).erreur, /panne/);
  assert.equal(prendre(salle.partie, poissonnier, enDecoupe.id, 21_000).ok, true);
});

test('le rush fait débarquer trois commandes d’un coup', () => {
  const salle = salleDeTest();
  demarrerManche(salle, 2, 0);
  const avant = salle.partie.cartes.size;
  declencherEvenement(salle, 1000, 'rush');
  assert.equal(salle.partie.cartes.size, avant + 3);
});

test('la critique culinaire injecte une commande VIP', () => {
  const salle = salleDeTest();
  demarrerManche(salle, 2, 0);
  declencherEvenement(salle, 1000, 'critique');
  assert.ok([...salle.partie.cartes.values()].some((c) => c.expedite));
});

test('un événement expiré se nettoie au tick suivant', () => {
  const salle = salleDeTest();
  demarrerManche(salle, 2, 0);
  declencherEvenement(salle, 1000, 'hygiene');
  salle.prochainEvenement = Infinity; // pas de nouveau tirage pendant le test
  const evts = tick(salle, 1000 + CONFIG.evenements.liste.hygiene.duree + 500);
  assert.equal(salle.partie.evenement, null);
  assert.ok(evts.some((e) => e.type === 'finEvenementCuisine'));
});

// ---------------------------------------------------------------------------
// Commis virtuels 🤖 (mode solo)
// ---------------------------------------------------------------------------

test('les commis s’ajoutent sur les postes les moins couverts, avec un plafond', () => {
  const salle = salleDeTest();
  const postes = new Set();
  for (let i = 0; i < CONFIG.commis.max; i += 1) {
    const r = ajouterCommis(salle);
    assert.equal(r.ok, true);
    postes.add(r.poste);
  }
  assert.equal(postes.size, CONFIG.commis.max); // un poste différent chacun
  assert.equal(ajouterCommis(salle).ok, false); // plafond atteint
  assert.equal(retirerCommis(salle).ok, true);
});

test('un commis prend une carte, la travaille (plus lentement) et la termine', () => {
  const salle = salleDeTest();
  ajouterCommis(salle); // ira sur riz (premier poste vide)
  const commis = [...salle.joueurs.values()].find((j) => j.estBot);
  commis.poste = 'riz';
  demarrerManche(salle, 1, 0);
  const carte = creerCarte(salle.partie, 'maki', false, 0);

  tick(salle, 1000); // pousse la carte dans riz, le commis la prend
  assert.equal(carte.proprietaire, commis.id);

  // Durée humaine 3000 ms × 1.25 de lenteur = 3750 ms : pas fini avant
  tick(salle, 4000);
  assert.equal(carte.proprietaire, commis.id);
  tick(salle, 4800); // 1000 + 3750 < 4800 → geste terminé
  assert.notEqual(carte.colonne, 'riz'); // poussée vers la découpe (mode push)
});

test('un commis inactif se réaffecte au poste qui déborde', () => {
  const salle = salleDeTest();
  ajouterCommis(salle);
  const commis = [...salle.joueurs.values()].find((j) => j.estBot);
  commis.poste = 'service'; // aucun travail ne l'attend là-bas
  commis.inactifDepuis = 0;
  demarrerManche(salle, 1, 0);
  salle.prochaineCommande = Infinity; // pas de nouveau spawn pendant le test
  // Trois cartes s'entassent à l'assemblage
  for (let i = 0; i < 3; i += 1) {
    const c = creerCarte(salle.partie, 'maki', false, 0);
    c.colonne = 'assemblage';
    c.etat = 'attente';
  }
  tick(salle, CONFIG.commis.delaiReaffectation + 1000);
  assert.equal(commis.poste, 'assemblage'); // il est allé aider le goulot
});

test('les commis ne maintiennent pas une salle en vie (TTL)', () => {
  const { salle, joueur } = creerSalle('Solo', '🍣');
  ajouterCommis(salle);
  joueur.connecte = false; // l'humain part, le commis reste
  salle.derniereActivite = 0;
  nettoyerSalles(CONFIG.salle.ttlSalleVide + 1);
  assert.equal(salles.has(salle.code), false);
});

// ---------------------------------------------------------------------------
// Pseudos : nettoyage et déduplication
// ---------------------------------------------------------------------------

test('les pseudos sont nettoyés (contrôles, espaces) et jamais vides', () => {
  assert.equal(nettoyerPseudo('  Yoan   Lu  '), 'Yoan Lu');
  assert.equal(nettoyerPseudo('​'), 'Chef anonyme');
  assert.equal(nettoyerPseudo(null), 'Chef anonyme');
});

test('deux homonymes dans la même salle sont distingués', () => {
  const { salle } = creerSalle('Kenji', '🍣');
  const a = rejoindreSalle(salle.code, 'Kenji', '🍤');
  assert.notEqual(a.joueur.pseudo, 'Kenji');
  assert.match(a.joueur.pseudo, /^Kenji/);
});

// ---------------------------------------------------------------------------
// Résumé de manche (écran de débrief)
// ---------------------------------------------------------------------------

test('p85 : la métrique de prévisibilité pointe la traîne, pas la moyenne', () => {
  const livrees = Array.from({ length: 20 }, (_, i) => ({ leadTime: (i + 1) * 1000 }));
  const s = statsLeadTime(livrees);
  assert.equal(s.p85, 17_000); // 85 % des 20 valeurs ≤ la 17e
  assert.equal(s.min, 1000);
});

test('l’efficience du flux rapporte le temps travaillé au lead time', async () => {
  const { efficienceFlux } = await import('../server/metrics.js');
  const livrees = [
    { leadTime: 10_000, tempsTravaille: 1000 },  // 10 %
    { leadTime: 20_000, tempsTravaille: 6000 },  // 30 %
  ];
  assert.equal(efficienceFlux(livrees), 0.2);
  assert.equal(efficienceFlux([]), 0);
});

test('le résumé de manche agrège livraisons, gâchis et lead time', () => {
  const stats = creerStats(1, 'push', 0);
  stats.fin = 300_000;
  stats.livrees.push({ leadTime: 10_000, sejours: { riz: 4000 }, retours: 1, tempsTravaille: 2000 });
  stats.livrees.push({ leadTime: 20_000, sejours: { riz: 6000 }, retours: 0, tempsTravaille: 4000 });
  stats.gachis.push({ raison: 'perime' });
  stats.gachis.push({ raison: 'rate' });
  stats.livrees[0].canal = 'salle';
  stats.livrees[1].canal = 'livraison';
  const r = resumerManche(stats, 300_000);
  assert.equal(r.livres, 2);
  assert.equal(r.livresSalle, 1);
  assert.equal(r.livresLivraison, 1);
  assert.equal(r.leadTimeMoyen, 15_000);
  assert.equal(r.gachisPerimes, 1);
  assert.equal(r.gachisRates, 1);
  assert.equal(r.cycleTimes.riz, 5000);
  assert.equal(r.throughput, 2 / 5); // 2 sushis en 5 minutes
  assert.equal(r.retoursTotal, 1);
  assert.equal(r.leadTimeMin, 10_000);
  assert.ok(r.efficience > 0);
});
