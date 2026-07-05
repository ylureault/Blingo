/**
 * main.js — Orchestrateur de la SPA.
 *
 * Aiguille entre les écrans (accueil → lobby → jeu → débrief) en fonction
 * de l'état autoritatif reçu du serveur, branche les interactions et fait
 * tourner la boucle d'affichage continue (chrono, fraîcheur, CFD).
 */

import { EVT, POSTES, COLONNE_PAR_ID, AVATARS, STATUTS } from '/shared/constants.js';
import { CONFIG, dureeVie } from '/shared/game-config.js';
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
let mancheBriefee = 0;       // dernier brief de manche affiché

function init() {
  // Un avatar au hasard pour commencer : moins de doublons dans la salle
  avatarChoisi = AVATARS[Math.floor(Math.random() * AVATARS.length)];

  net.connecter();
  brancherAccueil();
  brancherJeu();
  brancherLexique();
  brancherClavier();
  net.onEtat(rendre);
  net.onEvenement(surEvenement);
  net.onConnexion(surConnexion);

  // Lien direct /ABCD : pré-remplit le code
  const codeUrl = window.location.pathname.replace('/', '').toUpperCase();
  if (/^[A-Z]{4}$/.test(codeUrl)) $('champ-code').value = codeUrl;

  // Session mémorisée (rechargement de page) : pseudo, avatar et place retrouvés
  const session = net.lireSession();
  if (session?.avatar && AVATARS.includes(session.avatar)) avatarChoisi = session.avatar;
  construireChoixAvatars();
  if (session && (!codeUrl || codeUrl === session.code)) {
    $('champ-pseudo').value = session.pseudo || '';
    net.socket.once('connect', () => { net.reprendreSession(); });
  }

  $('btn-sons').textContent = sons.icone();

  // Le splash a fini son animation : on libère le DOM
  setTimeout(() => $('splash')?.remove(), 1800);

  // On ne quitte pas la cuisine par accident en pleine manche
  window.addEventListener('beforeunload', (e) => {
    if (net.etat?.statut === STATUTS.MANCHE && net.moi()?.poste) e.preventDefault();
  });

  requestAnimationFrame(boucleAffichage);
}

/** Pastille + bandeau de reconnexion : l'état réseau est toujours visible. */
function surConnexion(connecte) {
  $('bandeau-connexion').hidden = connecte;
  if (connecte && net.etat) toast('📡 Connexion rétablie !');
}

