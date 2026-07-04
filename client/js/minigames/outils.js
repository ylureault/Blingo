/**
 * outils.js — Petites aides partagées par les mini-jeux.
 */

/** Attend `ms` millisecondes. */
export const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/** Mélange un tableau (copie). */
export function melanger(tableau) {
  const copie = [...tableau];
  for (let i = copie.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

/** Crée un élément avec classe et contenu HTML. */
export function el(balise, classe = '', html = '') {
  const e = document.createElement(balise);
  if (classe) e.className = classe;
  if (html) e.innerHTML = html;
  return e;
}

/**
 * Rend un élément déplaçable au doigt ou à la souris (Pointer Events).
 * Appelle `surDepot(x, y)` au relâchement avec les coordonnées écran.
 */
export function rendreDeplacable(element, surDepot) {
  element.style.touchAction = 'none';
  element.addEventListener('pointerdown', (depart) => {
    depart.preventDefault();
    element.setPointerCapture(depart.pointerId);
    element.classList.add('en-vol');
    const bouger = (e) => {
      element.style.transform =
        `translate(${e.clientX - depart.clientX}px, ${e.clientY - depart.clientY}px) scale(1.08)`;
    };
    const lacher = (e) => {
      element.removeEventListener('pointermove', bouger);
      element.removeEventListener('pointerup', lacher);
      element.classList.remove('en-vol');
      element.style.transform = '';
      surDepot(e.clientX, e.clientY, element);
    };
    element.addEventListener('pointermove', bouger);
    element.addEventListener('pointerup', lacher);
  });
}

/** L'élément sous (x, y) correspond-il au sélecteur (ou un de ses parents) ? */
export function cibleSous(x, y, selecteur) {
  return document.elementFromPoint(x, y)?.closest(selecteur) || null;
}
