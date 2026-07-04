/**
 * Mini-jeu CONTRÔLE QUALITÉ — l'œil du chef.
 *
 * Comparez le sushi produit à la commande pendant l'inspection, puis
 * décidez : conforme (il part au service) ou renvoyé à l'assemblage.
 * Attention : laisser passer un défaut = client furieux à la livraison ;
 * renvoyer un bon sushi = temps perdu pour toute l'équipe.
 */

import { CONFIG } from '/shared/game-config.js';
import { svgSushi } from '../sushi-svg.js';
import { el } from './outils.js';

export function jouerQualite(conteneur, { carte, duree }) {
  return new Promise((resoudre) => {
    const type = CONFIG.typesSushi[carte.type];
    // `carte.defaut` n'est transmis par le serveur qu'au poste qualité
    const defaut = carte.defaut === true;

    conteneur.innerHTML = `
      <h3>🔍 Contrôle qualité — ${type.nom}</h3>
      <p class="minijeu-consigne">Comparez la commande et l’assiette. Un défaut ? Renvoyez-la !</p>
      <div class="qc-comparaison">
        <figure><figcaption>La commande</figcaption>${svgSushi(carte.type, { taille: 120 })}</figure>
        <figure class="qc-produit"><figcaption>L’assiette produite</figcaption>${svgSushi(carte.type, { defaut, taille: 120 })}</figure>
      </div>
      <div class="qc-inspection"><div class="qc-loupe">🔍</div><div class="qc-barre"></div></div>
    `;
    const barre = conteneur.querySelector('.qc-barre');
    const actions = el('div', 'qc-actions');
    const btnOk = el('button', 'btn btn-principal', '✅ Conforme');
    const btnKo = el('button', 'btn btn-danger', '↩️ Renvoyer');
    btnOk.disabled = btnKo.disabled = true;
    actions.append(btnOk, btnKo);
    conteneur.appendChild(actions);

    // L'inspection prend le temps du poste : impossible de tamponner sans regarder
    const inspection = Math.max(600, duree * 0.85);
    barre.style.transition = `width ${inspection}ms linear`;
    requestAnimationFrame(() => { barre.style.width = '100%'; });
    setTimeout(() => { btnOk.disabled = btnKo.disabled = false; }, inspection);

    const decider = (accepter) => {
      btnOk.disabled = btnKo.disabled = true;
      const bonneDecision = accepter !== defaut;
      const verdict = el('p', `minijeu-verdict ${bonneDecision ? 'bon' : 'mauvais'}`,
        accepter
          ? (defaut ? '😬 Vous l’avez laissé passer… espérons que le client ne voie rien.' : '👌 Bon œil : assiette conforme.')
          : (defaut ? '🎯 Bien vu, le défaut retourne à l’assemblage.' : '😅 Fausse alerte : c’était bon… retour à l’assemblage quand même.'));
      conteneur.appendChild(verdict);
      setTimeout(() => resoudre({ reussi: true, accepter }), 1100);
    };
    btnOk.addEventListener('click', () => decider(true));
    btnKo.addEventListener('click', () => decider(false));
  });
}
