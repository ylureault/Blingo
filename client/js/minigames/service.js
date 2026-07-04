/**
 * Mini-jeu SERVICE — porter le plateau au bon client.
 *
 * Trois clients attendent, chacun avec son ticket de commande. Faites
 * glisser le plateau vers celui qui a commandé CE sushi. Mauvaise table =
 * plateau refusé, le service est à refaire (et la fraîcheur file…).
 */

import { CONFIG } from '/shared/game-config.js';
import { svgSushi } from '../sushi-svg.js';
import { el, melanger, rendreDeplacable, cibleSous } from './outils.js';

const CLIENTS = ['🧔', '👩', '👴', '👨‍🦰', '👵', '🧑‍🎤'];

export function jouerService(conteneur, { carte, duree }) {
  return new Promise((resoudre) => {
    const type = CONFIG.typesSushi[carte.type];
    const enLivraison = carte.canal === 'livraison';
    // Trois tickets : le bon + deux autres types différents
    const autres = melanger(Object.keys(CONFIG.typesSushi).filter((t) => t !== carte.type)).slice(0, 2);
    const tickets = melanger([carte.type, ...autres]);
    // En salle : des clients à table. En livraison : des livreurs Yatta Eats.
    const visages = enLivraison ? ['🛵', '🛵', '🛵'] : melanger(CLIENTS).slice(0, 3);
    const numeros = enLivraison
      ? melanger([carte.id, 'YE-12', 'YE-58']).map((n, i) => `sac n°${i + 1}`)
      : null;

    conteneur.innerHTML = `
      <h3>${enLivraison ? '🛵 Remise Yatta Eats' : '🏮 Service en salle'} — ${type.nom}</h3>
      <p class="minijeu-consigne">${enLivraison
        ? `Glissez le plateau dans le sac du livreur qui attend <b>${type.nom.toLowerCase()}</b> — le scooter n’attend pas !`
        : `Glissez le plateau vers le client qui a commandé <b>${type.nom.toLowerCase()}</b>.`}</p>
      <div class="salle-clients">
        ${tickets.map((t, i) => `
          <div class="client ${enLivraison ? 'livreur' : ''}" data-type="${t}">
            <div class="client-visage">${visages[i]}</div>
            <div class="client-ticket">${CONFIG.typesSushi[t].emoji} ${CONFIG.typesSushi[t].nom}${numeros ? `<br><small>${numeros[i]}</small>` : ''}</div>
          </div>`).join('')}
      </div>
      <div class="comptoir">
        <div class="plateau" id="plateau">${svgSushi(carte.type, { taille: 84 })}<span>dressage…</span></div>
      </div>
    `;
    const plateau = conteneur.querySelector('#plateau');
    const verdictZone = el('p', 'minijeu-verdict', '');
    conteneur.appendChild(verdictZone);

    let pret = false;
    let fini = false;

    // Dressage du plateau : le temps du poste reste incompressible
    setTimeout(() => {
      pret = true;
      plateau.classList.add('pret');
      plateau.querySelector('span').textContent = 'glissez-moi !';
    }, Math.max(500, duree * 0.7));

    const terminer = (reussi, message) => {
      if (fini) return;
      fini = true;
      verdictZone.textContent = message;
      verdictZone.classList.add(reussi ? 'bon' : 'mauvais');
      setTimeout(() => resoudre({ reussi }), 1000);
    };

    rendreDeplacable(plateau, (x, y) => {
      if (fini || !pret) return;
      const client = cibleSous(x, y, '.client');
      if (!client) return; // lâché dans le vide : on garde le plateau
      if (client.dataset.type === carte.type) {
        client.classList.add('servi');
        terminer(true, enLivraison ? '🛵 Le scooter démarre, sushi en route !' : '🎏 Sushi livré, client ravi !');
      } else {
        client.classList.add('vexe');
        terminer(false, enLivraison ? '🙅 Mauvais sac ! Le plateau revient au comptoir.' : '🙅 Mauvaise table ! Le plateau revient au comptoir.');
      }
    });
  });
}
