/**
 * board.js — Rendu du tableau Kanban partagé.
 *
 * Le tableau est reconstruit à chaque état serveur ; une animation FLIP
 * fait glisser visuellement les cartes d'une colonne à l'autre : le flux
 * doit se VOIR. La fraîcheur et les âges sont rafraîchis en continu
 * (requestAnimationFrame) sans attendre le serveur.
 */

import { COLONNES, ETATS_CARTE } from '/shared/constants.js';
import { CONFIG, dureeVie, dureeTravail } from '/shared/game-config.js';
import { svgSushi } from './sushi-svg.js';

/** Petite icône d'ambiance par colonne. */
const ICONES_COLONNES = {
  commandes: '📥', riz: '🍚', decoupe: '🔪', assemblage: '🍙',
  qualite: '🔍', service: '🏮', livre: '🎌',
};

// Mémoire des états précédents : sert au flash vert « vient de finir »
const etatsPrecedents = new Map();

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

  const maintenant = etat.maintenant || Date.now();
  for (const colonne of COLONNES) {
    const cartes = etat.cartes
      .filter((c) => c.colonne === colonne.id)
      // Les VIP d'abord (swimlane expedite), puis la fraîcheur la plus
      // basse en tête : la carte la plus urgente remonte toute seule
      .sort((a, b) => (b.expedite - a.expedite)
        || fraicheurRestante(a, maintenant) - fraicheurRestante(b, maintenant));

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
        <span class="colonne-nom"><span class="colonne-icone">${ICONES_COLONNES[colonne.id] || ''}</span> ${colonne.nom}</span>
        <span class="colonne-wip ${pleine ? 'wip-pleine' : ''}">${cartes.length}${limite != null ? `/${limite}` : ''}</span>
      </header>
      <div class="colonne-joueurs">${presents}${entraide}</div>
      <div class="colonne-cartes"></div>`;

    const zone = colEl.querySelector('.colonne-cartes');
    // La file « Commandes » se replie au-delà d'un seuil : le nombre reste
    // visible (c'est la leçon), mais l'écran reste lisible
    const seuilCompact = CONFIG.affichage.compactCommandesAuDela;
    const visibles = colonne.id === 'commandes' ? cartes.slice(0, seuilCompact) : cartes;
    for (const carte of visibles) {
      zone.appendChild(rendreCarte(carte, etat, moi, surCarte));
    }
    if (colonne.id === 'commandes' && cartes.length > seuilCompact) {
      zone.insertAdjacentHTML('beforeend',
        `<div class="file-compacte">… et ${cartes.length - seuilCompact} commandes qui s’impatientent</div>`);
    }
    if (colonne.id === 'livre') {
      const n = etat.statsLive?.livres ?? 0;
      zone.insertAdjacentHTML('beforeend', `<div class="pile-livres">${n > 0 ? `🎉 ×${n}` : '—'}</div>`);
    }
    element.appendChild(colEl);
  }

  // Mémorise les états pour détecter les « vient de finir » au prochain rendu
  for (const c of etat.cartes) etatsPrecedents.set(c.id, c.etat);

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
  el.dataset.travaildebut = carte.travailDebut ?? '';
  el.dataset.dureetravail = carte.travailDebut
    ? dureeTravail(carte.type, carte.colonne, carte.expedite) : '';
  el.dataset.derniermouvement = carte.dernierMouvement ?? '';
  el.dataset.etat = carte.etat;
  if (carte.expedite) el.classList.add('expedite');
  if (carte.proprietaire === moi?.id) el.classList.add('mienne');
  if (action) el.classList.add('cliquable');
  if (carte.etat === ETATS_CARTE.FINI && carte.colonne !== 'commandes') {
    el.classList.add('finie');
    // Flash vert au moment précis où le travail vient d'être terminé
    if (etatsPrecedents.get(carte.id) === ETATS_CARTE.ENCOURS) el.classList.add('vient-de-finir');
  }

  // Infobulle de détail au survol (desktop) — tout ce qu'on sait de la carte
  el.title = [
    `${type.nom}${carte.expedite ? ' — VIP 🔥' : ''}`,
    carte.canal === 'livraison' ? 'Livraison Yatta Eats 🛵' : `Table ${carte.table ?? '?'} 🏮`,
    `État : ${carte.etat}`,
    carte.retours > 0 ? `Retours : ${carte.retours}` : null,
  ].filter(Boolean).join('\n');

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
    <div class="carte-etat">${etiquetteEtat(carte, proprietaire)}<span class="carte-sablier" data-role="sablier"></span></div>
    ${carte.travailDebut ? '<div class="travail-progression"><div data-role="travail"></div></div>' : ''}
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

/** Fraîcheur restante (0 à 1) d'une carte sérialisée. */
export function fraicheurRestante(carte, maintenant) {
  const vie = dureeVie(carte.type, carte.expedite, carte.canal);
  return Math.max(0, 1 - (maintenant - carte.creeLe) / vie);
}

/** Formate un âge : « 42s » puis « 1:07 » au-delà de la minute. */
function formaterAge(ms) {
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Rafraîchissement continu (appelé à chaque frame) : jauges de fraîcheur,
 * âges, progression du travail et sabliers — sans reconstruire le DOM.
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
    if (ageEl) ageEl.textContent = formaterAge(age);
    el.classList.toggle('perissante', restant < 0.15);

    // Progression du travail en cours (approximation locale de la durée du poste)
    const travailEl = el.querySelector('[data-role="travail"]');
    if (travailEl && el.dataset.travaildebut) {
      const avancement = (maintenant - Number(el.dataset.travaildebut)) / Number(el.dataset.dureetravail);
      travailEl.style.width = `${Math.min(100, avancement * 100)}%`;
    }

    // Sablier ⏳ : la carte n'a pas bougé depuis trop longtemps (et personne dessus)
    const sablier = el.querySelector('[data-role="sablier"]');
    if (sablier && el.dataset.derniermouvement) {
      const immobile = maintenant - Number(el.dataset.derniermouvement);
      sablier.textContent = (el.dataset.etat !== 'encours'
        && immobile > CONFIG.affichage.seuilSablier) ? ' ⏳' : '';
    }
  }
}
