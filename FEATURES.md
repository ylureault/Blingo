# ✅ Les 50 micro-fonctionnalités du Sushi Kanban Game

La couche de finition qui fait d'un jeu un **outil d'atelier professionnel**.
Toutes implémentées et couvertes par les tests (`npm test`) ou vérifiées en
navigateur. Un jeu [Insuffle Académie](https://insuffle-academie.com).

## Accueil & lobby

1. **Champ code auto-nettoyé** : majuscules forcées, lettres uniquement, 4 max.
2. **Touche Entrée intelligente** : rejoint si un code est saisi, crée sinon.
3. **Avatar aléatoire** proposé à l'arrivée (moins de doublons en salle).
4. **Pseudo et avatar mémorisés** d'une visite à l'autre (localStorage).
5. **Code de salle copiable d'un clic** (ou touche Entrée, accessible).
6. **Code en très grand** 🖥 pour le vidéoprojecteur de la salle d'atelier.
7. **Compteur de joueurs** connectés (x/8) dans le lobby.
8. **Pseudos assainis et homonymes distingués** (« Kenji », « Kenji ² »).

## Tableau & cartes

9. **Infobulle de détail** au survol d'une carte (type, canal, état, retours).
10. **WIP total en direct** 🗂️ dans l'en-tête — le nombre qui fait mal en manche 1.
11. **Tri par urgence** : la carte la moins fraîche remonte en tête de colonne.
12. **Halo pulsant** sur les commandes VIP 🔥.
13. **File Commandes repliée** au-delà de 5 cartes (« +N qui s'impatientent »).
14. **Barre de progression du travail** en cours sur la carte.
15. **Icônes d'ambiance par colonne** (🍚 🔪 🍙 🔍 🏮 🎌).
16. **Flash vert** à l'instant précis où un travail se termine.
17. **Âge en mm:ss** au-delà d'une minute (fini les « 247s »).
18. **Sablier ⏳** sur les cartes immobiles depuis plus de 15 s.

## Mini-jeux

19. **Barre d'espace pour cuire le riz** (accessibilité clavier).
20. **Jauge de fraîcheur visible dans le mini-jeu** : le lead time court toujours.
21. **Compteur de découpe** (2/4) pendant le tranchage.
22. **Retour haptique** (vibration) sur tablette et mobile, succès et échec.
23. **Échap ferme tout** : mini-jeu, lexique, code géant, brief.
24. **Anti double-action** pendant l'envoi du résultat au serveur.

## Facilitateur

25. **Pause de manche** ⏸ : chrono, commandes et fraîcheur gelés ensemble ;
    à la reprise, toutes les horloges sont décalées — la pause n'a pas existé.
26. **Prolongation +1 min** ⏲ quand la discussion mérite de finir le geste.
27. **Rejouer la même manche** ↻ depuis le débrief (la leçon en second tour).
28. **Compteur de sushis en danger** 🚨 (fraîcheur < 35 %) dans le panneau.
29. **Vider la file des commandes** 🧹 : soupape de secours anti-noyade.
30. **Transfert du rôle facilitateur** à n'importe quel joueur connecté.

## Métriques & débrief

31. **Efficience du flux** ⚡ : part du lead time réellement travaillée —
    le chiffre qui vaut une conférence entière sur l'attente.
32. **Lead time p85** 🎯 : la métrique de prévisibilité Kanban, pas la moyenne qui ment.
33. **Total des retours (rework)** ↩️ par manche.
34. **« Sushi éclair »** 🥇 : le meilleur lead time de la manche.
35. **Export JSON** 💾 des métriques brutes de toutes les manches.
36. **Titre d'onglet dynamique** : chrono + code de salle (pratique en visio).

## Sons & ambiance

37. **Tic-tac des 5 dernières secondes** de manche.
38. **Volume à trois niveaux** : normal 🔊, doux 🔉, coupé 🔇 (mémorisé).
39. **Gong d'ouverture** de manche, après le brief.

## Réseau & robustesse

40. **Bandeau « connexion perdue »** + toast au rétablissement.
41. **Salle vivante tant qu'on y joue** : chaque action repousse l'expiration.
42. **Assainissement serveur des pseudos** (caractères de contrôle, invisibles).
43. **Redirection propre** de toute URL inconnue vers l'accueil.
44. **Endpoint `/sante`** (salles, joueurs, uptime) pour la supervision.
45. **Arrêt serveur propre** : les joueurs sont prévenus avant un redéploiement.

## Accessibilité & confort

46. **aria-labels + focus clavier visibles** sur tous les boutons icônes.
47. **`prefers-reduced-motion` respecté** : animations coupées si demandé.
48. **Écran maintenu allumé** pendant la manche (Wake Lock, tablettes).
49. **Confirmation avant de quitter** la page en pleine manche.
50. **Records de la salle** à l'écran de fin : meilleur débit 🏆, sushi
    éclair ⚡, total régalé 🍣.

## Bonus demandé en cours de route

51. **Interface mobile** 📱 : les colonnes deviennent un carrousel à
    balayage (scroll-snap), cibles tactiles de 40 px minimum, champs en
    16 px (pas de zoom iOS intempestif), CFD et panneaux adaptés.
