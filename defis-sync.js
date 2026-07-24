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
      if (!snap.exists()) {
        // Le document a été supprimé (ou n'a jamais existé) : on efface un éventuel cache
        // local d'une ancienne config, sinon un téléphone qui l'a connue y resterait bloqué
        // pour toujours même après suppression côté Firestore, sans jamais revenir au bundle.
        if (localStorage.getItem(CLE)) {
          localStorage.removeItem(CLE);
          // Date.now() plutôt que versionLocale()+1 : la version en mémoire dans app.js
          // (déjà initialisée depuis l'ancien cache au chargement du module) doit être
          // dépassée à coup sûr, pas seulement la version relue depuis le localStorage
          // qu'on vient d'effacer.
          window.dispatchEvent(new CustomEvent("cirrestour:defis-config", {
            detail: { liste: window.CIRRESTOUR_DEFIS_DEFAUT, version: Date.now() }
          }));
        }
        return;
      }
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
