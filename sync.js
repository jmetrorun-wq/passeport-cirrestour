// Pousse la progression locale (prénom + statut des défis, jamais notes/photos)
// vers Firestore dès que possible. Best-effort : localStorage reste la source
// de vérité locale, aucune erreur ici ne doit affecter l'app.
import { auth, db, authReady } from "./firebase-init.js";
import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let dernierPayload = null;
let debounceTimer = null;

function planifierEnvoi() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(pousserVersFirestore, 400);
}

// Poussée initiale directe depuis localStorage : évite toute course avec l'ordre
// de chargement de ce module par rapport à app.js au premier rendu.
try {
  const cle = window.CIRRESTOUR_STORAGE_KEY || "cirrestour_passeport_v1";
  const brut = JSON.parse(localStorage.getItem(cle));
  if (brut && brut.prenom) {
    dernierPayload = {
      prenom: brut.prenom,
      defis: Object.fromEntries(Object.entries(brut.defis || {}).map(([k, v]) => [k, !!(v && v.done)])),
      celebrated: !!brut.celebrated
    };
    planifierEnvoi();
  }
} catch (e) { /* localStorage vide ou invalide, rien à pousser */ }

window.addEventListener("cirrestour:etat-modifie", (e) => {
  dernierPayload = e.detail;
  planifierEnvoi();
});

async function pousserVersFirestore() {
  if (!dernierPayload) return;
  try {
    await authReady;
    const uid = auth.currentUser && auth.currentUser.uid;
    if (!uid) return;
    const total = Object.values(dernierPayload.defis).filter(Boolean).length;
    await setDoc(doc(db, "participants", uid), {
      prenom: dernierPayload.prenom,
      defis: dernierPayload.defis,
      celebrated: !!dernierPayload.celebrated,
      total,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (err) {
    // Silencieux : pas de réseau ou config Firebase absente, on retentera au prochain changement d'état.
  }
}
