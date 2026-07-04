/**
 * main.js — Orchestrateur de la SPA.
 *
 * Aiguille entre les écrans (accueil → lobby → jeu → débrief) en fonction
 * de l'état autoritatif reçu du serveur, branche les interactions et fait
 * tourner la boucle d'affichage continue (chrono, fraîcheur, CFD).
 */

import { EVT, POSTES, COLONNE_PAR_ID, AVATARS, STATUTS } from '/shared/constants.js';
import { CONFIG } from '/shared/game-config.js';
import { net } from './net.js';
import { rendreTableau, rafraichirCartes } from './board.js';
import { dessinerCFD } from './cfd.js';
import { rendreDebrief } from './debrief.js';
import { lancerMiniJeu } from './minigames/index.js';
import { sons } from './sons.js';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

let avatarChoisi = AVATARS[0];
let jetonMiniJeu = 0;      // invalide les mini-jeux abandonnés
let numeroMancheAffiche = 0; // pour ne reconstruire le panneau WIP qu'au changement

function init() {
  net.connecter();
  construireChoixAvatars();
  brancherAccueil();
  brancherJeu();
  net.onEtat(rendre);
  net.onEvenement(surEvenement);

  // Lien direct /ABCD : pré-remplit le code
  const codeUrl = window.location.pathname.replace('/', '').toUpperCase();
  if (/^[A-Z]{4}$/.test(codeUrl)) $('champ-code').value = codeUrl;

  // Session mémorisée (rechargement de page) : on retrouve notre place
  const session = net.lireSession();
  if (session && (!codeUrl || codeUrl === session.code)) {
    $('champ-pseudo').value = session.pseudo || '';
    net.socket.once('connect', () => { net.reprendreSession(); });
  }

  requestAnimationFrame(boucleAffichage);
}

function construireChoixAvatars() {
  const zone = $('choix-avatars');
  for (const avatar of AVATARS) {
    const btn = document.createElement('button');
    btn.className = 'avatar-choix' + (avatar === avatarChoisi ? ' choisi' : '');
    btn.textContent = avatar;
    btn.addEventListener('click', () => {
      avatarChoisi = avatar;
      zone.querySelectorAll('.avatar-choix').forEach((b) => b.classList.toggle('choisi', b === btn));
    });
    zone.appendChild(btn);
  }
}

// ---------------------------------------------------------------------------
// Écran d'accueil
// ---------------------------------------------------------------------------

function brancherAccueil() {
  const erreur = (msg) => {
    const p = $('accueil-erreur');
    p.textContent = msg;
    p.hidden = !msg;
  };
  const pseudo = () => $('champ-pseudo').value.trim() || 'Chef anonyme';

  $('btn-creer').addEventListener('click', async () => {
    const r = await net.creerSalle(pseudo(), avatarChoisi);
    if (!r.ok) erreur(r.erreur || 'Impossible de créer la salle.');
  });
  $('btn-rejoindre').addEventListener('click', async () => {
    const code = $('champ-code').value.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) return erreur('Le code fait 4 lettres.');
    const r = await net.rejoindre(code, pseudo(), avatarChoisi);
    if (!r.ok) erreur(r.erreur || 'Impossible de rejoindre.');
  });
  $('champ-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-rejoindre').click(); });
}

// ---------------------------------------------------------------------------
// Rendu piloté par l'état serveur
// ---------------------------------------------------------------------------

function montrer(idEcran) {
  for (const ecran of document.querySelectorAll('.ecran')) {
    ecran.hidden = ecran.id !== idEcran;
  }
}

function rendre(etat) {
  switch (etat.statut) {
    case STATUTS.LOBBY:   montrer('ecran-lobby');   rendreLobby(etat); break;
    case STATUTS.MANCHE:  montrer('ecran-jeu');     rendreJeu(etat);   break;
    case STATUTS.DEBRIEF:
    case STATUTS.FIN:
      montrer('ecran-debrief');
      fermerMiniJeu();
      rendreDebrief({
        titre: $('debrief-titre'), manches: $('debrief-manches'),
        questions: $('debrief-questions'), actions: $('debrief-actions'),
      }, etat, net.estFacilitateur(), (action, numero) => {
        if (action === 'demarrer') net.action(EVT.FACIL_DEMARRER, { numero }).then(retourAction);
      });
      break;
    default: montrer('ecran-accueil');
  }
}

// ----- Lobby -----

