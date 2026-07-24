// Bootstrap Firebase pour la sync opportuniste de la progression (bonus best-effort,
// jamais bloquant pour l'usage local hors-ligne qui reste dans localStorage).
//
// Ces clés sont publiques par nature (app 100% cliente, dépôt public sur GitHub Pages).
// La vraie protection des données repose sur les Firestore Security Rules, pas sur ce secret.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCtlEHoWppfY_C-RJ9nbFEKLJtz_SABRJk",
  authDomain: "passeport-cirrestour.firebaseapp.com",
  projectId: "passeport-cirrestour",
  storageBucket: "passeport-cirrestour.firebasestorage.app",
  messagingSenderId: "486261316120",
  appId: "1:486261316120:web:36c9c629da5a008d3a016d"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Cache persistant IndexedDB : les écritures faites hors-ligne sont mises en file
// et rejouées automatiquement à la reconnexion, même après fermeture/réouverture de l'app.
// experimentalAutoDetectLongPolling : Safari échoue parfois sur le transport WebChannel par
// défaut de Firestore ("Fetch API cannot load .../Listen/channel... due to access control
// checks"), un problème de compatibilité connu et sans rapport avec les Security Rules —
// ce réglage bascule automatiquement sur un transport en long-polling compatible.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }),
  experimentalAutoDetectLongPolling: true
});

let resolveAuthReady;
export const authReady = new Promise((resolve) => { resolveAuthReady = resolve; });
onAuthStateChanged(auth, (user) => { if (user) resolveAuthReady(user); });

function tenterConnexion() {
  signInAnonymously(auth).catch(() => { /* pas de réseau pour l'instant, on retentera */ });
}
tenterConnexion();
window.addEventListener("online", () => { if (!auth.currentUser) tenterConnexion(); });

export { auth, db };
