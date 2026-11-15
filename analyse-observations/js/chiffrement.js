"use strict";
/*
 * Chiffrement local du tableau de correspondance de pseudonymisation.
 * AES-GCM 256 bits ; clé dérivée de la phrase de passe par PBKDF2-SHA-256 (600 000 itérations,
 * sel aléatoire de 16 octets, IV de 12 octets). Utilise l’API Web Crypto du navigateur
 * (disponible sur http://localhost, contexte sécurisé) ou de Node.js ≥ 19 pour les tests.
 * La phrase de passe n’est jamais stockée.
 */
(function (racine, fabrique) {
  const C = fabrique();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = C;
  } else {
    racine.Chiffrement = C;
  }
})(typeof self !== "undefined" ? self : this, function () {
  const ITERATIONS = 600000;
  const LONGUEUR_MIN_PHRASE = 12;
  const subtle = () => {
    const c = typeof globalThis !== "undefined" && globalThis.crypto;
    if (!c || !c.subtle) {
      throw new Error("chiffrement indisponible : ouvrez l’application via le script de démarrage (http://localhost)");
    }
    return c.subtle;
  };
  const versB64 = (octets) => {
    let s = "";
    const u = new Uint8Array(octets);
    for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s);
  };
  const depuisB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  async function deriverCle(phrase, sel, iterations) {
    const base = await subtle().importKey("raw", new TextEncoder().encode(phrase), "PBKDF2", false, ["deriveKey"]);
    return subtle().deriveKey(
      { name: "PBKDF2", salt: sel, iterations: iterations || ITERATIONS, hash: "SHA-256" },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  function verifierPhrase(phrase) {
    if (typeof phrase !== "string" || phrase.length < LONGUEUR_MIN_PHRASE) {
      throw new Error("la phrase de passe doit contenir au moins " + LONGUEUR_MIN_PHRASE + " caractères");
    }
  }

  async function chiffrer(objet, phrase) {
    verifierPhrase(phrase);
    const sel = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const cle = await deriverCle(phrase, sel, ITERATIONS);
    const clair = new TextEncoder().encode(JSON.stringify(objet));
    const chiffre = await subtle().encrypt({ name: "AES-GCM", iv }, cle, clair);
    return {
      format: "kit-analyse-observations/correspondance-chiffree",
      version: 1,
      algorithme: "AES-GCM-256",
      derivation: "PBKDF2-SHA-256",
      iterations: ITERATIONS,
      sel: versB64(sel),
      iv: versB64(iv),
      donnees: versB64(chiffre),
      date: new Date().toISOString()
    };
  }

  async function dechiffrer(enveloppe, phrase) {
    if (!enveloppe || enveloppe.format !== "kit-analyse-observations/correspondance-chiffree") {
      throw new Error("fichier de correspondance non reconnu");
    }
    const cle = await deriverCle(phrase, depuisB64(enveloppe.sel), enveloppe.iterations);
    try {
      const clair = await subtle().decrypt({ name: "AES-GCM", iv: depuisB64(enveloppe.iv) }, cle, depuisB64(enveloppe.donnees));
      return JSON.parse(new TextDecoder().decode(clair));
    } catch (e) {
      throw new Error("phrase de passe incorrecte ou fichier altéré");
    }
  }

  return { chiffrer, dechiffrer, verifierPhrase, ITERATIONS, LONGUEUR_MIN_PHRASE };
});
