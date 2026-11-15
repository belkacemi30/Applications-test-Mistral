"use strict";

/* =========================================================================
 * Analyse des observations — Enquête publique « Pas de Mirepoix »
 *
 * Deux façons d’obtenir l’analyse IA (Mistral) :
 *  1. serveur local (node serveur/server.js) : la clé reste côté serveur ;
 *  2. directement depuis le navigateur (GitHub Pages, fichier local) avec la
 *     clé API Mistral de l’utilisateur, conservée uniquement dans son navigateur.
 * La partie « logique » (sans DOM) est exportée pour le serveur et les tests.
 * ========================================================================= */

const REFERENCE_EXEMPLE = "OBS-2025-0147 (exemple fictif)";
const TITRE_ENQUETE = "Projet agrivoltaïque du Pas de Mirepoix — Saint-Julien-de-Briola (Aude)";
const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";
const MISTRAL_MODELES_URL = "https://api.mistral.ai/v1/models";
const MODELE_DEFAUT = "mistral-small-latest";
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
    .map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? Object.values(x).join(" — ") : ""))
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

/** Valide et normalise un objet d’analyse (réponse du modèle ou du serveur). */
function normaliserAnalyse(parse, reference) {
  const p = parse && typeof parse === "object" ? parse : {};
  return {
    reference: reference || (typeof p.reference === "string" ? p.reference.trim() : ""),
    position: normaliserPosition(p.position),
    themes: nettoyerTableau(p.themes),
    synthese: typeof p.synthese === "string" ? p.synthese.trim() : "",
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
          resume: String(t.resume || t.résumé || "").trim(),
          references: nettoyerTableau(t.references || t.références)
        }))
        .filter((t) => t.theme)
    : [];
  return {
    bilan: typeof s.bilan === "string" ? s.bilan.trim() : "",
    themes,
    questions_prioritaires: nettoyerTableau(s.questions_prioritaires),
    points_vigilance: nettoyerTableau(s.points_vigilance)
  };
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
    LIMITE_TEXTE,
    statutDemonstration,
    compterThemes,
    construireLignesDemo,
    lignesDepuisAnalyseIA,
    normaliserAnalyse,
    normaliserSynthese,
    construireMessagesAnalyse,
    construireMessagesSynthese,
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

  /* ---------- État ---------- */
  const etat = {
    serveur: false, // serveur local avec clé disponible
    serveurModele: "",
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

  /* ---------- Disponibilité de l’IA ---------- */
  function iaDisponible() {
    return etat.serveur || Boolean(etat.cle);
  }

  function mettreAJourBadgeIA() {
    const badge = $("badge-ia");
    if (etat.serveur) {
      badge.textContent = "IA : serveur local (" + (etat.serveurModele || MODELE_DEFAUT) + ")";
      badge.className = "badge badge-ok";
    } else if (etat.cle) {
      badge.textContent = "IA : prête (" + etat.modele + ")";
      badge.className = "badge badge-ok";
    } else {
      badge.textContent = "IA : clé à configurer";
      badge.className = "badge badge-attention";
    }
    $("etat-serveur").textContent = etat.serveur
      ? "✓ Un serveur local avec clé Mistral est détecté : il est utilisé pour les analyses (modèle " + (etat.serveurModele || MODELE_DEFAUT) + "). Les réglages ci-dessous ne sont alors pas nécessaires."
      : "Aucun serveur local détecté (hébergement statique ou fichier ouvert directement) : renseignez votre clé API Mistral pour activer les analyses.";
  }

  function ouvrirParametres(raison) {
    panneau.hidden = false;
    btnParametres.setAttribute("aria-expanded", "true");
    if (raison) {
      afficherRetourParametres(raison, "attention");
    }
    panneau.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => $("cle-api").focus(), 300);
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
    ouvrirParametres("Pour lancer une analyse IA, collez d’abord votre clé API Mistral puis cliquez sur « Enregistrer et tester ».");
    return false;
  }

  /* ---------- Appels Mistral ---------- */
  const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

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
        const err = new Error(messageErreurHTTP(reponse.status, typeof detail === "string" ? detail.slice(0, 160) : ""));
        err.statut = reponse.status;
        throw err;
      }
      const contenu = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      return extraireJSON(contenu);
    }
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
      const err = new Error(data.erreur || "HTTP " + reponse.status);
      err.statut = reponse.status;
      throw err;
    }
    return data;
  }

  async function analyserTexte(reference, texte, options) {
    const opts = options || {};
    let brut;
    if (etat.serveur) {
      brut = await appelServeur("api/analyse", { reference, texte }, opts.signal);
    } else {
      brut = await appelMistralDirect(construireMessagesAnalyse(reference, texte), opts);
    }
    const a = normaliserAnalyse(brut, reference);
    a.modele = etat.serveur ? etat.serveurModele || MODELE_DEFAUT : etat.modele;
    a.date = horodatage();
    a.empreinte = empreinte(texte);
    return a;
  }

  /* ---------- Paramètres ---------- */
  $("modele").value = etat.modele;
  if (!$("modele").value) {
    $("modele").value = MODELE_DEFAUT;
    etat.modele = MODELE_DEFAUT;
  }
  $("cle-api").value = etat.cle;
  try {
    $("memoriser-cle").checked = window.localStorage.getItem(CLE_API) !== null;
  } catch (e) {
    $("memoriser-cle").checked = false;
  }

  btnParametres.addEventListener("click", () => (panneau.hidden ? ouvrirParametres() : fermerParametres()));
  $("btn-fermer-parametres").addEventListener("click", fermerParametres);

  $("btn-voir-cle").addEventListener("click", (ev) => {
    const champ = $("cle-api");
    const visible = champ.type === "text";
    champ.type = visible ? "password" : "text";
    ev.currentTarget.textContent = visible ? "Afficher" : "Masquer";
    ev.currentTarget.setAttribute("aria-pressed", String(!visible));
  });

  $("modele").addEventListener("change", () => {
    etat.modele = $("modele").value;
    stock.ecrire(CLE_MODELE, etat.modele);
    mettreAJourBadgeIA();
  });

  $("btn-enregistrer-cle").addEventListener("click", async (ev) => {
    const bouton = ev.currentTarget;
    const cle = $("cle-api").value.trim();
    if (!cle) {
      afficherRetourParametres("Collez une clé API Mistral (console.mistral.ai → API Keys).", "attention");
      return;
    }
    bouton.disabled = true;
    bouton.textContent = "Test en cours…";
    try {
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
      afficherRetourParametres(
        "✓ Clé valide. " +
          (modeleOk ? "Modèle « " + etat.modele + " » disponible. " : "Attention : le modèle « " + etat.modele + " » n’apparaît pas dans votre liste, choisissez-en un autre. ") +
          ($("memoriser-cle").checked ? "Clé mémorisée sur cet appareil." : "Clé conservée jusqu’à la fermeture de l’onglet."),
        modeleOk ? "ok" : "attention"
      );
      mettreAJourBadgeIA();
      masquerMessage();
    } catch (e) {
      afficherRetourParametres("✗ Échec du test : " + (e.message || e) + ".", "erreur");
    } finally {
      bouton.disabled = false;
      bouton.textContent = "Enregistrer et tester";
    }
  });

  $("btn-oublier-cle").addEventListener("click", () => {
    stock.supprimer(CLE_API);
    etat.cle = "";
    $("cle-api").value = "";
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
      const a = await analyserTexte(reference, texte, {
        surAttente: (ms) => (bouton.textContent = "Limite atteinte, nouvel essai dans " + Math.round(ms / 1000) + " s…")
      });
      etat.derniereSource = { reference, texte };
      if (reference && registreParId.has(reference) && registreParId.get(reference).texte === texte) {
        enregistrerAnalyse(a);
      }
      afficherAnalyseIA(a, true);
    } catch (e) {
      sectionResultats.hidden = true;
      const cleEnCause = !etat.serveur && (e.statut === 401 || e.statut === 403);
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
  const entrees =
    typeof OBSERVATIONS_REGISTRE !== "undefined" ? [...OBSERVATIONS_REGISTRE.observations, ...OBSERVATIONS_REGISTRE.contributions] : [];
  const registreParId = new Map(entrees.map((e) => [e.id, e]));
  const select = $("liste-observations");
  let entreesFiltrees = entrees.slice();

  function enregistrerAnalyse(a) {
    etat.analyses[a.reference] = a;
    if (!stock.ecrire(CLE_ANALYSES, etat.analyses)) {
      toast("Stockage local indisponible : exportez vos analyses pour les conserver");
    }
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
    $("btn-lot").textContent = n >= entrees.length ? "✓ Tout le registre est analysé" : n === 0 ? "✦ Analyser tout le registre" : "✦ Analyser les " + (entrees.length - n) + " observations restantes";
  }

  function texteAAnalyser(e) {
    return (e.objet ? "Objet : " + e.objet + "\n\n" : "") + (e.contexte ? e.contexte + "\n\n" : "") + e.texte;
  }

  if (entrees.length) {
    $("nb-observations-texte").textContent = String(entrees.length);
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
          surAttente: (ms) => (bouton.textContent = "Limite atteinte, nouvel essai dans " + Math.round(ms / 1000) + " s…")
        });
        a.empreinte = empreinte(e.texte);
        enregistrerAnalyse(a);
        etat.derniereSource = null;
        afficherAnalyseIA(a, true);
        $("btn-relancer").hidden = true;
      } catch (err) {
        const cleEnCause = !etat.serveur && (err.statut === 401 || err.statut === 403);
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

    /* Thèmes (comptage local) */
    const corpsThemes = $("corps-themes");
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
    for (let i = 0; i < aFaire.length; i++) {
      if (etat.lotStop) break;
      const e = aFaire[i];
      remplissage.style.width = Math.round((100 * i) / aFaire.length) + "%";
      texteProg.textContent = "Analyse de " + e.id + " (" + (i + 1) + " / " + aFaire.length + ")…";
      try {
        const a = await analyserTexte(e.id, texteAAnalyser(e), {
          signal: controleurLot.signal,
          surAttente: (ms) => (texteProg.textContent = "Limite de requêtes atteinte : reprise dans " + Math.round(ms / 1000) + " s…")
        });
        a.empreinte = empreinte(e.texte);
        enregistrerAnalyse(a);
        ok += 1;
      } catch (err) {
        if (err && err.name === "AbortError") break;
        erreurs.push(e.id + " : " + (err.message || err));
        if (err.statut === 401 || err.statut === 403) {
          break; // inutile de continuer avec une clé refusée
        }
      }
      await attendre(etat.serveur ? 200 : 1100); // respecte la limite d’environ 1 requête/seconde
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
      stock.ecrire(CLE_ANALYSES, etat.analyses);
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
    etat.analyses = {};
    stock.supprimer(CLE_ANALYSES);
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
      if (etat.serveur) {
        brut = await appelServeur("api/synthese", { analyses: liste });
      } else {
        brut = await appelMistralDirect(construireMessagesSynthese(liste), { maxTokens: 3000 });
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

  if (location.protocol === "http:" || location.protocol === "https:") {
    fetch("api/etat", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("http " + r.status))))
      .then((e) => {
        etat.serveur = Boolean(e && e.ia_disponible);
        etat.serveurModele = (e && e.modele) || "";
      })
      .catch(() => {
        etat.serveur = false;
      })
      .finally(mettreAJourBadgeIA);
  }
}
