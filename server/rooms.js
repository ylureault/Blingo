/**
 * rooms.js — Gestion des salles en mémoire.
 *
 * Tout l'état vit dans une Map : AUCUNE base de données. Une salle sans
 * joueur connecté depuis `ttlSalleVide` est détruite par le nettoyeur.
 */

import { randomUUID } from 'node:crypto';
import { CONFIG } from '../shared/game-config.js';
import { STATUTS } from '../shared/constants.js';
import { creerPartie } from './flow.js';

/** Toutes les salles vivantes : code → salle. */
export const salles = new Map();

/** Génère un code de salle à 4 lettres, unique et sans caractères ambigus. */
export function genererCode() {
  const { alphabetCode, longueurCode } = CONFIG.salle;
  for (let essai = 0; essai < 100; essai += 1) {
    let code = '';
    for (let i = 0; i < longueurCode; i += 1) {
      code += alphabetCode[Math.floor(Math.random() * alphabetCode.length)];
    }
    if (!salles.has(code)) return code;
  }
  throw new Error('Impossible de générer un code de salle unique.');
}

/** Crée une salle et son facilitateur (celui qui crée la salle). */
export function creerSalle(pseudo, avatar) {
  const code = genererCode();
  const salle = {
    code,
    creeLe: Date.now(),
    derniereActivite: Date.now(),
    facilitateurId: null,
    joueurs: new Map(),          // id joueur → joueur
    partie: creerPartie(),
    reglages: { debit: 1 },      // multiplicateur du débit d'arrivée des commandes
    prochaineCommande: null,     // horodatage du prochain spawn
    dernierCFD: 0,               // horodatage du dernier échantillon CFD
    goulot: null,                // colonne goulot détectée (affichée au facilitateur)
  };
  const facilitateur = creerJoueur(pseudo, avatar, true);
  salle.joueurs.set(facilitateur.id, facilitateur);
  salle.facilitateurId = facilitateur.id;
  salles.set(code, salle);
  return { salle, joueur: facilitateur };
}

/** Nettoie un pseudo : caractères de contrôle retirés, espaces normalisés. */
export function nettoyerPseudo(pseudo) {
  const propre = String(pseudo || '')
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029]/g, '') // caracteres de controle et invisibles
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20);
  return propre || 'Chef anonyme';
}

/** Crée un objet joueur. Le `jeton` secret permet la reconnexion. */
export function creerJoueur(pseudo, avatar, estFacilitateur = false) {
  return {
    id: randomUUID().slice(0, 8),
    jeton: randomUUID(),         // secret partagé avec un seul navigateur
    pseudo: nettoyerPseudo(pseudo),
    avatar: avatar || '🍣',
    poste: null,                 // colonne-poste choisie (null = spectateur)
    carteActive: null,
    connecte: true,
    estFacilitateur,
  };
}

/**
 * Fait rejoindre (ou re-rejoindre) une salle.
 * Si `jeton` correspond à un joueur existant → reconnexion : il retrouve
 * son pseudo, son poste et sa carte en cours.
 */
export function rejoindreSalle(code, pseudo, avatar, jeton) {
  const salle = salles.get(String(code || '').toUpperCase());
  if (!salle) return { erreur: 'Code de salle invalide.' };

  // Reconnexion : on retrouve le joueur par son jeton secret
  if (jeton) {
    for (const joueur of salle.joueurs.values()) {
      if (joueur.jeton === jeton) {
        joueur.connecte = true;
        salle.derniereActivite = Date.now();
        return { salle, joueur, reconnexion: true };
      }
    }
  }

  const connectes = [...salle.joueurs.values()].filter((j) => j.connecte).length;
  if (connectes >= CONFIG.salle.maxJoueurs) return { erreur: 'La salle est pleine.' };

  const joueur = creerJoueur(pseudo, avatar, false);
  // Deux « Kenji » dans la même cuisine ? Le second devient « Kenji ² »
  const pseudos = new Set([...salle.joueurs.values()].map((j) => j.pseudo));
  let candidat = joueur.pseudo;
  for (let n = 2; pseudos.has(candidat); n += 1) candidat = `${joueur.pseudo} ${'²³⁴⁵⁶⁷⁸'[n - 2] || n}`;
  joueur.pseudo = candidat;
  salle.joueurs.set(joueur.id, joueur);
  salle.derniereActivite = Date.now();
  return { salle, joueur, reconnexion: false };
}

/**
 * Marque un joueur déconnecté. S'il était facilitateur, le rôle passe au
 * plus ancien joueur connecté pour que la partie reste pilotable.
 */
export function deconnecterJoueur(salle, joueurId) {
  const joueur = salle.joueurs.get(joueurId);
  if (!joueur) return;
  joueur.connecte = false;
  salle.derniereActivite = Date.now();
  if (salle.facilitateurId === joueurId) {
    const remplacant = [...salle.joueurs.values()].find((j) => j.connecte);
    if (remplacant) {
      salle.facilitateurId = remplacant.id;
      remplacant.estFacilitateur = true;
    }
  }
  // Dans le lobby, un déconnecté est simplement retiré de la liste
  if (salle.partie.statut === STATUTS.LOBBY) salle.joueurs.delete(joueurId);
}

/**
 * Détruit les salles vides depuis trop longtemps.
 * Renvoie les codes détruits (pour prévenir d'éventuels sockets fantômes).
 */
export function nettoyerSalles(maintenant = Date.now()) {
  const detruites = [];
  for (const [code, salle] of salles) {
    const personne = ![...salle.joueurs.values()].some((j) => j.connecte);
    if (personne && maintenant - salle.derniereActivite > CONFIG.salle.ttlSalleVide) {
      salles.delete(code);
      detruites.push(code);
    }
  }
  return detruites;
}
