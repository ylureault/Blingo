/**
 * cfd.js — Dessin du diagramme de flux cumulé (CFD) sur un canvas.
 *
 * Chaque bande colorée = une étape du flux. La hauteur d'une bande à un
 * instant t = nombre de cartes entre cette étape et la suivante (le WIP).
 * Si une bande gonfle, le travail s'accumule : le goulot se VOIT.
 */

import { COLONNES } from '/shared/constants.js';

// Ordre de dessin : de la colonne la plus en aval (bas) à la plus en amont (haut)
const SERIES = [...COLONNES].reverse();

// Palette : livré en vert, puis dégradé chaud vers l'amont
const COULEURS = {
  livre:      '#5c8d5a',
  service:    '#7a9e7e',
  qualite:    '#caa96d',
  assemblage: '#d98e4a',
  decoupe:    '#c96a4a',
  riz:        '#b04a3e',
  commandes:  '#7d3a35',
};

/**
 * Dessine le CFD à partir des échantillons [{ t, cumuls: {colonne: n} }].
 * `duree` (ms) fixe l'échelle horizontale (la durée totale de la manche).
 */
export function dessinerCFD(canvas, echantillons, duree) {
  const ctx = canvas.getContext('2d');
  const L = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, L, H);
  if (!echantillons || echantillons.length < 2) {
    ctx.fillStyle = 'rgba(245,239,230,.35)';
    ctx.font = '12px system-ui';
    ctx.fillText('Le diagramme se dessine pendant la manche…', 12, H / 2);
    return;
  }

  const maxT = Math.max(duree, echantillons[echantillons.length - 1].t);
  const maxN = Math.max(4, ...echantillons.map((e) => e.cumuls.commandes || 0));
  const x = (t) => 6 + (t / maxT) * (L - 12);
  const y = (n) => H - 6 - (n / maxN) * (H - 12);

  // Chaque série est une aire entre sa courbe et le bas du graphe ;
  // dessinées de l'amont (la plus haute) vers l'aval, elles se recouvrent
  // pour ne laisser visible que la bande de chaque étape.
  for (let i = SERIES.length - 1; i >= 0; i -= 1) {
    const { id } = SERIES[i];
    ctx.beginPath();
    ctx.moveTo(x(echantillons[0].t), y(echantillons[0].cumuls[id] || 0));
    for (const e of echantillons) ctx.lineTo(x(e.t), y(e.cumuls[id] || 0));
    ctx.lineTo(x(echantillons[echantillons.length - 1].t), H - 6);
    ctx.lineTo(x(echantillons[0].t), H - 6);
    ctx.closePath();
    ctx.fillStyle = COULEURS[id] || '#888';
    ctx.fill();
  }

  // Cadre discret
  ctx.strokeStyle = 'rgba(245,239,230,.25)';
  ctx.strokeRect(0.5, 0.5, L - 1, H - 1);
}

/** Légende HTML compacte (réutilisée sur l'écran de débrief). */
export function legendeCFD() {
  return SERIES.map(({ id, nom }) =>
    `<span class="cfd-legende-item"><i style="background:${COULEURS[id]}"></i>${nom}</span>`
  ).join('');
}