/** Raccourcis clavier globaux : Échap ferme tout ce qui flotte. */
function brancherClavier() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('voile-minijeu').hidden) fermerMiniJeu();
    if (!$('voile-lexique').hidden) $('voile-lexique').hidden = true;
    if (!$('voile-code').hidden) $('voile-code').hidden = true;
    if (!$('voile-brief').hidden) $('voile-brief').hidden = true;
  });
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
  // Le champ code se nettoie tout seul : lettres uniquement, en majuscules
  $('champ-code').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  });
  $('champ-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-rejoindre').click(); });
  // Entrée dans le pseudo : rejoint si un code est saisi, crée sinon
  $('champ-pseudo').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if ($('champ-code').value.length === 4) $('btn-rejoindre').click();
    else $('btn-creer').click();
  });
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
      gererWakeLock(false);
      mancheBriefee = 0; // si on rejoue la même manche, son brief se remontre
      numeroMancheAffiche = 0;
      document.title = 'Débrief · Sushi Kanban — Insuffle Académie';
      pluieDeSakura();
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

  const connectes = etat.joueurs.filter((j) => j.connecte).length;
  $('lobby-compteur').textContent = `Autour du comptoir : ${connectes}/${CONFIG.salle.maxJoueurs}`;

  $('lobby-joueurs').innerHTML = etat.joueurs.map((j) => `
    <div class="lobby-joueur ${j.connecte ? '' : 'deconnecte'} ${j.estBot ? 'est-commis' : ''}">
      <span class="lobby-avatar">${j.avatar}</span>
      <span>${j.pseudo}</span>
      ${j.estFacilitateur ? '<span class="badge-facil">facilitateur</span>' : ''}
      ${j.estBot ? '<span class="badge-commis">commis</span>' : ''}
      <small>${j.poste ? COLONNE_PAR_ID[j.poste].nom : 'sans poste'}</small>
    </div>`).join('');

  const commis = etat.joueurs.filter((j) => j.estBot).length;
  $('compteur-commis').textContent = `🤖 ×${commis}`;

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
    $('btn-sons').textContent = sons.basculer(); // normal → doux → coupé
  });
  $('btn-cfd').addEventListener('click', () => $('coin-cfd').classList.toggle('replie'));
  // Mode projection : pour l'écran partagé (vidéoprojecteur / visio) — tout
  // en plus grand, sans les affordances de jeu du poste local
  $('btn-projection').addEventListener('click', () => {
    document.body.classList.toggle('projection');
    toast(document.body.classList.contains('projection')
      ? '📺 Mode projection : idéal sur l’écran partagé de la salle.'
      : 'Retour au mode joueur.');
  });
  $('btn-facil').addEventListener('click', () => { $('panneau-facil').hidden = !$('panneau-facil').hidden; });
  $('btn-copier-lien').addEventListener('click', async () => {
    const lien = `${window.location.origin}/${net.etat?.code || ''}`;
    try { await navigator.clipboard.writeText(lien); toast(`Lien copié : ${lien}`); }
    catch { toast(lien); }
  });
  // Le code lui-même se copie d'un clic (ou de la touche Entrée)
  const copierCode = async () => {
    try { await navigator.clipboard.writeText(net.etat?.code || ''); toast('Code copié !'); }
    catch { /* pas de presse-papiers : le code reste affiché */ }
  };
  $('lobby-code').addEventListener('click', copierCode);
  $('lobby-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') copierCode(); });
  // Code en très grand pour le vidéoprojecteur de la salle
  $('btn-code-grand').addEventListener('click', () => {
    $('code-grand').textContent = net.etat?.code || '';
    $('code-grand-url').textContent = window.location.host;
    $('voile-code').hidden = false;
  });
  $('voile-code').addEventListener('click', () => { $('voile-code').hidden = true; });
  $('btn-lancer-m1').addEventListener('click', () => {
    net.action(EVT.FACIL_DEMARRER, { numero: 1 }).then(retourAction);
  });
  // Appel à l'aide : toute l'équipe voit le poste qui déborde
  $('btn-aide').addEventListener('click', () => net.action(EVT.APPELER_AIDE).then(retourAction));
  // Panneau facilitateur
  $('facil-arreter').addEventListener('click', () => net.action(EVT.FACIL_ARRETER).then(retourAction));
  $('facil-expedite').addEventListener('click', () => net.action(EVT.FACIL_EXPEDITE).then(retourAction));
  $('facil-pause').addEventListener('click', () => net.action(EVT.FACIL_PAUSE).then(retourAction));
  $('facil-prolonger').addEventListener('click', () => net.action(EVT.FACIL_PROLONGER).then(retourAction));
  $('facil-evenement').addEventListener('click', () => net.action(EVT.FACIL_EVENEMENT).then(retourAction));
  $('facil-vider').addEventListener('click', async () => {
    const r = await net.action(EVT.FACIL_VIDER);
    if (r.ok) toast(`🧹 ${r.retirees} commande(s) retirée(s) de la file.`);
  });
  // Commis virtuels : les mêmes boutons au lobby et en jeu
  const gererCommis = (action) => async () => {
    const r = await net.action(EVT.FACIL_COMMIS, { action });
    if (!r.ok) { toast(r.erreur); return; }
    toast(action === 'retirer' ? `👋 ${r.pseudo} quitte la cuisine.` : `🤖 ${r.pseudo} rejoint la cuisine (${COLONNE_PAR_ID[r.poste]?.nom}).`);
  };
  $('btn-commis-plus').addEventListener('click', gererCommis('ajouter'));
  $('btn-commis-moins').addEventListener('click', gererCommis('retirer'));
  $('facil-commis-plus').addEventListener('click', gererCommis('ajouter'));
  $('facil-commis-moins').addEventListener('click', gererCommis('retirer'));

  $('facil-transfert').addEventListener('change', (e) => {
    if (!e.target.value) return;
    net.action(EVT.FACIL_TRANSFERT, { joueurId: e.target.value }).then(retourAction);
    e.target.value = '';
  });
  $('facil-debit').addEventListener('input', (e) => {
    $('facil-debit-valeur').textContent = `×${Number(e.target.value).toFixed(1)}`;
    net.action(EVT.FACIL_DEBIT, { debit: Number(e.target.value) });
  });
}

