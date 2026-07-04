/**
 * Mini-jeu ASSEMBLAGE — glisser-déposer les ingrédients dans l'ordre.
 *
 * La recette s'affiche : faites glisser chaque ingrédient sur la natte,
 * dans l'ordre. Un mauvais ingrédient = maladresse ; trois maladresses et
 * l'assemblage est raté. Une fois tout posé, le rouleau se presse tout seul.
 */

import { CONFIG } from '/shared/game-config.js';
import { svgIngredient, NOMS_INGREDIENTS } from '../sushi-svg.js';
import { el, melanger, rendreDeplacable, cibleSous } from './outils.js';

const RATES_MAX = 3;
// Ingrédients pièges possibles (jamais dans la recette du sushi en cours)
const TOUS = ['riz', 'nori', 'poisson', 'wasabi', 'avocat', 'surimi', 'sesame', 'omelette'];

export function jouerAssemblage(conteneur, { carte, duree }) {
  return new Promise((resoudre) => {
    const recette = CONFIG.typesSushi[carte.type].ingredients;
    const pieges = melanger(TOUS.filter((i) => !recette.includes(i))).slice(0, 2);
    const disponibles = melanger([...recette, ...pieges]);

    conteneur.innerHTML = `
      <h3>🍙 Assemblage — ${CONFIG.typesSushi[carte.type].nom}</h3>
      <p class="minijeu-consigne">Glissez les ingrédients sur la natte, <b>dans l’ordre de la recette</b>.</p>
      <ol class="recette">${recette.map((i) => `<li data-ingredient="${i}">${NOMS_INGREDIENTS[i]}</li>`).join('')}</ol>
      <div class="natte" id="natte">Déposez ici ↓</div>
      <div class="garde-manger"></div>
    `;
    const natte = conteneur.querySelector('#natte');
    const gardeManger = conteneur.querySelector('.garde-manger');
    const etapes = [...conteneur.querySelectorAll('.recette li')];
    const verdictZone = el('p', 'minijeu-verdict', '');
    conteneur.appendChild(verdictZone);

    let indexAttendu = 0;
    let rates = 0;
    let fini = false;

    const terminer = (reussi, message) => {
      if (fini) return;
      fini = true;
      verdictZone.textContent = message;
      verdictZone.classList.add(reussi ? 'bon' : 'mauvais');
      setTimeout(() => resoudre({ reussi }), 900);
    };

    const debut = performance.now();
    const toutPose = () => {
      // Tout est posé : le rouleau se presse pendant le temps de travail restant
      // (la durée du poste reste incompressible, même pour les rapides)
      natte.innerHTML = '<div class="pressage"><div class="pressage-barre"></div>🍥 Pressage du rouleau…</div>';
      const barre = natte.querySelector('.pressage-barre');
      const restant = Math.max(400, duree - (performance.now() - debut));
      barre.style.transition = `width ${restant}ms linear`;
      requestAnimationFrame(() => { barre.style.width = '100%'; });
      setTimeout(() => terminer(true, '🌸 Assemblage réussi !'), restant);
    };

    for (const ingredient of disponibles) {
      const jeton = el('div', 'ingredient', `${svgIngredient(ingredient)}<span>${NOMS_INGREDIENTS[ingredient]}</span>`);
      jeton.dataset.ingredient = ingredient;
      gardeManger.appendChild(jeton);
      rendreDeplacable(jeton, (x, y) => {
        if (fini || !cibleSous(x, y, '#natte')) return; // lâché hors de la natte : rien
        if (ingredient === recette[indexAttendu]) {
          etapes[indexAttendu].classList.add('faite');
          indexAttendu += 1;
          jeton.classList.add('pose');
          jeton.style.pointerEvents = 'none';
          natte.appendChild(jeton);
          if (indexAttendu === recette.length) toutPose();
        } else {
          rates += 1;
          jeton.classList.remove('secousse');
          void jeton.offsetWidth;
          jeton.classList.add('secousse');
          if (rates >= RATES_MAX) terminer(false, '🙈 Assemblage raté ! On recommence.');
        }
      });
    }
  });
}
