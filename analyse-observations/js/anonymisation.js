"use strict";
/*
 * Module de pseudonymisation et d’anonymisation irréversible — exécution 100 % locale.
 *
 * Pipeline par observation (Exigence A) :
 *   1. Détection : expressions régulières (identifiants « certains » : courriels, téléphones,
 *      adresses, parcelles, dates…) + modèle de langage LOCAL (sortie JSON stricte : type,
 *      texte exact, catégorie direct/quasi, généralisation proposée) + champ « auteur ».
 *      Les positions sont calculées par le programme (le modèle n’est pas fiable pour cela).
 *   2. Application des remplacements avec traçabilité (compteurs par type, sans valeur personnelle).
 *   3. Contrôle qualité : relecture du texte traité par le modèle + nouvelle passe d’expressions
 *      régulières ; tout résidu place l’observation « à vérifier » (relecture humaine).
 *
 * L’appel au modèle est injecté (`appelModele(messages, options) → objet JSON`) : le module ne fait
 * lui-même aucune requête réseau, ce qui permet de le tester avec un faux modèle ou avec Ollama.
 */
(function (racine, fabrique) {
  const A = fabrique();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = A;
  } else {
    racine.Anonymisation = A;
  }
})(typeof self !== "undefined" ? self : this, function () {
  const MODES = { PSEUDO: "pseudonymisation", ANON: "anonymisation" };

  const AVERTISSEMENTS = {
    pseudonymisation:
      "La pseudonymisation reste une donnée personnelle au sens du RGPD ; le tableau de correspondance doit être protégé et détruit à la clôture du dossier.",
    anonymisation:
      "L'anonymisation irréversible est définitive : les données ne sont plus personnelles au sens du RGPD, mais aucun retour en arrière n'est possible. Conservez une copie du fichier original dans un espace sécurisé."
  };

  /* Types d’entités. direct = identifiant direct ; quasi = quasi-identifiant (ré-identification par recoupement). */
  const TYPES = {
    PERSONNE: { categorie: "direct", balise: "[PERSONNE]", libelle: "Noms et prénoms" },
    COURRIEL: { categorie: "direct", balise: "[COURRIEL]", libelle: "Adresses courriel" },
    TELEPHONE: { categorie: "direct", balise: "[TÉLÉPHONE]", libelle: "Téléphones" },
    ADRESSE: { categorie: "direct", balise: "[ADRESSE]", libelle: "Adresses postales" },
    IDENTIFIANT: { categorie: "direct", balise: "[IDENTIFIANT]", libelle: "Numéros d’identification (sécurité sociale, IBAN…)" },
    FONCTION: { categorie: "quasi", balise: "[FONCTION]", libelle: "Fonctions, professions, mandats" },
    PARCELLE: { categorie: "quasi", balise: "[PARCELLE]", libelle: "Parcelles cadastrales" },
    DATE: { categorie: "quasi", balise: "[DATE]", libelle: "Dates précises" },
    LIEU: { categorie: "quasi", balise: "[LIEU]", libelle: "Lieux précis (lieu-dit, quartier, voisinage)" },
    AGE: { categorie: "quasi", balise: "[ÂGE]", libelle: "Âges" },
    SANTE: { categorie: "quasi", balise: "[INFORMATION DE SANTÉ]", libelle: "Informations de santé (donnée sensible, art. 9 RGPD)" },
    ORGANISATION: { categorie: "quasi", balise: "[ORGANISATION]", libelle: "Entreprises, associations, exploitations" },
    AUTRE: { categorie: "quasi", balise: "[DONNÉE MASQUÉE]", libelle: "Autres éléments identifiants" }
  };

  const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

  /* ------------------------- Outils de texte ------------------------- */
  function normaliser(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[’‘`´]/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }
  function echapperRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  const RE_BALISE = /\[[^\][\n]{1,60}\]/g;
  /** Pronoms, civilités seules et mots génériques renvoyés à tort par les modèles. */
  const MOTS_NON_IDENTIFIANTS = new Set(
    [
      "je", "j'", "moi", "moi-meme", "nous", "on", "il", "elle", "ils", "elles", "vous", "tu", "me", "m'", "mon", "ma", "mes",
      "notre", "nos", "votre", "vos", "leur", "leurs", "lui", "eux", "monsieur", "madame", "mademoiselle", "m", "m.", "mme", "mr",
      "messieurs", "mesdames", "anonyme", "inconnu", "inconnue", "non precise", "n/a", "nc", "le maire", "la mairie", "mairie",
      "la prefecture", "le commissaire enqueteur", "le porteur de projet", "le petitionnaire", "riverain", "riveraine", "riverains",
      "habitant", "habitante", "habitants", "voisin", "voisine", "voisins", "agriculteur", "agricultrice", "mon mari", "ma femme"
    ]
  );
  function estGenerique(valeur) {
    const n = normaliser(valeur).replace(/[()«»"]/g, "").trim();
    return n.length < 2 || MOTS_NON_IDENTIFIANTS.has(n) || /^(?:19|20)\d{2}$/.test(n) || /^\d{1,3}$/.test(n);
  }
  function estBalise(v) {
    return /^\[[^\]]+\]$/.test(String(v).trim());
  }
  /** Motif tolérant : espaces multiples, apostrophes droites/courbes, tirets/espaces. */
  function motifPour(valeur) {
    const corps = echapperRegex(String(valeur).trim())
      .replace(/\s+/g, "\\s+")
      .replace(/['’]/g, "['’]")
      .replace(/\\-/g, "[-\\s]");
    return new RegExp("(?<![\\p{L}\\p{N}@])" + corps + "(?![\\p{L}\\p{N}])", "giu");
  }
  /** Zones déjà balisées (à ne jamais remplacer). */
  function zonesBalises(texte) {
    const z = [];
    let m;
    RE_BALISE.lastIndex = 0;
    while ((m = RE_BALISE.exec(texte))) z.push([m.index, m.index + m[0].length]);
    return z;
  }

  /* --------------------- 1a. Détection par expressions régulières --------------------- */
  const VOIES = "rue|avenue|av\\.|boulevard|bd|chemin|impasse|all[ée]e|place|route|quai|cours|passage|square|r[ée]sidence|lotissement|hameau|lieu-dit|lieudit|domaine|faubourg";
  const DETECTEURS = [
    { type: "COURRIEL", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
    { type: "TELEPHONE", re: /(?<!\d)(?:(?:\+|00)33[\s.-]?[1-9]|0[1-9])(?:[\s.-]?\d{2}){4}(?!\d)/g },
    { type: "IDENTIFIANT", re: /(?<!\d)[12][\s.]?\d{2}[\s.]?(?:0[1-9]|1[0-2]|[2-9]\d)[\s.]?(?:\d{2}|2[AB])[\s.]?\d{3}[\s.]?\d{3}(?:[\s.]?\d{2})?(?!\d)/g },
    { type: "IDENTIFIANT", re: /\bFR\d{2}(?:[\s]?[0-9A-Z]{4}){5}[\s]?[0-9A-Z]{3}\b/g },
    {
      type: "ADRESSE",
      re: new RegExp("\\b\\d{1,4}(?:\\s?(?:bis|ter))?,?\\s+(?:" + VOIES + ")\\s+[^\\n,.;:()]{2,45}?(?=[,.;:()\\n]|\\s+(?:à|a|au|dans|depuis|et|qui|où)\\s|$)", "giu")
    },
    { type: "ADRESSE", re: new RegExp("\\b(?:lieu-dit|lieudit)\\s+(?:« ?)?[A-ZÉÈÀÂ][\\p{L}'’-]+(?:\\s+[A-ZÉÈÀÂ\\p{Ll}][\\p{L}'’-]+){0,3}", "gu") },
    { type: "ADRESSE", re: /\b\d{5}\s+[A-ZÉÈÀÂ][\p{L}'’-]+(?:[\s-](?:sur|sous|de|du|des|la|le|les|en|[A-ZÉÈÀÂ][\p{L}'’-]+)){0,5}/gu },
    {
      type: "PARCELLE",
      re: /\b(?:parcelles?|section)\s+(?:cadastrales?\s+)?(?:n[°o]\s*)?[A-Z]{1,2}\s?(?:n[°o]\s*)?\d{1,4}(?:\s*(?:,|et)\s*(?:[A-Z]{1,2}\s?)?\d{1,4})*/giu
    },
    { type: "PARCELLE", re: /\b[A-Z]{1,2}\s?n[°o]\s?\d{1,4}\b/g },
    { type: "DATE", re: /(?:(?<![\p{L}])(?:le|du|au)\s+)?(?<!\d)\d{1,2}[\/.-]\d{1,2}[\/.-](?:19|20)?\d{2}(?!\d)/gu },
    { type: "DATE", re: new RegExp("(?:(?<![\\p{L}])(?:le|du|au)\\s+)?(?<!\\d)\\d{1,2}(?:er)?\\s+(?:" + MOIS.join("|") + "|fevrier|aout|decembre)\\s+(?:19|20)\\d{2}(?!\\d)", "giu") },
    { type: "AGE", re: /(?<![\p{L}])(?:âg[ée]e?s?\s+de|j'ai|j’ai|âge\s+de)\s+\d{1,3}\s?ans(?![\p{L}])/giu }
  ];

  function detecterParRegles(texte) {
    const res = [];
    for (const d of DETECTEURS) {
      d.re.lastIndex = 0;
      let m;
      while ((m = d.re.exec(texte))) {
        const valeur = m[0].trim().replace(/[\s,;:]+$/, "");
        if (valeur.length >= 4 && !estBalise(valeur)) res.push({ type: d.type, valeur, categorie: TYPES[d.type].categorie, source: "règle" });
      }
    }
    return res;
  }

  /** Contrôle rapide des identifiants directs (texte libre avant envoi à une IA externe, contrôle qualité). */
  function contientIdentifiantsDirects(texte) {
    return detecterParRegles(texte).filter((e) => TYPES[e.type].categorie === "direct");
  }

  /* --------------------- 1b. Détection par le modèle local --------------------- */
  const PROMPT_DETECTION = [
    "Tu es un outil d’anonymisation de documents administratifs français (observations du public dans une enquête publique).",
    "Tu travailles pour le commissaire enquêteur, en local. Repère dans le texte TOUTES les informations permettant d’identifier une personne physique, directement ou par recoupement.",
    "Réponds UNIQUEMENT avec un objet JSON de la forme :",
    '{"entites":[{"type":"…","valeur":"…","categorie":"direct|quasi","generalisation":"…"}]}',
    "Types autorisés : PERSONNE (nom, prénom, nom de famille seul, initiales nominatives, signature), COURRIEL, TELEPHONE, ADRESSE (adresse postale, numéro et voie, lieu-dit d’habitation), IDENTIFIANT (numéro de sécurité sociale, IBAN, numéro de client…), FONCTION (profession, mandat, poste : « adjoint au maire », « agriculteur du hameau », « secrétaire de mairie »), PARCELLE (références cadastrales), DATE (date précise d’un événement personnel), LIEU (lieu précis permettant de situer une personne : voisinage, quartier, nom d’exploitation), AGE, SANTE (maladie, handicap, traitement, état de santé), ORGANISATION (entreprise, association, GAEC, exploitation nommée), AUTRE.",
    "categorie = \"direct\" pour PERSONNE, COURRIEL, TELEPHONE, ADRESSE, IDENTIFIANT ; \"quasi\" pour les autres.",
    "\"valeur\" doit être COPIÉE EXACTEMENT telle qu’elle apparaît dans le texte (même casse, même orthographe), sans ajout ni reformulation. Une entrée par forme différente (ex. « Jean Dupont » et « M. Dupont »).",
    "\"generalisation\" : une formulation générale et non identifiante (ex. « un exploitant agricole de la commune », « une commune voisine », « au printemps 2024 »).",
    "N’inclus PAS : les balises déjà entre crochets comme [PERSONNE], le nom du projet, les noms de communes cités seulement comme localisation générale du projet, les institutions publiques (préfecture, mairie, ministère) citées sans désigner une personne.",
    "Si rien n’est identifiant, réponds {\"entites\":[]}."
  ].join("\n");

  function messagesDetection(texte) {
    return [
      { role: "system", content: PROMPT_DETECTION },
      { role: "user", content: "Texte à analyser :\n<<<\n" + texte + "\n>>>" }
    ];
  }

  function validerEntitesModele(reponse, texte) {
    const liste = reponse && Array.isArray(reponse.entites) ? reponse.entites : Array.isArray(reponse) ? reponse : [];
    const tn = normaliser(texte);
    const res = [];
    for (const e of liste) {
      if (!e || typeof e !== "object") continue;
      const valeur = String(e.valeur || e.value || e.texte || "").trim();
      if (valeur.length < 2 || estBalise(valeur) || valeur.length > 120 || estGenerique(valeur)) continue;
      let type = String(e.type || "AUTRE").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z]/g, "");
      if (type === "NOM" || type === "PRENOM") type = "PERSONNE";
      if (type === "EMAIL" || type === "MAIL") type = "COURRIEL";
      if (!TYPES[type]) type = "AUTRE";
      if (!tn.includes(normaliser(valeur))) continue; // le modèle a inventé ou reformulé : ignoré
      res.push({
        type,
        valeur,
        categorie: TYPES[type].categorie,
        generalisation: typeof e.generalisation === "string" ? e.generalisation.trim() : "",
        source: "modèle"
      });
    }
    return res;
  }

  /* ------------------ Correspondance des pseudonymes (stable) ------------------ */
  class Correspondance {
    constructor(donnees) {
      const d = donnees || {};
      this.compteur = d.compteur || 0;
      this.entrees = d.entrees || {}; // pseudo → { type, valeurs: [] }
      this.index = {};
      for (const [pseudo, e] of Object.entries(this.entrees)) {
        for (const v of e.valeurs) this.index[e.type + "|" + normaliser(v)] = pseudo;
      }
    }
    /** Pseudonyme stable pour une valeur ; rapproche les variantes d’un même nom (« Dupont » / « Jean Dupont »). */
    obtenir(type, valeur) {
      const cle = type + "|" + normaliser(valeur);
      if (this.index[cle]) return this.index[cle];
      if (type === "PERSONNE") {
        const decouper = (v) => {
          const mots = normaliser(v)
            .replace(/\b(m|mme|mr|monsieur|madame|mademoiselle|dr|me)\b\.?/g, " ")
            .split(/[\s.]+/)
            .filter((x) => x.length >= 2);
          return { nom: mots[mots.length - 1] || "", prenoms: mots.slice(0, -1) };
        };
        const n1 = decouper(valeur);
        if (n1.nom.length >= 3) {
          for (const [pseudo, e] of Object.entries(this.entrees)) {
            if (e.type !== "PERSONNE") continue;
            // Même nom de famille et prénoms compatibles (absents d’un côté, ou en commun).
            const compatible = e.valeurs.some((v) => {
              const n2 = decouper(v);
              return n2.nom === n1.nom && (!n1.prenoms.length || !n2.prenoms.length || n1.prenoms.some((p) => n2.prenoms.includes(p)));
            });
            if (compatible) {
              e.valeurs.push(valeur);
              this.index[cle] = pseudo;
              return pseudo;
            }
          }
        }
      }
      this.compteur += 1;
      const pseudo = "[PSEUDO-" + String(this.compteur).padStart(2, "0") + "]";
      this.entrees[pseudo] = { type, valeurs: [valeur] };
      this.index[cle] = pseudo;
      return pseudo;
    }
    toJSON() {
      return { compteur: this.compteur, entrees: this.entrees };
    }
    /** Version « sans valeurs » : conserve uniquement le compteur (reprise sans tableau). */
    etatMinimal() {
      return { compteur: this.compteur, entrees: {} };
    }
  }

  function reidentifier(texte, donneesCorrespondance) {
    const entrees = (donneesCorrespondance && donneesCorrespondance.entrees) || {};
    return String(texte).replace(/\[PSEUDO-\d+\]/g, (p) => (entrees[p] ? entrees[p].valeurs[0] : p));
  }

  /* --------------------------- Généralisation --------------------------- */
  function generaliserDate(valeur) {
    const v0 = normaliser(valeur);
    const prefixe = /^(le|du|au)\s+/.test(v0) ? "courant " : "";
    const r = generaliserDateSeule(v0.replace(/^(le|du|au)\s+/, ""));
    return r.startsWith("[") ? r : prefixe + r;
  }
  function generaliserDateSeule(v) {
    let m = v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-]((?:19|20)?\d{2})$/);
    if (m) {
      const mois = parseInt(m[2], 10);
      let an = m[3].length === 2 ? "20" + m[3] : m[3];
      if (mois >= 1 && mois <= 12) return MOIS[mois - 1] + " " + an;
    }
    m = v.match(/(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+((?:19|20)\d{2})/);
    if (m) {
      const i = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"].indexOf(m[1]);
      return MOIS[i] + " " + m[2];
    }
    return TYPES.DATE.balise;
  }
  function generaliserAge(valeur) {
    const m = String(valeur).match(/(\d{1,3})\s?ans/);
    if (!m) return TYPES.AGE.balise;
    const n = parseInt(m[1], 10);
    const avant = String(valeur).slice(0, m.index);
    if (n < 18) return avant + "[MINEUR]";
    const d = Math.floor(n / 10) * 10;
    return avant + "[" + d + "-" + (d + 9) + " ANS]";
  }
  /** Généralisation proposée par le modèle : acceptée seulement si elle ne reprend rien de la valeur d’origine. */
  function generalisationSure(e) {
    const g = String(e.generalisation || "").trim();
    if (!g || g.length > 50 || /[\[\]@\d]/.test(g)) return false;
    const motsOrigine = normaliser(e.valeur).split(/[\s'-]+/).filter((m) => m.length >= 4);
    const ng = normaliser(g);
    return !motsOrigine.some((m) => ng.includes(m));
  }

  function remplacement(e, mode, table) {
    const t = TYPES[e.type] || TYPES.AUTRE;
    if (mode === MODES.PSEUDO) {
      return t.categorie === "direct" ? table.obtenir(e.type, e.valeur) : null; // quasi-identifiants conservés
    }
    if (t.categorie === "direct") return t.balise;
    if (e.type === "DATE") return generaliserDate(e.valeur);
    if (e.type === "AGE") return generaliserAge(e.valeur);
    if (e.type === "LIEU" && generalisationSure(e)) return "[" + e.generalisation.toUpperCase() + "]";
    return t.balise;
  }

  /* --------------------------- 2. Application --------------------------- */
  /** Remplace toutes les occurrences des entités ; renvoie le texte et les comptes (sans valeurs). */
  function appliquer(texte, entites, mode, table) {
    const t = String(texte || "");
    if (!t) return { texte: t, remplacements: [] };
    const interdites = zonesBalises(t);
    const segmentsTrouves = [];
    for (const e of entites) {
      const re = motifPour(e.valeur);
      let m;
      while ((m = re.exec(t))) {
        const debut = m.index;
        const fin = debut + m[0].length;
        if (interdites.some(([a, b]) => debut < b && fin > a)) continue;
        segmentsTrouves.push({ debut, fin, e });
      }
    }
    // Résolution des chevauchements : le plus long d’abord, puis l’identifiant direct.
    segmentsTrouves.sort((a, b) => b.fin - b.debut - (a.fin - a.debut) || (TYPES[a.e.type].categorie === "direct" ? -1 : 1));
    const retenus = [];
    for (const s of segmentsTrouves) {
      if (!retenus.some((r) => s.debut < r.fin && s.fin > r.debut)) retenus.push(s);
    }
    retenus.sort((a, b) => b.debut - a.debut);
    let res = t;
    const remplacements = [];
    for (const s of retenus) {
      const par = remplacement(s.e, mode, table);
      if (par == null) continue;
      res = res.slice(0, s.debut) + par + res.slice(s.fin);
      remplacements.push({ type: s.e.type, categorie: TYPES[s.e.type].categorie, source: s.e.source, debut: s.debut, longueur: s.fin - s.debut, par });
    }
    return { texte: res, remplacements: remplacements.reverse() };
  }

  /* ------------------------- 3. Contrôle qualité ------------------------- */
  function messagesControle(texte, mode) {
    const cible =
      mode === MODES.PSEUDO
        ? "Seuls les IDENTIFIANTS DIRECTS comptent ici (nom, prénom, courriel, téléphone, adresse postale, numéro d’identification) : les quasi-identifiants sont volontairement conservés."
        : "Signale tout identifiant direct (nom, prénom, courriel, téléphone, adresse, numéro) ET tout quasi-identifiant résiduel (fonction ou profession précise, date précise, parcelle, lieu-dit, âge, information de santé, nom d’entreprise ou d’exploitation, combinaison de détails rares).";
    return [
      {
        role: "system",
        content: [
          "Tu es le contrôleur qualité d’une " + (mode === MODES.PSEUDO ? "pseudonymisation" : "anonymisation irréversible") + " de texte, en français.",
          "Les éléments entre crochets (ex. [PERSONNE], [PSEUDO-03], [ADRESSE]) sont des remplacements VOLONTAIRES : ne les signale jamais.",
          cible,
          "Ne signale PAS : les pronoms, les mots génériques (riverain, habitant, agriculteur sans autre précision), les éléments du projet (panneaux, site, haies, chantier), les descriptions de paysage, les années seules, les mois et années généralisés (ex. « en mars 2024 »), les noms d’espèces animales ou végétales.",
          'Réponds UNIQUEMENT avec un objet JSON : {"residus":[{"valeur":"texte exact","type":"…","raison":"courte explication"}]}. Si le texte est correct : {"residus":[]}.'
        ].join("\n")
      },
      { role: "user", content: "Texte à contrôler :\n<<<\n" + texte + "\n>>>" }
    ];
  }

  function validerResidus(reponse, texte, mode, remplacementsProduits) {
    const produits = (remplacementsProduits || []).map(normaliser);
    const liste = reponse && Array.isArray(reponse.residus) ? reponse.residus : [];
    const tn = normaliser(texte.replace(RE_BALISE, " "));
    const vus = new Set();
    const res = [];
    for (const r of liste) {
      const valeur = String((r && (r.valeur || r.value)) || "").trim();
      if (valeur.length < 3 || estBalise(valeur) || estGenerique(valeur) || !tn.includes(normaliser(valeur)) || vus.has(normaliser(valeur))) continue;
      if (produits.some((p) => p.includes(normaliser(valeur)))) continue; // généralisation produite par le kit
      let type = String(r.type || "AUTRE").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z]/g, "");
      if (!TYPES[type]) type = "AUTRE";
      if (mode === MODES.PSEUDO && TYPES[type].categorie !== "direct") continue;
      vus.add(normaliser(valeur));
      res.push({ valeur, type, raison: String(r.raison || "").slice(0, 200), source: "contrôle modèle" });
    }
    for (const e of detecterParRegles(texte)) {
      if (mode === MODES.PSEUDO && e.categorie !== "direct") continue;
      if (produits.some((p) => p.includes(normaliser(e.valeur)))) continue;
      if (!vus.has(normaliser(e.valeur))) {
        vus.add(normaliser(e.valeur));
        res.push({ valeur: e.valeur, type: e.type, raison: "motif détecté automatiquement", source: "contrôle règle" });
      }
    }
    return res;
  }

  /* ------------------------------ Pipeline ------------------------------ */
  function dedupliquer(entites) {
    const vus = new Map();
    for (const e of entites) {
      const cle = normaliser(e.valeur);
      const deja = vus.get(cle);
      if (!deja || (TYPES[e.type].categorie === "direct" && TYPES[deja.type].categorie !== "direct")) vus.set(cle, e);
    }
    return [...vus.values()];
  }

  /**
   * Traite une observation. ctx = { mode, appelModele, table (Correspondance), generaliserDateDepot, controle (défaut : true) }.
   * Renvoie un résultat sans perte de l’original (conservé à part par l’appelant).
   */
  async function traiterObservation(obs, ctx) {
    const debut = Date.now();
    const mode = ctx.mode === MODES.ANON ? MODES.ANON : MODES.PSEUDO;
    const table = ctx.table || new Correspondance();
    const champs = { objet: obs.objet || "", lieu: obs.lieu || "", texte: obs.texte || "" };
    const texteComplet = [champs.objet, champs.lieu, champs.texte].filter(Boolean).join("\n\n");

    // 1. Détection
    let entites = detecterParRegles(texteComplet);
    if (obs.auteur && obs.auteur.trim()) {
      for (const partie of obs.auteur.split(/\s*(?:,|;|\bet\b|&)\s*/)) {
        if (partie.trim().length >= 2 && !estBalise(partie) && !estGenerique(partie)) entites.push({ type: "PERSONNE", valeur: partie.trim(), categorie: "direct", source: "auteur" });
      }
    }
    const reponse = await ctx.appelModele(messagesDetection(texteComplet), { maxTokens: 1500 });
    entites = dedupliquer(entites.concat(validerEntitesModele(reponse, texteComplet)));

    // 2. Application
    const sortie = {};
    const remplacements = [];
    for (const [cle, valeur] of Object.entries(champs)) {
      const r = appliquer(valeur, entites, mode, table);
      sortie[cle] = r.texte;
      remplacements.push(...r.remplacements.map((x) => Object.assign({ champ: cle }, x)));
    }
    let auteur = "";
    if (obs.auteur && obs.auteur.trim()) {
      auteur = estGenerique(obs.auteur) ? obs.auteur.trim() : mode === MODES.PSEUDO ? appliquer(obs.auteur, entites, mode, table).texte : "[PERSONNE]";
    }
    let date = obs.date || "";
    if (mode === MODES.ANON && date && ctx.generaliserDateDepot !== false) date = generaliserDate(date);

    // 3. Contrôle qualité
    let residus = [];
    if (ctx.controle !== false) {
      const texteTraite = [sortie.objet, sortie.lieu, sortie.texte, mode === MODES.PSEUDO ? "" : auteur].filter(Boolean).join("\n\n");
      const rc = await ctx.appelModele(messagesControle(texteTraite, mode), { maxTokens: 800 });
      residus = validerResidus(rc, texteTraite, mode, remplacements.map((x) => x.par).concat(date ? [date] : []));
    }

    const compteurs = {};
    for (const r of remplacements) compteurs[r.type] = (compteurs[r.type] || 0) + 1;
    return {
      reference: obs.reference,
      mode,
      date,
      auteur,
      objet: sortie.objet,
      lieu: sortie.lieu,
      texte: sortie.texte,
      // Entités détectées : conservées pour la relecture humaine (contiennent des valeurs personnelles :
      // elles ne sortent jamais du dossier de travail local et ne figurent ni dans le rapport ni dans le journal).
      entites: entites.map((e) => ({ type: e.type, categorie: e.categorie, source: e.source, valeur: e.valeur })),
      compteurs,
      nbQuasiConserves: mode === MODES.PSEUDO ? entites.filter((e) => e.categorie === "quasi").length : 0,
      residus,
      statut: residus.length ? "a_verifier" : "traitee",
      dureeMs: Date.now() - debut
    };
  }

  /** Relecture humaine : masque un terme résiduel dans tous les champs d’un résultat. */
  function masquerTerme(resultat, valeur, type, table) {
    const e = { type: TYPES[type] ? type : "AUTRE", valeur, categorie: (TYPES[type] || TYPES.AUTRE).categorie, source: "relecture" };
    // En pseudonymisation, un quasi-identifiant que l’humain décide de masquer reçoit une balise générique.
    const modeApplique = resultat.mode === MODES.PSEUDO && e.categorie !== "direct" ? MODES.ANON : resultat.mode;
    let n = 0;
    for (const champ of ["objet", "lieu", "texte", "auteur"]) {
      const r = appliquer(resultat[champ] || "", [e], modeApplique, table);
      n += r.remplacements.length;
      resultat[champ] = r.texte;
    }
    resultat.residus = (resultat.residus || []).filter((x) => normaliser(x.valeur) !== normaliser(valeur));
    resultat.compteurs[e.type] = (resultat.compteurs[e.type] || 0) + n;
    if (!resultat.residus.length && resultat.statut === "a_verifier") resultat.statut = "traitee";
    return n;
  }

  /** Rapport de traitement (aucune valeur personnelle). */
  function rapport(resultats, infos) {
    const parType = {};
    let total = 0;
    for (const r of resultats) {
      for (const [t, n] of Object.entries(r.compteurs || {})) {
        parType[t] = (parType[t] || 0) + n;
        total += n;
      }
    }
    const compter = (s) => resultats.filter((r) => r.statut === s).length;
    return {
      format: "kit-analyse-observations/rapport-traitement",
      date: new Date().toISOString(),
      mode: infos.mode,
      modele: infos.modele || "",
      observationsImportees: infos.nbImportees,
      observationsTraitees: resultats.length,
      aVerifier: compter("a_verifier"),
      validees: compter("validee"),
      traiteesSansResidu: compter("traitee"),
      entitesRemplacees: total,
      parType: Object.entries(parType)
        .sort((a, b) => b[1] - a[1])
        .map(([type, nombre]) => ({ type, libelle: (TYPES[type] || TYPES.AUTRE).libelle, nombre })),
      quasiIdentifiantsConserves: infos.mode === MODES.PSEUDO ? resultats.reduce((n, r) => n + (r.nbQuasiConserves || 0), 0) : 0,
      tableauCorrespondance: infos.mode === MODES.PSEUDO ? (infos.tableConservee ? "conservé (chiffré)" : "non conservé") : "aucun (anonymisation irréversible)",
      dureeTotaleSecondes: Math.round(resultats.reduce((n, r) => n + (r.dureeMs || 0), 0) / 1000)
    };
  }

  return {
    MODES,
    AVERTISSEMENTS,
    TYPES,
    normaliser,
    detecterParRegles,
    contientIdentifiantsDirects,
    messagesDetection,
    validerEntitesModele,
    messagesControle,
    validerResidus,
    Correspondance,
    reidentifier,
    generaliserDate,
    generaliserAge,
    appliquer,
    traiterObservation,
    masquerTerme,
    rapport
  };
});
