/**
 * Tests de la logique de flux : limites WIP, push/pull, prise de cartes,
 * anti-triche, contrôle qualité, péremption.
 * Lancement : npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ETATS_CARTE, STATUTS } from '../shared/constants.js';
import { creerStats } from '../server/metrics.js';
import {
  creerPartie, creerCarte, prendreCarte, commencerTravail, terminerTravail,
  pousserFinies, peutEntrer, perimerCartes, compterColonne, colonneSuivante,
  libererCartesDuJoueur, expediteDisponible,
} from '../server/flow.js';

/** Fabrique une partie en cours de manche, avec un aléatoire déterministe. */
function partieDeTest(mode, limitesWip = null, aleatoire = () => 0.99) {
  const partie = creerPartie(aleatoire); // 0.99 > probaDefaut → jamais de défaut
  partie.statut = STATUTS.MANCHE;
  partie.manche = {
    numero: 1, mode, limitesWip,
    maxCartesParJoueur: mode === 'push' ? 8 : 1,
    intervalleCommandes: 6000, expediteActives: true, duree: 300_000,
  };
  partie.stats = creerStats(1, mode, 0);
  return partie;
}

function joueurDeTest(poste) {
  return { id: 'j1', pseudo: 'Testeur', poste, carteActive: null };
}

// ---------------------------------------------------------------------------
// Création et routes
// ---------------------------------------------------------------------------

test('une carte naît dans Commandes, prête à entrer dans le flux', () => {
  const partie = partieDeTest('push');
  const carte = creerCarte(partie, 'maki', false, 1000);
  assert.equal(carte.colonne, 'commandes');
  assert.equal(carte.etat, ETATS_CARTE.FINI);
  assert.equal(partie.stats.cumulEntrees.commandes, 1);
});

test('le sashimi saute la préparation du riz sur sa route', () => {
  const partie = partieDeTest('push');
  const carte = creerCarte(partie, 'sashimi', false, 0);
  assert.equal(colonneSuivante(carte), 'decoupe');
});

// ---------------------------------------------------------------------------
// Mode push (manche 1) : aucune limite
// ---------------------------------------------------------------------------

test('en push, les cartes finies avancent seules et sans limite', () => {
  const partie = partieDeTest('push');
  for (let i = 0; i < 10; i += 1) creerCarte(partie, 'maki', false, i);
  pousserFinies(partie, 1000);
  assert.equal(compterColonne(partie, 'riz'), 10); // les 10 s'entassent : le chaos
  assert.equal(compterColonne(partie, 'commandes'), 0);
});

test('en push, un joueur peut empiler plusieurs cartes (multitâche)', () => {
  const partie = partieDeTest('push');
  const joueur = joueurDeTest('riz');
  const c1 = creerCarte(partie, 'maki', false, 0);
  const c2 = creerCarte(partie, 'nigiri', false, 0);
  pousserFinies(partie, 100);
  assert.equal(prendreCarte(partie, joueur, c1.id, 200).ok, true);
  assert.equal(prendreCarte(partie, joueur, c2.id, 200).ok, true);
});

test('changer de carte active fait perdre la progression (context switching)', () => {
  const partie = partieDeTest('push');
  const joueur = joueurDeTest('riz');
  const c1 = creerCarte(partie, 'maki', false, 0);
  const c2 = creerCarte(partie, 'nigiri', false, 0);
  pousserFinies(partie, 100);
  prendreCarte(partie, joueur, c1.id, 200);
  prendreCarte(partie, joueur, c2.id, 200);
  commencerTravail(partie, joueur, c1.id, 300);
  commencerTravail(partie, joueur, c2.id, 400); // on abandonne c1
  assert.equal(partie.cartes.get(c1.id).travailDebut, null);
  assert.equal(joueur.carteActive, c2.id);
});

// ---------------------------------------------------------------------------
// Mode wip (manche 2) : les limites bloquent
// ---------------------------------------------------------------------------

