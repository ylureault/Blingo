/**
 * Mini-jeu DÉCOUPE POISSON — les lignes de découpe.
 *
 * Des lignes apparaissent une à une sur le poisson : cliquez chaque ligne
 * active pour trancher. Trois coups de couteau à côté = filet massacré (échec).
 */

import { el } from './outils.js';

const NB_LIGNES = 4;
const RATES_MAX = 3;

export function jouerDecoupe(conteneur, { duree }) {
  return new Promise((resoudre) => {
    conteneur.innerHTML = `
      <h3>🔪 Découpe du poisson</h3>
      <p class="minijeu-consigne">Tranchez les lignes <b>dans l’ordre</b> dès qu’elles brillent.</p>
    `;
    const planche = el('div', 'planche-decoupe');
    // Le poisson : une belle pièce de saumon en SVG
    planche.innerHTML = `
      <svg viewBox="0 0 300 120" class="poisson-svg">
        <path d="M20 60 Q80 8 190 18 Q265 26 285 60 Q265 94 190 102 Q80 112 20 60 Z"
          fill="#f08a5d" stroke="#d96b45" stroke-width="3"/>
        <path d="M30 60 Q90 25 180 30 M35 70 Q95 45 185 48 M40 80 Q100 65 190 66"
          stroke="#f7b899" stroke-width="4" fill="none" opacity=".7"/>
      </svg>`;
    conteneur.appendChild(planche);
    const verdictZone = el('p', 'minijeu-verdict', '');
    conteneur.appendChild(verdictZone);

    let coupees = 0;
    let rates = 0;
    let fini = false;

    const terminer = (reussi, message) => {
      if (fini) return;
      fini = true;
      verdictZone.textContent = message;
      verdictZone.classList.add(reussi ? 'bon' : 'mauvais');
      setTimeout(() => resoudre({ reussi }), 900);
    };

    // Un clic hors des lignes = coup de couteau raté
    planche.addEventListener('pointerdown', (e) => {
      if (fini || e.target.closest('.ligne-decoupe')) return;
      rates += 1;
      planche.classList.remove('secousse');
      void planche.offsetWidth; // relance l'animation
      planche.classList.add('secousse');
      if (rates >= RATES_MAX) terminer(false, '😱 Filet massacré ! Le poisson repart en découpe.');
    });

    // Les lignes apparaissent réparties sur la durée du poste
    const intervalle = duree / (NB_LIGNES + 1);
    for (let i = 0; i < NB_LIGNES; i += 1) {
      setTimeout(() => {
        if (fini) return;
        const ligne = el('button', 'ligne-decoupe');
        ligne.style.left = `${18 + i * 21}%`;
        ligne.setAttribute('aria-label', `Ligne de découpe ${i + 1}`);
        ligne.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          if (fini) return;
          ligne.classList.add('coupee');
          ligne.disabled = true;
          coupees += 1;
          if (coupees === NB_LIGNES) terminer(true, '🎌 Découpe impeccable !');
        });
        planche.appendChild(ligne);
      }, intervalle * (i + 1));
    }
  });
}
