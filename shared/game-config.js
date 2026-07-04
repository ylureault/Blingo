/**
 * ============================================================
 *  GAME-CONFIG — TOUS les paramètres de jeu au même endroit.
 * ============================================================
 * C'est LE fichier à modifier pour ajuster la difficulté ou le
 * rythme d'un atelier. Chaque valeur est commentée. Aucune autre
 * constante de réglage ne doit exister ailleurs dans le code.
 *
 * Les durées sont en millisecondes sauf mention contraire.
 */

export const CONFIG = {
  // ---------- Marque ----------
  // Le jeu est édité par Insuffle Académie et hébergé sur son sous-domaine.
  marque: {
    nom: 'Insuffle Académie',
    url: 'https://insuffle-academie.com',
    urlJeu: 'https://kanban.insuffle-academie.com',
    tagline: 'On ne vous explique pas la facilitation · on la pratique avec vous',
    signature: 'Formation Facilitation & Intelligence Collective',
  },

  // ---------- Salle ----------
  salle: {
    maxJoueurs: 8,                 // joueurs maximum par salle (facilitateur inclus)
    minJoueurs: 2,                 // minimum pour lancer une manche
    ttlSalleVide: 30 * 60 * 1000,  // une salle sans joueur connecté depuis 30 min est détruite
    longueurCode: 4,               // longueur du code de salle
    // Alphabet du code : sans I, O ni Q pour éviter les confusions à l'oral
    alphabetCode: 'ABCDEFGHJKLMNPRSTUVWXYZ',
  },

  // ---------- Boucle serveur ----------
  moteur: {
    periodeTick: 250,        // période du tick serveur (péremption, spawn, fin de manche)
    periodeDiffusion: 400,   // période de diffusion de l'état complet aux clients
    periodeCFD: 2000,        // période d'échantillonnage du diagramme de flux cumulé
  },

  // ---------- Manches ----------
  // Une partie = 3 manches. Chaque entrée définit le mode de flux,
  // le rythme d'arrivée des commandes et les limites WIP initiales.
  manches: [
    {
      numero: 1,
      mode: 'push',
      titre: 'Le chaos',
      duree: 5 * 60 * 1000,          // 5 minutes
      intervalleCommandes: 5500,      // une commande toutes les ~5,5 s : volontairement trop rapide
      limitesWip: null,               // aucune limite : c'est le but pédagogique
      expediteActives: false,
      maxCartesParJoueur: 8,          // on PEUT empiler → le multitâche devient douloureux
    },
    {
      numero: 2,
      mode: 'wip',
      titre: 'Les limites WIP',
      duree: 5 * 60 * 1000,
      intervalleCommandes: 6000,
      // Limites par défaut, ajustables par le facilitateur (ou par vote oral de l'équipe)
      limitesWip: { riz: 2, decoupe: 2, assemblage: 3, qualite: 2, service: 2 },
      expediteActives: false,
      maxCartesParJoueur: 1,          // une carte à la fois : fin du multitâche
    },
    {
      numero: 3,
      mode: 'pull',
      titre: 'Le flux tiré',
      duree: 5 * 60 * 1000,
      intervalleCommandes: 6000,
      limitesWip: { riz: 2, decoupe: 2, assemblage: 3, qualite: 2, service: 2 },
      expediteActives: true,          // le facilitateur peut injecter des commandes VIP
      maxCartesParJoueur: 1,
    },
  ],

  // ---------- Canaux de commande (la vraie vie d'un resto japonais) ----------
  // Deux sources de demande : la salle (tables du restaurant) et la
  // plateforme de livraison « Yatta Eats ». Le sushi qui part en scooter
  // doit être plus frais : son SLA est plus court — une classe de service
  // de plus à découvrir.
  canaux: {
    salle: {
      label: 'Sur place', emoji: '🏮', poids: 60,
      facteurFraicheur: 1.0,     // fraîcheur normale : le client est à table
      nbTables: 12,              // numéro de table affiché sur la carte
    },
    livraison: {
      label: 'Yatta Eats', emoji: '🛵', poids: 40,
      facteurFraicheur: 0.8,     // le trajet mange 20 % de la fraîcheur
    },
  },

  // ---------- Arrivée des commandes ----------
  commandes: {
    // Variation aléatoire de l'intervalle (±30 %) pour éviter un rythme métronomique
    variationIntervalle: 0.3,
    // Bornes du multiplicateur de débit réglable en direct par le facilitateur
    debitMin: 0.5,   // 0.5 = commandes deux fois plus espacées
    debitMax: 2.0,   // 2.0 = commandes deux fois plus rapprochées
  },

  // ---------- Types de sushis ----------
  // `facteur` multiplie le temps de travail de base de chaque poste.
  // `dureeVie` : temps total avant péremption (la jauge de fraîcheur).
  // `route` : colonnes traversées (le sashimi saute la préparation du riz !).
  // `poids` : probabilité relative d'apparition dans le flux de commandes.
  typesSushi: {
    maki: {
      nom: 'Maki', emoji: '🍣', facteur: 1.0, dureeVie: 110_000, poids: 30,
      route: ['commandes', 'riz', 'decoupe', 'assemblage', 'qualite', 'service', 'livre'],
      ingredients: ['riz', 'nori', 'poisson'],
    },
    nigiri: {
      nom: 'Nigiri', emoji: '🍤', facteur: 0.8, dureeVie: 100_000, poids: 25,
      route: ['commandes', 'riz', 'decoupe', 'assemblage', 'qualite', 'service', 'livre'],
      ingredients: ['riz', 'poisson'],
    },
    sashimi: {
      nom: 'Sashimi', emoji: '🐟', facteur: 0.7, dureeVie: 80_000, poids: 20,
      // Pas de riz : certaines cartes sautent un poste, comme dans la vraie vie
      route: ['commandes', 'decoupe', 'assemblage', 'qualite', 'service', 'livre'],
      ingredients: ['poisson', 'wasabi'],
    },
    california: {
      nom: 'California', emoji: '🥑', facteur: 1.2, dureeVie: 120_000, poids: 15,
      route: ['commandes', 'riz', 'decoupe', 'assemblage', 'qualite', 'service', 'livre'],
      ingredients: ['riz', 'avocat', 'surimi', 'sesame'],
    },
    plateau: {
      nom: 'Plateau mixte', emoji: '🍱', facteur: 1.6, dureeVie: 150_000, poids: 10,
      route: ['commandes', 'riz', 'decoupe', 'assemblage', 'qualite', 'service', 'livre'],
      ingredients: ['riz', 'nori', 'poisson', 'avocat', 'omelette'],
    },
  },

  // ---------- Temps de travail par poste ----------
  // Durée de base de la mini-mécanique (avant multiplication par le facteur du type).
  // L'assemblage est volontairement le plus long : c'est le goulot naturel.
  tempsPostes: {
    riz:        3000,
    decoupe:    3500,
    assemblage: 4500,
    qualite:    2500,
    service:    3000,
  },

  // ---------- Coopération entre les postes ----------
  entraide: {
    // Quand au moins deux joueurs occupent le même poste, chaque geste y est
    // plus rapide : l'incitation à aider le goulot est MÉCANIQUE, pas morale.
    facteur: 0.75,          // 0.75 = travail 25 % plus rapide à plusieurs
    cooldownAppel: 8000,    // délai minimal entre deux appels à l'aide d'un même joueur
  },

  // ---------- Anti-triche ----------
  antiTriche: {
    // Le serveur refuse un « travail terminé » envoyé avant ce ratio de la durée
    // théorique du poste (tolérance pour la latence réseau et les joueurs rapides).
    ratioDureeMinimale: 0.6,
  },

  // ---------- Qualité / défauts ----------
  qualite: {
    // Probabilité qu'un poste amont introduise un défaut invisible
    // (révélé uniquement au joueur du contrôle qualité pendant sa mini-mécanique)
    probaDefaut: 0.18,
  },

  // ---------- Commandes expedite (classe de service urgente) ----------
  expedite: {
    dureeVie: 60_000,   // un VIP n'attend pas : péremption accélérée
    facteur: 0.8,       // mais la commande est simple (préparée plus vite)
  },

  // ---------- Briefs de manche ----------
  // Affichés en plein écran quelques secondes au lancement de chaque manche :
  // les POLITIQUES EXPLICITES de la manche, annoncées avant de jouer.
  briefsManche: {
    1: {
      accroche: 'Le restaurant ouvre. Livrez un maximum de sushis !',
      regles: [
        'Les commandes arrivent en continu et sont poussées vers vos postes',
        'Empilez autant de cartes que vous voulez… si vous l’osez',
        'Changer de carte en cours de travail fait tout recommencer',
      ],
    },
    2: {
      accroche: 'Nouvelles règles d’équipe : les limites WIP.',
      regles: [
        'Chaque colonne a une limite : pleine, elle n’accepte plus rien',
        'Une seule carte à la fois par personne',
        'Un poste bloqué ? Vous pouvez changer de poste à tout moment…',
      ],
    },
    3: {
      accroche: 'Plus rien n’avance tout seul : tirez le travail.',
      regles: [
        'Une carte finie attend qu’un poste aval la TIRE',
        'On ne tire que si on a la capacité de traiter',
        'Les commandes VIP 🔥 passent avant tout — et périment 2× plus vite',
      ],
    },
  },

  // ---------- Enseignements clés affichés au débrief ----------
  // « Ce qu'il fallait voir » : l'ancrage théorique APRÈS le vécu.
  enseignements: {
    1: 'En flux poussé, commencer beaucoup ne fait pas livrer beaucoup : le travail s’accumule, le lead time explose et la fraîcheur (votre client) en paie le prix. Le multitâche a un coût que vous avez senti dans les doigts.',
    2: 'Limiter le travail en cours ne ralentit pas l’équipe : ça la concentre. Le système se met au rythme de son goulot — et le temps « libre » devient du temps pour l’aider. Stop starting, start finishing.',
    3: 'Tirer le travail, c’est laisser la capacité réelle décider. Les classes de service (VIP vs standard) sont une politique explicite : l’urgence est gérée par une règle, pas par du stress.',
  },

  // ---------- Lexique Kanban (bouton ❓ en jeu) ----------
  lexique: [
    ['Flux poussé / tiré', 'Poussé : l’amont envoie dès qu’il a fini. Tiré : l’aval prend quand il a de la capacité.'],
    ['WIP (travail en cours)', 'Tout ce qui est commencé mais pas livré. Le limiter accélère le flux.'],
    ['Lead time', 'Temps entre la commande et la livraison, vu du client. Ici : la jauge de fraîcheur.'],
    ['Cycle time', 'Temps passé dans une étape du flux. Sa somme + les attentes = le lead time.'],
    ['Throughput (débit)', 'Nombre d’éléments livrés par unité de temps. La seule vitesse qui compte.'],
    ['Goulot d’étranglement', 'L’étape la plus lente : c’est elle qui fixe le débit de tout le système.'],
    ['CFD', 'Diagramme de flux cumulé : chaque bande = une étape ; une bande qui gonfle = un bouchon.'],
    ['Classe de service', 'Règle explicite de priorité (ex. VIP) : l’urgence traitée par une politique, pas par la panique.'],
  ],

  // ---------- Questions de débrief affichées entre les manches ----------
  // La pédagogie se joue ICI : le facilitateur s'appuie sur ces questions.
  questionsDebrief: {
    1: [
      'Où le travail s’est-il accumulé ? Qu’est-ce que ça vous rappelle dans votre quotidien ?',
      'Combien de sushis avez-vous commencés… et combien avez-vous livrés ?',
      'Qu’avez-vous ressenti quand les commandes continuaient d’arriver ?',
    ],
    2: [
      'Qu’est-ce qui a changé avec les limites WIP ? Le débit a-t-il baissé… ou augmenté ?',
      'Quand une colonne était bloquée, qu’avez-vous fait de votre temps libre ?',
      'Où est le goulot d’étranglement ? Comment l’avez-vous repéré ?',
    ],
    3: [
      'Quelle différence entre pousser le travail et le tirer ?',
      'Comment l’équipe a-t-elle géré les commandes VIP sans couler le reste du flux ?',
      'Quelle politique explicite adopteriez-vous demain dans votre équipe ?',
    ],
  },
};

