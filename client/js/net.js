/**
 * net.js — Couche réseau du client.
 *
 * Encapsule Socket.io : connexion, reconnexion automatique avec jeton
 * (le joueur retrouve son poste), envoi d'actions avec accusé de réception.
 * L'état affiché vient TOUJOURS du serveur ; le client ne fait que de
 * l'optimisme cosmétique en attendant la prochaine diffusion.
 */

import { EVT } from '/shared/constants.js';

const CLE_SESSION = 'sushi-kanban-session'; // localStorage : { code, jeton, pseudo, avatar }

class Reseau {
  constructor() {
    this.socket = null;
    this.etat = null;          // dernier état autoritatif reçu
    this.joueurId = null;
    this.decalage = 0;         // horloge serveur − horloge locale
    this.abonnesEtat = [];
    this.abonnesEvenement = [];
    this.abonnesConnexion = []; // rappelés avec true (connecté) / false (perdu)
  }

  /** Heure serveur estimée (pour le chrono et la fraîcheur). */
  maintenant() { return Date.now() + this.decalage; }

  /** Établit la connexion et branche les écouteurs. */
  connecter() {
    if (this.socket) return;
    // eslint-disable-next-line no-undef — io est fourni par /socket.io/socket.io.js
    this.socket = io({ transports: ['websocket', 'polling'] });

    this.socket.on(EVT.ETAT, (etat) => {
      this.etat = etat;
      this.decalage = etat.maintenant - Date.now();
      for (const cb of this.abonnesEtat) cb(etat);
    });
    this.socket.on(EVT.EVENEMENT, (evt) => {
      for (const cb of this.abonnesEvenement) cb(evt);
    });
    this.socket.on(EVT.SALLE_FERMEE, () => {
      this.oublierSession();
      window.location.href = '/';
    });
    // Reconnexion Socket.io : on retente de rejoindre avec notre jeton
    this.socket.io.on('reconnect', () => this.reprendreSession());
    // Signal de connexion pour le bandeau et la pastille d'état
    this.socket.on('connect', () => { for (const cb of this.abonnesConnexion) cb(true); });
    this.socket.on('disconnect', () => { for (const cb of this.abonnesConnexion) cb(false); });
  }

  onEtat(cb) { this.abonnesEtat.push(cb); }
  onEvenement(cb) { this.abonnesEvenement.push(cb); }
  onConnexion(cb) { this.abonnesConnexion.push(cb); }

  /** Envoie une action et renvoie la réponse serveur { ok, erreur? }. */
  action(evenement, donnees = {}) {
    return new Promise((resoudre) => {
      if (!this.socket?.connected) return resoudre({ ok: false, erreur: 'Connexion perdue…' });
      this.socket.emit(evenement, donnees, (reponse) => resoudre(reponse || { ok: false }));
    });
  }

  async creerSalle(pseudo, avatar) {
    const r = await this.action(EVT.CREER_SALLE, { pseudo, avatar });
    if (r.ok) this.memoriserSession(r, pseudo, avatar);
    return r;
  }

  async rejoindre(code, pseudo, avatar, jeton = null) {
    const r = await this.action(EVT.REJOINDRE_SALLE, { code, pseudo, avatar, jeton });
    if (r.ok) this.memoriserSession(r, pseudo, avatar);
    return r;
  }

  /** Après une coupure : retrouve la salle et le joueur via le jeton. */
  async reprendreSession() {
    const session = this.lireSession();
    if (!session) return { ok: false };
    return this.rejoindre(session.code, session.pseudo, session.avatar, session.jeton);
  }

  memoriserSession(reponse, pseudo, avatar) {
    this.joueurId = reponse.joueurId;
    localStorage.setItem(CLE_SESSION, JSON.stringify({
      code: reponse.code, jeton: reponse.jeton, pseudo, avatar,
    }));
  }

  lireSession() {
    try { return JSON.parse(localStorage.getItem(CLE_SESSION)); }
    catch { return null; }
  }

  oublierSession() { localStorage.removeItem(CLE_SESSION); }

  /** Le joueur local, extrait du dernier état. */
  moi() { return this.etat?.joueurs.find((j) => j.id === this.joueurId) || null; }

  estFacilitateur() { return this.etat?.facilitateurId === this.joueurId; }
}

export const net = new Reseau();
