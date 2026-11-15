"use strict";

/* =========================================================================
 * Analyse des observations — Enquête publique « Pas de Mirepoix »
 *
 * Moteurs d’IA possibles (choix dans « Paramètres IA ») :
 *  - Ollama (modèle local sur le PC : rien ne quitte l’ordinateur) ;
 *  - Open WebUI (API compatible OpenAI, vers les mêmes modèles locaux) ;
 *  - Mistral en ligne, avec la clé de l’utilisateur (conservée dans son navigateur) ;
 *  - serveur local (node serveur/server.js) détenant une clé Mistral côté serveur.
 * La partie « logique » (sans DOM) est exportée pour le serveur et les tests.
 * ========================================================================= */

const REFERENCE_EXEMPLE = "OBS-2025-0147 (exemple fictif)";
const TITRE_ENQUETE = "Projet agrivoltaïque du Pas de Mirepoix — Saint-Julien-de-Briola (Aude)";
const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";
const MISTRAL_MODELES_URL = "https://api.mistral.ai/v1/models";
const MODELE_DEFAUT = "mistral-small-latest";
const OLLAMA_URL_DEFAUT = "http://localhost:11434";
const OPENWEBUI_URL_DEFAUT = "http://localhost:3000";
const LIMITE_TEXTE = 20000;

const TEXTE_EXEMPLE = [
  "Bonjour,",
  "",
  "J’habite rue des Lilas, juste à côté du chantier. Depuis le début des travaux, les poids lourds passent très tôt le matin, avant 7 heures, et encore le soir, ce qui fait beaucoup de bruit et des vibrations dans la maison. J’ai peur pour les enfants du quartier qui vont à l’école à pied le long de la route, surtout le matin.",
  "",
  "Est-ce qu’un itinéraire alternatif est prévu pour les camions ? Quelles mesures sont prises contre le bruit ? Pouvez-vous nous répondre ?",
  "",
  "Merci d’avance pour votre réponse."
].join("\n");

const TABLEAU_EXEMPLE = [
  ["Référence", null],
  ["Position", "Non exprimée (demande d’informations et de mesures)"],
  ["Thèmes", "Trafic de poids lourds pendant les travaux ; nuisances sonores et vibrations ; horaires de passage des camions ; sécurité des piétons, notamment des enfants scolarisés ; itinéraires empruntés par les engins de chantier."],
  ["Synthèse neutre", "Un riverain signale une augmentation du passage de poids lourds à proximité de son habitation depuis le début des travaux, avec des craintes concernant le bruit, les vibrations et la sécurité des enfants qui empruntent le trottoir pour aller à l’école."],
  ["Demandes explicites", "Prévoir un itinéraire alternatif pour les poids lourds ; limiter les nuisances sonores ; garantir la sécurité des piétons, en particulier des enfants ; apporter une réponse écrite à l’auteur de l’observation."],
  ["Questions au maître d’ouvrage", "Quels itinéraires les poids lourds empruntent-ils et à quels horaires ? Quelles mesures de réduction du bruit sont prévues (horaires, équipements, bâchage) ? Quelles protections sont prévues aux passages piétons à proximité du chantier et sur le trajet de l’école ? Un plan de circulation et une signalisation temporaire sont-ils en place ?"],
  ["Points à vérifier", "Conformité des itinéraires déclarés dans le dossier d’enquête ; respect des horaires réglementaires de chantier ; existence d’un plan de circulation des engins ; mesures de réduction des vibrations ; dispositif d’information des riverains ; traitement de la réponse au commissaire enquêteur."]
];

const POSITIONS = ["favorable", "défavorable", "réservé", "non exprimée"];

/* Mots-clés : ils sont cherchés en début de mot (« camion » trouve « camions »,
 * mais « asa » ne trouve plus « rasant »). */
const THEMES = [
  ["Paysage et impact visuel", ["paysage", "visuel", "défigur", "bucolique", "beauté", "laideur", "panorama", "masquer", "haie"]],
  ["Valeur immobilière", ["valeur immobilière", "dévaluation", "dévalorisation", "immobili", "perdre de la valeur", "propriété", "maison"]],
  ["Trafic, camions et travaux", ["camion", "trafic", "chaussée", "circulation", "chantier", "travaux", "route"]],
  ["Bruit et nuisances", ["bruit", "bruyant", "nuisance", "silencieux", "vibration", "pollution sonore"]],
  ["Biodiversité et environnement", ["busard", "faune", "flore", "biodiversité", "nidification", "espèce protégée", "espèces protégées", "écolog", "environnement", "patrimoine naturel"]],
  ["Agriculture, élevage et foncier", ["agricole", "agriculteur", "éleveur", "élevage", "vache", "bovin", "prairie", "pâturage", "terre arable", "terres arables", "agrivolta", "asa"]],
  ["Raccordement au réseau électrique", ["poste source", "raccordement", "raccorder", "ligne électrique", "acheminement", "transport de l'électricité", "tranchée"]],
  ["Économie, finances et emploi", ["taxe", "financier", "financière", "revenu", "coût", "onéreux", "subvention", "aide agricole", "emploi", "bénéfice"]],
  ["Conflit d'intérêts et procédure", ["conflit d'intérêt", "conflits d'intérêt", "adjoint au maire", "maire", "[fonction]", "charte", "abstention", "article 5", "publicité de l'enquête", "procédure", "irrégularit"]],
  ["Stratégie énergétique et alternatives", ["nucléaire", "co2", "gaz", "charbon", "intermittent", "climat", "transition énergétique", "souveraineté", "indépendance alimentaire", "recyclage", "déchet", "parking", "toiture", "hangar", "déjà artificialisé", "déjà pollué", "ombrière", "flottant"]],
  ["Sécurité et santé", ["santé", "sécurité", "risque", "danger", "pollution électromagnétique", "incendie"]]
];

/* ------------------------------------------------------------------------ */
/* Logique pure                                                              */
/* ------------------------------------------------------------------------ */

function statutDemonstration(texte, texteExemple) {
  if (!texte || texte.trim() === "") {
    return "vide";
  }
  return texte === texteExemple ? "exemple" : "modifie";
}

