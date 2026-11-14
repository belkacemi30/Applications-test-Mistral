"use strict";

const REFERENCE_EXEMPLE = "OBS-2025-0147 (exemple fictif)";

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
  ["Thèmes", "Trafic de poids lourds pendant les travaux ; nuisances sonores et vibrations ; horaires de passage des camions ; sécurité des piétons, notamment des enfants scolarisés ; itinéraires empruntés par les engins de chantier."],
  ["Synthèse neutre", "Un riverain signale une augmentation du passage de poids lourds à proximité de son habitation depuis le début des travaux, avec des craintes concernant le bruit, les vibrations et la sécurité des enfants qui empruntent le trottoir pour aller à l’école."],
  ["Demandes explicites", "Prévoir un itinéraire alternatif pour les poids lourds ; limiter les nuisances sonores ; garantir la sécurité des piétons, en particulier des enfants ; apporter une réponse écrite à l’auteur de l’observation."],
  ["Questions au maître d’ouvrage", "Quels itinéraires les poids lourds empruntent-ils et à quels horaires ? Quelles mesures de réduction du bruit sont prévues (horaires, équipements, bâchage) ? Quelles protections sont prévues aux passages piétons à proximité du chantier et sur le trajet de l’école ? Un plan de circulation et une signalisation temporaire sont-ils en place ?"],
  ["Points à vérifier", "Conformité des itinéraires déclarés dans le dossier d’enquête ; respect des horaires réglementaires de chantier ; existence d’un plan de circulation des engins ; mesures de réduction des vibrations ; dispositif d’information des riverains ; traitement de la réponse au commissaire enquêteur."]
];

function statutDemonstration(texte, texteExemple) {
  if (!texte || texte.trim() === "") {
    return "vide";
  }
  return texte === texteExemple ? "exemple" : "modifie";
}

const THEMES = [
  ["Paysage et impact visuel", ["paysage", "visuel", "impact visuel", "défigur", "bucolique", "beauté", "laideur", "panorama", "masquer", "haie"]],
  ["Valeur immobilière", ["valeur immobilière", "dévaluation", "immobilier", "perdre de la valeur", "biens immobiliers", "propriété", "maison"]],
  ["Trafic, camions et travaux", ["camion", "trafic", "chaussée", "circulation", "chantier", "travaux", "route"]],
  ["Bruit et nuisances", ["bruit", "bruyant", "nuisance", "silencieux", "vibration", "pollution sonore"]],
  ["Biodiversité et environnement", ["busard", "faune", "flore", "biodiversité", "nidification", "espèce protégée", "espèces protégées", "écolog", "environnement", "patrimoine naturel"]],
  ["Agriculture, élevage et foncier", ["agricole", "agriculteur", "éleveur", "élevage", "vache", "bovin", "prairie", "pâturage", "terre arable", "terres arables", "agrivolta", "asa"]],
  ["Raccordement au réseau électrique", ["poste source", "raccordement", "raccorder", "ligne électrique", "acheminement", "transport de l'électricité", "tranchée", "mirepoix"]],
  ["Économie, finances et emploi", ["taxe", "financier", "revenu", "coût", "onéreux", "subvention", "aide agricole", "emploi", "bénéfice"]],
  ["Conflit d'intérêts et procédure", ["conflit d'intérêt", "conflit d'intérêts", "adjoint au maire", "maire", "charte", "abstention", "article 5", "publicité de l'enquête", "procédure", "irrégularit"]],
  ["Stratégie énergétique et alternatives", ["nucléaire", "co2", "gaz", "charbon", "intermittent", "climat", "transition énergétique", "souveraineté", "indépendance alimentaire", "recyclage", "déchet", "parking", "toiture", "hangar", "déjà artificialisé", "déjà pollué", "ombrière", "flottant"]],
  ["Sécurité et santé", ["santé", "sécurité", "risque", "danger", "pollution électromagnétique", "incendie"]]
];

function compterThemes(entrees, themes) {
  const corpus = entrees.map((e) =>
    ((e.objet || "") + "\n" + (e.contexte || "") + "\n" + (e.texte || "")).toLowerCase()
  );
  return themes
    .map(([nom, mots]) => {
      let observations = 0;
      let mentions = 0;
      for (const texte of corpus) {
        let trouve = false;
        for (const mot of mots) {
          let pos = texte.indexOf(mot);
          while (pos !== -1) {
            mentions += 1;
            trouve = true;
            pos = texte.indexOf(mot, pos + mot.length);
          }
        }
        if (trouve) {
          observations += 1;
        }
      }
      return { nom, observations, mentions };
    })
    .sort((a, b) => b.observations - a.observations || b.mentions - a.mentions);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    REFERENCE_EXEMPLE,
    TEXTE_EXEMPLE,
    TABLEAU_EXEMPLE,
    THEMES,
    statutDemonstration,
    compterThemes
  };
}