// ----- Écran allumé pendant la manche (Wake Lock, silencieux si non géré) -----
let verrouEcran = null;
async function gererWakeLock(actif) {
  try {
    if (actif && !verrouEcran && navigator.wakeLock) {
      verrouEcran = await navigator.wakeLock.request('screen');
      verrouEcran.addEventListener('release', () => { verrouEcran = null; });
    } else if (!actif && verrouEcran) {
      await verrouEcran.release();
      verrouEcran = null;
    }
  } catch { /* refusé par le navigateur : sans gravité */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && net.etat?.statut === STATUTS.MANCHE) gererWakeLock(true);
});

function rendreJeu(etat) {
  const moi = net.moi();
  const facilitateur = net.estFacilitateur();

  $('jeu-manche').textContent = `Manche ${etat.manche.numero} · ${etat.manche.titre}`;
  $('stat-livres').textContent = etat.statsLive?.livres ?? 0;
  $('stat-gachis').textContent = etat.statsLive?.gachis ?? 0;
  $('stat-throughput').textContent = (etat.statsLive?.throughput ?? 0).toFixed(1);
  const ltm = etat.statsLive?.leadTimeMoyen ?? 0;
  $('stat-leadtime').textContent = ltm > 0 ? `${Math.round(ltm / 1000)}s` : '—';
  $('stat-wip').textContent = etat.cartes.length;
  gererWakeLock(true); // l'écran reste allumé pendant la manche

  // Brief de manche : les politiques explicites, annoncées au coup d'envoi
  if (mancheBriefee !== etat.manche.numero) {
    mancheBriefee = etat.manche.numero;
    afficherBriefManche(etat.manche);
    sons.gong();
  }
  $('btn-facil').hidden = !facilitateur;
  if (!facilitateur) $('panneau-facil').hidden = true;

  rendreBarrePostes($('barre-postes-jeu'), etat, moi);
  $('btn-aide').hidden = !moi?.poste;

  // Bandeau d'événement de cuisine en cours
  const bandeau = $('bandeau-evenement');
  if (etat.evenement) {
    const def = CONFIG.evenements.liste[etat.evenement.type];
    bandeau.hidden = false;
    bandeau.dataset.fina = etat.evenement.finA;
    $('evenement-texte').textContent = `${def.emoji} ${def.nom} — ${def.description}`;
  } else {
    bandeau.hidden = true;
    delete bandeau.dataset.fina;
  }

  rendreTableau($('tableau'), etat, net.joueurId, surCarte);
  dessinerCFD($('canvas-cfd'), etat.statsLive?.cfd, CONFIG.manches[etat.manche.numero - 1].duree);

  if (facilitateur) rendrePanneauFacilitateur(etat);
}

