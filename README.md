# 🍣 Sushi Kanban Game

**Le jeu de référence pour vivre Kanban en équipe**, par
[Insuffle Académie](https://insuffle-academie.com) — *on ne vous explique pas
la facilitation, on la pratique avec vous.* En ligne sur
**[kanban.insuffle-academie.com](https://kanban.insuffle-academie.com)**.

Jeu web multijoueur temps réel pour faire vivre les fondamentaux de **Kanban**
à une équipe en atelier (présentiel ou distanciel), inspiré du Pizza Kanban Game.
3 manches de 5 minutes, 2 à 8 joueurs, **sans aucune inscription**, depuis un
navigateur desktop ou tablette.

| Manche | Mode | Ce que l'équipe vit |
|---|---|---|
| 1 — Le chaos | Flux poussé | Encombrement, sushis périmés, multitâche douloureux |
| 2 — Les limites WIP | Poussé + limites | Une colonne pleine bloque l'amont, il faut aider le goulot |
| 3 — Le flux tiré | Pull + expedite | On ne prend que si l'aval a de la capacité, classes de service |

Entre chaque manche, un **écran de débrief** compare throughput, lead time
(moyenne, max **et distribution en histogramme**), gâchis, cycle time par
poste et CFD, avec les questions d'animation et un encart « ce qu'il fallait
voir » — c'est là que la pédagogie se fait (voir [FACILITATION.md](FACILITATION.md)).

La théorie est aussi en ligne : **[/theorie](client/theorie.html)** — la
méthode Kanban expliquée simplement (contenu original, optimisé pour le
référencement), reliée à la [formation « Kanban : fluidifier le flux »
d'Insuffle Académie](https://www.insuffle-academie.com/formations/formation-kanban-fluidifier-le-flux/).

En plus du tableau :

- **Mode solo et commis virtuels 🤖** : jouable seul·e — des équipiers IA
  qui respectent toutes les règles du flux, plus lents qu'un humain,
  faillibles au contrôle qualité, et qui vont spontanément aider le goulot.
- **Rôles prédéfinis** : au lancement d'une manche, chacun reçoit un poste
  selon la taille de l'équipe ; changer de poste coûte 3 s de déplacement —
  on ne peut pas être partout.
- **Événements aléatoires 🎲** dès la manche 2 : contrôle d'hygiène, panne
  du cuiseur, rush de touristes, arrivage du port, critique culinaire — la
  variabilité (mura) incarnée.
- **Direction artistique izakaya** : typographies calligraphiques
  auto-hébergées (OFL), cartes-tickets en papier washi, kanji en filigrane,
  splash screen ensō, brief de manche en carton-titre, pétales de sakura au
  débrief, motif seigaiha, grain d'écran.

- **Deux canaux de commande**, comme dans un vrai resto japonais : la salle 🏮
  (numéro de table) et la livraison 🛵 « Yatta Eats », dont la fraîcheur fond
  20 % plus vite — deux SLA dans le même flux. Le mini-jeu de service change
  de peau selon le canal (tables ou sacs de livreurs).
- **Coopération entre les postes** : à 2+ joueurs sur un même poste, badge 🤝
  et gestes 25 % plus rapides (aider le goulot paie mécaniquement) ; bouton
  🙋 « À l'aide ! » qui fait scintiller le poste débordé chez tout le monde.
- Un **brief de manche** plein écran annonce les politiques explicites au
  coup d'envoi de chaque manche.
- Un **lexique Kanban** ❓ (8 définitions) disponible à tout moment.
- Un **mode projection** 📺 pour l'écran partagé de la salle d'atelier.
- Des **animations partout** : cartes qui glissent (FLIP), colonnes pleines
  qui vibrent, particules de célébration à la livraison, appels à l'aide qui
  scintillent, lanternes qui se balancent.
- Le débrief s'exporte en **bilan PDF** aux couleurs de l'atelier (bouton 🖨,
  via l'impression du navigateur) pour que les participants repartent avec
  leurs métriques.

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

## Aller plus loin

- **[FEATURES.md](FEATURES.md)** — les 50 micro-fonctionnalités de finition
  (pause de manche, p85, efficience du flux, mode mobile, exports…).
- **[DEPLOIEMENT.md](DEPLOIEMENT.md)** — le guide de mise en production
  pas à pas sur kanban.insuffle-academie.com (DNS, PM2, nginx, HTTPS,
  supervision, dépannage).
- **[FACILITATION.md](FACILITATION.md)** — le guide d'animation andragogique :
  on n'explique pas Kanban, on le fait vivre, et le débrief fait le reste.

## Déploiement (PM2 + nginx)

### PM2

```bash
npm install -g pm2
PORT=3000 pm2 start server/server.js --name sushi-kanban
pm2 save && pm2 startup    # relance au démarrage de la machine
```

L'état étant en mémoire, lancez **une seule instance** (pas de mode cluster) :
les salles ne sont pas partagées entre processus.

### nginx — sous-domaine kanban.insuffle-academie.com (upgrade WebSocket)

1. Chez votre registrar, créez un enregistrement DNS
   `kanban.insuffle-academie.com → A/AAAA` vers votre serveur.
2. Socket.io a besoin que nginx laisse passer l'upgrade HTTP → WebSocket :

```nginx
# /etc/nginx/sites-available/kanban.insuffle-academie.com
server {
    listen 80;
    server_name kanban.insuffle-academie.com;

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

```bash
ln -s /etc/nginx/sites-available/kanban.insuffle-academie.com /etc/nginx/sites-enabled/
nginx -t && nginx -s reload
certbot --nginx -d kanban.insuffle-academie.com   # HTTPS : Socket.io passe en wss:// tout seul
```

Le lien à partager en atelier devient `https://kanban.insuffle-academie.com/ABCD`
(le code de salle directement dans l'URL). Pensez à ajouter un lien
« 🍣 Sushi Kanban » depuis le site principal insuffle-academie.com : le jeu
lui renvoie déjà la pareille (accueil, lexique, débrief et bilan PDF).

## Qualité

- `npm test` : 40 tests unitaires (node:test, aucun framework) sur les limites
  WIP, le pull, l'anti-triche, le contrôle qualité, le lead time, le CFD et la
  machine à états des manches.
- Cas limites gérés : code invalide, salle pleine, joueur qui quitte en pleine
  manche (ses cartes retournent en file), facilitateur qui part (le rôle est
  transmis), reconnexion automatique.
- Sons discrets synthétisés en WebAudio (aucun fichier), désactivables 🔊/🔇.