test('en wip, une colonne pleine refuse toute nouvelle carte', () => {
  const partie = partieDeTest('wip', { riz: 2 });
  for (let i = 0; i < 5; i += 1) creerCarte(partie, 'maki', false, i);
  pousserFinies(partie, 1000);
  assert.equal(compterColonne(partie, 'riz'), 2);       // limite respectée
  assert.equal(compterColonne(partie, 'commandes'), 3); // le reste bloque en amont
});

test('en wip, tirer une carte vers une colonne pleine est refusé', () => {
  const partie = partieDeTest('wip', { riz: 1 });
  const joueur = joueurDeTest('riz');
  creerCarte(partie, 'maki', false, 0);
  const c2 = creerCarte(partie, 'maki', false, 0);
  pousserFinies(partie, 100); // une seule carte entre dans riz
  const refus = prendreCarte(partie, joueur, c2.id, 200);
  assert.equal(refus.ok, false);
  assert.match(refus.erreur, /WIP/);
});

test('en wip, une seule carte par joueur', () => {
  const partie = partieDeTest('wip', { riz: 5 });
  const joueur = joueurDeTest('riz');
  const c1 = creerCarte(partie, 'maki', false, 0);
  const c2 = creerCarte(partie, 'maki', false, 0);
  pousserFinies(partie, 100);
  assert.equal(prendreCarte(partie, joueur, c1.id, 200).ok, true);
  assert.equal(prendreCarte(partie, joueur, c2.id, 200).ok, false);
});

test('une carte expedite ignore les limites WIP', () => {
  const partie = partieDeTest('wip', { riz: 1 });
  creerCarte(partie, 'maki', false, 0);
  pousserFinies(partie, 100); // riz est plein
  const vip = creerCarte(partie, 'nigiri', true, 200);
  assert.equal(peutEntrer(partie, vip, 'riz'), true);
});

// ---------------------------------------------------------------------------
// Mode pull (manche 3) : l'aval tire, rien ne se pousse
// ---------------------------------------------------------------------------

test('en pull, aucune poussée automatique : les cartes attendent d’être tirées', () => {
  const partie = partieDeTest('pull', { riz: 3 });
  creerCarte(partie, 'maki', false, 0);
  pousserFinies(partie, 1000);
  assert.equal(compterColonne(partie, 'commandes'), 1); // rien n'a bougé
});

test('en pull, un joueur tire une carte finie depuis l’amont', () => {
  const partie = partieDeTest('pull', { riz: 3 });
  const joueur = joueurDeTest('riz');
  const carte = creerCarte(partie, 'maki', false, 0);
  const resultat = prendreCarte(partie, joueur, carte.id, 500);
  assert.equal(resultat.ok, true);
  assert.equal(carte.colonne, 'riz');
  assert.equal(carte.etat, ETATS_CARTE.ENCOURS);
  assert.equal(carte.proprietaire, joueur.id);
});

test('une commande VIP en attente bloque la prise des cartes normales', () => {
  const partie = partieDeTest('pull', null);
  const joueur = joueurDeTest('riz');
  const normale = creerCarte(partie, 'maki', false, 0);
  creerCarte(partie, 'maki', true, 0); // VIP finie dans Commandes, amont de riz
  assert.equal(expediteDisponible(partie, 'riz'), true);
  const refus = prendreCarte(partie, joueur, normale.id, 100);
  assert.equal(refus.ok, false);
  assert.match(refus.erreur, /VIP/);
});

// ---------------------------------------------------------------------------
// Travail : anti-triche, échec, succès
// ---------------------------------------------------------------------------

/** Amène une carte maki dans le poste du joueur, prise et travail commencé à t. */
function carteEnMain(partie, joueur, t = 0, type = 'maki') {
  const carte = creerCarte(partie, type, false, t);
  // On la téléporte directement (les autres chemins sont testés plus haut)
  carte.colonne = joueur.poste;
  carte.etat = ETATS_CARTE.ATTENTE;
  prendreCarte(partie, joueur, carte.id, t);
  commencerTravail(partie, joueur, carte.id, t);
  return carte;
}

