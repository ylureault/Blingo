# 🏮 Guide d'animation — Sushi Kanban Game

*Un jeu [Insuffle Académie](https://insuffle-academie.com) — Formation
Facilitation & Intelligence Collective. En ligne sur
[kanban.insuffle-academie.com](https://kanban.insuffle-academie.com).*

Ce guide s'adresse au facilitateur ou à la facilitatrice. Il déroule un
atelier de **20 à 30 minutes de jeu** (45–60 minutes avec les débriefs) pour
faire vivre les fondamentaux de Kanban : visualisation du flux, limites WIP,
push vs pull, goulots, métriques de flux, CFD, politiques explicites et
amélioration continue.

**Principe d'or : ne rien expliquer avant la manche 1.** Le jeu enseigne par
la douleur du chaos, puis par le soulagement des manches 2 et 3. Vos
explications arrivent APRÈS le vécu, jamais avant.

---

## Préparation (5 min avant l'atelier)

1. Lancez le serveur (ou utilisez votre instance déployée) et créez la salle :
   vous êtes automatiquement facilitateur — vous pouvez aussi jouer.
2. Partagez le lien direct (`https://…/ABCD`) ou le code à 4 lettres.
   Chaque participant choisit un pseudo et un avatar : c'est tout.
3. 1 à 8 joueurs. Idéal : 4 à 6. À 1, 2 ou 3 joueurs, ajoutez des
   **commis virtuels 🤖** (boutons du lobby) : des équipiers IA qui suivent
   les mêmes règles de flux, travaillent 25 % moins vite qu'un humain,
   ratent parfois un défaut au contrôle qualité… et vont d'eux-mêmes aider
   le poste qui déborde. Parfaits aussi pour DÉCOUVRIR le jeu en solo avant
   votre atelier.
4. **Les rôles sont prédéfinis** : au lancement de chaque manche, le serveur
   affecte un poste à chacun selon la taille de l'équipe (à 3 : riz,
   assemblage, service — les postes vides sont la première leçon). On peut
   changer de poste à tout moment, mais **traverser la cuisine prend 3
   secondes** : on ne peut pas être partout, bouger se décide.
   Ne dites pas qu'on peut changer de poste : la découverte de la mobilité
   EST un moment pédagogique.
5. **Événements aléatoires 🎲** : à partir de la manche 2, la cuisine vit —
   contrôle d'hygiène (plus aucun nouveau geste pendant 10 s, mais la
   fraîcheur file), panne du cuiseur (le poste riz s'arrête : le goulot se
   déplace), rush de touristes (+3 commandes d'un coup), arrivage du port
   (découpe 2× plus rapide), critique culinaire (une VIP surgit). C'est la
   VARIABILITÉ (mura) incarnée — un excellent matériau de débrief. Vous
   pouvez aussi en déclencher un à la demande (bouton 🎲 du panneau ⚙️).

**Outils intégrés à connaître avant de démarrer :**
- Au lancement de chaque manche, un **brief plein écran** annonce les règles
  à toute l'équipe (il se referme seul après 9 s) : lisez-le à voix haute,
  c'est votre consigne — et la première politique explicite de la manche.
- Le bouton **❓ lexique** donne les 8 définitions clés : renvoyez-y les
  joueurs qui demandent « c'est quoi le lead time ? » plutôt que d'exposer.
- Chaque écran de débrief contient un encart **« 💡 Ce qu'il fallait voir »** :
  gardez-le pour APRÈS la discussion — le vécu d'abord, la théorie ensuite.
- Le bouton **🖨 Exporter le bilan (PDF)** produit un compte rendu imprimable
  des manches (métriques, CFD, enseignements) : les participants repartent
  avec, et il porte vos coordonnées Insuffle Académie.
- Le bouton **📺 mode projection** agrandit tableau, chrono et CFD : activez-le
  sur l'écran partagé de la salle (ou dans la visio) — c'est votre « radiateur
  d'information » commun.
- Les commandes arrivent par **deux canaux** : la salle 🏮 (numéro de table)
  et la livraison 🛵 « Yatta Eats », dont la fraîcheur fond 20 % plus vite —
  deux SLA différents dans le même flux, matière à débrief.
- **Coopération** : à deux ou plus sur un même poste, le badge 🤝 apparaît et
  chaque geste y est 25 % plus rapide — aider le goulot paie mécaniquement.
  Et le bouton **🙋 À l'aide !** fait scintiller le poste débordé sur l'écran
  de toute l'équipe.

Votre panneau ⚙️ (bouton en haut à droite pendant la manche) permet de :
lancer/arrêter les manches, régler le débit des commandes, fixer les limites
WIP en direct, injecter une commande VIP, et voir le **goulot détecté** 🌊
(vous seul le voyez — servez-vous-en pour vos questions, pas pour le révéler).

---

## Manche 1 — Le chaos (5 min de jeu + 5 min de débrief)

**Consigne de lancement, mot pour mot :**
> « Vous êtes l'équipe d'un restaurant de sushis. Les commandes arrivent,
> livrez-en un maximum. Chaque poste a son geste — vous découvrirez. C'est parti ! »

**Ce qui va se passer (c'est voulu, ne sauvez personne) :**
- Les commandes sont poussées automatiquement vers les postes : ça s'entasse.
- Chacun peut empiler jusqu'à 8 cartes dans sa pile ; changer de carte fait
  perdre la progression en cours — le coût du multitâche devient physique.
- La jauge de fraîcheur descend ; les sushis périment dans les files d'attente.

**Pendant la manche :** observez, notez qui s'épuise, où ça s'entasse.
N'intervenez pas. Si l'équipe s'en sort trop bien, montez le débit à ×1,3.

**Au débrief (questions affichées à l'écran) :**
- Où le travail s'est-il accumulé ? Qu'est-ce que ça vous rappelle ?
- Combien de sushis commencés… et combien livrés ?
- Qu'avez-vous ressenti quand les commandes continuaient d'arriver ?

**Concepts à nommer maintenant (pas avant) :** flux poussé, travail en cours
(WIP), lead time (montrez la jauge de fraîcheur : « la fraîcheur, C'EST le
lead time »), et lisez le CFD ensemble : la bande qui gonfle = là où ça bouchonne.

---

## Manche 2 — Les limites WIP (5 min de jeu + 5 min de débrief)

**Avant de lancer :** proposez à l'équipe de VOTER des limites WIP par
colonne (les valeurs par défaut — 2/2/3/2/2 — sont un bon point de départ ;
ajustez-les dans le panneau ⚙️ si l'équipe en choisit d'autres). C'est leur
première **politique explicite** : notez-la à voix haute.

**Consigne :**
> « Nouvelles règles, décidées ensemble : chaque colonne a une limite. Une
> colonne pleine n'accepte plus rien. Et une seule carte à la fois par
> personne. Mêmes commandes, même durée. »

**Ce qui va se passer :**
- Les colonnes pleines rougissent et vibrent ; l'amont se retrouve bloqué.
- Des joueurs se retrouvent « sans rien à faire » : le moment clé de la
  partie. S'ils ne bougent pas d'eux-mêmes, glissez : « vous avez le droit
  de changer de poste… » — et faites remarquer le badge 🤝 : à deux sur un
  poste, chaque geste est 25 % plus rapide. Encouragez aussi le bouton
  🙋 À l'aide ! : demander de l'aide est une pratique d'équipe, pas un aveu.
- Le débit MONTE souvent par rapport à la manche 1 alors qu'on travaille
  « moins » : c'est la démonstration centrale.

**Au débrief :**
- Le débit a-t-il baissé… ou augmenté ? (comparez les colonnes de métriques)
- Quand votre colonne était bloquée, qu'avez-vous fait de votre temps ?
- Où est le goulot ? Comment l'avez-vous repéré ? (le cycle time par poste
  et la bande la plus épaisse du CFD le montrent)

**Concepts à nommer :** limite WIP, « stop starting, start finishing »,
goulot d'étranglement (le poste d'assemblage est le goulot naturel du jeu),
aider le goulot plutôt que produire de l'en-cours.

---

## Manche 3 — Le flux tiré + les urgences (5 min de jeu + 10 min de débrief final)

**Consigne :**
> « Dernière évolution : plus rien n'avance tout seul. Une carte finie reste
> sur place tant que quelqu'un en aval ne la TIRE pas. On ne prend une carte
> que quand on a la capacité de la traiter. Et attention : des clients VIP
> peuvent débarquer. »

**Pendant la manche :** injectez 2 ou 3 commandes VIP 🔥 espacées (bouton
⚙️ → Commande VIP). La politique est explicite et appliquée par le serveur :
une VIP en attente passe avant toute carte normale, et elle ignore les
limites WIP — mais elle périme deux fois plus vite.

**Au débrief final (les 3 manches côte à côte) :**
- Quelle différence entre pousser et tirer le travail ?
- Comment avez-vous géré les VIP sans couler le reste du flux ?
  (→ classes de service : expedite vs standard)
- Regardez les 3 CFD : que raconte la forme de chacun ?
- **La question de transfert, la plus importante :** « Quelle politique
  explicite adopteriez-vous demain dans VOTRE équipe ? » Notez les réponses,
  c'est le livrable de l'atelier.

---

## Lecture rapide des métriques (antisèche)

| Métrique | Où | Comment la commenter |
|---|---|---|
| Throughput | En-tête + débrief | « Livrer plus en commençant moins » : comparez M1/M2 |
| Lead time | Débrief (moyen, max) | Reliez-le à la fraîcheur : long lead time = sushi pourri |
| Cycle time / poste | Débrief | La barre rouge = le goulot ; c'est lui qui fixe le débit |
| WIP | Compteurs de colonnes | L'écart vertical des bandes du CFD |
| CFD | Coin d'écran + débrief | Bandes parallèles fines = flux sain ; bande qui gonfle = bouchon |
| Gâchis | En-tête + débrief | Le coût du travail qui attend (périmés) et de la qualité poussée (ratés) |

## Timing type (45 min tout compris)

| Quoi | Durée |
|---|---|
| Accueil, connexion, choix des postes | 5 min |
| Manche 1 + débrief | 5 + 5 min |
| Manche 2 (vote des limites inclus) + débrief | 7 + 5 min |
| Manche 3 + débrief final et transfert | 5 + 10 min |

## Variantes

- **Format court (25 min)** : réduisez `duree` à 4 min dans
  `shared/game-config.js`, un seul débrief intermédiaire après la manche 1.
- **Équipe qui roule trop bien** : montez le débit en direct (jusqu'à ×2),
  ou baissez les limites WIP à 1 partout pour faire sentir le flux pièce à pièce.
- **Grande audience (> 8)** : plusieurs salles en parallèle, un porte-parole
  par salle au débrief ; comparez les CFD entre équipes.
- **Spécialistes contraints** : interdisez (oralement) de changer de poste en
  manche 2, autorisez-le en manche 3 — la différence de débit illustre les
  équipes en T.
- **Arrêt anticipé** : le bouton ⏹ vous permet de couper une manche qui a
  déjà fait sa démonstration — le débrief vaut mieux que 2 minutes de plus.

## Dépannage express

- **Un joueur perd sa connexion** : il recharge la page ou re-clique le lien,
  il retrouve son poste automatiquement (jeton en localStorage).
- **Le facilitateur se déconnecte** : le rôle passe au joueur connecté le
  plus ancien ; reprenez-le en revenant (le rôle reste transmis — continuez
  depuis le nouveau facilitateur si besoin).
- **Trop dur / trop facile** : curseur de débit ⚙️, effet immédiat.
- **La salle a expiré** (30 min sans personne) : recréez une salle, une
  partie ne se met pas en pause.
