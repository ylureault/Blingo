/**
 * sons.js — Sons discrets, synthétisés en WebAudio.
 * Aucun fichier audio : de simples oscillateurs, donc zéro ressource externe.
 * Désactivables (préférence conservée dans localStorage).
 */

const CLE = 'sushi-kanban-sons';
let contexte = null;
let actifs = localStorage.getItem(CLE) !== 'off';

function ctx() {
  if (!contexte) contexte = new (window.AudioContext || window.webkitAudioContext)();
  return contexte;
}

/** Joue une petite séquence de notes [fréquence, durée s, décalage s]. */
function jouer(notes, type = 'sine', volume = 0.06) {
  if (!actifs) return;
  try {
    const c = ctx();
    for (const [freq, duree, decalage] of notes) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      const t = c.currentTime + (decalage || 0);
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duree);
      osc.connect(gain).connect(c.destination);
      osc.start(t);
      osc.stop(t + duree);
    }
  } catch { /* l'audio peut être bloqué avant la première interaction : tant pis */ }
}

export const sons = {
  actifs: () => actifs,
  basculer() {
    actifs = !actifs;
    localStorage.setItem(CLE, actifs ? 'on' : 'off');
    if (actifs) this.commande();
    return actifs;
  },
  commande()  { jouer([[660, 0.08], [880, 0.10, 0.07]]); },                    // pop-pop : nouvelle commande
  livre()     { jouer([[523, 0.10], [659, 0.10, 0.08], [784, 0.16, 0.16]]); }, // arpège : sushi livré !
  perime()    { jouer([[220, 0.25], [165, 0.35, 0.12]], 'sawtooth', 0.04); },  // womp : sushi périmé
  rate()      { jouer([[196, 0.2], [185, 0.3, 0.1]], 'square', 0.03); },       // client mécontent
  expedite()  { jouer([[988, 0.09], [988, 0.09, 0.14], [1175, 0.14, 0.28]]); },// urgence VIP
  bloque()    { jouer([[330, 0.08]], 'square', 0.03); },                       // action refusée
  finManche() { jouer([[784, 0.2], [659, 0.2, 0.18], [523, 0.35, 0.36]]); },   // gong de fin
};