test('finir trop vite est refusé (anti-triche)', () => {
  const partie = partieDeTest('pull');
  const joueur = joueurDeTest('riz');
  const carte = carteEnMain(partie, joueur, 0);
  // Durée théorique riz/maki = 3000 ms, minimum accepté = 1800 ms
  const refus = terminerTravail(partie, joueur, carte.id, { reussi: true }, 500);
  assert.equal(refus.ok, false);
  assert.equal(carte.etat, ETATS_CARTE.ENCOURS); // le travail continue
});

test('un travail réussi rend la carte finie ; en pull elle attend d’être tirée', () => {
  const partie = partieDeTest('pull');
  const joueur = joueurDeTest('riz');
  const carte = carteEnMain(partie, joueur, 0);
  const resultat = terminerTravail(partie, joueur, carte.id, { reussi: true }, 3000);
  assert.equal(resultat.ok, true);
  assert.equal(carte.colonne, 'riz');            // pas de poussée en pull
  assert.equal(carte.etat, ETATS_CARTE.FINI);
  assert.equal(carte.proprietaire, null);
});

test('un travail réussi en push envoie la carte dans la colonne suivante', () => {
  const partie = partieDeTest('push');
  const joueur = joueurDeTest('riz');
  const carte = carteEnMain(partie, joueur, 0);
  terminerTravail(partie, joueur, carte.id, { reussi: true }, 3000);
  assert.equal(carte.colonne, 'decoupe');
  assert.equal(carte.etat, ETATS_CARTE.ATTENTE);
});

test('un échec (riz brûlé) renvoie la carte en file du même poste', () => {
  const partie = partieDeTest('pull');
  const joueur = joueurDeTest('riz');
  const carte = carteEnMain(partie, joueur, 0);
  terminerTravail(partie, joueur, carte.id, { reussi: false }, 3000);
  assert.equal(carte.colonne, 'riz');
  assert.equal(carte.etat, ETATS_CARTE.ATTENTE);
  assert.equal(carte.retours, 1);
});

test('un poste amont peut introduire un défaut caché', () => {
  const partie = partieDeTest('pull', null, () => 0.01); // 0.01 < probaDefaut → défaut
  const joueur = joueurDeTest('assemblage');
  const carte = carteEnMain(partie, joueur, 0);
  terminerTravail(partie, joueur, carte.id, { reussi: true }, 6000);
  assert.equal(carte.defaut, true);
});

// ---------------------------------------------------------------------------
// Contrôle qualité
// ---------------------------------------------------------------------------

test('le contrôle qualité qui rejette renvoie la carte à l’assemblage, corrigée', () => {
  const partie = partieDeTest('pull');
  const joueur = joueurDeTest('qualite');
  const carte = carteEnMain(partie, joueur, 0);
  carte.defaut = true;
  terminerTravail(partie, joueur, carte.id, { reussi: true, accepter: false }, 3000);
  assert.equal(carte.colonne, 'assemblage');
  assert.equal(carte.defaut, false); // le rework corrige le défaut
  assert.equal(carte.retours, 1);
});

test('un défaut accepté au contrôle explose à la livraison (gâchis raté)', () => {
  const partie = partieDeTest('pull');
  const qc = joueurDeTest('qualite');
  const carte = carteEnMain(partie, qc, 0);
  carte.defaut = true;
  terminerTravail(partie, qc, carte.id, { reussi: true, accepter: true }, 3000);
  assert.equal(carte.etat, ETATS_CARTE.FINI); // le défaut passe inaperçu…

  const serveur = { id: 'j2', poste: 'service', carteActive: null };
  prendreCarte(partie, serveur, carte.id, 4000);
  commencerTravail(partie, serveur, carte.id, 4000);
  const resultat = terminerTravail(partie, serveur, carte.id, { reussi: true }, 8000);
  assert.equal(resultat.consequence, 'rate');
  assert.equal(partie.stats.gachis.length, 1);
  assert.equal(partie.stats.livrees.length, 0);
});

