/**
 * board.js — Rendu du tableau Kanban partagé.
 *
 * Le tableau est reconstruit à chaque état serveur ; une animation FLIP
 * fait glisser visuellement les cartes d'une colonne à l'autre : le flux
 * doit se VOIR. La fraîcheur et les âges sont rafraîchis en continu
 * (requestAnimationFrame) sans attendre le serveur.
 */

import { COLONNES, ETATS_CARTE } from '/shared/constants.js';
import { CONFIG, dureeVie } from '/shared/game-config.js';
import { svgSushi } from './sushi-svg.js';

/**
 * Redessine le tableau complet.
 * `surCarte(carte, action)` : rappel quand le joueur clique une carte
 * (action = 'prendre' | 'travailler').
 */
export function rendreTableau(element, etat, joueurId, surCarte) {
  // --- FLIP, étape 1 : mémoriser la position actuelle de chaque carte ---
  const anciennes = new Map();
  for (const el of element.querySelectorAll('.carte')) {
    anciennes.set(el.dataset.id, el.getBoundingClientRect());
  }

  const moi = etat.joueurs.find((j) => j.id === joueurId);
  const estFacilitateur = etat.facilitateurId === joueurId;
  element.innerHTML = '';

  for (const colonne of COLONNES) {
    const cartes = etat.cartes
      .filter((c) => c.colonne === colonne.id)
      // Les VIP d'abord (swimlane expedite), puis les plus anciennes
      .sort((a, b) => (b.expedite - a.expedite) || (a.creeLe - b.creeLe));

    const limite = etat.manche?.limitesWip?.[colonne.id] ?? null;
    const pleine = limite != null && cartes.length >= limite;

    const colEl = document.createElement('section');
    colEl.className = 'colonne';
    colEl.dataset.colonne = colonne.id;
    if (pleine) colEl.classList.add('pleine');
    if (estFacilitateur && etat.goulot === colonne.id) colEl.classList.add('goulot');

    // En-tête : nom, compteur WIP, joueurs présents à ce poste
    const occupants = etat.joueurs.filter((j) => j.poste === colonne.id && j.connecte);
    const presents = occupants
      .map((j) => `<span class="poste-joueur" title="${j.pseudo}">${j.avatar}</span>`).join('');
    // À deux ou plus au même poste : bonus d'entraide (le geste est plus rapide)
    const entraide = occupants.length >= 2
      ? '<span class="badge-entraide" title="Entraide : le travail est 25 % plus rapide à plusieurs">🤝</span>'
      : '';
    colEl.innerHTML = `
      <header class="colonne-entete">
        <span class="colonne-nom">${colonne.nom}</span>
        <span class="colonne-wip ${pleine ? 'wip-pleine' : ''}">${cartes.length}${limite != null ? `/${limite}` : ''}</span>
      </header>
      <div class="colonne-joueurs">${presents}${entraide}</div>
      <div class="colonne-cartes"></div>`;

    const zone = colEl.querySelector('.colonne-cartes');
    for (const carte of cartes) {
      zone.appendChild(rendreCarte(carte, etat, moi, surCarte));
    }
    if (colonne.id === 'livre') {
      const n = etat.statsLive?.livres ?? 0;
      zone.insertAdjacentHTML('beforeend', `<div class="pile-livres">${n > 0 ? `🎉 ×${n}` : '—'}</div>`);
    }
    element.appendChild(colEl);
  }

  // --- FLIP, étape 2 : animer depuis l'ancienne position ---
  for (const el of element.querySelectorAll('.carte')) {
    const avant = anciennes.get(el.dataset.id);
    if (!avant) { el.classList.add('carte-arrivee'); continue; } // nouvelle carte : fondu
    const apres = el.getBoundingClientRect();
    const dx = avant.left - apres.left;
    const dy = avant.top - apres.top;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) continue;
    el.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
      { duration: 350, easing: 'cubic-bezier(.2,.8,.3,1)' },
    );
  }
}

