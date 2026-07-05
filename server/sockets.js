/**
 * sockets.js — Couche temps réel Socket.io.
 *
 * Rôle : traduire les événements réseau en appels à la logique de jeu,
 * TOUJOURS validés côté serveur (anti-triche), puis rediffuser l'état
 * autoritatif à toute la salle.
 *
 * Chaque action client passe par un callback d'accusé de réception
 * ({ ok, erreur? }) : le client peut afficher l'action de façon optimiste
 * et la corriger si le serveur refuse.
 */

import { EVT, POSTES, STATUTS } from '../shared/constants.js';
import { CONFIG } from '../shared/game-config.js';
import * as rooms from './rooms.js';
import * as game from './game.js';
import * as flow from './flow.js';

/** Branche toute la logique temps réel sur le serveur Socket.io. */
export function attacherSockets(io) {
  // ----- Boucle de simulation : un seul intervalle pour toutes les salles -----
  setInterval(() => {
    const maintenant = Date.now();
    for (const salle of rooms.salles.values()) {
      const evenements = game.tick(salle, maintenant);
      for (const evt of evenements) io.to(salle.code).emit(EVT.EVENEMENT, evt);
      if (evenements.length > 0) diffuser(io, salle);
    }
  }, CONFIG.moteur.periodeTick);

  // ----- Diffusion périodique de l'état (filet de sécurité anti-dérive) -----
  setInterval(() => {
    for (const salle of rooms.salles.values()) {
      if (salle.partie.statut === STATUTS.MANCHE) diffuser(io, salle);
    }
  }, CONFIG.moteur.periodeDiffusion);

  // ----- Nettoyage des salles abandonnées -----
  setInterval(() => {
    for (const code of rooms.nettoyerSalles()) {
      io.to(code).emit(EVT.SALLE_FERMEE);
    }
  }, 60_000);

  io.on('connection', (socket) => {
    // Contexte de ce socket : rempli au moment de créer/rejoindre une salle
    let salle = null;
    let joueur = null;

    /** Petit garde-fou commun : es-tu bien dans une salle ? */
    const enSalle = (repondre) => {
      if (salle && joueur) return true;
      repondre?.({ ok: false, erreur: 'Vous n’êtes dans aucune salle.' });
      return false;
    };

    /** Garde-fou facilitateur. */
    const estFacilitateur = (repondre) => {
      if (!enSalle(repondre)) return false;
      if (salle.facilitateurId === joueur.id) return true;
      repondre?.({ ok: false, erreur: 'Action réservée au facilitateur.' });
      return false;
    };

    // ------------------------------------------------------------------
    // Créer / rejoindre une salle
    // ------------------------------------------------------------------

    socket.on(EVT.CREER_SALLE, ({ pseudo, avatar } = {}, repondre) => {
      const resultat = rooms.creerSalle(pseudo, avatar);
      salle = resultat.salle;
      joueur = resultat.joueur;
      socket.join(salle.code);
      repondre?.({ ok: true, code: salle.code, joueurId: joueur.id, jeton: joueur.jeton });
      diffuser(io, salle);
    });

    socket.on(EVT.REJOINDRE_SALLE, ({ code, pseudo, avatar, jeton } = {}, repondre) => {
      const resultat = rooms.rejoindreSalle(code, pseudo, avatar, jeton);
      if (resultat.erreur) return repondre?.({ ok: false, erreur: resultat.erreur });
      salle = resultat.salle;
      joueur = resultat.joueur;
      socket.join(salle.code);
      repondre?.({
        ok: true, code: salle.code, joueurId: joueur.id, jeton: joueur.jeton,
        reconnexion: resultat.reconnexion,
      });
      diffuser(io, salle);
    });

    // ------------------------------------------------------------------
    // Actions de jeu (validées par flow.js — le client ne décide de rien)
    // ------------------------------------------------------------------

    socket.on(EVT.CHOISIR_POSTE, ({ poste } = {}, repondre) => {
      if (!enSalle(repondre)) return;
      if (poste !== null && !POSTES.includes(poste)) {
        return repondre?.({ ok: false, erreur: 'Poste inconnu.' });
      }
      if (joueur.poste !== poste) {
        // Changer de poste libère les cartes en cours : on ne déserte pas
        // son plan de travail avec les sushis sous le bras.
        flow.libererCartesDuJoueur(salle.partie, joueur);
        // Et on ne se téléporte pas : traverser la cuisine prend du temps
        // (uniquement pendant une manche — au lobby, on s'installe librement)
        if (salle.partie.statut === STATUTS.MANCHE && joueur.poste !== null && poste !== null) {
          joueur.enDeplacementJusqua = Date.now() + CONFIG.roles.dureeDeplacement;
        }
      }
      joueur.poste = poste;
      salle.derniereActivite = Date.now();
      repondre?.({ ok: true, arriveeA: joueur.enDeplacementJusqua || 0 });
      diffuser(io, salle);
    });

    socket.on(EVT.PRENDRE_CARTE, ({ carteId } = {}, repondre) => {
      if (!enSalle(repondre)) return;
      salle.derniereActivite = Date.now(); // la salle vit tant qu'on y joue
      repondre?.(flow.prendreCarte(salle.partie, joueur, carteId, Date.now()));
      diffuser(io, salle);
    });

    socket.on(EVT.COMMENCER_TRAVAIL, ({ carteId } = {}, repondre) => {
      if (!enSalle(repondre)) return;
      // Bonus d'entraide : un collègue connecté au même poste accélère le geste
      const entraide = [...salle.joueurs.values()]
        .some((j) => j.id !== joueur.id && j.connecte && j.poste === joueur.poste);
      repondre?.(flow.commencerTravail(salle.partie, joueur, carteId, Date.now(), entraide));
      diffuser(io, salle);
    });

    // Appel à l'aide : rien de mécanique, tout de social — le poste débordé
    // le dit à voix haute et l'écran de toute l'équipe le montre.
    socket.on(EVT.APPELER_AIDE, (_donnees, repondre) => {
      if (!enSalle(repondre)) return;
      if (!joueur.poste) return repondre?.({ ok: false, erreur: 'Choisissez d’abord un poste.' });
      const maintenant = Date.now();
      if (maintenant - (joueur.dernierAppel || 0) < CONFIG.entraide.cooldownAppel) {
        return repondre?.({ ok: false, erreur: 'Vous venez d’appeler : laissez l’équipe réagir !' });
      }
      joueur.dernierAppel = maintenant;
      io.to(salle.code).emit(EVT.EVENEMENT, {
        type: 'aide', poste: joueur.poste, pseudo: joueur.pseudo, avatar: joueur.avatar,
      });
      repondre?.({ ok: true });
    });

    socket.on(EVT.TERMINER_TRAVAIL, ({ carteId, resultat } = {}, repondre) => {
      if (!enSalle(repondre)) return;
      salle.derniereActivite = Date.now();
      const reponse = flow.terminerTravail(salle.partie, joueur, carteId, resultat, Date.now());
      repondre?.(reponse);
      if (reponse.consequence === 'livre') io.to(salle.code).emit(EVT.EVENEMENT, { type: 'livre' });
      if (reponse.consequence === 'rate') io.to(salle.code).emit(EVT.EVENEMENT, { type: 'rate' });
      diffuser(io, salle);
    });

    // ------------------------------------------------------------------
    // Panneau du facilitateur
    // ------------------------------------------------------------------

    socket.on(EVT.FACIL_DEMARRER, ({ numero } = {}, repondre) => {
      if (!estFacilitateur(repondre)) return;
      const connectes = [...salle.joueurs.values()].filter((j) => j.connecte).length;
      if (connectes < CONFIG.salle.minJoueurs) {
        return repondre?.({ ok: false, erreur: `Il faut au moins ${CONFIG.salle.minJoueurs} joueurs.` });
      }
      repondre?.(game.demarrerManche(salle, Number(numero), Date.now()));
      diffuser(io, salle);
    });

    socket.on(EVT.FACIL_ARRETER, (_donnees, repondre) => {
      if (!estFacilitateur(repondre)) return;
      repondre?.(game.arreterManche(salle, Date.now()));
      diffuser(io, salle);
    });

    // Pause / reprise : le chrono, le spawn et la fraîcheur gèlent ensemble
    socket.on(EVT.FACIL_PAUSE, (_donnees, repondre) => {
      if (!estFacilitateur(repondre)) return;
      const enPause = !!salle.partie.enPause;
      const reponse = enPause
        ? game.reprendreManche(salle, Date.now())
        : game.pauserManche(salle, Date.now());
      repondre?.(reponse);
      if (reponse.ok) io.to(salle.code).emit(EVT.EVENEMENT, { type: enPause ? 'reprise' : 'pause' });
      diffuser(io, salle);
    });

    socket.on(EVT.FACIL_PROLONGER, (_donnees, repondre) => {
      if (!estFacilitateur(repondre)) return;
      const reponse = game.prolongerManche(salle);
      repondre?.(reponse);
      if (reponse.ok) io.to(salle.code).emit(EVT.EVENEMENT, { type: 'prolongation' });
      diffuser(io, salle);
    });

    socket.on(EVT.FACIL_VIDER, (_donnees, repondre) => {
      if (!estFacilitateur(repondre)) return;
      repondre?.(game.viderCommandes(salle));
      diffuser(io, salle);
    });

    // Événement de cuisine à la demande (le 🎲 du facilitateur)
    socket.on(EVT.FACIL_EVENEMENT, (_donnees, repondre) => {
      if (!estFacilitateur(repondre)) return;
      const evenement = game.declencherEvenement(salle, Date.now());
      if (!evenement) return repondre?.({ ok: false, erreur: 'Aucune manche en cours.' });
      io.to(salle.code).emit(EVT.EVENEMENT, { type: 'evenementCuisine', evenement });
      repondre?.({ ok: true });
      diffuser(io, salle);
    });

    // Commis virtuels 🤖 : le renfort du mode solo
    socket.on(EVT.FACIL_COMMIS, ({ action } = {}, repondre) => {
      if (!estFacilitateur(repondre)) return;
      const reponse = action === 'retirer' ? game.retirerCommis(salle) : game.ajouterCommis(salle);
      repondre?.(reponse);
      diffuser(io, salle);
    });

    socket.on(EVT.FACIL_TRANSFERT, ({ joueurId } = {}, repondre) => {
      if (!estFacilitateur(repondre)) return;
      const reponse = game.transfererRole(salle, joueurId);
      repondre?.(reponse);
      if (reponse.ok) {
        io.to(salle.code).emit(EVT.EVENEMENT, { type: 'transfert', pseudo: reponse.pseudo });
      }
      diffuser(io, salle);
    });

    socket.on(EVT.FACIL_WIP, ({ colonne, limite } = {}, repondre) => {
      if (!estFacilitateur(repondre)) return;
      repondre?.(game.reglerWip(salle, colonne, limite));
      diffuser(io, salle);
    });

    socket.on(EVT.FACIL_DEBIT, ({ debit } = {}, repondre) => {
      if (!estFacilitateur(repondre)) return;
      repondre?.(game.reglerDebit(salle, debit));
      diffuser(io, salle);
    });

    socket.on(EVT.FACIL_EXPEDITE, (_donnees, repondre) => {
      if (!estFacilitateur(repondre)) return;
      const reponse = game.injecterExpedite(salle, Date.now());
      repondre?.(reponse);
      if (reponse.ok) io.to(salle.code).emit(EVT.EVENEMENT, { type: 'expedite' });
      diffuser(io, salle);
    });

    // ------------------------------------------------------------------
    // Déconnexion : les cartes sont libérées, le joueur peut revenir
    // ------------------------------------------------------------------

    socket.on('disconnect', () => {
      if (!salle || !joueur) return;
      flow.libererCartesDuJoueur(salle.partie, joueur);
      rooms.deconnecterJoueur(salle, joueur.id);
      diffuser(io, salle);
    });
  });
}

/** Diffuse l'état autoritatif complet à toute la salle. */
function diffuser(io, salle) {
  io.to(salle.code).emit(EVT.ETAT, game.serialiserEtat(salle));
}
