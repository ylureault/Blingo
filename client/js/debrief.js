/**
 * debrief.js — L'écran où la pédagogie se joue.
 *
 * Affiche les manches côte à côte : throughput, lead time, gâchis, cycle
 * time par colonne et CFD comparés, plus les questions de facilitation.
 */

import { COLONNE_PAR_ID } from '/shared/constants.js';
import { CONFIG } from '/shared/game-config.js';
import { dessinerCFD, legendeCFD } from './cfd.js';

const NOMS_MODES = { push: 'Flux poussé', wip: 'Limites WIP', pull: 'Flux tiré' };

/** Formate des millisecondes en « 1 min 23 s ». */
function fmtDuree(ms) {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`;
}

/** Rend l'écran de débrief complet dans les conteneurs fournis. */
export function rendreDebrief({ titre, manches, questions, actions }, etat, estFacilitateur, surAction) {
  const historique = etat.historique || [];
  const derniere = historique[historique.length - 1];
  const finie = etat.statut === 'fin';

  titre.textContent = finie
    ? '🏁 Fin de partie — le chemin parcouru'
    : `Débrief — Manche ${derniere?.numero} · ${NOMS_MODES[derniere?.mode] || ''}`;

  // ----- Cartes de manches côte à côte -----
  manches.innerHTML = '';
  const maxThroughput = Math.max(0.1, ...historique.map((m) => m.throughput));
  for (const m of historique) {
    const bloc = document.createElement('div');
    bloc.className = 'debrief-manche';
    bloc.innerHTML = `
      <h3>Manche ${m.numero} <small>${NOMS_MODES[m.mode]}</small></h3>
      <div class="debrief-metriques">
        ${metrique('🍣 Livrés', m.livres)}
        ${metrique('📈 Débit', `${m.throughput.toFixed(1)}/min`)}
        ${metrique('⏱️ Lead time moyen', fmtDuree(m.leadTimeMoyen))}
        ${metrique('⏱️ Lead time max', fmtDuree(m.leadTimeMax))}
        ${metrique('🗑️ Périmés', m.gachisPerimes, m.gachisPerimes > 0 ? 'mauvais' : '')}
        ${metrique('😡 Ratés livrés', m.gachisRates, m.gachisRates > 0 ? 'mauvais' : '')}
      </div>
      <div class="debrief-barre-debit" title="Débit relatif entre manches">
        <div style="width:${(m.throughput / maxThroughput) * 100}%"></div>
      </div>
      <h4>Cycle time par poste</h4>
      <div class="debrief-cycles">${barresCycles(m.cycleTimes)}</div>
      <h4>Flux cumulé</h4>
      <canvas class="debrief-cfd" width="300" height="120"></canvas>
    `;
    manches.appendChild(bloc);
    dessinerCFD(bloc.querySelector('.debrief-cfd'), m.cfd, m.duree);
  }
  if (historique.length > 0) {
    manches.insertAdjacentHTML('beforeend', `<div class="cfd-legende">${legendeCFD()}</div>`);
  }

  // ----- Questions de facilitation -----
  const liste = finie
    ? Object.values(CONFIG.questionsDebrief).flat().slice(-3)
    : (CONFIG.questionsDebrief[derniere?.numero] || []);
  questions.innerHTML = `
    <h3>💬 À discuter en équipe</h3>
    <ul>${liste.map((q) => `<li>${q}</li>`).join('')}</ul>`;

  // ----- Actions (facilitateur uniquement) -----
  actions.innerHTML = '';
  if (estFacilitateur && !finie) {
    const prochaine = (derniere?.numero || 0) + 1;
    if (prochaine <= CONFIG.manches.length) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-principal';
      btn.textContent = `Lancer la manche ${prochaine} — ${CONFIG.manches[prochaine - 1].titre}`;
      btn.addEventListener('click', () => surAction('demarrer', prochaine));
      actions.appendChild(btn);
    }
  } else if (!finie) {
    actions.innerHTML = '<p class="lobby-aide">Discutez ! Le facilitateur lancera la suite.</p>';
  } else {
    actions.innerHTML = '<p class="lobby-aide">Merci d’avoir joué 🍶 — rechargez la page pour une nouvelle partie.</p>';
  }
}

function metrique(nom, valeur, classe = '') {
  return `<div class="metrique ${classe}"><span>${nom}</span><b>${valeur}</b></div>`;
}

function barresCycles(cycleTimes) {
  const entrees = Object.entries(cycleTimes || {})
    .filter(([col]) => col !== 'commandes' && col !== 'livre');
  if (entrees.length === 0) return '<p class="lobby-aide">Aucun sushi livré…</p>';
  const max = Math.max(...entrees.map(([, v]) => v));
  return entrees.map(([col, v]) => `
    <div class="cycle-ligne ${v === max ? 'cycle-goulot' : ''}">
      <span>${COLONNE_PAR_ID[col]?.nom || col}</span>
      <div class="cycle-barre"><div style="width:${(v / max) * 100}%"></div></div>
      <b>${fmtDuree(v)}</b>
    </div>`).join('');
}