function rendreLobby(etat) {
  $('lobby-code').textContent = etat.code;
  const moi = net.moi();

  $('lobby-joueurs').innerHTML = etat.joueurs.map((j) => `
    <div class="lobby-joueur ${j.connecte ? '' : 'deconnecte'}">
      <span class="lobby-avatar">${j.avatar}</span>
      <span>${j.pseudo}</span>
      ${j.estFacilitateur ? '<span class="badge-facil">facilitateur</span>' : ''}
      <small>${j.poste ? COLONNE_PAR_ID[j.poste].nom : 'sans poste'}</small>
    </div>`).join('');

  rendreBarrePostes($('lobby-choix-postes'), etat, moi);
  $('lobby-facilitateur').hidden = !net.estFacilitateur();
  $('lobby-attente').hidden = net.estFacilitateur();
}

function rendreBarrePostes(zone, etat, moi) {
  const chips = POSTES.map((poste) => {
    const occupants = etat.joueurs.filter((j) => j.poste === poste && j.connecte);
    return `<button class="poste-chip ${moi?.poste === poste ? 'actif' : ''}" data-poste="${poste}">
      ${COLONNE_PAR_ID[poste].nom} ${occupants.map((j) => j.avatar).join('')}
    </button>`;
  }).join('');
  zone.innerHTML = chips + `<button class="poste-chip ${!moi?.poste ? 'actif' : ''}" data-poste="">👀 Observer</button>`;
  zone.querySelectorAll('.poste-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      net.action(EVT.CHOISIR_POSTE, { poste: btn.dataset.poste || null }).then(retourAction);
    });
  });
}

// ----- Jeu -----

function brancherJeu() {
  $('btn-sons').addEventListener('click', () => {
    $('btn-sons').textContent = sons.basculer() ? '🔊' : '🔇';
  });
  $('btn-cfd').addEventListener('click', () => $('coin-cfd').classList.toggle('replie'));
  $('btn-facil').addEventListener('click', () => { $('panneau-facil').hidden = !$('panneau-facil').hidden; });
  $('btn-copier-lien').addEventListener('click', async () => {
    const lien = `${window.location.origin}/${net.etat?.code || ''}`;
    try { await navigator.clipboard.writeText(lien); toast(`Lien copié : ${lien}`); }
    catch { toast(lien); }
  });
  $('btn-lancer-m1').addEventListener('click', () => {
    net.action(EVT.FACIL_DEMARRER, { numero: 1 }).then(retourAction);
  });
  // Panneau facilitateur
  $('facil-arreter').addEventListener('click', () => net.action(EVT.FACIL_ARRETER).then(retourAction));
  $('facil-expedite').addEventListener('click', () => net.action(EVT.FACIL_EXPEDITE).then(retourAction));
  $('facil-debit').addEventListener('input', (e) => {
    $('facil-debit-valeur').textContent = `×${Number(e.target.value).toFixed(1)}`;
    net.action(EVT.FACIL_DEBIT, { debit: Number(e.target.value) });
  });
}

function rendreJeu(etat) {
  const moi = net.moi();
  const facilitateur = net.estFacilitateur();

  $('jeu-manche').textContent = `Manche ${etat.manche.numero} · ${etat.manche.titre}`;
  $('stat-livres').textContent = etat.statsLive?.livres ?? 0;
  $('stat-gachis').textContent = etat.statsLive?.gachis ?? 0;
  $('stat-throughput').textContent = (etat.statsLive?.throughput ?? 0).toFixed(1);
  $('btn-facil').hidden = !facilitateur;
  if (!facilitateur) $('panneau-facil').hidden = true;

  rendreBarrePostes($('barre-postes-jeu'), etat, moi);
  rendreTableau($('tableau'), etat, net.joueurId, surCarte);
  dessinerCFD($('canvas-cfd'), etat.statsLive?.cfd, CONFIG.manches[etat.manche.numero - 1].duree);

  if (facilitateur) rendrePanneauFacilitateur(etat);
}

