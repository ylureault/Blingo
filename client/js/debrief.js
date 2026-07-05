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
        ${metrique('🎯 Lead time p85', fmtDuree(m.leadTimeP85), '', '85 % des sushis sont sortis en moins que ça : la vraie promesse client')}
        ${metrique('🥇 Le plus rapide', fmtDuree(m.leadTimeMin))}
        ${metrique('⏱️ Lead time max', fmtDuree(m.leadTimeMax))}
        ${metrique('⚡ Efficience du flux', m.efficience ? `${Math.round(m.efficience * 100)} %` : '—', '', 'Part du lead time réellement travaillée — le reste n’est que de l’attente')}
        ${metrique('↩️ Retours (rework)', m.retoursTotal ?? 0, (m.retoursTotal ?? 0) > 0 ? 'mauvais' : '')}
        ${metrique('🗑️ Périmés', m.gachisPerimes, m.gachisPerimes > 0 ? 'mauvais' : '')}
        ${metrique('😡 Ratés livrés', m.gachisRates, m.gachisRates > 0 ? 'mauvais' : '')}
        ${metrique('🏮 Sur place', m.livresSalle ?? '—')}
        ${metrique('🛵 Yatta Eats', m.livresLivraison ?? '—')}
      </div>
      <div class="debrief-barre-debit" title="Débit relatif entre manches">
        <div style="width:${(m.throughput / maxThroughput) * 100}%"></div>
      </div>
      <h4>Distribution du lead time</h4>
      <div class="debrief-histo">${histogrammeLeadTime(m.leadTimes)}</div>
      <h4>Cycle time par poste</h4>
      <div class="debrief-cycles">${barresCycles(m.cycleTimes)}</div>
      <h4>Flux cumulé</h4>
      <canvas class="debrief-cfd" width="300" height="120"></canvas>
      <div class="enseignement">
        <h4>💡 Ce qu’il fallait voir</h4>
        <p>${CONFIG.enseignements[m.numero] || ''}</p>
      </div>
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

  // ----- Actions -----
  actions.innerHTML = '';

  // Fin de partie : les records de la salle, puis l'invitation au transfert
  if (finie && historique.length > 0) {
    const meilleureManche = historique.reduce((a, b) => (b.throughput > a.throughput ? b : a));
    const meilleurLead = Math.min(...historique.map((m) => m.leadTimeMin || Infinity).filter(Number.isFinite));
    const totalLivres = historique.reduce((s, m) => s + m.livres, 0);
    actions.insertAdjacentHTML('beforebegin', `
      <div class="records">
        <div class="record">🏆 Meilleur débit<b>${meilleureManche.throughput.toFixed(1)}/min</b><small>manche ${meilleureManche.numero}</small></div>
        <div class="record">⚡ Sushi éclair<b>${Number.isFinite(meilleurLead) ? fmtDuree(meilleurLead) : '—'}</b><small>meilleur lead time</small></div>
        <div class="record">🍣 Total régalé<b>${totalLivres}</b><small>sushis livrés sur la partie</small></div>
      </div>`);
  }

  // Fin de partie : l'invitation à transformer le vécu en pratique
  if (finie) {
    actions.insertAdjacentHTML('beforebegin', `
      <div class="cta-insuffle">
        <p class="cta-souffle">〜</p>
        <h3>Vous venez de VIVRE Kanban. Et maintenant ?</h3>
        <p>${CONFIG.marque.tagline} — ateliers et formations pour ancrer
           ces pratiques dans vos équipes, partout en France.</p>
        <a class="btn btn-principal" href="${CONFIG.marque.url}" target="_blank" rel="noopener">
          Découvrir ${CONFIG.marque.nom}</a>
      </div>`);
  }

  const btnBilan = document.createElement('button');
  btnBilan.className = 'btn btn-discret';
  btnBilan.textContent = '🖨 Exporter le bilan (PDF)';
  btnBilan.addEventListener('click', () => window.print());

  // Export JSON : les métriques brutes, pour les facilitateurs data-curieux
  const btnJson = document.createElement('button');
  btnJson.className = 'btn btn-discret';
  btnJson.textContent = '💾 Export JSON';
  btnJson.title = 'Télécharger les métriques brutes des manches';
  btnJson.addEventListener('click', () => {
    const donnees = { jeu: 'Sushi Kanban', par: CONFIG.marque.nom, code: etat.code, manches: historique };
    const blob = new Blob([JSON.stringify(donnees, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sushi-kanban-bilan-${etat.code}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  if (estFacilitateur) {
    if (!finie) {
      const prochaine = (derniere?.numero || 0) + 1;
      if (prochaine <= CONFIG.manches.length) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-principal';
        btn.textContent = `Lancer la manche ${prochaine} — ${CONFIG.manches[prochaine - 1].titre}`;
        btn.addEventListener('click', () => surAction('demarrer', prochaine));
        actions.appendChild(btn);
      }
    }
    // Rejouer la même manche : précieux quand la leçon mérite un second tour
    if (derniere) {
      const btnBis = document.createElement('button');
      btnBis.className = 'btn';
      btnBis.textContent = `↻ Rejouer la manche ${derniere.numero}`;
      btnBis.addEventListener('click', () => surAction('demarrer', derniere.numero));
      actions.appendChild(btnBis);
    }
  } else if (!finie) {
    actions.innerHTML = '<p class="lobby-aide">Discutez ! Le facilitateur lancera la suite.</p>';
  }
  actions.appendChild(btnBilan);
  actions.appendChild(btnJson);

  // Signature de bas de page (visible à l'écran ET sur le bilan imprimé)
  if (!actions.parentElement.querySelector('.signature-insuffle')) {
    actions.parentElement.insertAdjacentHTML('beforeend', `
      <footer class="signature-insuffle">
        <a href="${CONFIG.marque.url}" target="_blank" rel="noopener">
          <span class="insuffle-souffle">〜</span> Sushi Kanban, un jeu <b>${CONFIG.marque.nom}</b></a>
        <small>${CONFIG.marque.signature} · ${CONFIG.marque.urlJeu.replace('https://', '')}</small>
      </footer>`);
  }
}

/**
 * Histogramme de la distribution du lead time : la moyenne cache toujours
 * une traîne — la faire voir vaut tous les discours sur la prévisibilité.
 */
function histogrammeLeadTime(leadTimes) {
  if (!leadTimes || leadTimes.length === 0) return '<p class="lobby-aide">Aucun sushi livré…</p>';
  const NB_CLASSES = 8;
  const max = Math.max(...leadTimes);
  const largeur = Math.max(1, Math.ceil(max / NB_CLASSES / 1000) * 1000); // classes rondes en secondes
  const classes = new Array(NB_CLASSES).fill(0);
  for (const lt of leadTimes) {
    classes[Math.min(NB_CLASSES - 1, Math.floor(lt / largeur))] += 1;
  }
  const pic = Math.max(...classes);
  return `<div class="histo">${classes.map((n, i) => `
    <div class="histo-classe" title="${n} sushi(s) entre ${i * largeur / 1000}s et ${(i + 1) * largeur / 1000}s">
      <div class="histo-barre" style="height:${pic ? (n / pic) * 100 : 0}%"></div>
      <span>${Math.round((i + 1) * largeur / 1000)}s</span>
    </div>`).join('')}</div>`;
}

function metrique(nom, valeur, classe = '', infobulle = '') {
  return `<div class="metrique ${classe}" ${infobulle ? `title="${infobulle}"` : ''}><span>${nom}</span><b>${valeur}</b></div>`;
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
