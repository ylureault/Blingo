/**
 * sushi-svg.js — Illustrations SVG inline des sushis.
 * Tout est dessiné en vectoriel : aucune image externe, aucun téléchargement.
 * `defaut: true` produit une version visiblement ratée (pour le contrôle qualité).
 */

/** Renvoie le SVG (chaîne) d'un sushi donné. */
export function svgSushi(type, { defaut = false, taille = 48 } = {}) {
  const dessin = DESSINS[type] || DESSINS.maki;
  return `<svg viewBox="0 0 64 40" width="${taille}" height="${Math.round(taille * 40 / 64)}"
    xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${type}">${dessin(defaut)}</svg>`;
}

// Couleurs de la palette « izakaya »
const RIZ = '#f5efe2';
const NORI = '#232a20';
const SAUMON = '#f08a5d';
const SAUMON_RATE = '#8d9f87'; // poisson douteux…
const AVOCAT = '#9bc06c';
const OMELETTE = '#f2c14e';

const DESSINS = {
  // Maki : rouleau nori, riz, cœur de saumon
  maki: (defaut) => `
    <ellipse cx="32" cy="22" rx="18" ry="14" fill="${NORI}"/>
    <ellipse cx="32" cy="20" rx="14" ry="10" fill="${RIZ}"/>
    <ellipse cx="32" cy="20" rx="6" ry="4.5" fill="${defaut ? SAUMON_RATE : SAUMON}"/>
    ${defaut ? `<path d="M18 10 L46 32" stroke="#c73e3a" stroke-width="2" opacity=".7"/>` : ''}`,

  // Nigiri : boule de riz + tranche de poisson (tordue si défaut)
  nigiri: (defaut) => `
    <ellipse cx="32" cy="28" rx="17" ry="9" fill="${RIZ}"/>
    <path d="M15 22 Q32 ${defaut ? 6 : 12} 49 22 L47 27 Q32 ${defaut ? 14 : 19} 17 27 Z"
      fill="${defaut ? SAUMON_RATE : SAUMON}"/>
    <path d="M22 21 L26 24 M32 19 L36 22 M42 21 L44 23" stroke="#d96b45" stroke-width="1.2" opacity=".6"/>`,

  // Sashimi : trois tranches en éventail
  sashimi: (defaut) => `
    <g fill="${defaut ? SAUMON_RATE : SAUMON}" stroke="#d96b45" stroke-width=".8">
      <path d="M10 30 Q16 12 26 14 L28 30 Z"/>
      <path d="M24 32 Q30 12 40 14 L42 32 Z"/>
      <path d="M38 30 Q44 12 54 14 L54 30 Z"/>
    </g>
    ${defaut ? `<circle cx="32" cy="22" r="3" fill="#5a6b52"/>` : `<circle cx="52" cy="32" r="3" fill="#9bc06c"/>`}`,

  // California : rouleau inversé, riz dehors, avocat + surimi
  california: (defaut) => `
    <ellipse cx="32" cy="22" rx="18" ry="14" fill="${RIZ}" stroke="#e3d9c6"/>
    <ellipse cx="32" cy="21" rx="12" ry="8.5" fill="${NORI}"/>
    <ellipse cx="28" cy="21" rx="4" ry="3" fill="${defaut ? '#6b7280' : AVOCAT}"/>
    <ellipse cx="37" cy="21" rx="4" ry="3" fill="#e86a5b"/>
    <circle cx="20" cy="12" r="1.2" fill="#caa96d"/><circle cx="30" cy="9" r="1.2" fill="#caa96d"/>
    <circle cx="42" cy="12" r="1.2" fill="#caa96d"/><circle cx="47" cy="20" r="1.2" fill="#caa96d"/>`,

  // Plateau mixte : petit assortiment sur planche
  plateau: (defaut) => `
    <rect x="4" y="26" width="56" height="8" rx="2" fill="#8a6642"/>
    <ellipse cx="16" cy="22" rx="9" ry="7" fill="${NORI}"/>
    <ellipse cx="16" cy="21" rx="6" ry="4.5" fill="${RIZ}"/>
    <ellipse cx="16" cy="21" rx="2.5" ry="2" fill="${defaut ? SAUMON_RATE : SAUMON}"/>
    <ellipse cx="36" cy="24" rx="9" ry="5" fill="${RIZ}"/>
    <path d="M27 20 Q36 13 45 20 L44 23 Q36 18 28 23 Z" fill="${defaut ? SAUMON_RATE : SAUMON}"/>
    <path d="M48 26 Q52 14 58 16 L59 26 Z" fill="${defaut ? SAUMON_RATE : SAUMON}"/>
    ${defaut ? `<path d="M6 12 L58 30" stroke="#c73e3a" stroke-width="2" opacity=".6"/>` : ''}`,
};

/** Pastilles SVG des ingrédients (pour le mini-jeu d'assemblage). */
export function svgIngredient(nom, taille = 34) {
  const formes = {
    riz:      `<ellipse cx="16" cy="18" rx="12" ry="8" fill="${RIZ}" stroke="#d8cbb2"/>`,
    nori:     `<rect x="5" y="8" width="22" height="16" rx="2" fill="${NORI}"/>`,
    poisson:  `<path d="M5 20 Q16 6 27 14 L26 22 Q16 14 6 24 Z" fill="${SAUMON}"/>`,
    wasabi:   `<circle cx="16" cy="16" r="8" fill="#7aa661"/><circle cx="13" cy="13" r="2" fill="#94c47a"/>`,
    avocat:   `<ellipse cx="16" cy="16" rx="10" ry="8" fill="${AVOCAT}"/><circle cx="16" cy="16" r="3.5" fill="#6b4f2e"/>`,
    surimi:   `<rect x="6" y="10" width="20" height="12" rx="5" fill="#e86a5b"/><rect x="6" y="10" width="20" height="5" rx="2.5" fill="${RIZ}"/>`,
    sesame:   `<circle cx="10" cy="12" r="2" fill="#caa96d"/><circle cx="18" cy="18" r="2" fill="#caa96d"/><circle cx="23" cy="10" r="2" fill="#8a6642"/>`,
    omelette: `<rect x="6" y="10" width="20" height="12" rx="3" fill="${OMELETTE}"/><line x1="6" y1="16" x2="26" y2="16" stroke="#d9a63c"/>`,
  };
  return `<svg viewBox="0 0 32 32" width="${taille}" height="${taille}"
    xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${nom}">${formes[nom] || formes.riz}</svg>`;
}

/** Noms affichables des ingrédients. */
export const NOMS_INGREDIENTS = {
  riz: 'Riz', nori: 'Nori', poisson: 'Poisson', wasabi: 'Wasabi',
  avocat: 'Avocat', surimi: 'Surimi', sesame: 'Sésame', omelette: 'Omelette',
};
