# 🚀 Guide de déploiement — kanban.insuffle-academie.com

Ce guide déroule, pas à pas, la mise en production du Sushi Kanban Game sur
un serveur Linux (VPS OVH, Scaleway, Hetzner…) derrière nginx, avec HTTPS.
Comptez **30 minutes** la première fois. Aucune base de données à installer :
tout l'état vit en mémoire du processus Node.

## Vue d'ensemble

```
Navigateurs ──HTTPS/WSS──▶ nginx (443) ──proxy──▶ Node.js (3000, PM2)
                             │
                             └── certificat Let's Encrypt (certbot)
```

## 1. Prérequis

- Un serveur Linux (Ubuntu 22.04+ ou Debian 12 recommandés), accès SSH root
  ou sudo.
- Le domaine `insuffle-academie.com` administrable chez votre registrar.
- 512 Mo de RAM suffisent largement (le jeu consomme ~80 Mo).

## 2. DNS : créer le sous-domaine

Chez votre registrar (là où est géré insuffle-academie.com), ajoutez :

| Type | Nom | Valeur | TTL |
|---|---|---|---|
| A | `kanban` | l'IPv4 de votre serveur | 3600 |
| AAAA (si IPv6) | `kanban` | l'IPv6 de votre serveur | 3600 |

Vérifiez la propagation : `dig +short kanban.insuffle-academie.com` doit
renvoyer l'IP du serveur (jusqu'à 1 h d'attente).

## 3. Installer Node.js (LTS) sur le serveur

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
node -v   # doit afficher v22.x (≥ 18 requis)
```

## 4. Déployer le code

```bash
sudo mkdir -p /opt/sushi-kanban && sudo chown $USER /opt/sushi-kanban
git clone https://github.com/ylureault/Blingo.git /opt/sushi-kanban
cd /opt/sushi-kanban
npm ci --omit=dev        # installe uniquement express + socket.io
npm test                 # 52 tests : tout doit être vert
PORT=3000 node server/server.js   # test manuel, Ctrl+C pour arrêter
```

Vérifiez depuis le serveur : `curl http://localhost:3000/sante` doit
renvoyer `{"ok":true,...}`.

## 5. PM2 : le processus qui ne meurt jamais

```bash
sudo npm install -g pm2
cd /opt/sushi-kanban
PORT=3000 pm2 start server/server.js --name sushi-kanban
pm2 save                 # mémorise la liste des processus
pm2 startup              # génère la commande à copier-coller (relance au boot)
```

⚠️ **Une seule instance, jamais de mode cluster** (`-i` interdit) : l'état
des salles vit en mémoire du processus ; deux instances = deux mondes
parallèles qui ne se voient pas.

Commandes utiles au quotidien :

```bash
pm2 status               # état du processus
pm2 logs sushi-kanban    # logs en direct
pm2 reload sushi-kanban  # redémarrage (les joueurs sont prévenus puis reconnectés)
```

## 6. nginx : reverse proxy + WebSocket

```bash
sudo tee /etc/nginx/sites-available/kanban.insuffle-academie.com > /dev/null <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name kanban.insuffle-academie.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # Les deux lignes qui font marcher Socket.io (upgrade WebSocket) :
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;   # une partie dure ~30 min : ne pas couper
    }
}
NGINX
sudo ln -s /etc/nginx/sites-available/kanban.insuffle-academie.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

À ce stade, `http://kanban.insuffle-academie.com` fonctionne déjà.

## 7. HTTPS avec Let's Encrypt

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d kanban.insuffle-academie.com --redirect
```

Certbot modifie la config nginx (443 + redirection 80→443) et renouvelle le
certificat tout seul. Socket.io bascule automatiquement en `wss://` : rien à
changer côté jeu.

## 8. Pare-feu (recommandé)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Le port 3000 n'a **pas** besoin d'être ouvert : seul nginx y accède en local.

## 9. Vérifications finales

```bash
curl -s https://kanban.insuffle-academie.com/sante
# → {"ok":true,"salles":0,"joueurs":0,"uptime":…}
```

Puis dans deux navigateurs (dont un mobile) : créer une salle, rejoindre
avec le code, lancer la manche 1, vérifier que les cartes bougent en temps
réel des deux côtés. Si les cartes ne bougent que toutes les ~25 s, le
WebSocket ne passe pas (voir dépannage).

## 10. Mettre à jour le jeu

```bash
cd /opt/sushi-kanban
git pull
npm ci --omit=dev
npm test && pm2 reload sushi-kanban
```

Le serveur prévient les joueurs connectés (« le serveur redémarre… ») et
leurs navigateurs se reconnectent automatiquement — mais par courtoisie,
déployez en dehors des heures d'atelier : les salles en mémoire sont
perdues au redémarrage.

## 11. Supervision (optionnel mais conseillé)

- **UptimeRobot / Better Stack** : surveillez `https://…/sante` (HTTP 200 +
  mot-clé `"ok":true`), alerte e-mail si le jeu tombe.
- **PM2** : `pm2 install pm2-logrotate` pour éviter des logs sans fin.

## Dépannage express

| Symptôme | Cause probable | Remède |
|---|---|---|
| Le jeu s'affiche mais rien ne bouge en temps réel | L'upgrade WebSocket ne passe pas | Vérifiez les 2 lignes `Upgrade`/`Connection` dans nginx, puis `sudo nginx -t && sudo systemctl reload nginx` |
| `EADDRINUSE` au démarrage | Le port 3000 est déjà pris | `pm2 status` (double lancement ?) ou changez `PORT` |
| Les joueurs sont déconnectés toutes les minutes | `proxy_read_timeout` trop court | Remettez `proxy_read_timeout 3600s;` |
| Deux salles avec le même code introuvables | PM2 en mode cluster | `pm2 delete sushi-kanban` puis relancez SANS `-i` |
| Certificat expiré | certbot en panne | `sudo certbot renew --dry-run` pour diagnostiquer |

## Rappels d'architecture

- **Aucune donnée persistée** : pas de sauvegarde à prévoir, pas de RGPD à
  déclarer (pseudos éphémères en mémoire, détruits avec la salle après
  30 min d'inactivité).
- **Un seul artefact** : le serveur Node sert aussi la SPA et le client
  Socket.io — aucun CDN, aucun build front à orchestrer.
- Tous les réglages du jeu (durées, débits, WIP…) sont dans
  [`shared/game-config.js`](shared/game-config.js) : modifiez, `pm2 reload`,
  c'est en ligne.
