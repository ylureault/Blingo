/**
 * server.js — Point d'entrée du Sushi Kanban Game.
 *
 * Un seul processus Node : Express sert la SPA statique (/client) et les
 * modules partagés (/shared), Socket.io gère le temps réel sur le même port.
 * Aucune base de données, aucune API tierce : tout est en mémoire.
 *
 * Lancement : PORT=3000 node server/server.js
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import { attacherSockets } from './sockets.js';
import { salles } from './rooms.js';
import { EVT } from '../shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const racine = path.join(__dirname, '..');

const app = express();
const serveurHttp = http.createServer(app);

// Socket.io sur le même serveur HTTP (upgrade WebSocket, voir README pour nginx)
const io = new Server(serveurHttp, {
  // Le client Socket.io est auto-servi sur /socket.io/socket.io.js : zéro CDN
  serveClient: true,
});

// Fichiers statiques : la SPA et les constantes partagées (importées telles
// quelles par le navigateur en modules ES — aucun bundler nécessaire)
app.use('/shared', express.static(path.join(racine, 'shared')));
app.use(express.static(path.join(racine, 'client')));

// Lien direct d'invitation : /ABCD renvoie la SPA, qui lit le code dans l'URL
app.get('/:code([A-Za-z]{4})', (_req, res) => {
  res.sendFile(path.join(racine, 'client', 'index.html'));
});

// Bilan de santé pour la supervision (PM2, nginx, uptime-robot…)
app.get('/sante', (_req, res) => {
  let joueursConnectes = 0;
  for (const salle of salles.values()) {
    joueursConnectes += [...salle.joueurs.values()].filter((j) => j.connecte).length;
  }
  res.json({
    ok: true,
    salles: salles.size,
    joueurs: joueursConnectes,
    uptime: Math.round(process.uptime()),
  });
});

// Toute route inconnue ramène poliment à l'accueil (pas de 404 brute)
app.use((_req, res) => res.redirect('/'));

attacherSockets(io);

const PORT = Number(process.env.PORT) || 3000;
serveurHttp.listen(PORT, () => {
  console.log(`🍣 Sushi Kanban Game prêt sur http://localhost:${PORT}`);
});

// Arrêt propre (déploiement PM2, reboot) : on prévient les joueurs avant de couper
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`\nArrêt demandé (${signal}) — au revoir 🍶`);
    io.emit(EVT.EVENEMENT, { type: 'maintenance' });
    setTimeout(() => {
      io.close();
      serveurHttp.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 1000).unref(); // filet de sécurité
    }, 300);
  });
}
