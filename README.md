# 🍣 Sushi Kanban Game

Jeu web multijoueur temps réel pour faire vivre les fondamentaux de **Kanban**
à une équipe en atelier (présentiel ou distanciel), inspiré du Pizza Kanban Game.
3 manches de 5 minutes, 2 à 8 joueurs, **sans aucune inscription**, depuis un
navigateur desktop ou tablette.

| Manche | Mode | Ce que l'équipe vit |
|---|---|---|
| 1 — Le chaos | Flux poussé | Encombrement, sushis périmés, multitâche douloureux |
| 2 — Les limites WIP | Poussé + limites | Une colonne pleine bloque l'amont, il faut aider le goulot |
| 3 — Le flux tiré | Pull + expedite | On ne prend que si l'aval a de la capacité, classes de service |

Entre chaque manche, un **écran de débrief** compare throughput, lead time,
gâchis, cycle time par poste et CFD — c'est là que la pédagogie se fait
(questions d'animation incluses, voir [FACILITATION.md](FACILITATION.md)).

## Installation et lancement

Prérequis : Node.js ≥ 18. Aucune base de données, aucune API tierce, aucun CDN.

```bash
npm install        # express + socket.io, rien d'autre
npm test           # tests unitaires de la logique de flux et des métriques
PORT=3000 node server/server.js
```

Ouvrez `http://localhost:3000`, créez une salle : vous obtenez un **code à
4 lettres** et un lien direct (`http://…/ABCD`) à partager. Une salle vide
depuis 30 minutes est détruite ; rien n'est persisté.

## Architecture

```
shared/            Code partagé serveur/client (modules ES purs)
  game-config.js   ⚙️ TOUS les paramètres de jeu (durées, débits, WIP, fraîcheur…)
  constants.js     Colonnes, états, modes, noms d'événements Socket.io
server/
  server.js        Point d'entrée : Express (statique) + Socket.io (temps réel)
  rooms.js         Salles en mémoire (Map), codes 4 lettres, reconnexion par jeton
  game.js          Manches, tick de simulation, spawn des commandes, sérialisation
  flow.js          Logique de flux PURE : push/WIP/pull, validation, qualité, péremption
  metrics.js       Métriques PURES : lead time, cycle time, throughput, CFD, goulot
  sockets.js       Traduction événements réseau ↔ logique de jeu
client/            SPA servie telle quelle (aucun build)
  js/main.js       Aiguillage des écrans, boucle d'affichage
  js/net.js        Socket.io, reconnexion automatique, optimistic UI
  js/board.js      Tableau Kanban, animations FLIP, jauges de fraîcheur
  js/minigames/    Les 5 mini-mécaniques de poste
  js/cfd.js        Diagramme de flux cumulé (canvas)
  js/debrief.js    Écran de comparaison entre manches
test/              node:test natif — 40 tests sur flow.js, metrics.js, game.js
```

**Pourquoi du vanilla JS plutôt que Vue ?** Le besoin est une SPA à 4 écrans
dont l'état vient entièrement du serveur : un rendu direct du DOM suffit,
supprime toute étape de build (le client est servi tel quel par Express),
garantit le « zéro dépendance externe au runtime » et rend le code lisible par
n'importe quel contributeur. Le seul script tiers est le client Socket.io,
auto-servi par le serveur lui-même sur `/socket.io/socket.io.js`.

**État autoritatif côté serveur.** Le client n'envoie que des intentions
(`prendreCarte`, `terminerTravail`…) ; le serveur valide tout : limites WIP,
mode de flux, une-carte-à-la-fois, priorité des commandes VIP, et une **durée
minimale de travail** par poste (impossible de finir un mini-jeu plus vite que
la mécanique ne le permet). Le client affiche ses actions de façon optimiste
et se réconcilie à chaque diffusion d'état (~400 ms + diffusion immédiate
après chaque action → latence perçue < 200 ms sur ses propres gestes).

**Reconnexion.** Chaque navigateur reçoit un jeton secret stocké en
`localStorage` : après une coupure ou un rechargement, le joueur retrouve sa
salle, son pseudo et son poste.

## Régler le jeu

Tous les paramètres vivent dans **[`shared/game-config.js`](shared/game-config.js)**,
commenté ligne à ligne : durée des manches, débit d'arrivée des commandes,
temps de travail par poste, vitesse de péremption par type de sushi, limites
WIP par défaut, probabilité de défaut, etc. Le facilitateur peut en plus
ajuster **en direct** le débit, les limites WIP et injecter des commandes VIP
depuis son panneau ⚙️.

## Déploiement (PM2 + nginx)

### PM2

```bash
npm install -g pm2
PORT=3000 pm2 start server/server.js --name sushi-kanban
pm2 save && pm2 startup    # relance au démarrage de la machine
```

L'état étant en mémoire, lancez **une seule instance** (pas de mode cluster) :
les salles ne sont pas partagées entre processus.

### nginx (reverse proxy avec upgrade WebSocket)

Socket.io a besoin que nginx laisse passer l'upgrade HTTP → WebSocket :

```nginx
server {
    listen 80;
    server_name sushi.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # Indispensable pour le WebSocket de Socket.io :
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 3600s;   # une partie dure ~30 min : ne pas couper
    }
}
```

Rechargez (`nginx -s reload`), et le jeu est accessible derrière le proxy —
HTTPS via certbot fonctionne sans autre réglage (Socket.io passe en `wss://`
automatiquement).

## Qualité

- `npm test` : 40 tests unitaires (node:test, aucun framework) sur les limites
  WIP, le pull, l'anti-triche, le contrôle qualité, le lead time, le CFD et la
  machine à états des manches.
- Cas limites gérés : code invalide, salle pleine, joueur qui quitte en pleine
  manche (ses cartes retournent en file), facilitateur qui part (le rôle est
  transmis), reconnexion automatique.
- Sons discrets synthétisés en WebAudio (aucun fichier), désactivables 🔊/🔇.
