// Validation par un·e pair : pour les défis de type "validation" (ex. "compliment"),
// permet de demander à la personne concernée de confirmer, via une notification
// transmise par Firestore. Best-effort et jamais bloquant : la case à cocher manuelle
// (gérée par app.js) reste toujours disponible, y compris sans réseau.
import { auth, db, authReady } from "./firebase-init.js";
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

function lireEtat() {
  try {
    const cle = window.CIRRESTOUR_STORAGE_KEY || "cirrestour_passeport_v1";
    return JSON.parse(localStorage.getItem(cle)) || {};
  } catch (e) {
    return {};
  }
}

// ---------- Répertoire des autres participant·e·s (best-effort, nécessite du réseau) ----------
let roster = [];
authReady.then((user) => {
  onSnapshot(
    collection(db, "participants"),
    (snap) => {
      roster = [];
      snap.forEach((d) => {
        if (d.id !== user.uid && d.data().prenom) roster.push({ uid: d.id, prenom: d.data().prenom });
      });
    },
    () => {}
  );
});

// ---------- Suivi local des demandes envoyées (persiste au rechargement) ----------
const DEMANDES_KEY = "cirrestour_demandes_envoyees_v1";

function lireDemandesEnCours() {
  try { return JSON.parse(localStorage.getItem(DEMANDES_KEY)) || {}; } catch (e) { return {}; }
}
function ecrireDemandesEnCours(m) { localStorage.setItem(DEMANDES_KEY, JSON.stringify(m)); }

window.CIRRESTOUR_getDemandeEnCours = function (defiId) {
  return lireDemandesEnCours()[defiId] || null;
};

window.CIRRESTOUR_annulerDemande = async function (defiId) {
  const m = lireDemandesEnCours();
  const entree = m[defiId];
  if (!entree) return;
  delete m[defiId];
  ecrireDemandesEnCours(m);
  peuplerWidgets();
  try { await deleteDoc(doc(db, "demandes_validation", entree.demandeId)); } catch (e) { /* pas grave, sera orpheline côté Firestore */ }
};

// ---------- Sélecteur de destinataire ----------
const elPicker = document.getElementById("validation-picker");
const listePicker = document.getElementById("validation-picker-liste");
const btnFermerPicker = document.getElementById("btn-fermer-validation-picker");
const pickerDefiTitre = document.getElementById("validation-picker-defi");

let defiEnCoursPourPicker = null;

window.CIRRESTOUR_ouvrirDemandeValidation = function (defiId, defiTitre) {
  if (!roster.length) {
    alert("Aucune connexion ou aucun·e autre participant·e détecté·e pour l'instant. Réessaie quand il y aura du réseau, ou coche simplement la case toi-même.");
    return;
  }
  defiEnCoursPourPicker = { id: defiId, titre: defiTitre };
  pickerDefiTitre.textContent = defiTitre;
  listePicker.innerHTML = "";
  roster.forEach((p) => {
    const btn = document.createElement("button");
    btn.className = "validation-picker-item";
    btn.textContent = p.prenom;
    btn.addEventListener("click", () => envoyerDemande(p));
    listePicker.appendChild(btn);
  });
  elPicker.classList.remove("hidden");
};

btnFermerPicker.addEventListener("click", () => elPicker.classList.add("hidden"));

async function envoyerDemande(participant) {
  try {
    await authReady;
    const dePrenom = lireEtat().prenom || "Quelqu'un";
    const ref = await addDoc(collection(db, "demandes_validation"), {
      deUid: auth.currentUser.uid,
      dePrenom,
      versUid: participant.uid,
      versPrenom: participant.prenom,
      defiId: defiEnCoursPourPicker.id,
      defiTitre: defiEnCoursPourPicker.titre,
      statut: "en_attente",
      createdAt: serverTimestamp()
    });
    const m = lireDemandesEnCours();
    m[defiEnCoursPourPicker.id] = { demandeId: ref.id, versPrenom: participant.prenom };
    ecrireDemandesEnCours(m);
    elPicker.classList.add("hidden");
    peuplerWidgets();
  } catch (e) {
    alert("Échec de l'envoi (pas de réseau pour l'instant ?). Réessaie plus tard, ou coche la case toi-même.");
  }
}