function normaliserApostrophes(t) {
  return String(t || "").replace(/[’‘`´]/g, "'");
}

function echapperRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compterThemes(entrees, themes) {
  const corpus = entrees.map((e) =>
    normaliserApostrophes((e.objet || "") + "\n" + (e.contexte || "") + "\n" + (e.texte || "")).toLowerCase()
  );
  return themes
    .map(([nom, mots]) => {
      const motifs = mots.map((m) => new RegExp("(?<![\\p{L}\\p{N}])" + echapperRegex(normaliserApostrophes(m).toLowerCase()), "gu"));
      let observations = 0;
      let mentions = 0;
      for (const texte of corpus) {
        let n = 0;
        for (const motif of motifs) {
          const r = texte.match(motif);
          n += r ? r.length : 0;
        }
        mentions += n;
        if (n > 0) {
          observations += 1;
        }
      }
      return { nom, observations, mentions };
    })
    .sort((a, b) => b.observations - a.observations || b.mentions - a.mentions);
}

function construireLignesDemo(reference) {
  return TABLEAU_EXEMPLE.map(([rubrique, contenu]) => [rubrique, rubrique === "Référence" ? reference : contenu]);
}

function nettoyerTableau(v) {
  if (typeof v === "string") {
    v = v.split(/\s*[;\n]\s*/);
  }
  if (!Array.isArray(v)) {
    return [];
  }
  return v
    .map((x) => (typeof x === "string" ? texteLibre(x) : x && typeof x === "object" ? Object.values(x).map(texteLibre).join(" — ") : ""))
    .map((x) => x.trim())
    .filter((x) => x !== "");
}

function normaliserPosition(p) {
  const t = String(p || "").toLowerCase();
  if (t.includes("défavorable") || t.includes("defavorable") || t.includes("contre") || t.includes("oppos")) {
    return "défavorable";
  }
  if (t.includes("réserv") || t.includes("reserv") || t.includes("mitig") || t.includes("nuanc")) {
    return "réservé";
  }
  if (t.includes("favorable") || t.includes("pour")) {
    return "favorable";
  }
  return "non exprimée";
}

/** Texte libre : accepte aussi un tableau ou un objet (certains modèles locaux en produisent). */
function texteLibre(v) {
  if (typeof v === "string") return v.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1").trim();
  if (Array.isArray(v)) return v.map(texteLibre).filter(Boolean).join(" ");
  if (v && typeof v === "object") return Object.values(v).map(texteLibre).filter(Boolean).join(" ");
  return "";
}

/** Valide et normalise un objet d’analyse (réponse du modèle ou du serveur). */
function normaliserAnalyse(parse, reference) {
  const p = parse && typeof parse === "object" ? parse : {};
  return {
    reference: reference || (typeof p.reference === "string" ? p.reference.trim() : ""),
    position: normaliserPosition(p.position),
    themes: nettoyerTableau(p.themes),
    synthese: texteLibre(p.synthese),
    demandes: nettoyerTableau(p.demandes),
    questions: nettoyerTableau(p.questions),
    points: nettoyerTableau(p.points)
  };
}

function lignesDepuisAnalyseIA(data, reference) {
  const a = normaliserAnalyse(data, reference);
  const liste = (v) => (v.length ? v.join(" ; ") : "—");
  return [
    ["Référence", a.reference || "—"],
    ["Position", a.position.charAt(0).toUpperCase() + a.position.slice(1)],
    ["Thèmes", liste(a.themes)],
    ["Synthèse neutre", a.synthese || "—"],
    ["Demandes explicites", liste(a.demandes)],
    ["Questions au maître d’ouvrage", liste(a.questions)],
    ["Points à vérifier", liste(a.points)]
  ];
}

const PROMPT_SYSTEME_ANALYSE = [
  "Tu es l’assistant d’un commissaire enquêteur dans le cadre de l’enquête publique",
  "« " + TITRE_ENQUETE + " » (registre du 12/11/2024 au 11/12/2024).",
  "Analyse l’observation fournie (déjà anonymisée : ne cherche jamais à identifier les personnes derrière les balises [PERSONNE], [NOM], etc.).",
  "Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, contenant exactement ces champs :",
  '"reference" (string),',
  '"position" (string, une valeur parmi : "favorable", "défavorable", "réservé", "non exprimée" — position de l’auteur sur le projet),',
  '"themes" (tableau de chaînes courtes),',
  '"synthese" (string, 1 à 4 phrases, ton neutre et factuel, à la troisième personne),',
  '"demandes" (tableau de chaînes : demandes explicites de l’auteur, vide si aucune),',
  '"questions" (tableau de chaînes : questions à adresser au maître d’ouvrage),',
  '"points" (tableau de chaînes : points à vérifier dans le dossier d’enquête).',
  "Rédige en français. Aucun avis personnel, aucune recommandation : constats et questions uniquement.",
  "N’invente aucun fait absent du texte."
].join(" ");

function construireMessagesAnalyse(reference, texte) {
  return [
    { role: "system", content: PROMPT_SYSTEME_ANALYSE },
    {
      role: "user",
      content: "Référence : " + (reference || "non précisée") + "\n\nTexte de l’observation :\n" + String(texte).slice(0, LIMITE_TEXTE)
    }
  ];
}

const PROMPT_SYSTEME_SYNTHESE = [
  "Tu es l’assistant d’un commissaire enquêteur pour l’enquête publique « " + TITRE_ENQUETE + " ».",
  "On te fournit les analyses individuelles (déjà produites) des observations du registre.",
  "Produis une synthèse globale et réponds UNIQUEMENT avec un objet JSON valide contenant :",
  '"bilan" (string : 3 à 6 phrases neutres décrivant l’ensemble des contributions et la répartition des positions),',
  '"themes" (tableau d’objets {"theme": string, "nombre": entier — nombre approximatif d’observations concernées, "resume": string — 1 à 2 phrases neutres, "references": tableau des références d’observations représentatives}), classés du plus fréquent au moins fréquent, 5 à 12 thèmes,',
  '"questions_prioritaires" (tableau de chaînes : questions majeures à adresser au maître d’ouvrage, sans doublon, 5 à 12),',
  '"points_vigilance" (tableau de chaînes : points du dossier à vérifier en priorité).',
  "Rédige en français, de façon factuelle, sans avis personnel ni recommandation sur le projet. N’invente aucun fait."
].join(" ");

function construireMessagesSynthese(analyses) {
  const lignes = analyses.map((a) =>
    [
      "[" + (a.reference || "?") + "]",
      "position: " + (a.position || "non exprimée"),
      "thèmes: " + (a.themes || []).join(", "),
      "synthèse: " + (a.synthese || ""),
      a.questions && a.questions.length ? "questions: " + a.questions.join(" | ") : ""
    ]
      .filter(Boolean)
      .join(" ; ")
  );
  return [
    { role: "system", content: PROMPT_SYSTEME_SYNTHESE },
    { role: "user", content: "Nombre d’observations analysées : " + analyses.length + "\n\n" + lignes.join("\n") }
  ];
}

function normaliserSynthese(p) {
  const s = p && typeof p === "object" ? p : {};
  const themes = Array.isArray(s.themes)
    ? s.themes
        .filter((t) => t && typeof t === "object")
        .map((t) => ({
          theme: String(t.theme || t.nom || "").trim(),
          nombre: Number.isFinite(Number(t.nombre)) ? Number(t.nombre) : null,
          resume: texteLibre(t.resume || t.résumé || ""),
          references: nettoyerTableau(t.references || t.références)
        }))
        .filter((t) => t.theme)
    : [];
  return {
    bilan: texteLibre(s.bilan),
    themes,
    questions_prioritaires: nettoyerTableau(s.questions_prioritaires),
    points_vigilance: nettoyerTableau(s.points_vigilance)
  };
}

/** Messages pour analyser plusieurs observations en une fois (mode « abonnement » par copier-coller). */
function construireMessagesAnalyseLot(elements) {
  const consigne = PROMPT_SYSTEME_ANALYSE.replace(
    "Analyse l’observation fournie",
    "Analyse CHACUNE des observations fournies"
  ).replace(
    "Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, contenant exactement ces champs :",
    'Réponds UNIQUEMENT avec un objet JSON valide de la forme {"analyses":[…]}, une entrée par observation, chacune contenant exactement ces champs :'
  );
  return [
    { role: "system", content: consigne },
    {
      role: "user",
      content: elements.map((e) => "### Référence : " + e.reference + "\n" + String(e.texte).slice(0, LIMITE_TEXTE)).join("\n\n")
    }
  ];
}

/** Texte unique à coller dans un service d’IA par abonnement (consignes + données). */
function texteAbonnement(messages) {
  const systeme = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const donnees = messages.filter((m) => m.role !== "system").map((m) => m.content).join("\n\n");
  return "CONSIGNES\n" + systeme + "\n\nDONNÉES (déjà anonymisées)\n" + donnees + "\n\nRappel : réponds uniquement avec le JSON demandé, sans aucun texte autour.";
}

/** Extrait l’objet JSON d’une réponse de chat (tolère les blocs ```json). */
function extraireJSON(contenu) {
  if (contenu && typeof contenu === "object") {
    return contenu;
  }
  const t = String(contenu || "").trim();
  try {
    return JSON.parse(t);
  } catch (e) {
    const debut = t.indexOf("{");
    const fin = t.lastIndexOf("}");
    if (debut !== -1 && fin > debut) {
      return JSON.parse(t.slice(debut, fin + 1));
    }
    throw new Error("La réponse du modèle n’est pas un JSON valide");
  }
}

function messageErreurHTTP(statut, detail) {
  const d = detail ? " (" + detail + ")" : "";
  switch (statut) {
    case 400:
      return "requête refusée par Mistral" + d;
    case 401:
      return "clé API Mistral invalide ou révoquée" + d;
    case 403:
      return "accès refusé : vérifiez les droits de la clé ou l’accès au modèle" + d;
    case 404:
      return "modèle introuvable — choisissez un autre modèle dans les paramètres" + d;
    case 422:
      return "paramètres refusés par Mistral" + d;
    case 429:
      return "limite de requêtes ou quota atteint — patientez puis réessayez" + d;
    default:
      return statut >= 500 ? "service Mistral momentanément indisponible (HTTP " + statut + ")" : "erreur HTTP " + statut + d;
  }
}

function echapperCSV(v) {
  const s = String(v == null ? "" : v);
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function analysesEnCSV(liste) {
  const entete = ["Référence", "Position", "Thèmes", "Synthèse neutre", "Demandes explicites", "Questions au maître d’ouvrage", "Points à vérifier", "Modèle", "Date"];
  const lignes = liste.map((a) =>
    [
      a.reference,
      a.position,
      (a.themes || []).join(" ; "),
      a.synthese,
      (a.demandes || []).join(" ; "),
      (a.questions || []).join(" ; "),
      (a.points || []).join(" ; "),
      a.modele || "",
      a.date || ""
    ]
      .map(echapperCSV)
      .join(";")
  );
  // BOM UTF-8 + séparateur « ; » : ouverture directe dans Excel (version française).
  return "﻿" + [entete.map(echapperCSV).join(";")].concat(lignes).join("\r\n");
}

/** Petite empreinte (FNV-1a) pour savoir si un texte a changé depuis son analyse. */
function empreinte(texte) {
  let h = 0x811c9dc5;
  const s = String(texte || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    REFERENCE_EXEMPLE,
    TITRE_ENQUETE,
    TEXTE_EXEMPLE,
    TABLEAU_EXEMPLE,
    THEMES,
    POSITIONS,
    MODELE_DEFAUT,
    OLLAMA_URL_DEFAUT,
    OPENWEBUI_URL_DEFAUT,
    LIMITE_TEXTE,
    statutDemonstration,
    compterThemes,
    construireLignesDemo,
    lignesDepuisAnalyseIA,
    normaliserAnalyse,
    normaliserSynthese,
    construireMessagesAnalyse,
    construireMessagesSynthese,
    construireMessagesAnalyseLot,
    texteAbonnement,
    extraireJSON,
    messageErreurHTTP,
    analysesEnCSV,
    empreinte,
    nettoyerTableau
  };
}

/* ------------------------------------------------------------------------ */
/* Interface                                                                 */
/* ------------------------------------------------------------------------ */

if (typeof document !== "undefined") {
  const $ = (id) => document.getElementById(id);

  /* ---------- Stockage local (toujours protégé par try/catch) ---------- */
  const stock = {
    lire(cle, defaut) {
      for (const s of [() => window.localStorage, () => window.sessionStorage]) {
        try {
          const v = s().getItem(cle);
          if (v !== null) {
            return JSON.parse(v);
          }
        } catch (e) {
          /* stockage indisponible */
        }
      }
      return defaut;
    },
    ecrire(cle, valeur, session) {
      try {
        (session ? window.sessionStorage : window.localStorage).setItem(cle, JSON.stringify(valeur));
        return true;
      } catch (e) {
        return false;
      }
    },
    supprimer(cle) {
      for (const s of [() => window.localStorage, () => window.sessionStorage]) {
        try {
          s().removeItem(cle);
        } catch (e) {
          /* rien */
        }
      }
    }
  };

  const CLE_API = "ao.cleMistral";
  const CLE_MODELE = "ao.modele";
  const CLE_ANALYSES = "ao.analyses";
  const CLE_FOURNISSEUR = "ao.fournisseur";
  const CLE_OLLAMA = "ao.ollama";
  const CLE_OWUI = "ao.openwebui";
  const CLE_OWUI_CLE = "ao.cleOpenWebUI";
  const CLE_OPENAI = "ao.openai";
  const CLE_OPENAI_CLE = "ao.cleOpenAI";
  const CLE_ANTHROPIC = "ao.anthropic";
  const CLE_ANTHROPIC_CLE = "ao.cleAnthropic";
  const CLE_ANALYSES_DOSSIER = "ao.analyses.dossier";
  /** Moteurs qui envoient des données hors du poste (Exigence G). */
  const FOURNISSEURS_EXTERNES = ["mistral", "openai", "anthropic", "abonnement"];

  const NOMS_FOURNISSEURS = {
    serveur: "Serveur local",
    ollama: "Ollama",
    openwebui: "Open WebUI",
    mistral: "Mistral (API)",
    openai: "API compatible OpenAI",
    anthropic: "Anthropic (API Claude)",
    abonnement: "Abonnement (copier-coller)"
  };

  /* ---------- État ---------- */
  const etat = {
    serveur: false, // serveur local avec clé Mistral disponible
    serveurModele: "",
    fournisseur: stock.lire(CLE_FOURNISSEUR, ""), // "" = choix automatique
    ollamaDetecte: false,
    ollama: Object.assign({ url: OLLAMA_URL_DEFAUT, modele: "" }, stock.lire(CLE_OLLAMA, {})),
    owui: Object.assign({ url: OPENWEBUI_URL_DEFAUT, modele: "" }, stock.lire(CLE_OWUI, {})),
    owuiCle: stock.lire(CLE_OWUI_CLE, ""),
    openai: Object.assign({ url: "https://api.openai.com/v1", modele: "" }, stock.lire(CLE_OPENAI, {})),
    openaiCle: stock.lire(CLE_OPENAI_CLE, ""),
    anthropic: Object.assign({ modele: "" }, stock.lire(CLE_ANTHROPIC, {})),
    anthropicCle: stock.lire(CLE_ANTHROPIC_CLE, ""),
    kit: null, // informations du serveur du kit (api/etat), null hors kit
    cle: stock.lire(CLE_API, ""),
    modele: stock.lire(CLE_MODELE, MODELE_DEFAUT),
    analyses: stock.lire(CLE_ANALYSES, {}), // { [reference]: analyse }
    lotEnCours: false,
    lotStop: false,
    derniereAnalyse: null, // analyse affichée dans « Résultat »
    derniereSource: null // { reference, texte } pour « Relancer »
  };
  if (!etat.analyses || typeof etat.analyses !== "object") {
    etat.analyses = {};
  }

  /* ---------- Éléments ---------- */
  const champReference = $("reference");
  const champTexte = $("texte");
  const avertissement = $("avertissement-modification");
  const sectionResultats = $("resultats");
  const corpsTableau = $("corps-tableau");
  const sectionMessage = $("message");
  const btnIa = $("btn-ia");
  const panneau = $("parametres-ia");
  const btnParametres = $("btn-parametres");

  /* ---------- Utilitaires d’interface ---------- */
  let minuterieToast = null;
  function toast(texte) {
    const t = $("toast");
    t.textContent = texte;
    t.hidden = false;
    clearTimeout(minuterieToast);
    minuterieToast = setTimeout(() => {
      t.hidden = true;
    }, 3200);
  }

  function afficherMessage(texte, action) {
    sectionMessage.textContent = texte;
    if (action) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "petit lien-action";
      b.textContent = action.libelle;
      b.addEventListener("click", action.faire);
      sectionMessage.appendChild(document.createTextNode(" "));
      sectionMessage.appendChild(b);
    }
    sectionMessage.hidden = false;
    sectionMessage.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function masquerMessage() {
    sectionMessage.hidden = true;
  }

  function telecharger(nom, contenu, type) {
    const blob = new Blob([contenu], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copier(texte) {
    try {
      await navigator.clipboard.writeText(texte);
      toast("Copié dans le presse-papiers");
    } catch (e) {
      const zone = document.createElement("textarea");
      zone.value = texte;
      document.body.appendChild(zone);
      zone.select();
      try {
        document.execCommand("copy");
        toast("Copié dans le presse-papiers");
      } catch (e2) {
        toast("Copie impossible dans ce navigateur");
      }
      zone.remove();
    }
  }

  function horodatage() {
    return new Date().toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  }

  function dateFichier() {
    return new Date().toISOString().slice(0, 10);
  }

  const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

  function sansBarreFinale(url) {
    return String(url || "").trim().replace(/\/+$/, "");
  }

  function pageServieEnLocal() {
    return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && /^https?:$/.test(location.protocol);
  }

  /* ---------- Fournisseur d’IA ---------- */
  function fournisseurActif() {
    const f = etat.fournisseur;
    if (f === "serveur" && !etat.serveur) {
      return "ollama";
    }
    if (f) {
      return f;
    }
    if (etat.serveur) return "serveur";
    return "ollama"; // protection des données par défaut : moteur local
  }

  function modeleActif() {
    switch (fournisseurActif()) {
      case "serveur":
        return etat.serveurModele || MODELE_DEFAUT;
      case "ollama":
        return etat.ollama.modele;
      case "openwebui":
        return etat.owui.modele;
      case "openai":
        return etat.openai.modele;
      case "anthropic":
        return etat.anthropic.modele;
      case "abonnement":
        return "service par abonnement";
      default:
        return etat.modele;
    }
  }

  function estLocal() {
    const f = fournisseurActif();
    return f === "ollama" || f === "openwebui";
  }

  function estExterne(f) {
    return FOURNISSEURS_EXTERNES.includes(f || fournisseurActif());
  }

  function iaDisponible() {
    switch (fournisseurActif()) {
      case "serveur":
        return etat.serveur;
      case "ollama":
        return Boolean(etat.ollama.modele);
      case "openwebui":
        return Boolean(etat.owuiCle && etat.owui.modele);
      case "openai":
        return Boolean(etat.openaiCle && etat.openai.modele && etat.openai.url);
      case "anthropic":
        return Boolean(etat.anthropicCle && etat.anthropic.modele);
      case "abonnement":
        return true;
      default:
        return Boolean(etat.cle);
    }
  }

  function mettreAJourBadgeIA() {
    const badge = $("badge-ia");
    const f = fournisseurActif();
    if (iaDisponible()) {
      badge.textContent = "IA : " + NOMS_FOURNISSEURS[f] + (estLocal() ? " (local)" : estExterne(f) ? " (externe)" : "") + " · " + modeleActif();
      badge.className = "badge " + (estExterne(f) ? "badge-attention" : "badge-ok");
    } else {
      badge.textContent = "IA : " + NOMS_FOURNISSEURS[f] + " à configurer";
      badge.className = "badge badge-attention";
    }
    mettreAJourPanneauFournisseur();
  }

  function mettreAJourPanneauFournisseur() {
    const f = fournisseurActif();
    $("option-serveur").hidden = !etat.serveur;
    $("option-serveur").disabled = !etat.serveur;
    $("fournisseur").value = f;
    for (const nom of ["ollama", "openwebui", "mistral", "openai", "anthropic", "abonnement"]) {
      $("bloc-" + nom).hidden = nom !== f;
    }
    const avecCle = ["mistral", "openwebui", "openai", "anthropic"].includes(f);
    $("btn-oublier-cle").hidden = !avecCle;
    $("memoriser-cle").closest("label").hidden = !avecCle;
    $("btn-enregistrer-cle").hidden = f === "abonnement";
    // Autorisation de l’IA externe (kit local uniquement)
    const blocAuto = $("bloc-autorisation-externe");
    blocAuto.hidden = !(estExterne(f) && etat.kit);
    if (etat.kit) {
      const autorise = Boolean(etat.kit.ia_externe);
      $("etat-autorisation-externe").textContent = autorise
        ? "✓ L’IA externe est autorisée sur ce poste (domaines : " + (etat.kit.hotes_externes || []).join(", ") + "). Seules des données anonymisées et validées peuvent lui être envoyées."
        : "L’IA externe est désactivée sur ce poste (protection par défaut) : le navigateur bloque toute connexion vers Internet.";
      $("btn-autoriser-externe").hidden = autorise;
      $("btn-retirer-externe").hidden = !autorise;
    }
    $("btn-enregistrer-cle").textContent = f === "serveur" ? "Tester le serveur" : "Enregistrer et tester";
    const info = $("etat-serveur");
    let texte = "";
    if (f === "serveur") {
      texte = "✓ Le serveur local de l’application dispose d’une clé Mistral : il est utilisé pour les analyses (modèle " + (etat.serveurModele || MODELE_DEFAUT) + ").";
    } else if (f === "ollama") {
      texte = etat.ollamaDetecte
        ? "✓ Ollama est détecté sur ce PC. Les observations sont analysées localement : rien ne quitte votre ordinateur, sans coût ni clé."
        : "Ollama n’est pas joignable à " + etat.ollama.url + ". Lancez Ollama, puis cliquez sur « Enregistrer et tester ».";
      if (!pageServieEnLocal()) {
        texte +=
          " Important : cette page n’est pas servie depuis votre PC (GitHub Pages ou fichier ouvert par double-clic) ; Ollama refuse alors les appels. Lancez plutôt l’application avec « lancer-local.bat », ou autorisez cette adresse dans Ollama (variable OLLAMA_ORIGINS, voir le README).";
      }
    } else if (f === "openwebui") {
      texte =
        "Open WebUI sert d’intermédiaire vers vos modèles locaux. Créez une clé API dans Open WebUI (Paramètres → Compte → Clés API), collez-la ici puis cliquez sur « Enregistrer et tester ».";
    } else if (f === "openai") {
      texte = "API en ligne au format OpenAI (OpenAI ou tout service compatible : indiquez son URL de base). IA EXTERNE : seules des observations anonymisées et validées peuvent être envoyées.";
    } else if (f === "anthropic") {
      texte = "API Anthropic (modèles Claude) en ligne. IA EXTERNE : seules des observations anonymisées et validées peuvent être envoyées.";
    } else if (f === "abonnement") {
      texte = "Abonnement à un service d’IA (Le Chat, ChatGPT, Claude…) sans API : le kit prépare le texte à coller dans le service, puis vous collez la réponse. Aucune connexion directe. IA EXTERNE : uniquement des données anonymisées et validées.";
    } else {
      texte = "API Mistral en ligne : renseignez votre clé API (console.mistral.ai → API Keys). IA EXTERNE : seules des observations anonymisées et validées peuvent être envoyées.";
    }
    info.textContent = texte;
  }

  function ouvrirParametres(raison) {
    panneau.hidden = false;
    btnParametres.setAttribute("aria-expanded", "true");
    mettreAJourPanneauFournisseur();
    if (raison) {
      afficherRetourParametres(raison, "attention");
    }
    panneau.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function fermerParametres() {
    panneau.hidden = true;
    btnParametres.setAttribute("aria-expanded", "false");
  }

  function afficherRetourParametres(texte, type) {
    const r = $("retour-parametres");
    r.textContent = texte;
    r.className = "retour retour-" + (type || "info");
    r.hidden = false;
  }

  /** Vérifie que l’IA est utilisable ; sinon ouvre les paramètres. */
  function exigerIA() {
    if (iaDisponible()) {
      return true;
    }
    const f = fournisseurActif();
    ouvrirParametres(
      f === "ollama"
        ? "Choisissez un modèle Ollama (cliquez sur « Enregistrer et tester » pour charger la liste)."
        : f === "openwebui"
          ? "Renseignez l’adresse et la clé API d’Open WebUI, puis choisissez un modèle."
          : "Pour lancer une analyse IA, choisissez un moteur d’IA (Ollama en local, ou Mistral avec votre clé) puis cliquez sur « Enregistrer et tester »."
    );
    return false;
  }

  /* ---------- Appels aux modèles ---------- */
  function erreurAvecStatut(message, statut) {
    const err = new Error(message);
    err.statut = statut;
    return err;
  }

  async function appelMistralDirect(messages, options) {
    const opts = options || {};
    let tentative = 0;
    for (;;) {
      let reponse;
      try {
        reponse = await fetch(MISTRAL_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + etat.cle },
          body: JSON.stringify({
            model: etat.modele,
            temperature: 0.2,
            max_tokens: opts.maxTokens || 1500,
            response_format: { type: "json_object" },
            messages
          }),
          signal: opts.signal
        });
      } catch (e) {
        if (e && e.name === "AbortError") {
          throw e;
        }
        throw new Error("API Mistral injoignable (connexion Internet ou blocage réseau ?)");
      }
      if ((reponse.status === 429 || reponse.status >= 500) && tentative < 4) {
        tentative += 1;
        const apres = Number(reponse.headers.get("retry-after"));
        const delai = Number.isFinite(apres) && apres > 0 ? apres * 1000 : 1500 * Math.pow(2, tentative);
        if (opts.surAttente) {
          opts.surAttente(delai);
        }
        await attendre(delai);
        continue;
      }
      const data = await reponse.json().catch(() => null);
      if (!reponse.ok) {
        const detail = data && (data.message || (data.error && data.error.message) || data.detail);
        throw erreurAvecStatut(messageErreurHTTP(reponse.status, typeof detail === "string" ? detail.slice(0, 160) : ""), reponse.status);
      }
      const contenu = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      return extraireJSON(contenu);
    }
  }

  function messageOllamaInjoignable() {
    return (
      "Ollama injoignable à " +
      etat.ollama.url +
      (pageServieEnLocal()
        ? " : vérifiez qu’Ollama est lancé (icône dans la barre des tâches)"
        : " : cette page n’est pas servie depuis votre PC, Ollama refuse l’appel. Lancez l’application avec « lancer-local.bat » (ou définissez OLLAMA_ORIGINS, voir le README)")
    );
  }

  async function appelOllama(messages, options) {
    const opts = options || {};
    // Contexte adapté à la taille du prompt (~3,5 caractères par jeton).
    const taille = messages.reduce((n, m) => n + m.content.length, 0);
    const numCtx = Math.min(32768, Math.max(8192, Math.ceil(((taille / 3.5 + (opts.maxTokens || 1500)) * 1.2) / 1024) * 1024));
    // 1er essai : réglages sobres ; 2e essai (boucle de répétition ou JSON illisible) : plus de variété.
    const essais = [
      { temperature: 0.2, repeat_penalty: 1.1 },
      { temperature: 0.45, repeat_penalty: 1.2 }
    ];
    let derniereErreur = null;
    for (const reglage of essais) {
      let reponse;
      try {
        reponse = await fetch(sansBarreFinale(etat.ollama.url) + "/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: etat.ollama.modele,
            messages,
            stream: false,
            format: "json",
            think: false,
            keep_alive: "15m",
            options: Object.assign({ num_ctx: numCtx, num_predict: opts.maxTokens || 1500, repeat_last_n: 256 }, reglage)
          }),
          signal: opts.signal
        });
      } catch (e) {
        if (e && e.name === "AbortError") {
          throw e;
        }
        throw new Error(messageOllamaInjoignable());
      }
      const data = await reponse.json().catch(() => null);
      if (!reponse.ok) {
        const detail = data && data.error ? String(data.error).slice(0, 200) : "HTTP " + reponse.status;
        derniereErreur = erreurAvecStatut(
          reponse.status === 404 ? "modèle « " + etat.ollama.modele + " » introuvable dans Ollama (" + detail + ")" : "erreur Ollama : " + detail,
          reponse.status
        );
        if (/repeat|repetition/i.test(detail)) {
          continue; // le modèle a bouclé : nouvel essai avec d’autres réglages
        }
        throw derniereErreur;
      }
      try {
        return extraireJSON(data && data.message && data.message.content);
      } catch (e) {
        derniereErreur = e;
      }
    }
    throw derniereErreur;
  }

  async function appelOpenWebUI(messages, options) {
    const opts = options || {};
    let reponse;
    try {
      reponse = await fetch(sansBarreFinale(etat.owui.url) + "/api/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + etat.owuiCle },
        body: JSON.stringify({
          model: etat.owui.modele,
          messages,
          stream: false,
          temperature: 0.2,
          max_tokens: opts.maxTokens || 1500,
          response_format: { type: "json_object" }
        }),
        signal: opts.signal
      });
    } catch (e) {
      if (e && e.name === "AbortError") {
        throw e;
      }
      throw new Error("Open WebUI injoignable à " + etat.owui.url + " : vérifiez qu’il est lancé et que l’adresse est correcte");
    }
    const data = await reponse.json().catch(() => null);
    if (!reponse.ok) {
      const detail = data && (data.detail || data.error || data.message);
      throw erreurAvecStatut(
        reponse.status === 401 || reponse.status === 403
          ? "clé API Open WebUI refusée"
          : "erreur Open WebUI : " + (typeof detail === "string" ? detail.slice(0, 200) : "HTTP " + reponse.status),
        reponse.status
      );
    }
    const contenu = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    return extraireJSON(contenu);
  }

  async function appelOpenAICompatible(messages, options) {
    const opts = options || {};
    let reponse;
    const url = sansBarreFinale(etat.openai.url) + "/chat/completions";
    try {
      reponse = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + etat.openaiCle },
        body: JSON.stringify({
          model: etat.openai.modele,
          messages,
          temperature: 0.2,
          max_tokens: opts.maxTokens || 1500,
          response_format: { type: "json_object" }
        }),
        signal: opts.signal
      });
    } catch (e) {
      if (e && e.name === "AbortError") throw e;
      throw new Error("service injoignable à " + url + " (connexion Internet, adresse ou autorisation de l’IA externe ?)");
    }
    const data = await reponse.json().catch(() => null);
    if (!reponse.ok) {
      const detail = data && ((data.error && data.error.message) || data.message || data.detail);
      throw erreurAvecStatut(messageErreurHTTP(reponse.status, typeof detail === "string" ? detail.slice(0, 160) : ""), reponse.status);
    }
    return extraireJSON(data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content);
  }

  async function appelAnthropic(messages, options) {
    const opts = options || {};
    let reponse;
    try {
      reponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": etat.anthropicCle,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: etat.anthropic.modele,
          max_tokens: opts.maxTokens || 1500,
          temperature: 0.2,
          system: messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n"),
          messages: messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }))
        }),
        signal: opts.signal
      });
    } catch (e) {
      if (e && e.name === "AbortError") throw e;
      throw new Error("API Anthropic injoignable (connexion Internet ou autorisation de l’IA externe ?)");
    }
    const data = await reponse.json().catch(() => null);
    if (!reponse.ok) {
      const detail = data && data.error && data.error.message;
      throw erreurAvecStatut(messageErreurHTTP(reponse.status, typeof detail === "string" ? detail.slice(0, 160) : ""), reponse.status);
    }
    const texte = ((data && data.content) || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
    return extraireJSON(texte);
  }

  /** Abonnement : copier-coller assisté via la boîte de dialogue du kit (aucune connexion). */
  async function appelAbonnement(messages, options) {
    const opts = options || {};
    const texte = texteAbonnement(messages);
    let reponse;
    if (window.Kit && window.Kit.dialogueAbonnement) {
      reponse = await window.Kit.dialogueAbonnement(texte, opts.titreAbonnement || "Analyse par abonnement");
    } else {
      await copier(texte);
      reponse = window.prompt("Le texte à soumettre a été copié. Collez-le dans votre service d’IA, puis collez ici sa réponse (JSON) :") || "";
    }
    if (!reponse || !reponse.trim()) {
      const err = new Error("analyse annulée");
      err.name = "AbortError";
      throw err;
    }
    return extraireJSON(reponse);
  }

  /** Garde-fous RGPD avant tout envoi à une IA externe (Exigence G). */
  async function verifierEnvoiExterne(texte, origine, entree) {
    if (!estExterne()) return;
    if (etat.kit && !etat.kit.ia_externe) {
      throw erreurAvecStatut(
        "IA externe non autorisée sur ce poste. Choisissez un moteur local (Ollama) ou autorisez l’IA externe dans « Paramètres IA »",
        451
      );
    }
    if (origine === "registre") return; // registre de démonstration : déjà anonymisé irréversiblement
    if (origine === "dossier") {
      if (entree && entree.modeTraitement === "anonymisation" && entree.statutTraitement === "validee") return;
      throw erreurAvecStatut(
        "envoi refusé : seules les observations ANONYMISÉES de façon irréversible et VALIDÉES par relecture humaine peuvent être confiées à une IA externe" +
          (entree && entree.modeTraitement === "pseudonymisation" ? " (les données pseudonymisées restent des données personnelles)" : "") +
          ". Utilisez un moteur local (Ollama)",
        451
      );
    }
    // Texte saisi ou collé librement : jamais envoyé à une IA externe, quel que soit son contenu.
    // Seules les contributions passées par l’anonymisation IRRÉVERSIBLE du kit et validées par
    // relecture humaine peuvent l’être (règle fixée par l’association, au-delà du simple contrôle automatique).
    throw erreurAvecStatut(
      "envoi refusé : une IA externe ne peut analyser que des contributions anonymisées de façon irréversible et validées. " +
        "Importez ce texte dans l’onglet « Anonymiser / Pseudonymiser » (mode anonymisation irréversible), validez-le, puis analysez-le " +
        "depuis « Mon dossier » ; ou choisissez un moteur local (Ollama), qui accepte tous les textes",
      451
    );
  }

  async function appelServeur(chemin, corps, signal) {
    let reponse;
    try {
      reponse = await fetch(chemin, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
        signal
      });
    } catch (e) {
      if (e && e.name === "AbortError") {
        throw e;
      }
      throw new Error("serveur local injoignable");
    }
    const data = await reponse.json().catch(() => ({}));
    if (!reponse.ok) {
      throw erreurAvecStatut(data.erreur || "HTTP " + reponse.status, reponse.status);
    }
    return data;
  }

  /** Envoie des messages au moteur choisi et renvoie l’objet JSON produit. */
  function appelIA(messages, options) {
    switch (fournisseurActif()) {
      case "ollama":
        return appelOllama(messages, options);
      case "openwebui":
        return appelOpenWebUI(messages, options);
      case "openai":
        return appelOpenAICompatible(messages, options);
      case "anthropic":
        return appelAnthropic(messages, options);
      case "abonnement":
        return appelAbonnement(messages, options);
      default:
        return appelMistralDirect(messages, options);
    }
  }

  async function analyserTexte(reference, texte, options) {
    const opts = options || {};
    await verifierEnvoiExterne(texte, opts.origine || "libre", opts.entree);
    let brut;
    if (fournisseurActif() === "serveur") {
      brut = await appelServeur("api/analyse", { reference, texte }, opts.signal);
    } else {
      brut = await appelIA(construireMessagesAnalyse(reference, texte), opts);
    }
    const a = normaliserAnalyse(brut, reference);
    a.modele = (estLocal() || estExterne() ? NOMS_FOURNISSEURS[fournisseurActif()] + " · " : "") + modeleActif();
    a.date = horodatage();
    a.empreinte = empreinte(texte);
    return a;
  }

  /* ---------- Listes de modèles locaux ---------- */
  function estModeleTexte(m) {
    const nom = String(m.name || m.id || "").toLowerCase();
    const familles = (m.details && (m.details.families || [m.details.family])) || [];
    return !/embed|bge|nomic|minilm|rerank/.test(nom) && !familles.some((f) => /bert/i.test(String(f)));
  }

  function remplirSelectModeles(select, noms, choisi) {
    select.innerHTML = "";
    for (const nom of noms) {
      const o = document.createElement("option");
      o.value = nom;
      o.textContent = nom;
      select.appendChild(o);
    }
    if (noms.length === 0) {
      const o = document.createElement("option");
      o.value = "";
      o.textContent = "Aucun modèle trouvé";
      select.appendChild(o);
    }
    select.value = noms.includes(choisi) ? choisi : noms[0] || "";
    return select.value;
  }

  function choisirModeleParDefaut(noms, actuel) {
    if (noms.includes(actuel)) return actuel;
    return noms.find((n) => /^ministral-3:(8b|latest)$/i.test(n)) || noms.find((n) => /^ministral|^mistral/i.test(n)) || noms.find((n) => /qwen|llama|gemma/i.test(n)) || noms[0] || "";
  }

  async function chargerModelesOllama(silencieux) {
    const url = sansBarreFinale(etat.ollama.url);
    const controleur = new AbortController();
    const minuterie = setTimeout(() => controleur.abort(), silencieux ? 2500 : 8000);
    try {
      const r = await fetch(url + "/api/tags", { signal: controleur.signal });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      const noms = (data.models || []).filter(estModeleTexte).map((m) => m.name).sort();
      etat.ollamaDetecte = true;
      etat.ollama.modele = remplirSelectModeles($("ollama-modele"), noms, choisirModeleParDefaut(noms, etat.ollama.modele));
      stock.ecrire(CLE_OLLAMA, etat.ollama);
      return noms;
    } catch (e) {
      etat.ollamaDetecte = false;
      if (!silencieux) throw new Error(messageOllamaInjoignable());
      return null;
    } finally {
      clearTimeout(minuterie);
    }
  }

  async function chargerModelesOpenWebUI() {
    const url = sansBarreFinale(etat.owui.url);
    let r;
    try {
      r = await fetch(url + "/api/models", { headers: { Authorization: "Bearer " + etat.owuiCle } });
    } catch (e) {
      throw new Error("Open WebUI injoignable à " + url);
    }
    if (r.status === 401 || r.status === 403) throw new Error("clé API Open WebUI refusée");
    if (!r.ok) throw new Error("Open WebUI a répondu HTTP " + r.status);
    const data = await r.json().catch(() => ({}));
    const liste = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
    const noms = liste.filter(estModeleTexte).map((m) => m.id || m.name).filter(Boolean).sort();
    etat.owui.modele = remplirSelectModeles($("owui-modele"), noms, choisirModeleParDefaut(noms, etat.owui.modele));
    stock.ecrire(CLE_OWUI, etat.owui);
    return noms;
  }

  /* ---------- Paramètres ---------- */
  $("modele").value = etat.modele;
  if (!$("modele").value) {
    $("modele").value = MODELE_DEFAUT;
    etat.modele = MODELE_DEFAUT;
  }
  $("cle-api").value = etat.cle;
  $("ollama-url").value = etat.ollama.url;
  $("owui-url").value = etat.owui.url;
  $("owui-cle").value = etat.owuiCle;
  $("openai-url").value = etat.openai.url;
  $("openai-cle").value = etat.openaiCle;
  $("anthropic-cle").value = etat.anthropicCle;
  if (etat.openai.modele) remplirSelectModeles($("openai-modele"), [etat.openai.modele], etat.openai.modele);
  if (etat.anthropic.modele) remplirSelectModeles($("anthropic-modele"), [etat.anthropic.modele], etat.anthropic.modele);
  if (etat.ollama.modele) remplirSelectModeles($("ollama-modele"), [etat.ollama.modele], etat.ollama.modele);
  if (etat.owui.modele) remplirSelectModeles($("owui-modele"), [etat.owui.modele], etat.owui.modele);
  try {
    $("memoriser-cle").checked = [CLE_API, CLE_OWUI_CLE, CLE_OPENAI_CLE, CLE_ANTHROPIC_CLE].some((k) => window.localStorage.getItem(k) !== null);
  } catch (e) {
    $("memoriser-cle").checked = false;
  }

  btnParametres.addEventListener("click", () => (panneau.hidden ? ouvrirParametres() : fermerParametres()));
  $("btn-fermer-parametres").addEventListener("click", fermerParametres);

  for (const [bouton, champ] of [
    ["btn-voir-cle", "cle-api"],
    ["btn-voir-owui-cle", "owui-cle"],
    ["btn-voir-openai-cle", "openai-cle"],
    ["btn-voir-anthropic-cle", "anthropic-cle"]
  ]) {
    $(bouton).addEventListener("click", (ev) => {
      const c = $(champ);
      const visible = c.type === "text";
      c.type = visible ? "password" : "text";
      ev.currentTarget.textContent = visible ? "Afficher" : "Masquer";
      ev.currentTarget.setAttribute("aria-pressed", String(!visible));
    });
  }

  $("fournisseur").addEventListener("change", async () => {
    etat.fournisseur = $("fournisseur").value;
    stock.ecrire(CLE_FOURNISSEUR, etat.fournisseur);
    $("retour-parametres").hidden = true;
    mettreAJourBadgeIA();
    if (etat.fournisseur === "ollama") {
      await chargerModelesOllama(true);
      mettreAJourBadgeIA();
    }
  });

  $("modele").addEventListener("change", () => {
    etat.modele = $("modele").value;
    stock.ecrire(CLE_MODELE, etat.modele);
    mettreAJourBadgeIA();
  });
  $("ollama-modele").addEventListener("change", () => {
    etat.ollama.modele = $("ollama-modele").value;
    etat.ollama.choixManuel = true; // le modèle recommandé par le diagnostic ne le remplacera plus
    stock.ecrire(CLE_OLLAMA, etat.ollama);
    mettreAJourBadgeIA();
  });
  $("owui-modele").addEventListener("change", () => {
    etat.owui.modele = $("owui-modele").value;
    stock.ecrire(CLE_OWUI, etat.owui);
    mettreAJourBadgeIA();
  });
  $("openai-modele").addEventListener("change", () => {
    etat.openai.modele = $("openai-modele").value;
    stock.ecrire(CLE_OPENAI, etat.openai);
    mettreAJourBadgeIA();
  });
  $("anthropic-modele").addEventListener("change", () => {
    etat.anthropic.modele = $("anthropic-modele").value;
    stock.ecrire(CLE_ANTHROPIC, etat.anthropic);
    mettreAJourBadgeIA();
  });
  $("ollama-url").addEventListener("change", () => {
    etat.ollama.url = sansBarreFinale($("ollama-url").value) || OLLAMA_URL_DEFAUT;
    etat.ollama.urlManuelle = true;
    stock.ecrire(CLE_OLLAMA, etat.ollama);
  });
  $("owui-url").addEventListener("change", () => {
    etat.owui.url = sansBarreFinale($("owui-url").value) || OPENWEBUI_URL_DEFAUT;
    stock.ecrire(CLE_OWUI, etat.owui);
  });

  async function testerMistral() {
    const cle = $("cle-api").value.trim();
    if (!cle) {
      throw new Error("collez une clé API Mistral (console.mistral.ai → API Keys)");
    }
    const r = await fetch(MISTRAL_MODELES_URL, { headers: { Authorization: "Bearer " + cle } });
    if (!r.ok) {
      throw new Error(messageErreurHTTP(r.status));
    }
    const liste = await r.json().catch(() => ({}));
    const ids = Array.isArray(liste.data) ? liste.data.map((m) => m.id) : [];
    etat.cle = cle;
    stock.supprimer(CLE_API);
    stock.ecrire(CLE_API, cle, !$("memoriser-cle").checked);
    etat.modele = $("modele").value;
    stock.ecrire(CLE_MODELE, etat.modele);
    const modeleOk = ids.length === 0 || ids.includes(etat.modele);
    return [
      "✓ Clé valide. " +
        (modeleOk ? "Modèle « " + etat.modele + " » disponible. " : "Attention : le modèle « " + etat.modele + " » n’apparaît pas dans votre liste, choisissez-en un autre. ") +
        ($("memoriser-cle").checked ? "Clé mémorisée sur cet appareil." : "Clé conservée jusqu’à la fermeture de l’onglet."),
      modeleOk ? "ok" : "attention"
    ];
  }

  async function testerOllama() {
    etat.ollama.url = sansBarreFinale($("ollama-url").value) || OLLAMA_URL_DEFAUT;
    $("ollama-url").value = etat.ollama.url;
    const noms = await chargerModelesOllama(false);
    if (!noms.length) {
      return ["Ollama répond, mais aucun modèle de texte n’est installé. Exemple : « ollama pull ministral-3 ».", "attention"];
    }
    return [
      "✓ Ollama joignable : " + noms.length + " modèle" + (noms.length > 1 ? "s" : "") + " de texte disponible" + (noms.length > 1 ? "s" : "") + ". Modèle choisi : « " + etat.ollama.modele + " ». Rien ne quitte votre PC.",
      "ok"
    ];
  }

  async function testerOpenWebUI() {
    etat.owui.url = sansBarreFinale($("owui-url").value) || OPENWEBUI_URL_DEFAUT;
    $("owui-url").value = etat.owui.url;
    stock.ecrire(CLE_OWUI, etat.owui);
    const cle = $("owui-cle").value.trim();
    if (!cle) {
      throw new Error("collez la clé API d’Open WebUI (Paramètres → Compte → Clés API)");
    }
    etat.owuiCle = cle;
    stock.supprimer(CLE_OWUI_CLE);
    stock.ecrire(CLE_OWUI_CLE, cle, !$("memoriser-cle").checked);
    const noms = await chargerModelesOpenWebUI();
    if (!noms.length) {
      return ["Open WebUI répond, mais aucun modèle n’est disponible pour cette clé.", "attention"];
    }
    return ["✓ Open WebUI joignable : " + noms.length + " modèle(s). Modèle choisi : « " + etat.owui.modele + " ».", "ok"];
  }

  const EXCLUS_OPENAI = /embed|tts|whisper|dall|image|audio|moderation|realtime|transcribe|search|babbage|davinci/i;

  async function testerOpenAI() {
    etat.openai.url = sansBarreFinale($("openai-url").value) || "https://api.openai.com/v1";
    $("openai-url").value = etat.openai.url;
    const cle = $("openai-cle").value.trim();
    if (!cle) throw new Error("collez la clé API du service");
    let r;
    try {
      r = await fetch(etat.openai.url + "/models", { headers: { Authorization: "Bearer " + cle } });
    } catch (e) {
      throw new Error("service injoignable à " + etat.openai.url + (etat.kit && !etat.kit.ia_externe ? " — l’IA externe n’est pas autorisée sur ce poste" : ""));
    }
    if (!r.ok) throw new Error(messageErreurHTTP(r.status));
    const data = await r.json().catch(() => ({}));
    const noms = (Array.isArray(data.data) ? data.data : []).map((m) => m.id).filter((id) => id && !EXCLUS_OPENAI.test(id)).sort();
    etat.openaiCle = cle;
    stock.supprimer(CLE_OPENAI_CLE);
    stock.ecrire(CLE_OPENAI_CLE, cle, !$("memoriser-cle").checked);
    etat.openai.modele = remplirSelectModeles($("openai-modele"), noms, noms.includes(etat.openai.modele) ? etat.openai.modele : noms[0] || "");
    stock.ecrire(CLE_OPENAI, etat.openai);
    return ["✓ Clé acceptée : " + noms.length + " modèle(s) de texte. Choisissez le modèle dans la liste.", noms.length ? "ok" : "attention"];
  }

  async function testerAnthropic() {
    const cle = $("anthropic-cle").value.trim();
    if (!cle) throw new Error("collez la clé API Anthropic (console.anthropic.com)");
    let r;
    try {
      r = await fetch("https://api.anthropic.com/v1/models?limit=100", {
        headers: { "x-api-key": cle, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }
      });
    } catch (e) {
      throw new Error("API Anthropic injoignable" + (etat.kit && !etat.kit.ia_externe ? " — l’IA externe n’est pas autorisée sur ce poste" : ""));
    }
    if (!r.ok) throw new Error(messageErreurHTTP(r.status));
    const data = await r.json().catch(() => ({}));
    const noms = (Array.isArray(data.data) ? data.data : []).map((m) => m.id).filter(Boolean);
    etat.anthropicCle = cle;
    stock.supprimer(CLE_ANTHROPIC_CLE);
    stock.ecrire(CLE_ANTHROPIC_CLE, cle, !$("memoriser-cle").checked);
    etat.anthropic.modele = remplirSelectModeles($("anthropic-modele"), noms, noms.includes(etat.anthropic.modele) ? etat.anthropic.modele : noms[0] || "");
    stock.ecrire(CLE_ANTHROPIC, etat.anthropic);
    return ["✓ Clé acceptée : " + noms.length + " modèle(s) disponible(s).", noms.length ? "ok" : "attention"];
  }

  /** Autorise / retire l’IA externe sur le poste (serveur du kit : politique de sécurité élargie). */
  async function changerAutorisationExterne(autoriser) {
    if (!etat.kit) return;
    if (autoriser) {
      const ok =
        window.Kit && window.Kit.confirmer2Etapes
          ? await window.Kit.confirmer2Etapes({
              titre: "Autoriser l’IA externe sur ce poste",
              etape1:
                "Vous allez permettre au navigateur de se connecter aux services d’IA en ligne (Mistral, OpenAI ou compatible, Anthropic). Le kit n’enverra que des observations anonymisées de façon irréversible et validées, ou le registre de démonstration. Vérifiez les conditions de traitement du fournisseur (conservation, entraînement, localisation des serveurs) avant usage.",
              caseACocher: "J’ai compris que les textes envoyés quittent mon poste et sont soumis aux conditions du fournisseur.",
              motConfirmation: "AUTORISER",
              bouton: "Autoriser"
            })
          : window.confirm("Autoriser l’IA externe sur ce poste ?") && window.confirm("Confirmez une seconde fois.");
      if (!ok) return;
    }
    const hotes = [];
    if (autoriser) {
      hotes.push("https://api.mistral.ai", "https://api.openai.com", "https://api.anthropic.com");
      try {
        const u = new URL(etat.openai.url);
        if (u.protocol === "https:" && !hotes.includes(u.origin)) hotes.push(u.origin);
      } catch (e) {
        /* URL invalide : ignorée */
      }
    }
    const r = await fetch("api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Kit": "1" },
      body: JSON.stringify({ ia_externe: autoriser, hotes_externes: hotes })
    }).catch(() => null);
    if (!r || !r.ok) {
      afficherRetourParametres("✗ Impossible d’enregistrer l’autorisation (serveur du kit injoignable).", "erreur");
      return;
    }
    if (window.Kit && window.Kit.journal) window.Kit.journal(autoriser ? "IA externe autorisée (" + hotes.join(", ") + ")" : "IA externe désactivée");
    // La politique de sécurité est envoyée par le serveur avec la page : rechargement nécessaire.
    location.reload();
  }
  $("btn-autoriser-externe").addEventListener("click", () => changerAutorisationExterne(true));
  $("btn-retirer-externe").addEventListener("click", () => changerAutorisationExterne(false));

  $("btn-enregistrer-cle").addEventListener("click", async (ev) => {
    const bouton = ev.currentTarget;
    const libelle = bouton.textContent;
    bouton.disabled = true;
    bouton.classList.add("chargement");
    bouton.textContent = "Test en cours…";
    try {
      const f = fournisseurActif();
      etat.fournisseur = f;
      stock.ecrire(CLE_FOURNISSEUR, f);
      const [texte, type] =
        f === "ollama"
          ? await testerOllama()
          : f === "openwebui"
            ? await testerOpenWebUI()
            : f === "openai"
              ? await testerOpenAI()
              : f === "anthropic"
                ? await testerAnthropic()
            : f === "serveur"
              ? ["✓ Serveur local opérationnel (modèle " + (etat.serveurModele || MODELE_DEFAUT) + ").", "ok"]
              : await testerMistral();
      afficherRetourParametres(texte, type);
      masquerMessage();
    } catch (e) {
      afficherRetourParametres("✗ Échec du test : " + (e.message || e) + ".", "erreur");
    } finally {
      bouton.disabled = false;
      bouton.classList.remove("chargement");
      bouton.textContent = libelle;
      mettreAJourBadgeIA();
    }
  });

  $("btn-oublier-cle").addEventListener("click", () => {
    const f = fournisseurActif();
    if (f === "openwebui") {
      stock.supprimer(CLE_OWUI_CLE);
      etat.owuiCle = "";
      $("owui-cle").value = "";
    } else if (f === "openai") {
      stock.supprimer(CLE_OPENAI_CLE);
      etat.openaiCle = "";
      $("openai-cle").value = "";
    } else if (f === "anthropic") {
      stock.supprimer(CLE_ANTHROPIC_CLE);
      etat.anthropicCle = "";
      $("anthropic-cle").value = "";
    } else {
      stock.supprimer(CLE_API);
      etat.cle = "";
      $("cle-api").value = "";
    }
    afficherRetourParametres("Clé supprimée de ce navigateur.", "info");
    mettreAJourBadgeIA();
  });

  /* ---------- Saisie & démonstration ---------- */
  function mettreAJourCompteur() {
    $("compteur-texte").textContent = champTexte.value.length.toLocaleString("fr-FR") + " / 20 000";
  }

  function masquerTout() {
    sectionResultats.hidden = true;
    masquerMessage();
    avertissement.hidden = true;
  }

  function mettreAJourAvertissement() {
    const statut = statutDemonstration(champTexte.value, TEXTE_EXEMPLE);
    const demoAffichee = !sectionResultats.hidden && sectionResultats.dataset.mode === "demo";
    if (demoAffichee && statut !== "exemple") {
      sectionResultats.hidden = true;
    }
    avertissement.hidden = !(demoAffichee && statut !== "exemple");
  }

  function afficherResultat(lignes, bandeauTexte, classeBadge, noteTexte, titre, mode) {
    $("titre-resultats").textContent = titre;
    const bandeau = $("bandeau-resultats");
    bandeau.textContent = bandeauTexte;
    bandeau.className = "badge " + classeBadge;
    $("note-resultats").textContent = noteTexte;
    corpsTableau.innerHTML = "";
    for (const [rubrique, contenu] of lignes) {
      const ligne = document.createElement("tr");
      const celluleRubrique = document.createElement("th");
      celluleRubrique.scope = "row";
      celluleRubrique.textContent = rubrique;
      const celluleContenu = document.createElement("td");
      celluleContenu.textContent = contenu;
      ligne.appendChild(celluleRubrique);
      ligne.appendChild(celluleContenu);
      corpsTableau.appendChild(ligne);
    }
    sectionResultats.dataset.mode = mode;
    $("btn-relancer").hidden = mode !== "ia";
    sectionResultats.hidden = false;
  }

  function afficherDemo() {
    const reference = champReference.value.trim() !== "" ? champReference.value.trim() : REFERENCE_EXEMPLE;
    etat.derniereAnalyse = null;
    afficherResultat(
      construireLignesDemo(reference),
      "Démonstration — aucune analyse par IA effectuée",
      "badge-demo",
      "Ce tableau a été préparé à l’avance pour l’exemple fictif. Il ne résulte pas d’une analyse automatique du texte saisi.",
      "Tableau préparé pour l’exemple fictif",
      "demo"
    );
  }

  function afficherAnalyseIA(a, defiler) {
    etat.derniereAnalyse = a;
    afficherResultat(
      lignesDepuisAnalyseIA(a, a.reference),
      "Analyse IA — " + (a.modele || "Mistral") + " · à vérifier",
      "badge-ia",
      "Résultat généré par IA" + (a.date ? " le " + a.date : "") + ", dans le cadre de l’enquête « " + TITRE_ENQUETE + " ». Le commissaire enquêteur en reste pleinement responsable.",
      "Analyse IA — " + (a.reference || "observation"),
      "ia"
    );
    if (defiler) {
      sectionResultats.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  $("btn-exemple").addEventListener("click", () => {
    champReference.value = REFERENCE_EXEMPLE;
    champTexte.value = TEXTE_EXEMPLE;
    mettreAJourCompteur();
    masquerTout();
  });

  champTexte.addEventListener("input", () => {
    mettreAJourCompteur();
    mettreAJourAvertissement();
  });
  champReference.addEventListener("input", () => {
    if (!sectionResultats.hidden && sectionResultats.dataset.mode === "demo") {
      afficherDemo();
    }
  });

  $("btn-demo").addEventListener("click", () => {
    const statut = statutDemonstration(champTexte.value, TEXTE_EXEMPLE);
    if (statut === "vide") {
      sectionResultats.hidden = true;
      afficherMessage("Chargez d’abord l’exemple fictif : la démonstration n’existe que pour lui.", {
        libelle: "Charger l’exemple et afficher",
        faire: () => {
          $("btn-exemple").click();
          afficherDemo();
        }
      });
    } else if (statut === "modifie") {
      sectionResultats.hidden = true;
      afficherMessage("Ce texte n’est pas l’exemple fictif : le tableau de démonstration ne lui correspond pas. Utilisez « Analyser avec l’IA » pour l’analyser réellement.", {
        libelle: "✦ Analyser avec l’IA",
        faire: () => btnIa.click()
      });
    } else {
      masquerMessage();
      afficherDemo();
    }
  });

  $("btn-effacer").addEventListener("click", () => {
    champReference.value = "";
    champTexte.value = "";
    mettreAJourCompteur();
    masquerTout();
  });

  async function lancerAnalyse(reference, texte, bouton) {
    if (!texte || texte.trim() === "") {
      sectionResultats.hidden = true;
      afficherMessage("Saisissez ou chargez d’abord un texte d’observation à analyser.");
      return;
    }
    if (texte.length > LIMITE_TEXTE) {
      afficherMessage("Le texte dépasse 20 000 caractères : raccourcissez-le avant l’analyse.");
      return;
    }
    if (!exigerIA()) {
      return;
    }
    const libelle = bouton.textContent;
    bouton.disabled = true;
    bouton.classList.add("chargement");
    bouton.textContent = "Analyse en cours…";
    masquerMessage();
    try {
      const connue = reference && registreParId.has(reference) && registreParId.get(reference).texte === texte;
      const a = await analyserTexte(reference, texte, {
        origine: connue ? sourceCourante : "libre",
        entree: connue ? registreParId.get(reference) : null,
        surAttente: (ms) => (bouton.textContent = "Limite atteinte, nouvel essai dans " + Math.round(ms / 1000) + " s…")
      });
      etat.derniereSource = { reference, texte };
      if (reference && registreParId.has(reference) && registreParId.get(reference).texte === texte) {
        enregistrerAnalyse(a);
      }
      afficherAnalyseIA(a, true);
    } catch (e) {
      if (e && e.name === "AbortError") return;
      sectionResultats.hidden = true;
      const cleEnCause = fournisseurActif() !== "serveur";
      afficherMessage(
        "Analyse IA impossible : " + (e.message || e) + ".",
        cleEnCause ? { libelle: "Ouvrir les paramètres IA", faire: () => ouvrirParametres() } : null
      );
    } finally {
      bouton.disabled = false;
      bouton.classList.remove("chargement");
      bouton.textContent = libelle;
    }
  }

  btnIa.addEventListener("click", () => lancerAnalyse(champReference.value.trim(), champTexte.value, btnIa));

  $("btn-relancer").addEventListener("click", (ev) => {
    if (etat.derniereSource) {
      lancerAnalyse(etat.derniereSource.reference, etat.derniereSource.texte, ev.currentTarget);
    }
  });

  function tableauEnTexte() {
    return Array.from(corpsTableau.querySelectorAll("tr"))
      .map((tr) => tr.children[0].textContent + " : " + tr.children[1].textContent)
      .join("\n");
  }

  $("btn-copier").addEventListener("click", () => copier($("titre-resultats").textContent + "\n\n" + tableauEnTexte()));

  $("btn-export-un").addEventListener("click", () => {
    const lignes = Array.from(corpsTableau.querySelectorAll("tr")).map((tr) => [tr.children[0].textContent, tr.children[1].textContent]);
    const csv = "﻿" + [["Rubrique", "Contenu"]].concat(lignes).map((l) => l.map(echapperCSV).join(";")).join("\r\n");
    const ref = (etat.derniereAnalyse && etat.derniereAnalyse.reference) || champReference.value.trim() || "observation";
    telecharger("analyse-" + ref.replace(/[^\w-]+/g, "_") + ".csv", csv, "text/csv;charset=utf-8");
  });

  /* ---------- Registre ---------- */
  const ENTREES_REGISTRE =
    typeof OBSERVATIONS_REGISTRE !== "undefined" ? [...OBSERVATIONS_REGISTRE.observations, ...OBSERVATIONS_REGISTRE.contributions] : [];
  // Source analysée : « registre » (démonstration anonymisée) ou « dossier » (observations importées et traitées
  // dans l’onglet « Anonymiser / Pseudonymiser » — seule leur version traitée est utilisée, jamais l’original).
  let sourceCourante = "registre";
  let entrees = ENTREES_REGISTRE;
  let registreParId = new Map(entrees.map((e) => [e.id, e]));
  const analysesParSource = { registre: etat.analyses, dossier: stock.lire(CLE_ANALYSES_DOSSIER, {}) || {} };
  function cleStockageAnalyses() {
    return sourceCourante === "dossier" ? CLE_ANALYSES_DOSSIER : CLE_ANALYSES;
  }
  const select = $("liste-observations");
  let entreesFiltrees = entrees.slice();

  function enregistrerAnalyse(a) {
    etat.analyses[a.reference] = a;
    if (!stock.ecrire(cleStockageAnalyses(), etat.analyses)) {
      toast("Stockage local indisponible : exportez vos analyses pour les conserver");
    }
    if (window.Kit && window.Kit.miroir) window.Kit.miroir("analyses-" + sourceCourante + ".json", etat.analyses);
    rafraichirApresAnalyse();
  }

  function analyseValide(id) {
    const a = etat.analyses[id];
    const e = registreParId.get(id);
    return Boolean(a && e && (!a.empreinte || a.empreinte === empreinte(e.texte)));
  }

  function nbAnalyses() {
    return entrees.filter((e) => analyseValide(e.id)).length;
  }

  function libelleOption(e) {
    const meta = e.date || "";
    const objet = e.objet ? " — " + e.objet.slice(0, 60) : "";
    return (analyseValide(e.id) ? "✓ " : "") + e.id + " — " + (e.type === "orale" ? "orale" : "écrite") + (meta ? " — " + meta : "") + objet;
  }

  function appliquerFiltre() {
    const q = normaliserApostrophes($("filtre-registre").value.trim()).toLowerCase();
    const type = $("filtre-type").value;
    const precedent = select.value;
    entreesFiltrees = entrees.filter((e) => {
      if (type === "orale" && e.type !== "orale") return false;
      if (type === "ecrite" && e.type === "orale") return false;
      if (type === "analysee" && !analyseValide(e.id)) return false;
      if (type === "non-analysee" && analyseValide(e.id)) return false;
      if (!q) return true;
      if (e.id.toLowerCase() === q) return true;
      return normaliserApostrophes([e.id, e.objet, e.contexte, e.texte].join(" ")).toLowerCase().includes(q);
    });
    select.innerHTML = "";
    for (const e of entreesFiltrees) {
      const option = document.createElement("option");
      option.value = e.id;
      option.textContent = libelleOption(e);
      select.appendChild(option);
    }
    $("nb-observations").textContent =
      entreesFiltrees.length === entrees.length ? entrees.length + " au total" : entreesFiltrees.length + " sur " + entrees.length;
    if (entreesFiltrees.length === 0) {
      $("detail-observation").hidden = true;
      return;
    }
    select.value = entreesFiltrees.some((e) => e.id === precedent) ? precedent : entreesFiltrees[0].id;
    afficherDetail(select.value);
  }

  function afficherDetail(id) {
    const e = registreParId.get(id);
    if (!e) {
      return;
    }
    $("detail-observation").hidden = false;
    $("detail-id").textContent = e.id;
    const metaParts = [e.type === "orale" ? "Observation orale" : "Contribution écrite", e.auteur || "Auteur non précisé"];
    if (e.modeTraitement) metaParts.push(e.modeTraitement === "anonymisation" ? "anonymisée" + (e.statutTraitement === "validee" ? " et validée" : " (non validée)") : "pseudonymisée");
    if (e.date) metaParts.push(e.date);
    if (e.lieu) metaParts.push(e.lieu);
    $("detail-meta").textContent = "— " + metaParts.join(" — ");
    const objetEl = $("detail-objet");
    objetEl.hidden = !e.objet;
    objetEl.textContent = e.objet ? "Objet : " + e.objet : "";
    $("detail-texte").textContent = (e.contexte ? e.contexte + "\n\n" : "") + e.texte;
    const dejaFaite = analyseValide(e.id);
    $("btn-voir-analyse").hidden = !dejaFaite;
    $("btn-analyser-observation").textContent = dejaFaite ? "✦ Réanalyser avec l’IA" : "✦ Analyser cette observation avec l’IA";
  }

  function rafraichirApresAnalyse() {
    const n = nbAnalyses();
    $("badge-avancement").textContent = n + " / " + entrees.length + " analysée" + (n > 1 ? "s" : "");
    for (const option of select.options) {
      const e = registreParId.get(option.value);
      if (e) option.textContent = libelleOption(e);
    }
    if (select.value) afficherDetail(select.value);
    rendreTableauLot();
    $("btn-lot").textContent = !entrees.length ? "✦ Aucune observation dans cette source" : n >= entrees.length ? "✓ Toutes les observations sont analysées" : n === 0 ? "✦ Analyser toutes les observations" : "✦ Analyser les " + (entrees.length - n) + " observations restantes";
  }

  function texteAAnalyser(e) {
    return (e.objet ? "Objet : " + e.objet + "\n\n" : "") + (e.contexte ? e.contexte + "\n\n" : "") + e.texte;
  }

  function rendreThemes() {
    const corpsThemes = $("corps-themes");
    corpsThemes.innerHTML = "";
    if (!entrees.length) return;
    for (const l of compterThemes(entrees, THEMES)) {
      const ligne = document.createElement("tr");
      const celluleNom = document.createElement("th");
      celluleNom.scope = "row";
      celluleNom.textContent = l.nom;
      const celluleObs = document.createElement("td");
      const pct = Math.round((100 * l.observations) / entrees.length);
      celluleObs.innerHTML = '<div class="jauge"><span></span></div>';
      celluleObs.querySelector("span").style.width = pct + "%";
      celluleObs.appendChild(document.createTextNode(l.observations + " / " + entrees.length + " (" + pct + " %)"));
      const celluleMentions = document.createElement("td");
      celluleMentions.textContent = String(l.mentions);
      ligne.append(celluleNom, celluleObs, celluleMentions);
      corpsThemes.appendChild(ligne);
    }
  }

  /** Change la source analysée. liste : entrées au format du registre (id, type, auteur, date, objet, texte…). */
  function changerSource(nom, liste) {
    sourceCourante = nom === "dossier" ? "dossier" : "registre";
    entrees = sourceCourante === "dossier" ? liste || [] : ENTREES_REGISTRE;
    registreParId = new Map(entrees.map((e) => [e.id, e]));
    etat.analyses = analysesParSource[sourceCourante];
    $("source-analyse").value = sourceCourante;
    $("nb-observations-texte").textContent = String(entrees.length);
    $("titre-registre").textContent = sourceCourante === "dossier" ? "Dossier importé (version traitée)" : "Registre réel anonymisé (démonstration)";
    $("note-source").textContent =
      sourceCourante === "dossier"
        ? "Observations importées dans l’onglet « Anonymiser / Pseudonymiser » : seule la version traitée est analysée, jamais l’original. Avec une IA externe, seules les observations anonymisées et validées sont acceptées."
        : "Export anonymisé de façon irréversible (voir docs/RAPPORT_ANONYMISATION.md) : 204 observations du registre, servies localement.";
    $("synthese-globale").hidden = true;
    rendreThemes();
    appliquerFiltre();
    rafraichirApresAnalyse();
  }

  {
    $("nb-observations-texte").textContent = String(entrees.length);
    $("source-analyse").addEventListener("change", () => {
      if ($("source-analyse").value === "dossier") {
        const liste = window.Kit && window.Kit.entreesDossierPourAnalyse ? window.Kit.entreesDossierPourAnalyse() : [];
        if (!liste.length) {
          $("source-analyse").value = sourceCourante;
          afficherMessage("Aucun dossier traité : importez et traitez d’abord des observations dans l’onglet « Anonymiser / Pseudonymiser ».");
          return;
        }
        changerSource("dossier", liste);
      } else {
        changerSource("registre");
      }
    });
    select.addEventListener("change", () => afficherDetail(select.value));
    $("filtre-registre").addEventListener("input", appliquerFiltre);
    $("filtre-type").addEventListener("change", appliquerFiltre);
    appliquerFiltre();

    $("btn-charger-observation").addEventListener("click", () => {
      const e = registreParId.get(select.value);
      if (!e) return;
      champReference.value = e.id;
      champTexte.value = e.texte;
      mettreAJourCompteur();
      masquerTout();
      $("titre-saisie").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    $("btn-analyser-observation").addEventListener("click", async (ev) => {
      const e = registreParId.get(select.value);
      if (!e) return;
      // Le texte analysé inclut l’objet et le contexte ; on garde l’empreinte du texte seul.
      const bouton = ev.currentTarget;
      if (!exigerIA()) return;
      const libelle = bouton.textContent;
      bouton.disabled = true;
      bouton.classList.add("chargement");
      bouton.textContent = "Analyse en cours…";
      masquerMessage();
      try {
        const a = await analyserTexte(e.id, texteAAnalyser(e), {
          origine: sourceCourante,
          entree: e,
          surAttente: (ms) => (bouton.textContent = "Limite atteinte, nouvel essai dans " + Math.round(ms / 1000) + " s…")
        });
        a.empreinte = empreinte(e.texte);
        enregistrerAnalyse(a);
        etat.derniereSource = null;
        afficherAnalyseIA(a, true);
        $("btn-relancer").hidden = true;
      } catch (err) {
        if (err && err.name === "AbortError") return;
        const cleEnCause = fournisseurActif() !== "serveur";
        afficherMessage("Analyse IA impossible pour " + e.id + " : " + (err.message || err) + ".", cleEnCause ? { libelle: "Ouvrir les paramètres IA", faire: () => ouvrirParametres() } : null);
      } finally {
        bouton.disabled = false;
        bouton.classList.remove("chargement");
        bouton.textContent = libelle;
        afficherDetail(select.value);
      }
    });

    $("btn-voir-analyse").addEventListener("click", () => {
      const a = etat.analyses[select.value];
      if (a) {
        etat.derniereSource = null;
        afficherAnalyseIA(a, true);
        $("btn-relancer").hidden = true;
      }
    });

    rendreThemes();
  }

  /* ---------- Analyses en lot ---------- */
  function rendreTableauLot() {
    const corps = $("corps-lot");
    corps.innerHTML = "";
    const faites = entrees.filter((e) => analyseValide(e.id)).map((e) => etat.analyses[e.id]);
    $("conteneur-lot").hidden = faites.length === 0;
    for (const a of faites) {
      const tr = document.createElement("tr");
      const th = document.createElement("th");
      th.scope = "row";
      th.textContent = a.reference;
      const pos = document.createElement("span");
      pos.className = "pastille pastille-" + (a.position || "non exprimée").replace(/[^a-zéè]+/g, "-");
      pos.textContent = a.position || "non exprimée";
      th.appendChild(document.createElement("br"));
      th.appendChild(pos);
      const tdThemes = document.createElement("td");
      tdThemes.textContent = (a.themes || []).join(" ; ");
      const tdSynthese = document.createElement("td");
      tdSynthese.textContent = a.synthese;
      const tdAction = document.createElement("td");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "petit";
      b.textContent = "Détail";
      b.addEventListener("click", () => {
        etat.derniereSource = null;
        afficherAnalyseIA(a, true);
        $("btn-relancer").hidden = true;
      });
      tdAction.appendChild(b);
      tr.append(th, tdThemes, tdSynthese, tdAction);
      corps.appendChild(tr);
    }
  }

  let controleurLot = null;

  $("btn-lot").addEventListener("click", async () => {
    if (etat.lotEnCours || !exigerIA()) return;
    const source = $("lot-filtre").checked ? entreesFiltrees : entrees;
    const aFaire = source.filter((e) => !analyseValide(e.id));
    if (aFaire.length === 0) {
      toast(source === entrees ? "Toutes les observations sont déjà analysées" : "Toutes les observations filtrées sont déjà analysées");
      return;
    }
    etat.lotEnCours = true;
    etat.lotStop = false;
    controleurLot = new AbortController();
    $("btn-lot").disabled = true;
    $("btn-lot-stop").hidden = false;
    $("progression").hidden = false;
    masquerMessage();
    const remplissage = $("progression-remplissage");
    const texteProg = $("progression-texte");
    let ok = 0;
    const erreurs = [];
    if (fournisseurActif() === "abonnement") {
      // Abonnement : observations groupées par 8 dans un seul texte à coller.
      for (let i = 0; i < aFaire.length && !etat.lotStop; i += 8) {
        const groupe = aFaire.slice(i, i + 8);
        remplissage.style.width = Math.round((100 * i) / aFaire.length) + "%";
        texteProg.textContent = "Préparation du lot " + (i / 8 + 1) + " / " + Math.ceil(aFaire.length / 8) + " pour l’abonnement…";
        try {
          for (const e of groupe) await verifierEnvoiExterne(texteAAnalyser(e), sourceCourante, e);
          const brut = await appelAbonnement(
            construireMessagesAnalyseLot(groupe.map((e) => ({ reference: e.id, texte: texteAAnalyser(e) }))),
            { titreAbonnement: "Lot " + (i / 8 + 1) + " / " + Math.ceil(aFaire.length / 8) + " — " + groupe.map((e) => e.id).join(", ") }
          );
          const liste = Array.isArray(brut.analyses) ? brut.analyses : Array.isArray(brut) ? brut : [];
          for (const e of groupe) {
            const trouve = liste.find((x) => x && String(x.reference || "").trim() === e.id);
            if (!trouve) {
              erreurs.push(e.id + " : absente de la réponse collée");
              continue;
            }
            const a = normaliserAnalyse(trouve, e.id);
            a.modele = NOMS_FOURNISSEURS.abonnement;
            a.date = horodatage();
            a.empreinte = empreinte(e.texte);
            enregistrerAnalyse(a);
            ok += 1;
          }
        } catch (err) {
          if (err && err.name === "AbortError") break;
          erreurs.push("lot " + (i / 8 + 1) + " : " + (err.message || err));
          if (err.statut === 451) break;
        }
      }
    }
    for (let i = 0; i < aFaire.length && fournisseurActif() !== "abonnement"; i++) {
      if (etat.lotStop) break;
      const e = aFaire[i];
      remplissage.style.width = Math.round((100 * i) / aFaire.length) + "%";
      texteProg.textContent = "Analyse de " + e.id + " (" + (i + 1) + " / " + aFaire.length + ")…";
      try {
        const a = await analyserTexte(e.id, texteAAnalyser(e), {
          origine: sourceCourante,
          entree: e,
          signal: controleurLot.signal,
          surAttente: (ms) => (texteProg.textContent = "Limite de requêtes atteinte : reprise dans " + Math.round(ms / 1000) + " s…")
        });
        a.empreinte = empreinte(e.texte);
        enregistrerAnalyse(a);
        ok += 1;
      } catch (err) {
        if (err && err.name === "AbortError") break;
        erreurs.push(e.id + " : " + (err.message || err));
        if (err.statut === 401 || err.statut === 403 || err.statut === 451 || /injoignable/.test(err.message || "")) {
          break; // inutile de continuer avec une clé refusée
        }
      }
      await attendre(fournisseurActif() === "mistral" ? 1100 : 100); // API Mistral : environ 1 requête/seconde
    }
    remplissage.style.width = "100%";
    const interrompu = etat.lotStop;
    texteProg.textContent =
      (interrompu ? "Interrompu : " : "Terminé : ") +
      ok +
      " observation" +
      (ok > 1 ? "s" : "") +
      " analysée" +
      (ok > 1 ? "s" : "") +
      (erreurs.length ? ", " + erreurs.length + " erreur" + (erreurs.length > 1 ? "s" : "") : "") +
      ". " +
      nbAnalyses() +
      " / " +
      entrees.length +
      " au total.";
    if (erreurs.length) {
      afficherMessage("Erreurs pendant l’analyse en lot — " + erreurs.slice(0, 3).join(" · ") + (erreurs.length > 3 ? " …" : ""));
    }
    etat.lotEnCours = false;
    $("btn-lot").disabled = false;
    $("btn-lot-stop").hidden = true;
    appliquerFiltre();
  });

  $("btn-lot-stop").addEventListener("click", () => {
    etat.lotStop = true;
    if (controleurLot) controleurLot.abort();
    $("progression-texte").textContent = "Interruption…";
  });

  function analysesListe() {
    return entrees.filter((e) => analyseValide(e.id)).map((e) => etat.analyses[e.id]);
  }

  $("btn-export-csv").addEventListener("click", () => {
    const liste = analysesListe();
    if (!liste.length) {
      toast("Aucune analyse à exporter");
      return;
    }
    telecharger("analyses-observations-" + dateFichier() + ".csv", analysesEnCSV(liste), "text/csv;charset=utf-8");
  });

  $("btn-export-json").addEventListener("click", () => {
    const liste = analysesListe();
    if (!liste.length) {
      toast("Aucune analyse à exporter");
      return;
    }
    const contenu = JSON.stringify({ enquete: TITRE_ENQUETE, export: new Date().toISOString(), analyses: liste }, null, 2);
    telecharger("analyses-observations-" + dateFichier() + ".json", contenu, "application/json");
  });

  $("btn-import-json").addEventListener("click", () => $("fichier-import").click());
  $("fichier-import").addEventListener("change", async (ev) => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const liste = Array.isArray(data) ? data : data.analyses;
      if (!Array.isArray(liste)) throw new Error("format inattendu");
      let n = 0;
      for (const brut of liste) {
        if (!brut || typeof brut.reference !== "string" || !registreParId.has(brut.reference)) continue;
        const a = normaliserAnalyse(brut, brut.reference);
        a.modele = brut.modele || "";
        a.date = brut.date || "";
        a.empreinte = brut.empreinte || "";
        etat.analyses[a.reference] = a;
        n += 1;
      }
      stock.ecrire(cleStockageAnalyses(), etat.analyses);
      rafraichirApresAnalyse();
      appliquerFiltre();
      toast(n + " analyse" + (n > 1 ? "s" : "") + " importée" + (n > 1 ? "s" : ""));
    } catch (e) {
      afficherMessage("Import impossible : fichier JSON non reconnu (" + (e.message || e) + ").");
    }
  });

  $("btn-vider").addEventListener("click", () => {
    const n = Object.keys(etat.analyses).length;
    if (!n) {
      toast("Aucune analyse enregistrée");
      return;
    }
    if (!window.confirm("Supprimer les " + n + " analyses enregistrées dans ce navigateur ? Exportez-les d’abord si vous souhaitez les conserver.")) {
      return;
    }
    for (const k of Object.keys(etat.analyses)) delete etat.analyses[k];
    stock.supprimer(cleStockageAnalyses());
    if (window.Kit && window.Kit.miroir) window.Kit.miroir("analyses-" + sourceCourante + ".json", {});
    $("synthese-globale").hidden = true;
    rafraichirApresAnalyse();
    appliquerFiltre();
    toast("Analyses supprimées");
  });

  /* ---------- Synthèse globale ---------- */
  let derniereSynthese = null;

  function rendreSynthese(s) {
    const zone = $("synthese-contenu");
    zone.innerHTML = "";
    const ajouter = (balise, texte, classe) => {
      const el = document.createElement(balise);
      el.textContent = texte;
      if (classe) el.className = classe;
      zone.appendChild(el);
      return el;
    };
    if (s.bilan) ajouter("p", s.bilan);
    if (s.themes.length) {
      ajouter("h4", "Principaux thèmes");
      const ul = document.createElement("ul");
      for (const t of s.themes) {
        const li = document.createElement("li");
        const fort = document.createElement("strong");
        fort.textContent = t.theme + (t.nombre != null ? " (≈ " + t.nombre + ")" : "");
        li.appendChild(fort);
        li.appendChild(document.createTextNode(" — " + t.resume + (t.references.length ? " [" + t.references.slice(0, 8).join(", ") + "]" : "")));
        ul.appendChild(li);
      }
      zone.appendChild(ul);
    }
    for (const [titre, liste] of [
      ["Questions prioritaires au maître d’ouvrage", s.questions_prioritaires],
      ["Points de vigilance", s.points_vigilance]
    ]) {
      if (!liste.length) continue;
      ajouter("h4", titre);
      const ol = document.createElement("ol");
      for (const q of liste) {
        const li = document.createElement("li");
        li.textContent = q;
        ol.appendChild(li);
      }
      zone.appendChild(ol);
    }
    $("synthese-globale").hidden = false;
  }

  function syntheseEnTexte(s) {
    const l = ["SYNTHÈSE GLOBALE (IA — à vérifier)", "", s.bilan, "", "Principaux thèmes :"];
    for (const t of s.themes) l.push("- " + t.theme + (t.nombre != null ? " (≈ " + t.nombre + ")" : "") + " : " + t.resume);
    l.push("", "Questions prioritaires :");
    s.questions_prioritaires.forEach((q, i) => l.push(i + 1 + ". " + q));
    l.push("", "Points de vigilance :");
    s.points_vigilance.forEach((q, i) => l.push(i + 1 + ". " + q));
    return l.join("\n");
  }

  $("btn-synthese").addEventListener("click", async (ev) => {
    const liste = analysesListe();
    if (liste.length < 3) {
      afficherMessage("La synthèse globale s’appuie sur les analyses individuelles : analysez au moins 3 observations (idéalement tout le registre) avant de la lancer.", {
        libelle: "✦ Analyser le registre",
        faire: () => $("btn-lot").click()
      });
      return;
    }
    if (!exigerIA()) return;
    const bouton = ev.currentTarget;
    bouton.disabled = true;
    bouton.classList.add("chargement");
    bouton.textContent = "Synthèse en cours…";
    masquerMessage();
    try {
      let brut;
      if (estExterne()) {
        // La synthèse ne contient que des analyses (déjà sans identifiant) ; mêmes règles d’origine.
        for (const a of liste) await verifierEnvoiExterne(a.synthese || "", sourceCourante, registreParId.get(a.reference));
      }
      if (fournisseurActif() === "serveur") {
        brut = await appelServeur("api/synthese", { analyses: liste });
      } else {
        if (estLocal()) bouton.textContent = "Synthèse en cours (modèle local : plusieurs minutes)…";
        brut = await appelIA(construireMessagesSynthese(liste), { maxTokens: 3000 });
      }
      derniereSynthese = normaliserSynthese(brut);
      rendreSynthese(derniereSynthese);
      $("synthese-globale").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      afficherMessage("Synthèse globale impossible : " + (e.message || e) + ".");
    } finally {
      bouton.disabled = false;
      bouton.classList.remove("chargement");
      bouton.textContent = "✦ Synthèse globale par l’IA";
    }
  });

  $("btn-copier-synthese").addEventListener("click", () => {
    if (derniereSynthese) copier(syntheseEnTexte(derniereSynthese));
  });

  /* ---------- Démarrage ---------- */
  mettreAJourCompteur();
  mettreAJourBadgeIA();
  rafraichirApresAnalyse();

  (async () => {
    if (location.protocol === "http:" || location.protocol === "https:") {
      await fetch("api/etat", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("http " + r.status))))
        .then((e) => {
          etat.serveur = Boolean(e && e.ia_disponible);
          etat.serveurModele = (e && e.modele) || "";
          etat.kit = e && e.kit ? e : null;
          // Ollama intégré au kit : son adresse est fournie par le serveur du kit, sauf réglage manuel.
          if (etat.kit && e.ollama_url && urlEstLocale(e.ollama_url) && !etat.ollama.urlManuelle) {
            etat.ollama.url = sansBarreFinale(e.ollama_url);
            $("ollama-url").value = etat.ollama.url;
          }
        })
        .catch(() => {
          etat.serveur = false;
        });
    }
    await chargerModelesOllama(true);
    mettreAJourBadgeIA();
    document.dispatchEvent(new CustomEvent("analyse:etat", { detail: { kit: etat.kit, ollama: etat.ollamaDetecte } }));
  })();

  function urlEstLocale(url) {
    try {
      return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(url).hostname);
    } catch (e) {
      return false;
    }
  }

  /* Interface utilisée par les autres onglets du kit (kit.js). */
  window.AnalyseIA = {
    etat,
    fournisseurActif,
    modeleActif,
    estExterne,
    iaDisponible,
    ouvrirParametres,
    mettreAJourBadgeIA,
    chargerModelesOllama,
    changerSource,
    sourceCourante: () => sourceCourante,
    entreesRegistre: () => ENTREES_REGISTRE,
    analysesDe: (source) => analysesParSource[source] || {},
    chargerAnalyses(source, objet) {
      if (!objet || typeof objet !== "object") return;
      const cible = analysesParSource[source];
      for (const k of Object.keys(cible)) delete cible[k];
      Object.assign(cible, objet);
      if (source === sourceCourante) rafraichirApresAnalyse();
    },
    /** Moteur local prêt pour l’anonymisation (Ollama sur cette machine uniquement). */
    ollamaPret: () => Boolean(etat.ollamaDetecte && etat.ollama.modele && urlEstLocale(etat.ollama.url)),
    ollamaUrlLocale: () => urlEstLocale(etat.ollama.url),
    /** Applique le modèle recommandé par le diagnostic s’il est installé et si l’utilisateur n’a rien choisi. */
    appliquerRecommandation(modele) {
      if (!modele || etat.ollama.choixManuel) return false;
      const options = [...$("ollama-modele").options].map((o) => o.value);
      const cible = options.includes(modele) ? modele : modele === "ministral-3:8b" && options.includes("ministral-3:latest") ? "ministral-3:latest" : "";
      if (!cible || cible === etat.ollama.modele) return false;
      etat.ollama.modele = cible;
      $("ollama-modele").value = cible;
      stock.ecrire(CLE_OLLAMA, etat.ollama);
      mettreAJourBadgeIA();
      return true;
    },
    /** Appel au modèle LOCAL (Ollama) — refusé si l’adresse n’est pas locale. */
    appelLocal(messages, options) {
      if (!urlEstLocale(etat.ollama.url)) {
        return Promise.reject(new Error("l’adresse d’Ollama n’est pas locale : traitement refusé (données personnelles)"));
      }
      if (!etat.ollama.modele) return Promise.reject(new Error("aucun modèle Ollama choisi"));
      return appelOllama(messages, options);
    }
  };
}
