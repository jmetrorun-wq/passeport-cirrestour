// Reçoit la config des défis (organisateur -> tous les téléphones), jamais l'inverse.
// Best-effort : si Firestore est injoignable, l'app continue avec la dernière config
// connue en localStorage, ou le jeu par défaut bundlé dans app.js.
import { db, authReady } from "./firebase-init.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const CLE = window.CIRRESTOUR_DEFIS_CONFIG_KEY || "cirrestour_defis_config_v1";

function versionLocale() {
  try {
    const p = JSON.parse(localStorage.getItem(CLE));
    return (p && p.version) || 0;
  } catch (e) { return 0; }
}

authReady.then(() => {
  onSnapshot(
    doc(db, "config", "defis"),
    (snap) => {
      if (!snap.exists()) return; // jamais configuré : on reste sur le défaut bundlé
      const data = snap.data();
      if (!Array.isArray(data.liste) || !data.liste.length) return;
      if (!data.version || data.version <= versionLocale()) return;

      localStorage.setItem(CLE, JSON.stringify({ version: data.version, liste: data.liste }));
      window.dispatchEvent(new CustomEvent("cirrestour:defis-config", {
        detail: { liste: data.liste, version: data.version }
      }));
    },
    () => { /* silencieux : pas de réseau, onSnapshot se reconnecte seul à la reprise */ }
  );
}).catch(() => {});
