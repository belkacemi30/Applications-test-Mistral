"use strict";
/*
 * Rendu Markdown minimal et SÛR pour les guides intégrés au kit.
 * Aucun HTML du document n’est interprété : tout est construit avec createElement / textContent.
 * Pris en charge : titres, paragraphes, listes (puces / numérotées, un niveau d’imbrication),
 * tableaux, blocs de code, citations, ligne horizontale, gras, italique, code en ligne, liens.
 * Les liens externes s’ouvrent dans un nouvel onglet (rel="noopener noreferrer") et sont signalés.
 */
(function (racine, fabrique) {
  const M = fabrique();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = M;
  } else {
    racine.Markdown = M;
  }
})(typeof self !== "undefined" ? self : this, function () {
  /** Découpe le texte en blocs (structure intermédiaire, testable sans DOM). */
  function analyser(source) {
    const lignes = String(source || "").replace(/\r\n?/g, "\n").split("\n");
    const blocs = [];
    let i = 0;
    const estTableau = (l) => /^\s*\|.*\|\s*$/.test(l);
    const estListe = (l) => /^(\s*)([-*+]|\d+[.)])\s+/.test(l);
    while (i < lignes.length) {
      const l = lignes[i];
      if (/^\s*$/.test(l)) {
        i++;
        continue;
      }
      let m;
      if ((m = l.match(/^```(\w*)/))) {
        const contenu = [];
        i++;
        while (i < lignes.length && !/^```/.test(lignes[i])) contenu.push(lignes[i++]);
        i++;
        blocs.push({ type: "code", texte: contenu.join("\n"), langage: m[1] || "" });
        continue;
      }
      if ((m = l.match(/^(#{1,6})\s+(.*)$/))) {
        blocs.push({ type: "titre", niveau: m[1].length, texte: m[2].replace(/\s+#+\s*$/, "") });
        i++;
        continue;
      }
      if (/^\s*(---|\*\*\*|___)\s*$/.test(l)) {
        blocs.push({ type: "hr" });
        i++;
        continue;
      }
      if (/^\s*>/.test(l)) {
        const contenu = [];
        while (i < lignes.length && /^\s*>/.test(lignes[i])) contenu.push(lignes[i++].replace(/^\s*>\s?/, ""));
        blocs.push({ type: "citation", blocs: analyser(contenu.join("\n")) });
        continue;
      }
      if (estTableau(l) && i + 1 < lignes.length && /^\s*\|?\s*:?-{2,}/.test(lignes[i + 1])) {
        const cellules = (x) => x.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        const entete = cellules(l);
        i += 2;
        const corps = [];
        while (i < lignes.length && estTableau(lignes[i])) corps.push(cellules(lignes[i++]));
        blocs.push({ type: "tableau", entete, corps });
        continue;
      }
      if (estListe(l)) {
        const items = [];
        const ordonnee = /^\s*\d+[.)]/.test(l);
        const retraitBase = l.match(/^(\s*)/)[1].length;
        while (i < lignes.length && (estListe(lignes[i]) || (/^\s+\S/.test(lignes[i]) && items.length))) {
          const x = lignes[i];
          const r = x.match(/^(\s*)/)[1].length;
          const mm = x.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
          if (mm && r <= retraitBase + 1) {
            items.push({ texte: mm[3], sous: [] });
          } else if (mm) {
            items[items.length - 1].sous.push(mm[3]);
          } else {
            items[items.length - 1].texte += " " + x.trim();
          }
          i++;
        }
        blocs.push({ type: "liste", ordonnee, items });
        continue;
      }
      const para = [];
      while (
        i < lignes.length &&
        !/^\s*$/.test(lignes[i]) &&
        !/^(#{1,6})\s/.test(lignes[i]) &&
        !/^```/.test(lignes[i]) &&
        !estListe(lignes[i]) &&
        !/^\s*>/.test(lignes[i]) &&
        !estTableau(lignes[i])
      ) {
        para.push(lignes[i++].trim());
      }
      blocs.push({ type: "paragraphe", texte: para.join(" ") });
    }
    return blocs;
  }

  /** Découpe une ligne en segments en ligne : texte, gras, italique, code, lien. */
  function segments(texte) {
    const res = [];
    const motif = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(_[^_\s][^_]*_)|(\[[^\]]+\]\([^)\s]+\))/g;
    let dernier = 0;
    let m;
    while ((m = motif.exec(texte))) {
      if (m.index > dernier) res.push({ t: "texte", v: texte.slice(dernier, m.index) });
      const s = m[0];
      if (m[1]) res.push({ t: "code", v: s.slice(1, -1) });
      else if (m[2]) res.push({ t: "gras", v: s.slice(2, -2) });
      else if (m[3] || m[4]) res.push({ t: "italique", v: s.slice(1, -1) });
      else {
        const mm = s.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
        res.push({ t: "lien", v: mm[1], href: mm[2] });
      }
      dernier = m.index + s.length;
    }
    if (dernier < texte.length) res.push({ t: "texte", v: texte.slice(dernier) });
    return res;
  }

  function lienSur(href) {
    return /^(https?:\/\/|#|\.{0,2}\/|[\w-]+\.(md|html|pdf|mp4|vtt|csv|json|txt)$|[\w./-]+$)/i.test(href) && !/^\s*(javascript|data|vbscript):/i.test(href);
  }

  function enLigne(doc, parent, texte, options) {
    for (const s of segments(texte)) {
      if (s.t === "texte") parent.appendChild(doc.createTextNode(s.v));
      else if (s.t === "code") {
        const c = doc.createElement("code");
        c.textContent = s.v;
        parent.appendChild(c);
      } else if (s.t === "gras" || s.t === "italique") {
        const e = doc.createElement(s.t === "gras" ? "strong" : "em");
        enLigne(doc, e, s.v, options);
        parent.appendChild(e);
      } else if (s.t === "lien") {
        if (!lienSur(s.href)) {
          parent.appendChild(doc.createTextNode(s.v));
          continue;
        }
        const a = doc.createElement("a");
        a.textContent = s.v;
        if (/^https?:\/\//i.test(s.href)) {
          a.href = s.href;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.title = "Lien externe (nécessite Internet) : " + s.href;
          a.className = "lien-externe";
        } else if (/\.md$/i.test(s.href) && options && options.surLienInterne) {
          a.href = "#";
          a.addEventListener("click", (ev) => {
            ev.preventDefault();
            options.surLienInterne(s.href);
          });
        } else {
          a.href = (options && options.base ? options.base : "") + s.href;
        }
        parent.appendChild(a);
      }
    }
  }

  function identifiant(texte) {
    return (
      "sec-" +
      texte
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60)
    );
  }

  /** Construit le DOM d’un document Markdown dans `conteneur`. Renvoie la liste des titres (sommaire). */
  function rendre(source, conteneur, options) {
    const doc = conteneur.ownerDocument;
    const titres = [];
    const construire = (blocs, parent) => {
      for (const b of blocs) {
        let e;
        switch (b.type) {
          case "titre":
            e = doc.createElement("h" + Math.min(6, b.niveau + ((options && options.decalageTitres) || 0)));
            e.id = identifiant(b.texte);
            enLigne(doc, e, b.texte, options);
            titres.push({ niveau: b.niveau, texte: e.textContent, id: e.id });
            break;
          case "paragraphe":
            e = doc.createElement("p");
            enLigne(doc, e, b.texte, options);
            break;
          case "code":
            e = doc.createElement("pre");
            const c = doc.createElement("code");
            c.textContent = b.texte;
            e.appendChild(c);
            break;
          case "hr":
            e = doc.createElement("hr");
            break;
          case "citation":
            e = doc.createElement("blockquote");
            construire(b.blocs, e);
            break;
          case "liste":
            e = doc.createElement(b.ordonnee ? "ol" : "ul");
            for (const it of b.items) {
              const li = doc.createElement("li");
              enLigne(doc, li, it.texte, options);
              if (it.sous.length) {
                const ul = doc.createElement("ul");
                for (const s of it.sous) {
                  const li2 = doc.createElement("li");
                  enLigne(doc, li2, s, options);
                  ul.appendChild(li2);
                }
                li.appendChild(ul);
              }
              e.appendChild(li);
            }
            break;
          case "tableau": {
            const conteneurTableau = doc.createElement("div");
            conteneurTableau.className = "tableau-conteneur";
            const t = doc.createElement("table");
            const thead = doc.createElement("thead");
            const tr = doc.createElement("tr");
            for (const h of b.entete) {
              const th = doc.createElement("th");
              th.scope = "col";
              enLigne(doc, th, h, options);
              tr.appendChild(th);
            }
            thead.appendChild(tr);
            t.appendChild(thead);
            const tbody = doc.createElement("tbody");
            for (const ligne of b.corps) {
              const trb = doc.createElement("tr");
              for (const cel of ligne) {
                const td = doc.createElement("td");
                enLigne(doc, td, cel, options);
                trb.appendChild(td);
              }
              tbody.appendChild(trb);
            }
            t.appendChild(tbody);
            conteneurTableau.appendChild(t);
            e = conteneurTableau;
            break;
          }
          default:
            continue;
        }
        parent.appendChild(e);
      }
    };
    construire(analyser(source), conteneur);
    return titres;
  }

  return { analyser, segments, rendre, identifiant };
});
