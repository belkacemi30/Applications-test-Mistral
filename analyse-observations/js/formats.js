"use strict";
/*
 * Formats d’import / export du kit — sans aucune bibliothèque externe (fonctionnement hors ligne).
 *  - CSV (préconisé) : UTF-8 avec BOM, séparateur « ; », guillemets doublés, retours à la ligne protégés.
 *  - XLSX : classeur Office Open XML minimal (cellules texte, en-tête en gras, retour à la ligne).
 *  - ZIP  : archive « stockée » (sans compression) avec CRC-32, utilisée pour XLSX et l’export TXT multi-fichiers.
 *  - JSON, TXT.
 *  - Lecture CSV (séparateur ; , ou tabulation détecté automatiquement) et JSON pour l’import d’observations.
 */
(function (racine, fabrique) {
  const F = fabrique();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = F;
  } else {
    racine.Formats = F;
  }
})(typeof self !== "undefined" ? self : this, function () {
  const BOM = "﻿";

  /* ------------------------------ CSV ------------------------------ */
  function echapperCSV(v) {
    const s = v == null ? "" : String(v);
    return /[";\n\r]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /** colonnes : [{ cle, titre }] ; lignes : objets. */
  function versCSV(colonnes, lignes) {
    const entete = colonnes.map((c) => echapperCSV(c.titre)).join(";");
    const corps = lignes.map((l) => colonnes.map((c) => echapperCSV(l[c.cle])).join(";"));
    return BOM + [entete].concat(corps).join("\r\n") + "\r\n";
  }

  /** Lecture CSV robuste (guillemets, retours à la ligne dans les champs). */
  function lireCSV(texte) {
    let t = String(texte || "").replace(/^﻿/, "");
    const premiereLigne = t.split(/\r?\n/, 1)[0] || "";
    const compte = (c) => (premiereLigne.match(new RegExp(c === "\t" ? "\t" : "\\" + c, "g")) || []).length;
    const sep = [";", ",", "\t"].sort((a, b) => compte(b) - compte(a))[0];
    const lignes = [];
    let champ = "";
    let ligne = [];
    let entreGuillemets = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (entreGuillemets) {
        if (c === '"') {
          if (t[i + 1] === '"') {
            champ += '"';
            i++;
          } else {
            entreGuillemets = false;
          }
        } else {
          champ += c;
        }
      } else if (c === '"' && champ === "") {
        entreGuillemets = true;
      } else if (c === sep) {
        ligne.push(champ);
        champ = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && t[i + 1] === "\n") i++;
        ligne.push(champ);
        champ = "";
        if (ligne.some((x) => x !== "")) lignes.push(ligne);
        ligne = [];
      } else {
        champ += c;
      }
    }
    if (champ !== "" || ligne.length) {
      ligne.push(champ);
      if (ligne.some((x) => x !== "")) lignes.push(ligne);
    }
    if (!lignes.length) return { colonnes: [], lignes: [], separateur: sep };
    const colonnes = lignes[0].map((x) => x.trim());
    return {
      colonnes,
      separateur: sep,
      lignes: lignes.slice(1).map((l) => {
        const o = {};
        colonnes.forEach((c, k) => (o[c] = l[k] == null ? "" : l[k]));
        return o;
      })
    };
  }

  /* --------------------- Correspondance des colonnes --------------------- */
  const SYNONYMES = {
    reference: ["reference", "référence", "ref", "réf", "id", "identifiant", "numero", "numéro", "n°", "no"],
    date: ["date", "date de depot", "date de dépôt", "depot", "dépôt"],
    auteur: ["auteur", "nom", "contributeur", "deposant", "déposant", "identite", "identité", "signataire"],
    objet: ["objet", "sujet", "titre"],
    texte: ["texte", "observation", "contribution", "contenu", "message", "commentaire", "description"],
    lieu: ["lieu", "commune", "ville", "adresse"]
  };
  function normaliserNom(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9° ]+/g, " ")
      .trim();
  }
  function correspondreColonnes(colonnes) {
    const res = {};
    for (const [cle, noms] of Object.entries(SYNONYMES)) {
      const cibles = noms.map(normaliserNom);
      const trouve = colonnes.find((c) => cibles.includes(normaliserNom(c))) || colonnes.find((c) => cibles.some((n) => normaliserNom(c).startsWith(n)));
      if (trouve) res[cle] = trouve;
    }
    return res;
  }

  /** Convertit un fichier importé (CSV, JSON ou TXT) en liste d’observations normalisées. */
  function importerObservations(nomFichier, contenu) {
    const ext = String(nomFichier || "").toLowerCase().split(".").pop();
    let brutes = [];
    if (ext === "json") {
      const d = JSON.parse(String(contenu).replace(/^﻿/, ""));
      const liste = Array.isArray(d) ? d : d.observations || d.contributions || d.donnees || [];
      const autres = !Array.isArray(d) && d.observations && d.contributions ? d.contributions : [];
      brutes = liste.concat(autres);
    } else if (ext === "txt") {
      // Une observation par bloc séparé d’une ligne vide ; « Référence : … » facultatif en tête de bloc.
      brutes = String(contenu)
        .replace(/^﻿/, "")
        .split(/\n\s*\n(?=\s*(?:R[ée]f[ée]rence\s*:|\S))/)
        .map((b) => b.trim())
        .filter(Boolean)
        .map((b) => {
          const m = b.match(/^R[ée]f[ée]rence\s*:\s*(.+)\n([\s\S]*)$/i);
          return m ? { reference: m[1].trim(), texte: m[2].trim() } : { texte: b };
        });
    } else {
      const csv = lireCSV(contenu);
      const map = correspondreColonnes(csv.colonnes);
      if (!map.texte) {
        throw new Error("colonne du texte introuvable (en-têtes attendus : référence ; date ; auteur ; objet ; texte)");
      }
      brutes = csv.lignes.map((l) => {
        const o = {};
        for (const [cle, col] of Object.entries(map)) o[cle] = l[col];
        return o;
      });
    }
    const vues = new Set();
    return brutes
      .map((o, i) => {
        let reference = String(o.reference || o.id || o.ref || "").trim() || "OBS-" + String(i + 1).padStart(3, "0");
        while (vues.has(reference)) reference += "-bis";
        vues.add(reference);
        return {
          reference,
          date: String(o.date || "").trim(),
          auteur: String(o.auteur || "").trim(),
          objet: String(o.objet || "").trim(),
          lieu: String(o.lieu || "").trim(),
          texte: String(o.texte || "").trim()
        };
      })
      .filter((o) => o.texte !== "");
  }

  /* ------------------------------ ZIP ------------------------------ */
  const TABLE_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(octets) {
    let c = 0xffffffff;
    for (let i = 0; i < octets.length; i++) c = TABLE_CRC[(c ^ octets[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  const encodeur = new TextEncoder();

  /** fichiers : [{ nom, contenu (string | Uint8Array) }] → Uint8Array (ZIP sans compression). */
  function creerZIP(fichiers) {
    const morceaux = [];
    const central = [];
    let decalage = 0;
    const maintenant = new Date();
    const heureDos = ((maintenant.getHours() << 11) | (maintenant.getMinutes() << 5) | (maintenant.getSeconds() >> 1)) & 0xffff;
    const dateDos = (((maintenant.getFullYear() - 1980) << 9) | ((maintenant.getMonth() + 1) << 5) | maintenant.getDate()) & 0xffff;
    for (const f of fichiers) {
      const nom = encodeur.encode(f.nom);
      const donnees = typeof f.contenu === "string" ? encodeur.encode(f.contenu) : f.contenu;
      const crc = crc32(donnees);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // noms en UTF-8
      local.setUint16(8, 0, true); // stockage
      local.setUint16(10, heureDos, true);
      local.setUint16(12, dateDos, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, donnees.length, true);
      local.setUint32(22, donnees.length, true);
      local.setUint16(26, nom.length, true);
      local.setUint16(28, 0, true);
      morceaux.push(new Uint8Array(local.buffer), nom, donnees);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true);
      c.setUint16(4, 20, true);
      c.setUint16(6, 20, true);
      c.setUint16(8, 0x0800, true);
      c.setUint16(10, 0, true);
      c.setUint16(12, heureDos, true);
      c.setUint16(14, dateDos, true);
      c.setUint32(16, crc, true);
      c.setUint32(20, donnees.length, true);
      c.setUint32(24, donnees.length, true);
      c.setUint16(28, nom.length, true);
      c.setUint32(42, decalage, true);
      central.push(new Uint8Array(c.buffer), nom);
      decalage += 30 + nom.length + donnees.length;
    }
    const tailleCentral = central.reduce((n, x) => n + x.length, 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true);
    fin.setUint16(8, fichiers.length, true);
    fin.setUint16(10, fichiers.length, true);
    fin.setUint32(12, tailleCentral, true);
    fin.setUint32(16, decalage, true);
    const tout = morceaux.concat(central, [new Uint8Array(fin.buffer)]);
    const total = tout.reduce((n, x) => n + x.length, 0);
    const res = new Uint8Array(total);
    let p = 0;
    for (const x of tout) {
      res.set(x, p);
      p += x.length;
    }
    return res;
  }

  /* ------------------------------ XLSX ------------------------------ */
  function xml(s) {
    return String(s == null ? "" : s)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function nomColonne(n) {
    let s = "";
    n += 1;
    while (n > 0) {
      const r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }
  function versXLSX(colonnes, lignes, nomFeuille) {
    const largeur = (c) => (/texte|synthese|contenu/i.test(c.cle) ? 80 : /objet|themes|questions|points|demandes/i.test(c.cle) ? 40 : 16);
    const cellule = (ref, valeur, style) =>
      '<c r="' + ref + '" t="inlineStr" s="' + style + '"><is><t xml:space="preserve">' + xml(String(valeur == null ? "" : valeur).slice(0, 32767)) + "</t></is></c>";
    const rangs = [];
    rangs.push('<row r="1">' + colonnes.map((c, k) => cellule(nomColonne(k) + "1", c.titre, 1)).join("") + "</row>");
    lignes.forEach((l, i) => {
      const r = i + 2;
      rangs.push('<row r="' + r + '">' + colonnes.map((c, k) => cellule(nomColonne(k) + r, l[c.cle], 2)).join("") + "</row>");
    });
    const feuille =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      "<cols>" + colonnes.map((c, k) => '<col min="' + (k + 1) + '" max="' + (k + 1) + '" width="' + largeur(c) + '" customWidth="1"/>').join("") + "</cols>" +
      "<sheetData>" + rangs.join("") + "</sheetData>" +
      (lignes.length ? '<autoFilter ref="A1:' + nomColonne(colonnes.length - 1) + (lignes.length + 1) + '"/>' : "") +
      "</worksheet>";
    const nom = xml(String(nomFeuille || "Contributions").replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
    const fichiers = [
      {
        nom: "[Content_Types].xml",
        contenu:
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
          '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'
      },
      {
        nom: "_rels/.rels",
        contenu:
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
      },
      {
        nom: "xl/workbook.xml",
        contenu:
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
          '<sheets><sheet name="' + nom + '" sheetId="1" r:id="rId1"/></sheets></workbook>'
      },
      {
        nom: "xl/_rels/workbook.xml.rels",
        contenu:
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
          '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'
      },
      {
        nom: "xl/styles.xml",
        contenu:
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
          '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
          '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
          '<fill><patternFill patternType="solid"><fgColor rgb="FFDCE6FF"/><bgColor indexed="64"/></patternFill></fill></fills>' +
          '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
          '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
          '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
          '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
          '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>' +
          "</styleSheet>"
      },
      { nom: "xl/worksheets/sheet1.xml", contenu: feuille }
    ];
    return creerZIP(fichiers);
  }

  /* ------------------------------ TXT / JSON ------------------------------ */
  function versTXTUnique(colonnes, lignes, titre) {
    const sep = "=".repeat(72);
    const blocs = lignes.map((l, i) => {
      const entete = (i + 1) + ". " + (l.reference || "Contribution " + (i + 1));
      const meta = colonnes
        .filter((c) => c.cle !== "texte" && c.cle !== "reference" && l[c.cle])
        .map((c) => c.titre + " : " + l[c.cle]);
      return [sep, entete, sep].concat(meta, ["", String(l.texte || "")]).join("\r\n");
    });
    return BOM + (titre ? titre + "\r\n" + new Date().toLocaleString("fr-FR") + "\r\n\r\n" : "") + blocs.join("\r\n\r\n") + "\r\n";
  }

  function versTXTMultiples(colonnes, lignes) {
    return creerZIP(
      lignes.map((l, i) => ({
        nom: String(i + 1).padStart(3, "0") + "_" + String(l.reference || "contribution").replace(/[^\w.-]+/g, "_") + ".txt",
        contenu: versTXTUnique(colonnes, [l], "").replace(/^﻿/, BOM)
      }))
    );
  }

  function versJSON(colonnes, lignes, meta) {
    return JSON.stringify(
      Object.assign({ format: "kit-analyse-observations/contributions", version: 1, export: new Date().toISOString() }, meta || {}, {
        colonnes: colonnes.map((c) => ({ cle: c.cle, titre: c.titre })),
        contributions: lignes.map((l) => {
          const o = {};
          for (const c of colonnes) o[c.cle] = l[c.cle] == null ? "" : l[c.cle];
          return o;
        })
      }),
      null,
      2
    );
  }

  return {
    BOM,
    echapperCSV,
    versCSV,
    lireCSV,
    correspondreColonnes,
    importerObservations,
    crc32,
    creerZIP,
    versXLSX,
    versTXTUnique,
    versTXTMultiples,
    versJSON
  };
});
