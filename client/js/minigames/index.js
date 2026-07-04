/**
 * index.js — Aiguillage des mini-jeux par poste.
 * Chaque mini-jeu rend son interface dans le conteneur fourni et renvoie
 * une promesse résolue avec le résultat { reussi, accepter? } que le
 * serveur validera (durée minimale comprise — tricher ne sert à rien).
 */

import { jouerRiz } from './riz.js';
import { jouerDecoupe } from './decoupe.js';
import { jouerAssemblage } from './assemblage.js';
import { jouerQualite } from './qualite.js';
import { jouerService } from './service.js';

const JEUX = {
  riz: jouerRiz,
  decoupe: jouerDecoupe,
  assemblage: jouerAssemblage,
  qualite: jouerQualite,
  service: jouerService,
};

/** Lance le mini-jeu du poste. `options` = { carte, duree }. */
export function lancerMiniJeu(poste, conteneur, options) {
  const jeu = JEUX[poste];
  if (!jeu) return Promise.resolve({ reussi: true });
  return jeu(conteneur, options);
}