/**
 * Renvoie la durée de travail théorique (ms) pour un type de sushi à un poste.
 * Utilisée par le serveur (validation anti-triche) ET par le client (durée des mini-jeux).
 */
export function dureeTravail(typeSushi, poste, expedite = false) {
  const base = CONFIG.tempsPostes[poste] || 3000;
  const facteur = expedite ? CONFIG.expedite.facteur : (CONFIG.typesSushi[typeSushi]?.facteur ?? 1);
  return Math.round(base * facteur);
}

/**
 * Renvoie la durée de vie (fraîcheur totale, ms) d'une carte.
 * Les commandes en livraison périment plus vite : le scooter attend.
 */
export function dureeVie(typeSushi, expedite = false, canal = 'salle') {
  if (expedite) return CONFIG.expedite.dureeVie;
  const base = CONFIG.typesSushi[typeSushi]?.dureeVie ?? 100_000;
  const facteur = CONFIG.canaux[canal]?.facteurFraicheur ?? 1;
  return Math.round(base * facteur);
}

/** Tire un canal de commande (salle / livraison) selon les poids. */
export function tirerCanal(aleatoire = Math.random) {
  const entrees = Object.entries(CONFIG.canaux);
  const total = entrees.reduce((s, [, c]) => s + c.poids, 0);
  let seuil = aleatoire() * total;
  for (const [id, c] of entrees) {
    seuil -= c.poids;
    if (seuil <= 0) return id;
  }
  return 'salle';
}

/** Tire un type de sushi au hasard selon les poids configurés. */
export function tirerTypeSushi(aleatoire = Math.random) {
  const entrees = Object.entries(CONFIG.typesSushi);
  const total = entrees.reduce((somme, [, t]) => somme + t.poids, 0);
  let seuil = aleatoire() * total;
  for (const [id, t] of entrees) {
    seuil -= t.poids;
    if (seuil <= 0) return id;
  }
  return entrees[0][0];
}