// ---------- Écoute des réponses à mes demandes envoyées ----------
authReady.then((user) => {
  onSnapshot(
    query(collection(db, "demandes_validation"), where("deUid", "==", user.uid)),
    (snap) => {
      snap.docChanges().forEach((change) => {
        const d = change.doc.data();
        if (d.statut === "en_attente") return;
        const m = lireDemandesEnCours();
        if (!m[d.defiId] || m[d.defiId].demandeId !== change.doc.id) return;
        delete m[d.defiId];
        ecrireDemandesEnCours(m);
        if (d.statut === "validee" && window.CIRRESTOUR_marquerValide) {
          window.CIRRESTOUR_marquerValide(d.defiId, d.versPrenom);
        }
        deleteDoc(change.doc.ref).catch(() => {});
        peuplerWidgets();
      });
    },
    () => {}
  );
});

// ---------- Écoute des demandes reçues (à approuver) ----------
const elBanniere = document.getElementById("validation-banniere");
const banniereTexte = document.getElementById("validation-banniere-texte");
const btnBanniereOui = document.getElementById("btn-validation-oui");
const btnBanniereNon = document.getElementById("btn-validation-non");

let fileDemandesRecues = [];
let demandeEnCoursAffichee = null;

authReady.then((user) => {
  onSnapshot(
    query(collection(db, "demandes_validation"), where("versUid", "==", user.uid), where("statut", "==", "en_attente")),
    (snap) => {
      fileDemandesRecues = [];
      snap.forEach((d) => fileDemandesRecues.push({ id: d.id, ...d.data() }));
      afficherProchaineDemande();
    },
    () => {}
  );
});

function afficherProchaineDemande() {
  if (!fileDemandesRecues.length) {
    elBanniere.classList.add("hidden");
    demandeEnCoursAffichee = null;
    return;
  }
  if (demandeEnCoursAffichee && fileDemandesRecues.some((d) => d.id === demandeEnCoursAffichee.id)) return;
  demandeEnCoursAffichee = fileDemandesRecues[0];
  banniereTexte.textContent = `${demandeEnCoursAffichee.dePrenom} confirme : « ${demandeEnCoursAffichee.defiTitre} » — tu valides ?`;
  elBanniere.classList.remove("hidden");
}

btnBanniereOui.addEventListener("click", () => repondre(true));
btnBanniereNon.addEventListener("click", () => repondre(false));

async function repondre(accepte) {
  if (!demandeEnCoursAffichee) return;
  const traitee = demandeEnCoursAffichee;
  elBanniere.classList.add("hidden");
  demandeEnCoursAffichee = null;
  try {
    await updateDoc(doc(db, "demandes_validation", traitee.id), { statut: accepte ? "validee" : "refusee" });
  } catch (e) {
    alert("Échec de l'envoi de ta réponse (réessaie quand il y aura du réseau).");
  }
  fileDemandesRecues = fileDemandesRecues.filter((d) => d.id !== traitee.id);
  afficherProchaineDemande();
}

// ---------- Petits widgets par défi (bouton "demander", statut "en attente", "validé par") ----------
function peuplerWidgets() {
  document.querySelectorAll(".defi-validation").forEach((conteneur) => {
    const defiId = conteneur.dataset.defiId;
    const defiTitre = conteneur.dataset.titre;
    const etat = lireEtat();
    const s = etat.defis && etat.defis[defiId];
    conteneur.innerHTML = "";

    if (s && s.done) {
      if (s.valideePar) {
        const p = document.createElement("p");
        p.className = "validation-statut validee";
        p.textContent = `✅ Validé par ${s.valideePar}`;
        conteneur.appendChild(p);
      }
      return;
    }

    const enCours = window.CIRRESTOUR_getDemandeEnCours(defiId);
    if (enCours) {
      const p = document.createElement("p");
      p.className = "validation-statut attente";
      p.textContent = `⏳ En attente de validation par ${enCours.versPrenom}...`;
      const btnAnnuler = document.createElement("button");
      btnAnnuler.className = "validation-annuler";
      btnAnnuler.textContent = "Annuler";
      btnAnnuler.addEventListener("click", () => window.CIRRESTOUR_annulerDemande(defiId));
      conteneur.appendChild(p);
      conteneur.appendChild(btnAnnuler);
    } else {
      const btn = document.createElement("button");
      btn.className = "defi-photo-btn";
      btn.textContent = "🤝 Demander une validation";
      btn.addEventListener("click", () => window.CIRRESTOUR_ouvrirDemandeValidation(defiId, defiTitre));
      conteneur.appendChild(btn);
    }
  });
}

window.addEventListener("cirrestour:liste-rendue", peuplerWidgets);
peuplerWidgets();