if (typeof document !== "undefined") {
  const champReference = document.getElementById("reference");
  const champTexte = document.getElementById("texte");
  const avertissement = document.getElementById("avertissement-modification");
  const btnExemple = document.getElementById("btn-exemple");
  const btnDemo = document.getElementById("btn-demo");
  const btnEffacer = document.getElementById("btn-effacer");
  const sectionResultats = document.getElementById("resultats");
  const corpsTableau = document.getElementById("corps-tableau");
  const sectionMessage = document.getElementById("message");

  function afficherMessage(texte) {
    sectionMessage.textContent = texte;
    sectionMessage.hidden = false;
  }

  function masquerTout() {
    sectionResultats.hidden = true;
    sectionMessage.hidden = true;
    avertissement.hidden = true;
  }

  function mettreAJourAvertissement() {
    const statut = statutDemonstration(champTexte.value, TEXTE_EXEMPLE);
    avertissement.hidden = statut !== "modifie";
    if (statut !== "exemple") {
      sectionResultats.hidden = true;
    }
  }

  function afficherTableau() {
    const reference = champReference.value.trim() !== "" ? champReference.value.trim() : REFERENCE_EXEMPLE;
    corpsTableau.innerHTML = "";
    for (const [rubrique, contenu] of TABLEAU_EXEMPLE) {
      const ligne = document.createElement("tr");
      const celluleRubrique = document.createElement("th");
      celluleRubrique.scope = "row";
      celluleRubrique.textContent = rubrique;
      const celluleContenu = document.createElement("td");
      celluleContenu.textContent = rubrique === "Référence" ? reference : contenu;
      ligne.appendChild(celluleRubrique);
      ligne.appendChild(celluleContenu);
      corpsTableau.appendChild(ligne);
    }
    sectionResultats.hidden = false;
  }

  btnExemple.addEventListener("click", () => {
    champReference.value = REFERENCE_EXEMPLE;
    champTexte.value = TEXTE_EXEMPLE;
    masquerTout();
  });

  champTexte.addEventListener("input", mettreAJourAvertissement);
  champReference.addEventListener("input", () => {
    if (!sectionResultats.hidden && statutDemonstration(champTexte.value, TEXTE_EXEMPLE) === "exemple") {
      afficherTableau();
    }
  });

  btnDemo.addEventListener("click", () => {
    const statut = statutDemonstration(champTexte.value, TEXTE_EXEMPLE);
    if (statut === "vide") {
      sectionResultats.hidden = true;
      afficherMessage("Veuillez d’abord charger l’exemple fictif ou saisir un texte d’observation. Aucune analyse par IA n’est effectuée dans cette démonstration.");
    } else if (statut === "modifie") {
      sectionResultats.hidden = true;
      afficherMessage("Le texte a été modifié par rapport à l’exemple fictif : le tableau préparé ne correspond pas à ce nouveau texte. Aucune analyse par IA n’est effectuée dans cette démonstration.");
    } else {
      sectionMessage.hidden = true;
      afficherTableau();
    }
  });

  btnEffacer.addEventListener("click", () => {
    champReference.value = "";
    champTexte.value = "";
    masquerTout();
  });

  if (typeof OBSERVATIONS_REGISTRE !== "undefined") {
    const entrees = [...OBSERVATIONS_REGISTRE.observations, ...OBSERVATIONS_REGISTRE.contributions];
    const select = document.getElementById("liste-observations");
    document.getElementById("nb-observations").textContent = String(entrees.length);

    entrees.forEach((e, i) => {
      const option = document.createElement("option");
      option.value = String(i);
      const meta = e.date || e.permanence || "";
      const objet = e.objet ? " — " + e.objet.slice(0, 60) : "";
      option.textContent = e.id + " — " + (e.auteur || "Non précisé") + (meta ? " — " + meta : "") + objet;
      select.appendChild(option);
    });

    function afficherDetail(i) {
      const e = entrees[i];
      if (!e) {
        return;
      }
      document.getElementById("detail-observation").hidden = false;
      document.getElementById("detail-id").textContent = e.id;
      const metaParts = [e.type === "orale" ? "Observation orale" : "Contribution écrite", e.auteur || "Non précisé"];
      if (e.type === "orale" && e.permanence) {
        metaParts.push(e.permanence);
      }
      if (e.date) {
        metaParts.push(e.date);
      }
      if (e.lieu) {
        metaParts.push(e.lieu);
      }
      document.getElementById("detail-meta").textContent = "— " + metaParts.join(" — ");
      const objetEl = document.getElementById("detail-objet");
      objetEl.hidden = !e.objet;
      objetEl.textContent = e.objet ? "Objet : " + e.objet : "";
      document.getElementById("detail-texte").textContent = (e.contexte ? e.contexte + "\n\n" : "") + e.texte;
    }

    select.addEventListener("change", () => afficherDetail(parseInt(select.value, 10)));
    afficherDetail(0);

    document.getElementById("btn-charger-observation").addEventListener("click", () => {
      const e = entrees[parseInt(select.value, 10)];
      if (!e) {
        return;
      }
      champReference.value = e.id;
      champTexte.value = e.texte;
      sectionResultats.hidden = true;
      sectionMessage.hidden = true;
      mettreAJourAvertissement();
      document.getElementById("titre-saisie").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const lignesThemes = compterThemes(entrees, THEMES);
    const corpsThemes = document.getElementById("corps-themes");
    for (const l of lignesThemes) {
      const ligne = document.createElement("tr");
      const celluleNom = document.createElement("th");
      celluleNom.scope = "row";
      celluleNom.textContent = l.nom;
      const celluleObs = document.createElement("td");
      celluleObs.textContent = l.observations + " / " + entrees.length;
      const celluleMentions = document.createElement("td");
      celluleMentions.textContent = String(l.mentions);
      ligne.appendChild(celluleNom);
      ligne.appendChild(celluleObs);
      ligne.appendChild(celluleMentions);
      corpsThemes.appendChild(ligne);
    }
  }
}