function rendrePanneauFacilitateur(etat) {
  $('facil-expedite').hidden = !etat.manche.expediteActives;
  $('facil-debit').value = etat.reglages.debit;

  // Le goulot, visible du facilitateur seulement : levier d'animation
  const goulot = $('facil-goulot');
  goulot.hidden = !etat.goulot;
  if (etat.goulot) goulot.textContent = `🌊 Goulot probable : ${COLONNE_PAR_ID[etat.goulot].nom}`;

  // Les champs WIP ne sont reconstruits qu'au changement de manche
  if (numeroMancheAffiche !== etat.manche.numero) {
    numeroMancheAffiche = etat.manche.numero;
    const zone = $('facil-wip');
    if (etat.manche.mode === 'push') {
      zone.innerHTML = '<p class="lobby-aide">Manche 1 : pas de limites, laissez le chaos parler.</p>';
    } else {
      zone.innerHTML = '<h4>Limites WIP</h4>' + POSTES.map((poste) => `
        <label class="facil-wip-ligne">${COLONNE_PAR_ID[poste].nom}
          <input type="number" min="0" max="20" data-poste="${poste}"
            value="${etat.manche.limitesWip?.[poste] ?? ''}" placeholder="∞">
        </label>`).join('');
      zone.querySelectorAll('input').forEach((champ) => {
        champ.addEventListener('change', () => {
          net.action(EVT.FACIL_WIP, { colonne: champ.dataset.poste, limite: Number(champ.value) || 0 })
            .then(retourAction);
        });
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Interactions avec les cartes et mini-jeux
// ---------------------------------------------------------------------------

async function surCarte(carte, action) {
  if (action === 'prendre') {
    // Optimisme : on tente, le serveur tranche (WIP, VIP, pile pleine…)
    const r = await net.action(EVT.PRENDRE_CARTE, { carteId: carte.id });
    if (!r.ok) { toast(r.erreur); sons.bloque(); return; }
  }
  ouvrirMiniJeu(carte.id);
}

async function ouvrirMiniJeu(carteId) {
  const moi = net.moi();
  const carte = net.etat?.cartes.find((c) => c.id === carteId);
  if (!moi?.poste || !carte) return;

  const r = await net.action(EVT.COMMENCER_TRAVAIL, { carteId });
  if (!r.ok) { toast(r.erreur); sons.bloque(); return; }

  const voile = $('voile-minijeu');
  const boite = $('boite-minijeu');
  voile.hidden = false;
  boite.innerHTML = '';
  const jeton = ++jetonMiniJeu;

  // Bouton pour reposer la carte (la progression est perdue : c'est le coût
  // du changement de contexte, voulu et assumé)
  const fermer = document.createElement('button');
  fermer.className = 'btn btn-discret minijeu-fermer';
  fermer.textContent = '✖ Reposer';
  fermer.addEventListener('click', () => fermerMiniJeu());
  boite.appendChild(fermer);

  const zone = document.createElement('div');
  boite.appendChild(zone);

  const resultat = await lancerMiniJeu(moi.poste, zone, {
    carte: { ...carte, defaut: r.defaut ?? carte.defaut },
    duree: r.duree,
  });
  if (jeton !== jetonMiniJeu) return; // mini-jeu abandonné entre-temps

  const reponse = await net.action(EVT.TERMINER_TRAVAIL, { carteId, resultat });
  if (!reponse.ok) toast(reponse.erreur);
  fermerMiniJeu();
}

function fermerMiniJeu() {
  jetonMiniJeu += 1;
  $('voile-minijeu').hidden = true;
  $('boite-minijeu').innerHTML = '';
}

// ---------------------------------------------------------------------------
// Boucle d'affichage continue (indépendante du serveur)
// ---------------------------------------------------------------------------

function boucleAffichage() {
  const etat = net.etat;
  if (etat?.statut === STATUTS.MANCHE) {
    // Chrono de manche
    const restant = Math.max(0, etat.manche.finA - net.maintenant());
    const s = Math.ceil(restant / 1000);
    $('jeu-chrono').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    $('jeu-chrono').classList.toggle('urgent', s <= 30);
    // Fraîcheur et âges, entre deux états serveur
    rafraichirCartes($('tableau'), net.maintenant());
  }
  requestAnimationFrame(boucleAffichage);
}

// ---------------------------------------------------------------------------
// Événements ponctuels : sons + toasts
// ---------------------------------------------------------------------------

function surEvenement(evt) {
  switch (evt.type) {
    case 'commande':  sons.commande(); break;
    case 'livre':     sons.livre(); break;
    case 'rate':      sons.rate(); toast('😡 Un client a reçu un sushi raté !'); break;
    case 'perime':    sons.perime(); toast(`🗑️ ${evt.nombre > 1 ? `${evt.nombre} sushis périmés` : 'Un sushi a périmé'} !`); break;
    case 'expedite':  sons.expedite(); toast('🔥 Commande VIP ! Elle passe avant tout.'); break;
    case 'finManche': sons.finManche(); break;
    default: break;
  }
}

/** Affiche l'erreur éventuelle d'une action refusée par le serveur. */
function retourAction(r) {
  if (r && !r.ok && r.erreur) { toast(r.erreur); sons.bloque(); }
}

function toast(message) {
  if (!message) return;
  const zone = $('toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  zone.appendChild(el);
  setTimeout(() => el.classList.add('visible'), 10);
  setTimeout(() => { el.classList.remove('visible'); setTimeout(() => el.remove(), 400); }, 3200);
}

init();
