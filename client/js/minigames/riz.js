/**
 * Mini-jeu PRÉPARATION RIZ — la jauge de cuisson.
 *
 * Maintenir le bouton pour cuire : la jauge monte. Relâcher dans la zone
 * verte = riz parfait. Trop tôt = riz cru, trop tard (ou jauge pleine) =
 * riz brûlé → la carte repart en file d'attente (échec).
 */

import { el } from './outils.js';

const ZONE_MIN = 0.62; // début de la zone verte (fraction de la jauge)
const ZONE_MAX = 0.90; // fin de la zone verte

export function jouerRiz(conteneur, { duree }) {
  return new Promise((resoudre) => {
    conteneur.innerHTML = `
      <h3>🍚 Préparation du riz</h3>
      <p class="minijeu-consigne">Maintenez <b>CUIRE</b> et relâchez dans la zone verte.</p>
      <div class="jauge-riz">
        <div class="jauge-zone" style="left:${ZONE_MIN * 100}%; width:${(ZONE_MAX - ZONE_MIN) * 100}%"></div>
        <div class="jauge-remplissage"></div>
      </div>
      <div class="jauge-etiquettes"><span>cru</span><span>parfait</span><span>brûlé</span></div>
    `;
    const bouton = el('button', 'btn btn-principal btn-cuire', '🔥 CUIRE (maintenir)');
    conteneur.appendChild(bouton);
    const remplissage = conteneur.querySelector('.jauge-remplissage');

    // La jauge se remplit en `duree * 1.2` ms : relâcher dans la zone verte
    // demande donc naturellement ~75 à 110 % de la durée théorique du poste.
    const dureePleine = duree * 1.2;
    let progression = 0;
    let enCuisson = false;
    let horloge = null;
    let precedent = 0;

    const terminer = (reussi, message) => {
      cancelAnimationFrame(horloge);
      bouton.disabled = true;
      const verdict = el('p', `minijeu-verdict ${reussi ? 'bon' : 'mauvais'}`, message);
      conteneur.appendChild(verdict);
      setTimeout(() => resoudre({ reussi }), 900);
    };

    const boucle = (t) => {
      if (enCuisson) {
        progression += (t - precedent) / dureePleine;
        remplissage.style.width = `${Math.min(100, progression * 100)}%`;
        remplissage.classList.toggle('chaud', progression > ZONE_MAX);
        if (progression >= 1) return terminer(false, '💨 Brûlé ! Le riz repart en préparation…');
      }
      precedent = t;
      horloge = requestAnimationFrame(boucle);
    };
    horloge = requestAnimationFrame((t) => { precedent = t; boucle(t); });

    bouton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      bouton.setPointerCapture(e.pointerId);
      enCuisson = true;
    });
    bouton.addEventListener('pointerup', () => {
      if (!enCuisson) return;
      enCuisson = false;
      if (progression >= ZONE_MIN && progression <= ZONE_MAX) {
        terminer(true, '✨ Riz parfait !');
      } else if (progression < ZONE_MIN) {
        terminer(false, '🥶 Riz cru… on recommence.');
      } else {
        terminer(false, '💨 Trop cuit ! On recommence.');
      }
    });
  });
}