function rendrePanneauFacilitateur(etat) {
  $('facil-expedite').hidden = !etat.manche.expediteActives;
  $('facil-debit').value = etat.reglages.debit;
  $('facil-pause').textContent = etat.manche.enPause ? '▶ Reprendre' : '⏸ Pause';

  // Le goulot, visible du facilitateur seulement : levier d'animation
  const goulot = $('facil-goulot');
  goulot.hidden = !etat.goulot;
  if (etat.goulot) goulot.textContent = `🌊 Goulot probable : ${COLONNE_PAR_ID[etat.goulot].nom}`;

  // Cartes en danger (fraîcheur sous le seuil d'alerte) : le pouls de la cuisine
  const enDanger = etat.cartes.filter((c) => {
    const vie = dureeVie(c.type, c.expedite, c.canal);
    return 1 - (etat.maintenant - c.creeLe) / vie < CONFIG.affichage.seuilFraicheurAlerte;
  }).length;
  $('facil-danger').hidden = enDanger === 0;
  if (enDanger > 0) $('facil-danger').textContent = `🚨 ${enDanger} sushi(s) en danger de péremption`;

  $('facil-compteur-commis').textContent = `🤖 ×${etat.joueurs.filter((j) => j.estBot).length}`;

  // Liste de transfert du rôle (les autres humains connectés)
  const options = etat.joueurs
    .filter((j) => j.connecte && !j.estBot && j.id !== net.joueurId)
    .map((j) => `<option value="${j.id}">${j.avatar} ${j.pseudo}</option>`).join('');
  const select = $('facil-transfert');
  if (select.dataset.options !== options) { // ne pas casser un menu ouvert
    select.dataset.options = options;
    select.innerHTML = '<option value="">— choisir —</option>' + options;
  }

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
// Brief de manche et lexique
// ---------------------------------------------------------------------------

/**
 * Affiche en plein écran les règles de la manche qui démarre.
 * C'est une « politique explicite » vécue : tout le monde lit les mêmes
 * règles au même moment, puis on joue.
 */
function afficherBriefManche(manche) {
  const brief = CONFIG.briefsManche[manche.numero];
  if (!brief) return;
  const voile = $('voile-brief');
  const boite = $('boite-brief');
  const limites = manche.limitesWip
    ? `<p class="brief-limites">Limites votées : ${POSTES
        .map((p) => `${COLONNE_PAR_ID[p].nom} <b>${manche.limitesWip[p] ?? '∞'}</b>`)
        .join(' · ')}</p>`
    : '';
  // Le kanji de la manche, à l'encre diluée : 混 chaos, 限 limite, 流 flux
  const kanji = { 1: '混沌', 2: '限界', 3: '流れ' }[manche.numero] || '';
  boite.innerHTML = `
    <span class="brief-kanji" aria-hidden="true">${kanji}</span>
    <span class="brief-numero">Manche ${manche.numero}</span>
    <h2>${manche.titre}</h2>
    <p class="brief-accroche">${brief.accroche}</p>
    <ul class="brief-regles">${brief.regles.map((r) => `<li>${r}</li>`).join('')}</ul>
    ${limites}
    <button class="btn btn-principal" id="btn-brief-go">C’est parti !</button>`;
  voile.hidden = false;
  const fermer = () => { voile.hidden = true; };
  boite.querySelector('#btn-brief-go').addEventListener('click', fermer);
  setTimeout(fermer, 9000); // se referme seul : la manche n'attend personne
}

function brancherLexique() {
  $('contenu-lexique').innerHTML = CONFIG.lexique
    .map(([mot, def]) => `<dt>${mot}</dt><dd>${def}</dd>`).join('');
  $('btn-lexique').addEventListener('click', () => { $('voile-lexique').hidden = false; });
  $('btn-fermer-lexique').addEventListener('click', () => { $('voile-lexique').hidden = true; });
  $('voile-lexique').addEventListener('click', (e) => {
    if (e.target === $('voile-lexique')) $('voile-lexique').hidden = true;
  });
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

  // Jauge de fraîcheur de la carte, visible pendant tout le geste :
  // le lead time continue de courir même quand on travaille
  boite.dataset.creele = carte.creeLe;
  boite.dataset.dureevie = dureeVie(carte.type, carte.expedite, carte.canal);
  boite.insertAdjacentHTML('beforeend',
    '<div class="minijeu-fraicheur" title="Fraîcheur restante de la commande"><div></div></div>');

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
  fermer.disabled = true; // anti double-action pendant l'envoi du résultat

  // Retour haptique sur tablette/mobile : succès bref, échec insistant
  try { navigator.vibrate?.(resultat?.reussi === false ? [70, 40, 70] : 25); } catch { /* non géré */ }

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

let derniereSecondeTic = -1;

function boucleAffichage() {
  const etat = net.etat;
  if (etat?.statut === STATUTS.MANCHE) {
    if (etat.manche.enPause) {
      // Manche gelée : le chrono le dit, rien d'autre ne bouge
      $('jeu-chrono').textContent = '⏸';
      $('jeu-chrono').classList.remove('urgent');
      document.title = '⏸ En pause · Sushi Kanban';
    } else {
      const restant = Math.max(0, etat.manche.finA - net.maintenant());
      const s = Math.ceil(restant / 1000);
      const chrono = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      $('jeu-chrono').textContent = chrono;
      $('jeu-chrono').classList.toggle('urgent', s <= 30);
      // L'onglet du navigateur suit la partie (pratique en visio)
      document.title = `${chrono} · ${etat.code} · Sushi Kanban`;
      // Tic-tac des cinq dernières secondes
      if (s <= 5 && s > 0 && s !== derniereSecondeTic) { derniereSecondeTic = s; sons.tick(); }
      // Fraîcheur et âges, entre deux états serveur
      rafraichirCartes($('tableau'), net.maintenant());
      majFraicheurMiniJeu();
      // Compte à rebours du bandeau d'événement
      const bandeau = $('bandeau-evenement');
      if (!bandeau.hidden && bandeau.dataset.fina) {
        const reste = Math.max(0, Math.ceil((Number(bandeau.dataset.fina) - net.maintenant()) / 1000));
        $('evenement-chrono').textContent = reste > 0 ? `${reste}s` : '';
      }
    }
  }
  requestAnimationFrame(boucleAffichage);
}

/** Jauge de fraîcheur de la carte en cours, affichée DANS le mini-jeu. */
function majFraicheurMiniJeu() {
  const barre = document.querySelector('#boite-minijeu .minijeu-fraicheur div');
  const boite = $('boite-minijeu');
  if (!barre || !boite.dataset.creele) return;
  const restant = Math.max(0, 1 - (net.maintenant() - Number(boite.dataset.creele)) / Number(boite.dataset.dureevie));
  barre.style.width = `${restant * 100}%`;
  barre.classList.toggle('fraicheur-critique', restant < 0.15);
}

// ---------------------------------------------------------------------------
// Événements ponctuels : sons + toasts
// ---------------------------------------------------------------------------

function surEvenement(evt) {
  switch (evt.type) {
    case 'commande':
      sons.commande();
      particules(evt.canal === 'livraison' ? '🛵' : '🏮', 'commandes', 1);
      break;
    case 'livre':
      sons.livre();
      particules('✨', 'livre', 3);
      break;
    case 'rate':
      sons.rate(); toast('😡 Un client a reçu un sushi raté !');
      particules('💢', 'livre', 2);
      break;
    case 'perime':
      sons.perime();
      toast(`🗑️ ${evt.nombre > 1 ? `${evt.nombre} sushis périmés` : 'Un sushi a périmé'} !`);
      for (const colonne of evt.colonnes || []) particules('🦨', colonne, 1);
      break;
    case 'expedite':
      sons.expedite(); toast('🔥 Commande VIP ! Elle passe avant tout.');
      particules('🔥', 'commandes', 3);
      break;
    case 'aide':
      sons.aide();
      toast(`🙋 ${evt.avatar} ${evt.pseudo} appelle à l’aide : ${COLONNE_PAR_ID[evt.poste]?.nom} déborde !`);
      clignoterColonne(evt.poste);
      break;
    case 'pause':
      toast('⏸ Manche en pause — chrono, commandes et fraîcheur sont gelés.');
      break;
    case 'reprise':
      sons.gong(); toast('▶ La manche reprend !');
      break;
    case 'prolongation':
      toast('⏲ Le facilitateur prolonge la manche d’une minute.');
      break;
    case 'transfert':
      toast(`⚙️ ${evt.pseudo} est maintenant facilitateur·rice.`);
      break;
    case 'maintenance':
      toast('🛠 Le serveur redémarre — reconnexion automatique dans un instant…');
      break;
    case 'evenementCuisine': {
      const def = CONFIG.evenements.liste[evt.evenement?.type];
      if (def) { sons.evenement(); toast(`${def.emoji} ${def.nom} !`); }
      break;
    }
    case 'finEvenementCuisine':
      toast('✅ La cuisine reprend son rythme normal.');
      break;
    case 'finManche': sons.finManche(); break;
    default: break;
  }
}

/** Fait scintiller brièvement une colonne (appel à l'aide). */
function clignoterColonne(poste) {
  const col = document.querySelector(`.colonne[data-colonne="${poste}"]`);
  if (!col) return;
  col.classList.add('appel');
  setTimeout(() => col.classList.remove('appel'), 3200);
}

/** Pluie de pétales de sakura à l'arrivée sur le débrief : on souffle. */
let sakuraEnCours = false;
function pluieDeSakura() {
  if (sakuraEnCours) return;
  sakuraEnCours = true;
  for (let i = 0; i < 14; i += 1) {
    setTimeout(() => {
      const p = document.createElement('div');
      p.className = 'petale';
      p.style.left = `${Math.random() * 100}vw`;
      p.style.setProperty('--derive', `${(Math.random() - 0.5) * 200}px`);
      p.style.animationDuration = `${5 + Math.random() * 5}s`;
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 11_000);
    }, i * 350);
  }
  setTimeout(() => { sakuraEnCours = false; }, 14_000);
}

/**
 * Petites particules émoji qui s'élèvent d'une colonne : le flux se fête.
 * Purement cosmétique, purement DOM — aucune dépendance.
 */
function particules(emoji, colonneId, nombre = 2) {
  const col = document.querySelector(`.colonne[data-colonne="${colonneId}"]`);
  if (!col) return;
  const rect = col.getBoundingClientRect();
  for (let i = 0; i < nombre; i += 1) {
    const p = document.createElement('span');
    p.className = 'particule';
    p.textContent = emoji;
    p.style.left = `${rect.left + rect.width * (0.2 + Math.random() * 0.6)}px`;
    p.style.top = `${rect.top + 40 + Math.random() * 60}px`;
    p.style.animationDelay = `${i * 120}ms`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1600 + i * 120);
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
