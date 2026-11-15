"use strict";
/*
 * Poste de travail local du commissaire enquêteur — pilotage des onglets du kit.
 *  - onglets, accueil et état du poste ;
 *  - stockage des données de l’utilisateur dans le dossier « donnees/ » du kit (via le serveur local) ;
 *  - module « Anonymiser / Pseudonymiser » (Exigence A) : import, traitement par lots avec Ollama,
 *    rapport, relecture humaine, tableau de correspondance chiffré, purge ;
 *  - export multi-format (Exigence E), guides et vidéo (Exigences B et C) ;
 *  - boîtes de dialogue de confirmation (deux étapes pour les actions sensibles).
 * Aucune valeur personnelle n’est écrite dans le journal ni dans le rapport.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const A = window.Anonymisation;
  const F = window.Formats;
  const IA = () => window.AnalyseIA;

  /* =========================================================================
   * Grille de recommandation des modèles (vérifiée le 15/11/2026 sur ollama.com/library)
   * Source unique pour l’application ; reprise dans docs/GRILLE_MODELES.md et les scripts de diagnostic.
   * ========================================================================= */
  const GRILLE = [
    { palier: "minimal", libelle: "Configuration minimale (8 Go de RAM, sans GPU dédié)", modele: "ministral-3:3b", taille: "3,0 Go", quantification: "Q4_K_M", disque: "6 Go libres", duree: "estimation : 30 s à 2 min par observation (processeur seul)" },
    { palier: "intermediaire", libelle: "Configuration intermédiaire (16 Go de RAM, GPU grand public 6 à 8 Go)", modele: "ministral-3:8b", taille: "6,0 Go", quantification: "Q4_K_M", disque: "10 Go libres", duree: "mesuré : 10 à 20 s par observation (2 passes) sur GPU RTX 3070 8 Go" },
    { palier: "confortable", libelle: "Configuration confortable (32 Go de RAM ou plus, GPU 12 Go de VRAM ou plus)", modele: "ministral-3:14b", taille: "9,1 Go", quantification: "Q4_K_M", disque: "15 Go libres", duree: "estimation : 10 à 30 s par observation" }
  ];
  function recommander(d) {
    if (!d) return null;
    const ram = Number(d.ram_go) || 0;
    const vram = Number(d.vram_go) || 0;
    if (d.apple_silicon) {
      // Mémoire unifiée : la mémoire vive sert aussi au GPU.
      return ram >= 30 ? GRILLE[2] : ram >= 15 ? GRILLE[1] : GRILLE[0];
    }
    // Seuils tolérants : 32 Go physiques apparaissent souvent comme ~31,7 Go utilisables.
    if (ram >= 30 && vram >= 12) return GRILLE[2];
    if (ram >= 15 && vram >= 6) return GRILLE[1];
    return GRILLE[0];
  }

  /* =========================================================================
   * Utilitaires
   * ========================================================================= */
  let minuterieToast = null;
  function toast(texte) {
    const t = $("toast");
    t.textContent = texte;
    t.hidden = false;
    clearTimeout(minuterieToast);
    minuterieToast = setTimeout(() => (t.hidden = true), 3500);
  }
  function telecharger(nom, contenu, type) {
    const blob = contenu instanceof Blob ? contenu : new Blob([contenu], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const dateFichier = () => new Date().toISOString().slice(0, 10);
  const horodatage = () => new Date().toLocaleString("fr-FR");
  function el(balise, proprietes, enfants) {
    const e = document.createElement(balise);
    for (const [k, v] of Object.entries(proprietes || {})) {
      if (k === "texte") e.textContent = v;
      else if (k === "classe") e.className = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const c of enfants || []) if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return e;
  }

  /* =========================================================================
   * Mode kit / vitrine et stockage des données de l’utilisateur
   * ========================================================================= */
  const kit = { actif: false, info: null };

  async function detecterKit() {
    if (!/^https?:$/.test(location.protocol)) return;
    try {
      const r = await fetch("api/etat", { cache: "no-store" });
      if (!r.ok) throw new Error();
      const e = await r.json();
      if (e && e.kit) {
        kit.actif = true;
        kit.info = e;
      }
    } catch (e) {
      kit.actif = false;
    }
  }

  const Stockage = {
    async lire(nom) {
      if (kit.actif) {
        const r = await fetch("api/donnees/" + encodeURIComponent(nom), { cache: "no-store" });
        if (r.status === 404) return null;
        if (!r.ok) throw new Error("lecture impossible (" + r.status + ")");
        const t = await r.text();
        return /\.json$|\.enc$/.test(nom) ? JSON.parse(t) : t;
      }
      return Stockage.memoire[nom] == null ? null : JSON.parse(JSON.stringify(Stockage.memoire[nom]));
    },
    async ecrire(nom, valeur) {
      if (kit.actif) {
        const corps = typeof valeur === "string" ? valeur : JSON.stringify(valeur);
        const r = await fetch("api/donnees/" + encodeURIComponent(nom), {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream", "X-Kit": "1" },
          body: corps
        });
        if (!r.ok) throw new Error("écriture impossible dans le dossier « donnees » (" + r.status + ")");
        return;
      }
      // Vitrine : rien n’est écrit durablement (aucune donnée personnelle dans le navigateur).
      Stockage.memoire[nom] = typeof valeur === "string" ? valeur : JSON.parse(JSON.stringify(valeur));
    },
    async supprimer(nom) {
      if (kit.actif) {
        const r = await fetch("api/donnees/" + encodeURIComponent(nom), { method: "DELETE", headers: { "X-Kit": "1" } });
        if (!r.ok && r.status !== 404) throw new Error("suppression impossible (" + r.status + ")");
        return;
      }
      delete Stockage.memoire[nom];
    },
    memoire: {}
  };

  const minuteriesMiroir = {};
  function miroir(nom, valeur) {
    if (!kit.actif) return;
    clearTimeout(minuteriesMiroir[nom]);
    minuteriesMiroir[nom] = setTimeout(() => Stockage.ecrire(nom, valeur).catch((e) => toast("Sauvegarde : " + e.message)), 600);
  }

  /* Journal local horodaté (sans aucune valeur personnelle), purgeable. */
  let lignesJournal = [];
  function journal(message) {
    const ligne = new Date().toISOString() + "  " + message;
    lignesJournal.push(ligne);
    if (lignesJournal.length > 3000) lignesJournal = lignesJournal.slice(-3000);
    $("journal-anon").textContent = lignesJournal.slice(-200).join("\n");
    miroir("journal.log", lignesJournal.join("\n") + "\n");
  }

  /* =========================================================================
   * Boîtes de dialogue
   * ========================================================================= */
  const dialogue = $("dialogue");
  function ouvrirDialogue(titre, construire) {
    return new Promise((resoudre) => {
      $("dialogue-titre").textContent = titre;
      const corps = $("dialogue-corps");
      const boutons = $("dialogue-boutons");
      corps.innerHTML = "";
      boutons.innerHTML = "";
      let termine = false;
      const fermer = (valeur) => {
        if (termine) return;
        termine = true;
        dialogue.close();
        resoudre(valeur);
      };
      dialogue.oncancel = (ev) => {
        ev.preventDefault();
        fermer(null);
      };
      construire(corps, boutons, fermer);
      if (typeof dialogue.showModal === "function") dialogue.showModal();
      else dialogue.setAttribute("open", "");
      const premier = corps.querySelector("input, textarea") || boutons.querySelector("button");
      if (premier) premier.focus();
    });
  }
  function boutonDialogue(texte, classe, action) {
    return el("button", { type: "button", classe: classe || "", texte, onclick: action });
  }

  /** Confirmation simple, avec case à cocher facultative. */
  function confirmer(o) {
    return ouvrirDialogue(o.titre, (corps, boutons, fermer) => {
      corps.appendChild(el("p", { texte: o.texte }));
      let caseEl = null;
      if (o.caseACocher) {
        caseEl = el("input", { type: "checkbox", id: "dialogue-case" });
        corps.appendChild(el("label", { classe: "case", for: "dialogue-case" }, [caseEl, " " + o.caseACocher]));
      }
      const ok = boutonDialogue(o.bouton || "Confirmer", "principal", () => fermer(true));
      if (caseEl) {
        ok.disabled = true;
        caseEl.addEventListener("change", () => (ok.disabled = !caseEl.checked));
      }
      boutons.append(boutonDialogue("Annuler", "doux", () => fermer(false)), ok);
    }).then(Boolean);
  }

  /** Confirmation en deux étapes : explication + case à cocher, puis saisie d’un mot de confirmation. */
  async function confirmer2Etapes(o) {
    const etape1 = await confirmer({ titre: o.titre + " — étape 1 sur 2", texte: o.etape1, caseACocher: o.caseACocher, bouton: "Continuer" });
    if (!etape1) return false;
    return ouvrirDialogue(o.titre + " — étape 2 sur 2", (corps, boutons, fermer) => {
      corps.appendChild(el("p", { texte: "Pour confirmer, saisissez le mot « " + o.motConfirmation + " » puis validez. Cette action ne pourra pas être annulée." }));
      const champ = el("input", { type: "text", id: "dialogue-mot", autocomplete: "off", "aria-label": "Mot de confirmation" });
      corps.appendChild(champ);
      const ok = boutonDialogue(o.bouton || "Confirmer", "danger", () => fermer(true));
      ok.disabled = true;
      champ.addEventListener("input", () => (ok.disabled = champ.value.trim().toUpperCase() !== o.motConfirmation.toUpperCase()));
      boutons.append(boutonDialogue("Annuler", "doux", () => fermer(false)), ok);
    }).then(Boolean);
  }

  /** Saisie de champs (phrase de passe, texte…) ; renvoie un objet ou null. */
  function saisir(o) {
    return ouvrirDialogue(o.titre, (corps, boutons, fermer) => {
      if (o.texte) corps.appendChild(el("p", { texte: o.texte }));
      const champs = {};
      for (const c of o.champs) {
        const id = "dialogue-" + c.nom;
        const entree = c.type === "textarea" ? el("textarea", { id, rows: "8" }) : el("input", { id, type: c.type || "text", autocomplete: "off" });
        champs[c.nom] = entree;
        corps.appendChild(el("div", { classe: "champ" }, [el("label", { for: id, texte: c.libelle }), entree]));
      }
      boutons.append(
        boutonDialogue("Annuler", "doux", () => fermer(null)),
        boutonDialogue(o.bouton || "Valider", "principal", () => {
          const res = {};
          for (const [k, v] of Object.entries(champs)) res[k] = v.value;
          fermer(res);
        })
      );
    });
  }

  /** Mode « abonnement » : texte à copier dans le service d’IA, puis réponse à coller. */
  function dialogueAbonnement(texte, titre) {
    return ouvrirDialogue(titre || "Analyse par abonnement", (corps, boutons, fermer) => {
      corps.appendChild(
        el("ol", { classe: "etapes" }, [
          el("li", { texte: "Copiez le texte ci-dessous (bouton « Copier »)." }),
          el("li", { texte: "Collez-le dans une nouvelle conversation de votre service d’IA (Le Chat, ChatGPT, Claude…) et envoyez-le." }),
          el("li", { texte: "Copiez la réponse complète du service (le JSON) et collez-la dans le second cadre, puis « Importer la réponse »." })
        ])
      );
      const source = el("textarea", { rows: "8", readonly: "readonly", "aria-label": "Texte à copier" });
      source.value = texte;
      const copier = boutonDialogue("Copier le texte", "petit", async () => {
        try {
          await navigator.clipboard.writeText(texte);
          copier.textContent = "✓ Copié";
        } catch (e) {
          source.select();
          document.execCommand("copy");
          copier.textContent = "✓ Copié";
        }
      });
      const reponse = el("textarea", { rows: "8", "aria-label": "Réponse du service à coller" });
      reponse.placeholder = "Collez ici la réponse JSON du service…";
      corps.append(source, el("div", { classe: "boutons" }, [copier]), el("label", { texte: "Réponse du service :" }), reponse);
      boutons.append(boutonDialogue("Annuler", "doux", () => fermer(null)), boutonDialogue("Importer la réponse", "principal", () => fermer(reponse.value)));
    });
  }

  /* =========================================================================
   * Onglets
   * ========================================================================= */
  const ONGLETS = ["accueil", "anonymiser", "analyse", "export", "installation", "guide"];
  function activerOnglet(nom, focus) {
    if (!ONGLETS.includes(nom)) nom = "accueil";
    for (const n of ONGLETS) {
      const actif = n === nom;
      const onglet = $("onglet-" + n);
      onglet.setAttribute("aria-selected", String(actif));
      onglet.tabIndex = actif ? 0 : -1;
      $("panneau-" + n).hidden = !actif;
      if (actif && focus) onglet.focus();
      if (actif && onglet.scrollIntoView) onglet.scrollIntoView({ block: "nearest", inline: "nearest" }); // petits écrans
    }
    if (location.hash !== "#" + nom) history.replaceState(null, "", "#" + nom);
    if (nom === "installation") chargerInstallation();
    if (nom === "guide") chargerGuideUsage();
    if (nom === "export") majResumeExport();
    if (nom === "anonymiser") majIndicateurLocal();
    if (nom === "accueil") majEtat();
  }
  $("liste-onglets").addEventListener("click", (ev) => {
    const b = ev.target.closest("[role=tab]");
    if (b) activerOnglet(b.id.replace("onglet-", ""));
  });
  $("liste-onglets").addEventListener("keydown", (ev) => {
    const i = ONGLETS.indexOf(document.activeElement.id.replace("onglet-", ""));
    if (i < 0) return;
    let j = null;
    if (ev.key === "ArrowRight") j = (i + 1) % ONGLETS.length;
    if (ev.key === "ArrowLeft") j = (i - 1 + ONGLETS.length) % ONGLETS.length;
    if (ev.key === "Home") j = 0;
    if (ev.key === "End") j = ONGLETS.length - 1;
    if (j !== null) {
      ev.preventDefault();
      activerOnglet(ONGLETS[j], true);
    }
  });
  document.querySelectorAll("[data-aller]").forEach((b) => b.addEventListener("click", () => activerOnglet(b.dataset.aller, true)));

  /* =========================================================================
   * Accueil : état du poste
   * ========================================================================= */
  let diagnostic = null;

  function majBadgeLocal() {
    const b = $("badge-local");
    if (kit.actif && !kit.info.ia_externe) {
      b.textContent = "✓ 100 % local / hors ligne";
      b.className = "badge badge-ok";
    } else if (kit.actif) {
      b.textContent = "Kit local · IA externe autorisée";
      b.className = "badge badge-attention";
    } else {
      b.textContent = "Vitrine en ligne (démonstration)";
      b.className = "badge badge-attention";
    }
  }

  async function majEtat() {
    const v = window.VERSION_KIT || { numero: "?", date: "" };
    $("version-kit").textContent = "version " + v.numero;
    $("etat-version").textContent = v.numero + " (" + v.date + ")" + (kit.actif && kit.info.version && kit.info.version !== v.numero ? " — attention : le serveur annonce " + kit.info.version : "");
    $("etat-mode").textContent = kit.actif
      ? "Kit local (serveur " + (kit.info.serveur || "local") + ", http://" + location.host + ")"
      : "Vitrine en ligne : démonstration uniquement, pas de traitement de données personnelles";
    $("etat-horsligne").textContent = kit.actif
      ? kit.info.ia_externe
        ? "Limitées à ce poste et aux services d’IA externes autorisés : " + (kit.info.hotes_externes || []).join(", ")
        : "✓ Bloquées : le navigateur n’autorise que ce poste (localhost). Hors ligne garanti."
      : "Non contrôlées (page servie depuis Internet)";
    $("etat-externe").textContent = kit.actif ? (kit.info.ia_externe ? "Autorisée (données anonymisées et validées uniquement)" : "Désactivée (protection par défaut)") : "—";
    const ia = IA();
    if (ia) {
      const e = ia.etat;
      $("etat-ollama").textContent = e.ollamaDetecte ? "✓ Détecté à " + e.ollama.url : "✗ Non détecté — voir l’onglet « Installation »";
      let charge = "";
      if (e.ollamaDetecte) {
        try {
          const r = await fetch(e.ollama.url.replace(/\/+$/, "") + "/api/ps");
          const d = await r.json();
          const noms = (d.models || []).map((m) => m.name);
          charge = noms.length ? " — en mémoire : " + noms.join(", ") : " — aucun modèle en mémoire pour l’instant";
        } catch (err) {
          /* sans importance */
        }
      }
      $("etat-modele").textContent = (e.ollama.modele || "aucun modèle choisi") + charge;
    }
    const rec = recommander(diagnostic);
    $("etat-config").textContent = diagnostic
      ? describeDiag(diagnostic) + (rec ? " → modèle conseillé : " + rec.modele + " (" + rec.libelle + ")" : "")
      : kit.actif
        ? "Diagnostic non disponible : relancez le kit avec le script de démarrage."
        : "Disponible dans le kit local (script de diagnostic).";
    majBadgeLocal();
  }
  function describeDiag(d) {
    const parts = [d.systeme || "système inconnu"];
    if (d.ram_go) parts.push(d.ram_go + " Go de RAM");
    if (d.apple_silicon) parts.push("puce Apple (mémoire unifiée)");
    else if (d.gpu) parts.push(d.gpu + (d.vram_go ? " (" + d.vram_go + " Go de VRAM)" : ""));
    return parts.join(", ");
  }
  $("btn-actualiser-etat").addEventListener("click", async () => {
    if (IA()) await IA().chargerModelesOllama(true);
    if (IA()) IA().mettreAJourBadgeIA();
    await majEtat();
    majIndicateurLocal();
  });

  /* =========================================================================
   * Anonymiser / Pseudonymiser
   * ========================================================================= */
  const DOSSIER = "dossier.json";
  const TABLE = "correspondance.enc";
  let dossier = null; // { version, cree, mode, options, observations: [], resultats: {}, sondage: [], compteur }
  let table = null; // Anonymisation.Correspondance (en mémoire)
  let phrasePasse = null; // jamais stockée
  let traitementEnCours = false;
  let arretDemande = false;

  function modeChoisi() {
    return document.querySelector("input[name=mode-traitement]:checked").value;
  }
  function majAvertissementMode() {
    const mode = dossier && Object.keys(dossier.resultats).length ? dossier.mode : modeChoisi();
    $("avertissement-mode").textContent = A.AVERTISSEMENTS[mode];
    $("avertissement-mode").className = "avertissement-rgpd " + (mode === "anonymisation" ? "irreversible" : "");
    $("options-pseudo").hidden = mode !== "pseudonymisation";
    $("options-anon").hidden = mode !== "anonymisation";
    $("bloc-phrase").hidden = !$("conserver-table").checked;
    const verrou = Boolean(dossier && Object.keys(dossier.resultats).length);
    document.querySelectorAll("input[name=mode-traitement]").forEach((r) => {
      r.disabled = verrou;
      if (verrou) r.checked = r.value === dossier.mode;
    });
    $("conserver-table").disabled = verrou;
    $("generaliser-date-depot").disabled = verrou;
  }
  document.querySelectorAll("input[name=mode-traitement]").forEach((r) => r.addEventListener("change", majAvertissementMode));
  $("conserver-table").addEventListener("change", majAvertissementMode);

  function majIndicateurLocal() {
    const ia = IA();
    const ind = $("indicateur-local");
    const pret = ia && ia.ollamaPret();
    $("moteur-anon").value = ia ? (ia.etat.ollama.modele ? "Ollama · " + ia.etat.ollama.modele + " (" + ia.etat.ollama.url + ")" : "Ollama : aucun modèle") : "—";
    if (!kit.actif) {
      ind.textContent = "Vitrine : traitement réservé au kit local";
      ind.className = "badge badge-attention";
    } else if (pret && !kit.info.ia_externe) {
      ind.textContent = "✓ 100 % local / hors ligne";
      ind.className = "badge badge-ok";
    } else if (pret) {
      ind.textContent = "✓ Traitement 100 % local (Ollama sur ce poste)";
      ind.className = "badge badge-ok";
    } else {
      ind.textContent = "✗ Ollama non prêt — voir « Installation »";
      ind.className = "badge badge-erreur";
    }
    $("btn-importer").disabled = !kit.actif;
    $("btn-importer").title = kit.actif ? "" : "Import de fichiers réservé au kit local (protection des données)";
  }

  async function sauverDossier() {
    if (!dossier) return;
    if (table && !(dossier.options.tableConservee && phrasePasse)) dossier.compteur = table.compteur;
    await Stockage.ecrire(DOSSIER, dossier);
    if (table && dossier.options.tableConservee && phrasePasse) {
      await Stockage.ecrire(TABLE, await window.Chiffrement.chiffrer(table.toJSON(), phrasePasse));
    }
  }

  function afficherImport() {
    const n = dossier ? dossier.observations.length : 0;
    $("resume-import").hidden = !dossier;
    $("apercu-import").hidden = !n;
    if (!dossier) return;
    const traitees = Object.keys(dossier.resultats).length;
    $("resume-import").textContent =
      "✓ " + n + " observation" + (n > 1 ? "s" : "") + " dans le dossier de travail" + (dossier.source ? " (« " + dossier.source + " »)" : "") +
      (traitees ? " — " + traitees + " déjà traitée" + (traitees > 1 ? "s" : "") + " en " + dossier.mode : "") + ".";
    $("resume-import").className = "retour retour-ok";
    const corps = $("corps-apercu");
    corps.innerHTML = "";
    for (const o of dossier.observations.slice(0, 5)) {
      corps.appendChild(el("tr", {}, [el("th", { scope: "row", texte: o.reference }), el("td", { texte: o.date }), el("td", { texte: o.objet }), el("td", { texte: o.texte.slice(0, 90) + (o.texte.length > 90 ? "…" : "") })]));
    }
    $("btn-traiter").textContent = traitees && traitees < n ? "Reprendre le traitement (" + (n - traitees) + " restantes)" : traitees >= n && n ? "✓ Toutes les observations sont traitées" : "Lancer le traitement";
    $("btn-traiter").disabled = !n || traitees >= n;
  }

  async function chargerFichierObservations(nom, contenu) {
    let obs;
    try {
      obs = F.importerObservations(nom, contenu);
    } catch (e) {
      toast("Import impossible : " + e.message);
      return;
    }
    if (!obs.length) {
      toast("Aucune observation trouvée dans ce fichier");
      return;
    }
    if (dossier && Object.keys(dossier.resultats).length) {
      const ok = await confirmer({
        titre: "Remplacer le dossier de travail",
        texte: "Un dossier est déjà en cours (" + Object.keys(dossier.resultats).length + " observations traitées). L’importer remplace le dossier et ses résultats. Exportez-les d’abord si nécessaire.",
        bouton: "Remplacer"
      });
      if (!ok) return;
    }
    dossier = { version: 1, cree: new Date().toISOString(), source: nom, mode: modeChoisi(), options: {}, observations: obs, resultats: {}, sondage: [], compteur: 0 };
    table = new A.Correspondance();
    phrasePasse = null;
    await sauverDossier();
    journal("Import : " + obs.length + " observations (fichier " + nom.replace(/[^\w.-]/g, "_") + ")");
    majAvertissementMode();
    afficherImport();
    rendreRapport();
  }

  $("btn-importer").addEventListener("click", () => $("fichier-observations").click());
  $("fichier-observations").addEventListener("change", async (ev) => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (f) await chargerFichierObservations(f.name, await f.text());
  });
  $("btn-exemple-fictif").addEventListener("click", async () => {
    try {
      const r = await fetch("exemples/observations-fictives.csv", { cache: "no-store" });
      await chargerFichierObservations("observations-fictives.csv", await r.text());
    } catch (e) {
      toast("Jeu d’exemple introuvable");
    }
  });

  async function preparerTable() {
    if (dossier.mode !== "pseudonymisation") {
      table = table || new A.Correspondance();
      return true;
    }
    if (dossier.options.tableConservee) {
      if (table && phrasePasse) return true;
      // Reprise : déchiffrer le tableau existant.
      const env = await Stockage.lire(TABLE);
      if (!env) {
        table = new A.Correspondance();
        return true;
      }
      const s = await saisir({ titre: "Reprise de la pseudonymisation", texte: "Saisissez la phrase de passe du tableau de correspondance pour conserver des pseudonymes stables.", champs: [{ nom: "phrase", libelle: "Phrase de passe", type: "password" }], bouton: "Déchiffrer" });
      if (!s) return false;
      try {
        table = new A.Correspondance(await window.Chiffrement.dechiffrer(env, s.phrase));
        phrasePasse = s.phrase;
        return true;
      } catch (e) {
        toast(e.message);
        return false;
      }
    }
    table = table || new A.Correspondance({ compteur: dossier.compteur || 0 });
    return true;
  }

  $("btn-traiter").addEventListener("click", async () => {
    if (traitementEnCours || !dossier) return;
    const ia = IA();
    if (!kit.actif) {
      toast("Le traitement de données personnelles est réservé au kit local.");
      return;
    }
    if (!ia || !ia.ollamaPret()) {
      const aller = await confirmer({ titre: "Ollama n’est pas prêt", texte: "Le traitement s’exécute uniquement avec Ollama sur ce poste. Ollama n’est pas détecté ou aucun modèle n’est choisi.", bouton: "Voir l’installation" });
      if (aller) activerOnglet("installation");
      return;
    }
    const premiereFois = !Object.keys(dossier.resultats).length;
    if (premiereFois) {
      dossier.mode = modeChoisi();
      if (dossier.mode === "anonymisation") {
        const ok = await confirmer2Etapes({
          titre: "Anonymisation irréversible",
          etape1: A.AVERTISSEMENTS.anonymisation,
          caseACocher: "J’ai conservé une copie du fichier original dans un espace sécurisé.",
          motConfirmation: "ANONYMISER",
          bouton: "Lancer l’anonymisation"
        });
        if (!ok) return;
        dossier.options = { generaliserDateDepot: $("generaliser-date-depot").checked };
      } else {
        dossier.options = { tableConservee: $("conserver-table").checked };
        if (dossier.options.tableConservee) {
          const p1 = $("phrase-passe").value;
          if (p1 !== $("phrase-passe-2").value) {
            toast("Les deux phrases de passe ne correspondent pas");
            return;
          }
          try {
            window.Chiffrement.verifierPhrase(p1);
          } catch (e) {
            toast(e.message);
            return;
          }
          phrasePasse = p1;
          $("phrase-passe").value = $("phrase-passe-2").value = "";
        }
        table = new A.Correspondance();
      }
      majAvertissementMode();
    }
    if (!(await preparerTable())) return;

    const restantes = dossier.observations.filter((o) => !dossier.resultats[o.reference]);
    const taille = parseInt($("taille-lot").value, 10);
    traitementEnCours = true;
    arretDemande = false;
    $("btn-traiter").disabled = true;
    $("btn-traiter-stop").hidden = false;
    $("progression-anon").hidden = false;
    const modele = ia.etat.ollama.modele;
    journal("Début du traitement : mode " + dossier.mode + ", modèle " + modele + ", " + restantes.length + " observations, lots de " + taille);
    let faites = 0;
    let erreurs = 0;
    const total = dossier.observations.length;
    try {
      for (let i = 0; i < restantes.length && !arretDemande; i += taille) {
        const lot = restantes.slice(i, i + taille);
        let douteux = 0;
        for (const o of lot) {
          if (arretDemande) break;
          const deja = Object.keys(dossier.resultats).length;
          $("remplissage-anon").style.width = Math.round((100 * deja) / total) + "%";
          $("texte-progression-anon").textContent =
            "Lot " + (Math.floor(i / taille) + 1) + " / " + Math.ceil(restantes.length / taille) + " — " + o.reference + " (" + (deja + 1) + " / " + total + ") : détection, remplacement, contrôle qualité…";
          try {
            const r = await A.traiterObservation(o, {
              mode: dossier.mode,
              appelModele: (m, opt) => ia.appelLocal(m, opt),
              table,
              generaliserDateDepot: dossier.options.generaliserDateDepot !== false
            });
            r.modele = modele;
            dossier.resultats[o.reference] = r;
            faites += 1;
            if (r.statut === "a_verifier") douteux += 1;
          } catch (e) {
            erreurs += 1;
            journal("Erreur sur " + o.reference + " : " + String(e.message || e).slice(0, 160));
            if (/injoignable|refusé|introuvable/i.test(e.message || "")) {
              arretDemande = true;
              toast("Traitement interrompu : " + e.message);
            }
          }
        }
        await sauverDossier();
        journal("Lot terminé : " + lot.length + " observations, " + douteux + " à vérifier");
        rendreRapport();
      }
    } finally {
      traitementEnCours = false;
      $("btn-traiter-stop").hidden = true;
      $("remplissage-anon").style.width = Math.round((100 * Object.keys(dossier.resultats).length) / total) + "%";
      $("texte-progression-anon").textContent =
        (arretDemande ? "Interrompu" : "Terminé") + " : " + faites + " observation(s) traitée(s)" + (erreurs ? ", " + erreurs + " erreur(s) (voir le journal)" : "") +
        ". Total : " + Object.keys(dossier.resultats).length + " / " + total + ".";
      journal((arretDemande ? "Traitement interrompu" : "Traitement terminé") + " : " + faites + " traitées, " + erreurs + " erreurs");
      await sauverDossier().catch(() => {});
      afficherImport();
      rendreRapport();
    }
  });
  $("btn-traiter-stop").addEventListener("click", () => {
    arretDemande = true;
    $("texte-progression-anon").textContent = "Interruption à la fin de l’observation en cours…";
  });

  /* ---------- Rapport ---------- */
  function resultatsListe() {
    return dossier ? dossier.observations.map((o) => dossier.resultats[o.reference]).filter(Boolean) : [];
  }
  function rapportCourant() {
    return A.rapport(resultatsListe(), {
      mode: dossier.mode,
      modele: (resultatsListe()[0] || {}).modele || "",
      nbImportees: dossier.observations.length,
      tableConservee: Boolean(dossier.options.tableConservee)
    });
  }
  function rendreRapport() {
    const liste = resultatsListe();
    $("section-rapport").hidden = !liste.length;
    if (!liste.length) return;
    const r = rapportCourant();
    const zone = $("rapport-anon");
    zone.innerHTML = "";
    zone.appendChild(
      el("dl", { classe: "grille-etat" }, [
        el("div", {}, [el("dt", { texte: "Mode" }), el("dd", { texte: r.mode })]),
        el("div", {}, [el("dt", { texte: "Observations traitées" }), el("dd", { texte: r.observationsTraitees + " / " + r.observationsImportees })]),
        el("div", {}, [el("dt", { texte: "Entités remplacées" }), el("dd", { texte: String(r.entitesRemplacees) })]),
        el("div", {}, [el("dt", { texte: "À vérifier" }), el("dd", { texte: String(r.aVerifier) })]),
        el("div", {}, [el("dt", { texte: "Validées" }), el("dd", { texte: String(r.validees) })]),
        el("div", {}, [el("dt", { texte: "Tableau de correspondance" }), el("dd", { texte: r.tableauCorrespondance })])
      ])
    );
    if (r.parType.length) {
      const tb = el("tbody");
      for (const t of r.parType) tb.appendChild(el("tr", {}, [el("th", { scope: "row", texte: t.libelle }), el("td", { texte: String(t.nombre) })]));
      zone.appendChild(el("div", { classe: "tableau-conteneur" }, [el("table", {}, [el("thead", {}, [el("tr", {}, [el("th", { scope: "col", texte: "Type d’élément" }), el("th", { scope: "col", texte: "Remplacements" })])]), tb])]));
    }
    if (r.quasiIdentifiantsConserves) {
      zone.appendChild(el("p", { classe: "note-normale", texte: "Pseudonymisation : " + r.quasiIdentifiantsConserves + " quasi-identifiant(s) (fonction, date, parcelle, lieu, santé…) ont été volontairement conservés. Les données restent personnelles." }));
    }
    rendreRelecture();
  }
  $("btn-rapport-json").addEventListener("click", () => telecharger("rapport-traitement-" + dateFichier() + ".json", JSON.stringify(rapportCourant(), null, 2), "application/json"));
  $("btn-rapport-txt").addEventListener("click", () => {
    const r = rapportCourant();
    const l = [
      "RAPPORT DE TRAITEMENT — " + (r.mode === "anonymisation" ? "ANONYMISATION IRRÉVERSIBLE" : "PSEUDONYMISATION"),
      "Date : " + horodatage(),
      "Modèle local : " + r.modele,
      "Observations traitées : " + r.observationsTraitees + " / " + r.observationsImportees,
      "Entités remplacées : " + r.entitesRemplacees,
      "À vérifier : " + r.aVerifier + " ; validées : " + r.validees,
      "Tableau de correspondance : " + r.tableauCorrespondance,
      "",
      "Détail par type :"
    ].concat(r.parType.map((t) => "  - " + t.libelle + " : " + t.nombre));
    if (r.quasiIdentifiantsConserves) l.push("", "Quasi-identifiants conservés (pseudonymisation) : " + r.quasiIdentifiantsConserves);
    l.push("", "Ce rapport ne contient aucune donnée personnelle.");
    telecharger("rapport-traitement-" + dateFichier() + ".txt", "﻿" + l.join("\r\n"), "text/plain;charset=utf-8");
  });

  /* ---------- Relecture humaine ---------- */
  function texteSurligne(texte, residus) {
    const frag = document.createDocumentFragment();
    const t = String(texte || "");
    const zones = [];
    for (const r of residus || []) {
      const n = A.normaliser(r.valeur);
      const tl = A.normaliser(t);
      // Les longueurs sont préservées par normaliser() sauf espaces multiples : recherche simple.
      let i = t.toLowerCase().indexOf(r.valeur.toLowerCase());
      if (i < 0) i = tl.indexOf(n);
      while (i >= 0) {
        zones.push([i, i + r.valeur.length]);
        i = t.toLowerCase().indexOf(r.valeur.toLowerCase(), i + 1);
      }
    }
    zones.sort((a, b) => a[0] - b[0]);
    let pos = 0;
    for (const [a, b] of zones) {
      if (a < pos) continue;
      frag.appendChild(document.createTextNode(t.slice(pos, a)));
      frag.appendChild(el("mark", { texte: t.slice(a, b) }));
      pos = b;
    }
    frag.appendChild(document.createTextNode(t.slice(pos)));
    return frag;
  }

  const LIBELLES_STATUT = { a_verifier: "À vérifier", traitee: "Traitée — à valider", validee: "Validée" };

  function rendreRelecture() {
    const zone = $("liste-relecture");
    zone.innerHTML = "";
    const filtre = $("filtre-relecture").value;
    let liste = resultatsListe();
    if (filtre === "sondage") liste = liste.filter((r) => (dossier.sondage || []).includes(r.reference));
    else if (filtre !== "toutes") liste = liste.filter((r) => r.statut === filtre);
    if (!liste.length) {
      zone.appendChild(el("p", { classe: "note-normale", texte: "Aucune observation dans cette catégorie." }));
      return;
    }
    for (const r of liste.slice(0, 100)) zone.appendChild(carteRelecture(r));
    if (liste.length > 100) zone.appendChild(el("p", { classe: "note-normale", texte: "100 premières observations affichées sur " + liste.length + "." }));
  }
  $("filtre-relecture").addEventListener("change", rendreRelecture);

  function carteRelecture(r) {
    const original = dossier.observations.find((o) => o.reference === r.reference) || {};
    const carte = el("article", { classe: "carte-relecture statut-" + r.statut });
    carte.appendChild(
      el("div", { classe: "carte-entete" }, [
        el("h3", { texte: r.reference + (r.auteur ? " — " + r.auteur : "") }),
        el("span", { classe: "badge " + (r.statut === "validee" ? "badge-ia" : r.statut === "a_verifier" ? "badge-demo" : "badge-neutre-clair"), texte: LIBELLES_STATUT[r.statut] })
      ])
    );
    if (r.objet) carte.appendChild(el("p", { classe: "objet-observation" }, [document.createTextNode("Objet : "), texteSurligne(r.objet, r.residus)]));
    const bloc = el("div", { classe: "texte-observation" }, [texteSurligne(r.texte, r.residus)]);
    carte.appendChild(bloc);

    if (r.residus && r.residus.length) {
      const ul = el("ul", { classe: "residus" });
      for (const x of r.residus) {
        ul.appendChild(
          el("li", {}, [
            el("strong", { texte: x.valeur }),
            " — " + ((A.TYPES[x.type] || A.TYPES.AUTRE).libelle) + (x.raison ? " : " + x.raison : "") + " ",
            boutonPetit("Masquer", async () => {
              if (!table && !(await preparerTable())) return;
              A.masquerTerme(r, x.valeur, x.type, table);
              journal("Relecture " + r.reference + " : élément masqué (" + x.type + ")");
              await apresRelecture();
            }),
            boutonPetit("Ce n’est pas identifiant", async () => {
              r.residus = r.residus.filter((y) => y !== x);
              if (!r.residus.length && r.statut === "a_verifier") r.statut = "traitee";
              journal("Relecture " + r.reference + " : signalement écarté (" + x.type + ")");
              await apresRelecture();
            }, "doux")
          ])
        );
      }
      carte.appendChild(ul);
    }
    const actions = el("div", { classe: "boutons" });
    actions.appendChild(
      boutonPetit("Masquer un autre terme…", async () => {
        const s = await saisir({ titre: "Masquer un terme dans " + r.reference, champs: [{ nom: "terme", libelle: "Terme exact à masquer (toutes ses occurrences)" }], bouton: "Masquer" });
        if (!s || !s.terme.trim()) return;
        if (!table && !(await preparerTable())) return;
        const n = A.masquerTerme(r, s.terme.trim(), "AUTRE", table);
        toast(n + " occurrence(s) masquée(s)");
        journal("Relecture " + r.reference + " : terme masqué manuellement (" + n + " occurrence(s))");
        await apresRelecture();
      })
    );
    actions.appendChild(
      boutonPetit("Modifier le texte…", async () => {
        const s = await ouvrirDialogue("Modifier le texte traité — " + r.reference, (corps, boutons, fermer) => {
          const zoneTexte = el("textarea", { rows: "12", "aria-label": "Texte traité" });
          zoneTexte.value = r.texte;
          corps.appendChild(zoneTexte);
          boutons.append(boutonDialogue("Annuler", "doux", () => fermer(null)), boutonDialogue("Enregistrer", "principal", () => fermer(zoneTexte.value)));
        });
        if (s == null) return;
        r.texte = s;
        r.residus = A.validerResidus({ residus: [] }, s, r.mode);
        r.statut = r.residus.length ? "a_verifier" : "traitee";
        journal("Relecture " + r.reference + " : texte modifié manuellement");
        await apresRelecture();
      })
    );
    const voir = boutonPetit("Voir l’original", () => {
      const visible = carte.querySelector(".original");
      if (visible) {
        visible.remove();
        voir.textContent = "Voir l’original";
        return;
      }
      carte.insertBefore(el("div", { classe: "texte-observation original" }, [el("strong", { texte: "Original (nominatif, local) : " }), original.texte || ""]), actions);
      voir.textContent = "Masquer l’original";
    }, "doux");
    actions.appendChild(voir);
    if (r.statut !== "validee") {
      const b = boutonPetit("✓ Valider cette observation", async () => {
        if (r.residus && r.residus.length) {
          const ok = await confirmer({ titre: "Valider malgré des signalements", texte: "Des éléments restent signalés. Vous les avez relus et jugés non identifiants ?", caseACocher: "Oui, j’ai relu cette observation et elle ne permet plus d’identifier une personne.", bouton: "Valider" });
          if (!ok) return;
          r.residus = [];
        }
        r.statut = "validee";
        journal("Relecture " + r.reference + " : observation validée");
        await apresRelecture();
      }, "principal");
      actions.appendChild(b);
    } else {
      actions.appendChild(
        boutonPetit("Retirer la validation", async () => {
          r.statut = "traitee";
          journal("Relecture " + r.reference + " : validation retirée");
          await apresRelecture();
        }, "doux")
      );
    }
    carte.appendChild(actions);
    return carte;
  }
  function boutonPetit(texte, action, classe) {
    return el("button", { type: "button", classe: "petit " + (classe || ""), texte, onclick: action });
  }
  async function apresRelecture() {
    await sauverDossier().catch((e) => toast(e.message));
    rendreRapport();
  }

  $("btn-valider-tout").addEventListener("click", async () => {
    const candidates = resultatsListe().filter((r) => r.statut === "traitee");
    if (!candidates.length) {
      toast("Aucune observation traitée sans résidu à valider");
      return;
    }
    const ok = await confirmer({
      titre: "Validation groupée",
      texte: candidates.length + " observation(s) n’ont aucun résidu signalé. La relecture humaine reste obligatoire : un modèle peut oublier un identifiant.",
      caseACocher: "J’ai relu ces observations (ou un échantillon par sondage) et elles ne permettent plus d’identifier une personne.",
      bouton: "Valider " + candidates.length + " observation(s)"
    });
    if (!ok) return;
    candidates.forEach((r) => (r.statut = "validee"));
    journal("Validation groupée : " + candidates.length + " observations");
    await apresRelecture();
  });

  $("btn-sondage").addEventListener("click", async () => {
    const pool = resultatsListe().filter((r) => r.statut !== "a_verifier").map((r) => r.reference);
    const tirage = [];
    while (pool.length && tirage.length < 5) tirage.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    dossier.sondage = tirage;
    journal("Contrôle par sondage : " + tirage.length + " observations tirées au hasard");
    $("filtre-relecture").value = "sondage";
    await apresRelecture();
  });

  /* ---------- Outils ---------- */
  $("btn-reidentifier").addEventListener("click", async () => {
    if (!dossier || dossier.mode !== "pseudonymisation" || !dossier.options.tableConservee) {
      toast("Réidentification impossible : aucun tableau de correspondance conservé.");
      return;
    }
    const s = await saisir({
      titre: "Réidentifier un texte pseudonymisé",
      texte: "Le résultat contient des données personnelles : ne le diffusez pas.",
      champs: [
        { nom: "phrase", libelle: "Phrase de passe du tableau", type: "password" },
        { nom: "texte", libelle: "Texte contenant des pseudonymes [PSEUDO-xx]", type: "textarea" }
      ],
      bouton: "Réidentifier"
    });
    if (!s) return;
    try {
      const env = await Stockage.lire(TABLE);
      if (!env) throw new Error("tableau de correspondance introuvable");
      const donnees = await window.Chiffrement.dechiffrer(env, s.phrase);
      const resultat = A.reidentifier(s.texte, donnees);
      journal("Réidentification effectuée (outil)");
      await ouvrirDialogue("Texte réidentifié", (corps, boutons, fermer) => {
        const z = el("textarea", { rows: "10", readonly: "readonly", "aria-label": "Texte réidentifié" });
        z.value = resultat;
        corps.append(el("p", { classe: "avertissement", texte: "Données personnelles : usage interne uniquement." }), z);
        boutons.append(boutonDialogue("Fermer", "principal", () => fermer(null)));
      });
    } catch (e) {
      toast(e.message);
    }
  });

  $("btn-detruire-table").addEventListener("click", async () => {
    const existe = kit.actif ? await Stockage.lire(TABLE).catch(() => null) : null;
    if (!existe && !(table && Object.keys(table.entrees).length)) {
      toast("Aucun tableau de correspondance à détruire.");
      return;
    }
    const ok = await confirmer2Etapes({
      titre: "Détruire le tableau de correspondance",
      etape1: "La destruction du tableau rend la réidentification définitivement impossible. À faire à la clôture du dossier. Les textes pseudonymisés restent des données personnelles.",
      caseACocher: "Je n’aurai plus besoin de réidentifier les auteurs des observations.",
      motConfirmation: "DÉTRUIRE",
      bouton: "Détruire"
    });
    if (!ok) return;
    await Stockage.supprimer(TABLE);
    if (table) table = new A.Correspondance({ compteur: table.compteur });
    phrasePasse = null;
    if (dossier) {
      dossier.options.tableConservee = false;
      dossier.compteur = table ? table.compteur : dossier.compteur;
      await sauverDossier();
    }
    journal("Tableau de correspondance détruit");
    toast("Tableau de correspondance détruit");
    rendreRapport();
  });

  $("btn-purger-dossier").addEventListener("click", async () => {
    const ok = await confirmer2Etapes({
      titre: "Purger le dossier de travail",
      etape1: "Le dossier de travail (observations originales importées, résultats, analyses du dossier, tableau de correspondance) sera supprimé de ce poste. Exportez d’abord ce que vous devez conserver.",
      caseACocher: "J’ai exporté ce que je dois conserver.",
      motConfirmation: "PURGER",
      bouton: "Purger"
    });
    if (!ok) return;
    for (const f of [DOSSIER, TABLE, "analyses-dossier.json"]) await Stockage.supprimer(f).catch(() => {});
    dossier = null;
    table = null;
    phrasePasse = null;
    if (IA()) {
      IA().chargerAnalyses("dossier", {});
      if (IA().sourceCourante() === "dossier") IA().changerSource("registre");
    }
    journal("Dossier de travail purgé");
    majAvertissementMode();
    afficherImport();
    rendreRapport();
    toast("Dossier de travail purgé");
  });

  $("btn-purger-journal").addEventListener("click", async () => {
    const ok = await confirmer({ titre: "Purger le journal", texte: "Le journal local du traitement sera effacé.", bouton: "Purger" });
    if (!ok) return;
    lignesJournal = [];
    $("journal-anon").textContent = "";
    await Stockage.supprimer("journal.log").catch(() => {});
  });

  /** Entrées du dossier (version traitée uniquement) pour l’onglet « Analyse ». */
  function entreesDossierPourAnalyse() {
    return resultatsListe().map((r) => ({
      id: r.reference,
      type: "ecrite",
      auteur: r.auteur,
      date: r.date,
      objet: r.objet,
      lieu: r.lieu,
      texte: r.texte,
      modeTraitement: r.mode,
      statutTraitement: r.statut
    }));
  }

  /* =========================================================================
   * Export des contributions
   * ========================================================================= */
  const COLONNES_CONTRIB = [
    { cle: "reference", titre: "Référence" },
    { cle: "date", titre: "Date" },
    { cle: "objet", titre: "Objet" },
    { cle: "texte", titre: "Texte" },
    { cle: "mode", titre: "Mode de traitement appliqué" },
    { cle: "pseudonyme", titre: "Pseudonyme de l’auteur" }
  ];
  const COLONNES_ANALYSES = [
    { cle: "reference", titre: "Référence" },
    { cle: "position", titre: "Position" },
    { cle: "themes", titre: "Thèmes" },
    { cle: "synthese", titre: "Synthèse neutre" },
    { cle: "demandes", titre: "Demandes explicites" },
    { cle: "questions", titre: "Questions au maître d’ouvrage" },
    { cle: "points", titre: "Points à vérifier" },
    { cle: "modele", titre: "Moteur et modèle" },
    { cle: "date", titre: "Date de l’analyse" }
  ];

  function donneesExport() {
    const source = $("export-source").value;
    const valides = $("export-valides").checked;
    const auteur = $("export-auteur").checked;
    let colonnes = COLONNES_CONTRIB.slice();
    let lignes = [];
    let nominatif = false;
    if (source === "registre") {
      lignes = (IA() ? IA().entreesRegistre() : []).map((e) => ({
        reference: e.id,
        date: e.date || "",
        objet: e.objet || "",
        texte: (e.contexte ? e.contexte + "\n\n" : "") + e.texte,
        mode: "anonymisation irréversible (registre)",
        pseudonyme: "",
        auteur: e.auteur || ""
      }));
    } else if (source === "dossier-traite") {
      lignes = resultatsListe()
        .filter((r) => !valides || r.statut === "validee")
        .map((r) => ({
          reference: r.reference,
          date: r.date,
          objet: r.objet,
          texte: r.texte,
          mode: r.mode + (r.statut === "validee" ? " (validée)" : " (non validée)"),
          pseudonyme: r.mode === "pseudonymisation" ? (r.auteur.match(/\[PSEUDO-\d+\]/g) || []).join(", ") : "",
          auteur: r.auteur
        }));
    } else if (source === "dossier-original") {
      nominatif = true;
      lignes = dossier
        ? dossier.observations.map((o) => ({ reference: o.reference, date: o.date, objet: o.objet, texte: o.texte, mode: "aucun (original nominatif)", pseudonyme: "", auteur: o.auteur }))
        : [];
    } else {
      const src = source === "analyses-dossier" ? "dossier" : "registre";
      const analyses = IA() ? IA().analysesDe(src) : {};
      colonnes = COLONNES_ANALYSES.slice();
      lignes = Object.values(analyses).map((a) => ({
        reference: a.reference,
        position: a.position,
        themes: (a.themes || []).join(" ; "),
        synthese: a.synthese,
        demandes: (a.demandes || []).join(" ; "),
        questions: (a.questions || []).join(" ; "),
        points: (a.points || []).join(" ; "),
        modele: a.modele || "",
        date: a.date || ""
      }));
      return { colonnes, lignes, nominatif: false, source };
    }
    if (auteur) colonnes.splice(2, 0, { cle: "auteur", titre: "Auteur" });
    return { colonnes, lignes, nominatif: nominatif || (auteur && source !== "registre" && lignes.some((l) => l.mode && /pseudonymisation|original/.test(l.mode))), source };
  }

  function majResumeExport() {
    const d = donneesExport();
    $("export-resume").textContent = d.lignes.length
      ? d.lignes.length + " ligne(s) à exporter, colonnes : " + d.colonnes.map((c) => c.titre).join(", ") + "." + (d.nominatif ? " ⚠ Données nominatives : confirmation requise." : "")
      : "Rien à exporter pour ce contenu.";
  }
  ["export-source", "export-valides", "export-auteur"].forEach((id) => $(id).addEventListener("change", majResumeExport));

  document.querySelectorAll("[data-format]").forEach((b) =>
    b.addEventListener("click", async () => {
      const d = donneesExport();
      if (!d.lignes.length) {
        toast("Rien à exporter");
        return;
      }
      if (d.nominatif) {
        const ok = await confirmer2Etapes({
          titre: "Export de données nominatives",
          etape1: "Le fichier contiendra des données personnelles (noms ou textes non anonymisés). Il ne doit être ni diffusé, ni chargé dans un service en ligne, et doit être conservé dans un espace sécurisé.",
          caseACocher: "Cet export est nécessaire et sera conservé de façon sécurisée.",
          motConfirmation: "NOMINATIF",
          bouton: "Exporter"
        });
        if (!ok) return;
      }
      const base = "contributions-" + d.source + "-" + dateFichier();
      const fmt = b.dataset.format;
      if (fmt === "csv") telecharger(base + ".csv", F.versCSV(d.colonnes, d.lignes), "text/csv;charset=utf-8");
      else if (fmt === "xlsx") telecharger(base + ".xlsx", new Blob([F.versXLSX(d.colonnes, d.lignes, "Contributions")], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      else if (fmt === "json") telecharger(base + ".json", F.versJSON(d.colonnes, d.lignes, { source: d.source, kit: (window.VERSION_KIT || {}).numero }), "application/json");
      else if (fmt === "txt") telecharger(base + ".txt", F.versTXTUnique(d.colonnes, d.lignes, "Contributions — " + d.source), "text/plain;charset=utf-8");
      else if (fmt === "txt-zip") telecharger(base + "-txt.zip", new Blob([F.versTXTMultiples(d.colonnes, d.lignes)], { type: "application/zip" }));
      journal("Export " + fmt.toUpperCase() + " : " + d.lignes.length + " lignes (" + d.source + (d.nominatif ? ", nominatif confirmé" : "") + ")");
      toast("Export " + fmt.toUpperCase() + " téléchargé");
    })
  );

  /* =========================================================================
   * Installation et guides
   * ========================================================================= */
  const guidesCharges = {};
  async function chargerGuide(fichier, cible, sommaire) {
    if (guidesCharges[fichier]) return;
    const zone = $(cible);
    try {
      const r = await fetch(fichier, { cache: "no-cache" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const md = await r.text();
      zone.innerHTML = "";
      const titres = window.Markdown.rendre(md, zone, {
        decalageTitres: 1,
        surLienInterne: (lien) => activerOnglet(/INSTALLATION/i.test(lien) ? "installation" : "guide", true)
      });
      if (sommaire) {
        const nav = $(sommaire);
        nav.innerHTML = "";
        const ul = el("ul");
        for (const t of titres.filter((x) => x.niveau === 2)) ul.appendChild(el("li", {}, [el("a", { href: "#" + t.id, texte: t.texte })]));
        nav.appendChild(el("details", {}, [el("summary", { texte: "Sommaire" }), ul]));
      }
      guidesCharges[fichier] = true;
    } catch (e) {
      zone.textContent = "Guide introuvable (" + fichier + ") : " + e.message;
    }
  }

  async function chargerInstallation() {
    await chargerGuide("docs/GUIDE_INSTALLATION.md", "guide-installation", "sommaire-installation");
    rendreDiagnostic();
  }

  function rendreDiagnostic() {
    const zone = $("diag-contenu");
    zone.innerHTML = "";
    if (!diagnostic) {
      zone.appendChild(
        el("p", {
          classe: "note-normale",
          texte: kit.actif
            ? "Aucun diagnostic : il est produit automatiquement par le script de démarrage (demarrer.bat / demarrer.command / demarrer.sh). Relancez le kit avec ce script."
            : "Le diagnostic de l’ordinateur est disponible dans le kit local (le navigateur ne peut pas lire la configuration de la machine)."
        })
      );
      return;
    }
    const d = diagnostic;
    const rec = recommander(d);
    const lignes = [
      ["Système", d.systeme],
      ["Processeur", d.processeur],
      ["Mémoire vive", d.ram_go ? d.ram_go + " Go" : "inconnue"],
      ["Carte graphique", d.apple_silicon ? "puce Apple — mémoire unifiée" : d.gpu || "aucune détectée"],
      ["Mémoire vidéo", d.apple_silicon ? "partagée avec la mémoire vive" : d.vram_go ? d.vram_go + " Go" + (d.vram_source ? " (" + d.vram_source + ")" : "") : "inconnue ou aucune"],
      ["Espace disque libre", d.disque_libre_go ? d.disque_libre_go + " Go" : "inconnu"],
      ["Ollama", d.ollama_installe ? "installé" + (d.ollama_version ? " (version " + d.ollama_version + ")" : "") + (d.ollama_actif ? ", en fonctionnement" : ", arrêté") : "non installé"],
      ["Modèles installés", (d.modeles || []).join(", ") || "aucun"],
      ["Diagnostic réalisé le", d.date]
    ];
    const tb = el("tbody");
    for (const [k, v] of lignes) tb.appendChild(el("tr", {}, [el("th", { scope: "row", texte: k }), el("td", { texte: String(v == null ? "" : v) })]));
    zone.appendChild(el("div", { classe: "tableau-conteneur" }, [el("table", {}, [tb])]));
    if (rec) {
      // « ministral-3:latest » désigne la variante 8b (vérifié sur ollama.com le 15/11/2026).
      const modeles = d.modeles || [];
      const installe = modeles.includes(rec.modele) || (rec.modele === "ministral-3:8b" && modeles.includes("ministral-3:latest"));
      zone.appendChild(
        el("div", { classe: "encadre-conseil" }, [
          el("p", {}, [el("strong", { texte: "Recommandation : " + rec.modele }), " — " + rec.libelle + ". Taille " + rec.taille + " (" + rec.quantification + "), " + rec.disque + ". " + rec.duree + "."]),
          installe ? el("p", { texte: "✓ Ce modèle est déjà installé." }) : el("p", {}, ["Pour l’installer (connexion Internet nécessaire une seule fois) : ", el("code", { texte: "ollama pull " + rec.modele })])
        ])
      );
    }
    if (d.ram_go && d.disque_libre_go && d.disque_libre_go < 10) {
      zone.appendChild(el("p", { classe: "avertissement", texte: "Espace disque faible : libérez de la place avant de télécharger un modèle." }));
    }
  }

  $("btn-tester-ollama").addEventListener("click", async () => {
    const ia = IA();
    if (!ia) return;
    const url = ia.etat.ollama.url.replace(/\/+$/, "");
    try {
      const r = await fetch(url + "/api/version");
      const v = await r.json();
      const noms = (await ia.chargerModelesOllama(true)) || [];
      toast("✓ Ollama " + v.version + " répond à " + url + " — " + noms.length + " modèle(s) de texte");
      ia.mettreAJourBadgeIA();
      majIndicateurLocal();
    } catch (e) {
      toast("✗ Ollama ne répond pas à " + url + " : voir « Dépannage » dans le guide.");
    }
  });

  async function chargerGuideUsage() {
    await chargerGuide("docs/GUIDE_USAGE_ANONYMISATION.md", "guide-usage", "sommaire-usage");
    await chargerGuide("docs/video/transcription.md", "transcription-video", null);
    if (!guidesCharges.video) {
      guidesCharges.video = true;
      let present = false;
      try {
        const r = await fetch("docs/video/video-sensibilisation.mp4", { method: "HEAD", cache: "no-cache" });
        present = r.ok;
      } catch (e) {
        present = false;
      }
      $("video-sensibilisation").hidden = !present;
      $("video-absente").hidden = present;
    }
  }

  document.querySelectorAll("[data-imprimer]").forEach((b) =>
    b.addEventListener("click", () => {
      const cible = $(b.dataset.imprimer).closest("section");
      document.body.classList.add("impression-selective");
      cible.classList.add("a-imprimer");
      window.print();
      setTimeout(() => {
        document.body.classList.remove("impression-selective");
        cible.classList.remove("a-imprimer");
      }, 500);
    })
  );

  /* Violations de la politique de sécurité : une connexion non autorisée a été bloquée. */
  document.addEventListener("securitypolicyviolation", (ev) => {
    if (ev.violatedDirective && ev.violatedDirective.startsWith("connect-src")) {
      let hote = "";
      try {
        hote = new URL(ev.blockedURI).host;
      } catch (e) {
        hote = "adresse externe";
      }
      journal("Connexion sortante bloquée par la politique de sécurité : " + hote);
      toast("Connexion vers " + hote + " bloquée : le kit fonctionne hors ligne. Pour une IA externe, voir « Paramètres IA ».");
    }
  });

  /* =========================================================================
   * Démarrage
   * ========================================================================= */
  window.Kit = { confirmer, confirmer2Etapes, saisir, dialogueAbonnement, miroir, journal, entreesDossierPourAnalyse, activerOnglet, Stockage };

  (async () => {
    await detecterKit();
    $("bandeau-vitrine").hidden = kit.actif;
    if (kit.actif) {
      try {
        diagnostic = await Stockage.lire("diagnostic.json");
      } catch (e) {
        diagnostic = null;
      }
      try {
        const j = await Stockage.lire("journal.log");
        if (j) lignesJournal = j.split("\n").filter(Boolean).slice(-3000);
        $("journal-anon").textContent = lignesJournal.slice(-200).join("\n");
      } catch (e) {
        /* journal absent */
      }
      try {
        dossier = await Stockage.lire(DOSSIER);
        if (dossier) {
          table = dossier.options && dossier.options.tableConservee ? null : new A.Correspondance({ compteur: dossier.compteur || 0 });
          if (dossier.mode) document.querySelectorAll("input[name=mode-traitement]").forEach((r) => (r.checked = r.value === dossier.mode));
        }
      } catch (e) {
        toast("Dossier de travail illisible : " + e.message);
      }
      for (const src of ["registre", "dossier"]) {
        try {
          const a = await Stockage.lire("analyses-" + src + ".json");
          if (a && IA()) IA().chargerAnalyses(src, a);
        } catch (e) {
          /* rien */
        }
      }
    }
    majAvertissementMode();
    afficherImport();
    rendreRapport();
    activerOnglet((location.hash || "#accueil").slice(1));
  })();

  document.addEventListener("analyse:etat", () => {
    majEtat();
    majIndicateurLocal();
  });
})();