// ---------------------------------------------------------------------------
// Livraison et péremption
// ---------------------------------------------------------------------------

test('le service livre : lead time enregistré, carte retirée du tableau', () => {
  const partie = partieDeTest('pull');
  const joueur = joueurDeTest('service');
  const carte = carteEnMain(partie, joueur, 1000);
  const resultat = terminerTravail(partie, joueur, carte.id, { reussi: true }, 5000);
  assert.equal(resultat.consequence, 'livre');
  assert.equal(partie.cartes.has(carte.id), false);
  assert.equal(partie.stats.livrees.length, 1);
  assert.equal(partie.stats.livrees[0].leadTime, 4000);
});

test('une carte trop vieille périme et part au gâchis', () => {
  const partie = partieDeTest('push');
  const joueur = joueurDeTest('riz');
  const carte = creerCarte(partie, 'sashimi', false, 0); // durée de vie : 80 s
  joueur.carteActive = carte.id;
  perimerCartes(partie, 79_000, [joueur]);
  assert.equal(partie.cartes.has(carte.id), true);  // encore fraîche
  perimerCartes(partie, 81_000, [joueur]);
  assert.equal(partie.cartes.has(carte.id), false); // périmée
  assert.equal(partie.stats.gachis[0].raison, 'perime');
  assert.equal(joueur.carteActive, null);           // la main du joueur est libérée
});

// ---------------------------------------------------------------------------
// Coopération : entraide et canaux de commande
// ---------------------------------------------------------------------------

test('l’entraide raccourcit le geste ET la durée minimale anti-triche', () => {
  const partie = partieDeTest('pull');
  const joueur = joueurDeTest('riz');
  const carte = creerCarte(partie, 'maki', false, 0);
  carte.colonne = 'riz';
  carte.etat = ETATS_CARTE.ATTENTE;
  prendreCarte(partie, joueur, carte.id, 0);
  // Un collègue au même poste : durée 3000 × 0.75 = 2250, minimum = 1350 ms
  const r = commencerTravail(partie, joueur, carte.id, 0, true);
  assert.equal(r.duree, 2250);
  assert.equal(r.entraide, true);
  // 1400 ms : refusé sans entraide (min 1800), accepté avec
  const fin = terminerTravail(partie, joueur, carte.id, { reussi: true }, 1400);
  assert.equal(fin.ok, true);
});

test('une commande en livraison périme plus vite qu’une commande en salle', () => {
  const partie = partieDeTest('push');
  const salle = creerCarte(partie, 'nigiri', false, 0, 'salle');       // 100 s
  const livraison = creerCarte(partie, 'nigiri', false, 0, 'livraison'); // 80 s
  perimerCartes(partie, 90_000, []);
  assert.equal(partie.cartes.has(salle.id), true);       // encore bonne
  assert.equal(partie.cartes.has(livraison.id), false);  // le scooter a trop attendu
});

test('les cartes en salle ont un numéro de table, pas celles en livraison', () => {
  const partie = partieDeTest('push');
  const table = creerCarte(partie, 'maki', false, 0, 'salle');
  const scooter = creerCarte(partie, 'maki', false, 0, 'livraison');
  assert.ok(table.table >= 1);
  assert.equal(scooter.table, null);
});

// ---------------------------------------------------------------------------
// Départ d'un joueur
// ---------------------------------------------------------------------------

test('un joueur qui part libère ses cartes, qui retournent en attente', () => {
  const partie = partieDeTest('pull');
  const joueur = joueurDeTest('riz');
  const carte = carteEnMain(partie, joueur, 0);
  libererCartesDuJoueur(partie, joueur);
  assert.equal(carte.etat, ETATS_CARTE.ATTENTE);
  assert.equal(carte.proprietaire, null);
  assert.equal(joueur.carteActive, null);
});