/** Construit l'élément DOM d'une carte de commande. */
function rendreCarte(carte, etat, moi, surCarte) {
  const type = CONFIG.typesSushi[carte.type];
  const proprietaire = etat.joueurs.find((j) => j.id === carte.proprietaire);
  const action = actionPossible(carte, etat, moi);

  const el = document.createElement('article');
  el.className = 'carte';
  el.dataset.id = carte.id;
  el.dataset.creele = carte.creeLe;
  el.dataset.dureevie = dureeVie(carte.type, carte.expedite, carte.canal);
  if (carte.expedite) el.classList.add('expedite');
  if (carte.proprietaire === moi?.id) el.classList.add('mienne');
  if (action) el.classList.add('cliquable');
  if (carte.etat === ETATS_CARTE.FINI && carte.colonne !== 'commandes') el.classList.add('finie');

  // Provenance de la commande : table de la salle ou scooter Yatta Eats
  const canal = carte.canal === 'livraison'
    ? `${CONFIG.canaux.livraison.emoji} ${CONFIG.canaux.livraison.label}`
    : `${CONFIG.canaux.salle.emoji} Table ${carte.table ?? '?'}`;

  el.innerHTML = `
    ${carte.expedite ? '<span class="carte-vip">🔥 VIP</span>' : ''}
    <div class="carte-visuel">${svgSushi(carte.type, { taille: 44 })}</div>
    <div class="carte-infos">
      <span class="carte-nom">${type.nom}</span>
      <span class="carte-age" data-role="age"></span>
    </div>
    <div class="carte-canal ${carte.canal === 'livraison' ? 'canal-livraison' : ''}">${canal}</div>
    <div class="carte-etat">${etiquetteEtat(carte, proprietaire)}</div>
    <div class="fraicheur"><div class="fraicheur-barre" data-role="fraicheur"></div></div>
    ${action ? `<span class="carte-action">${action === 'travailler' ? '🔨 travailler' : (etat.manche?.mode === 'pull' && carte.colonne !== moi?.poste ? '🪝 tirer' : '✋ prendre')}</span>` : ''}
  `;
  if (action) el.addEventListener('click', () => surCarte(carte, action));
  return el;
}

/** Quelle action le joueur local peut-il tenter sur cette carte ? */
function actionPossible(carte, etat, moi) {
  if (!moi?.poste || etat.statut !== 'manche') return null;
  if (carte.proprietaire === moi.id) return 'travailler';
  if (carte.proprietaire) return null; // déjà dans la pile d'un collègue

  const route = CONFIG.typesSushi[carte.type].route;
  const iPoste = route.indexOf(moi.poste);
  if (iPoste < 0) return null;

  // En attente dans mon poste, ou finie dans la colonne juste en amont
  if (carte.colonne === moi.poste && carte.etat === ETATS_CARTE.ATTENTE) return 'prendre';
  if (carte.colonne === route[iPoste - 1] && carte.etat === ETATS_CARTE.FINI) return 'prendre';
  return null;
}

/** Petite étiquette d'état de la carte. */
function etiquetteEtat(carte, proprietaire) {
  if (carte.etat === ETATS_CARTE.ENCOURS && proprietaire) {
    return `${proprietaire.avatar} ${proprietaire.pseudo}`;
  }
  if (carte.etat === ETATS_CARTE.FINI && carte.colonne !== 'commandes') return '✔ prêt à avancer';
  if (carte.retours > 0) return `↩ retour ×${carte.retours}`;
  return '';
}

/**
 * Rafraîchissement continu (appelé à chaque frame) : jauges de fraîcheur
 * et âges, sans reconstruire le DOM.
 */
export function rafraichirCartes(element, maintenant) {
  for (const el of element.querySelectorAll('.carte')) {
    const creeLe = Number(el.dataset.creele);
    const vie = Number(el.dataset.dureevie);
    const age = maintenant - creeLe;
    const restant = Math.max(0, 1 - age / vie);

    const barre = el.querySelector('[data-role="fraicheur"]');
    if (barre) {
      barre.style.width = `${restant * 100}%`;
      barre.classList.toggle('fraicheur-alerte', restant < 0.35);
      barre.classList.toggle('fraicheur-critique', restant < 0.15);
    }
    const ageEl = el.querySelector('[data-role="age"]');
    if (ageEl) ageEl.textContent = `${Math.floor(age / 1000)}s`;
    el.classList.toggle('perissante', restant < 0.15);
  }
}
