// Validation par un·e pair : pour les défis de type "validation" (ex. "compliment"),
// permet de demander à la personne concernée de confirmer, via une notification
// transmise par Firestore. Best-effort et jamais bloquant : la case à cocher manuelle
// (gérée par app.js) reste toujours disponible, y compris sans réseau.
import { auth, db, authReady } from "./firebase-init.js";
import {
  collection,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Envoie vers Firestore (collection photos_validees) la photo d'un défi tout juste
// validé, pour un montage après la rando. Best-effort, jamais bloquant : aucune erreur
// ne doit gêner l'usage normal (seule exception à la règle "les photos restent 100%
// locales", et seulement une fois le défi validé par un pair, jamais avant).
async function tenterUploadPhoto(defiId, defiTitre) {
  try {
    const etat = lireEtat();
    const photoOriginale = etat.defis && etat.defis[defiId] && etat.defis[defiId].photo;
    if (!photoOriginale) return;
    const photo = await redimensionnerDataUrl(photoOriginale, 700, 0.6);
    const uid = auth.currentUser.uid;
    await setDoc(doc(db, "photos_validees", `${uid}_${defiId}`), {
      uid,
      prenom: etat.prenom || "Quelqu'un",
      defiId,
      defiTitre: defiTitre || defiId,
      photo,
      createdAt: serverTimestamp()
    });
  } catch (e) {
    console.error("cirrestour: échec tenterUploadPhoto", e);
  }
}

// Une photo capturée localement (900px, qualité 0.72) dépasse largement la limite de
// taille d'un document Firestore (1 Mo) une fois combinée à d'autres photos/champs.
// On génère donc une version bien plus compressée, uniquement pour la transmission
// (bannière de validation + collection photos_validees) — jamais pour l'usage local.
function redimensionnerDataUrl(dataUrl, maxWidth, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = reject;
    img.onload = () => {
      const ratio = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = dataUrl;
  });
}

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
  const entree = lireDemandesEnCours()[defiId];
  // Ignore/nettoie les entrées d'un ancien format (avant l'envoi groupé à plusieurs destinataires).
  if (!entree || !Array.isArray(entree.demandeIds) || !Array.isArray(entree.versPrenoms)) {
    if (entree) {
      const m = lireDemandesEnCours();
      delete m[defiId];
      ecrireDemandesEnCours(m);
    }
    return null;
  }
  return entree;
};

window.CIRRESTOUR_annulerDemande = async function (defiId) {
  const m = lireDemandesEnCours();
  const entree = m[defiId];
  if (!entree) return;
  delete m[defiId];
  ecrireDemandesEnCours(m);
  peuplerWidgets();
  await Promise.all(entree.demandeIds.map((id) =>
    deleteDoc(doc(db, "demandes_validation", id)).catch(() => { /* pas grave, sera orpheline côté Firestore */ })
  ));
};

// ---------- Sélecteur de destinataire (validation ouverte, ex. "compliment") ----------
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
    btn.addEventListener("click", () => {
      envoyerDemandes(defiEnCoursPourPicker.id, defiEnCoursPourPicker.titre, [p], true);
      elPicker.classList.add("hidden");
    });
    listePicker.appendChild(btn);
  });
  elPicker.classList.remove("hidden");
};

btnFermerPicker.addEventListener("click", () => elPicker.classList.add("hidden"));

// ---------- Demande groupée (validation restreinte, ex. Manu/Chnick) : envoyée à
// tou·te·s les référent·e·s détecté·e·s en même temps, le/la premier·e à valider l'emporte.
function envoyerDemandeGroupee(defiId, defiTitre, validateursAutorises) {
  const cibles = roster.filter((p) => validateursAutorises.some((v) => v.toLowerCase() === p.prenom.toLowerCase()));
  if (!cibles.length) {
    alert(`${validateursAutorises.join(" ou ")} n'a pas encore été détecté·e (réseau ou passeport pas encore commencé). Réessaie plus tard, ou coche simplement la case toi-même.`);
    return;
  }
  envoyerDemandes(defiId, defiTitre, cibles);
}

// Crée une demande Firestore par destinataire, et suit le groupe comme une seule
// entrée en attente (premier·e à répondre "validee" l'emporte pour les autres).
// `inclureNote` : uniquement pour la validation ouverte (ex. "compliment"), où le/la
// validateur·rice est choisi·e au hasard dans la liste et ne connaît pas forcément le
// contexte — contrairement aux référent·e·s fixes (Manu/Chnick), qui n'en ont pas besoin.
async function envoyerDemandes(defiId, defiTitre, destinataires, inclureNote) {
  try {
    await authReady;
    const etat = lireEtat();
    const dePrenom = etat.prenom || "Quelqu'un";
    const defiEnCours = etat.defis && etat.defis[defiId];
    const photoOriginale = defiEnCours && defiEnCours.photo;
    const photo = photoOriginale ? await redimensionnerDataUrl(photoOriginale, 500, 0.5) : null;
    const note = inclureNote && defiEnCours && defiEnCours.note ? defiEnCours.note : null;
    const demandeIds = [];
    for (const participant of destinataires) {
      const contenu = {
        deUid: auth.currentUser.uid,
        dePrenom,
        versUid: participant.uid,
        versPrenom: participant.prenom,
        defiId,
        defiTitre,
        statut: "en_attente",
        createdAt: serverTimestamp()
      };
      if (photo) contenu.photo = photo;
      if (note) contenu.note = note;
      const docRef = await addDoc(collection(db, "demandes_validation"), contenu);
      demandeIds.push(docRef.id);
    }
    const m = lireDemandesEnCours();
    m[defiId] = { demandeIds, versPrenoms: destinataires.map((p) => p.prenom) };
    ecrireDemandesEnCours(m);
    peuplerWidgets();
  } catch (e) {
    console.error("cirrestour: échec envoyerDemandes", e);
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
        const entree = m[d.defiId];
        if (!entree || !entree.demandeIds.includes(change.doc.id)) return;

        deleteDoc(change.doc.ref).catch(() => {});

        if (d.statut === "validee") {
          // Premier·e à valider : on annule les demandes encore en attente auprès des autres.
          entree.demandeIds
            .filter((id) => id !== change.doc.id)
            .forEach((id) => deleteDoc(doc(db, "demandes_validation", id)).catch(() => {}));
          delete m[d.defiId];
          ecrireDemandesEnCours(m);
          if (window.CIRRESTOUR_marquerValide) window.CIRRESTOUR_marquerValide(d.defiId, d.versPrenom);
          tenterUploadPhoto(d.defiId, d.defiTitre);
        } else {
          // Refus d'une seule personne : on continue d'attendre les autres, s'il y en a.
          entree.demandeIds = entree.demandeIds.filter((id) => id !== change.doc.id);
          entree.versPrenoms = entree.versPrenoms.filter((n) => n !== d.versPrenom);
          if (entree.demandeIds.length) m[d.defiId] = entree;
          else delete m[d.defiId];
          ecrireDemandesEnCours(m);
        }
        peuplerWidgets();
      });
    },
    () => {}
  );
});

// ---------- Écoute des demandes reçues (à approuver) ----------
const elBanniere = document.getElementById("validation-banniere");
const banniereTexte = document.getElementById("validation-banniere-texte");
const banniereNote = document.getElementById("validation-banniere-note");
const bannierePhoto = document.getElementById("validation-banniere-photo");
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
  if (demandeEnCoursAffichee.note) {
    banniereNote.textContent = `« ${demandeEnCoursAffichee.note} »`;
    banniereNote.classList.remove("hidden");
  } else {
    banniereNote.classList.add("hidden");
    banniereNote.textContent = "";
  }
  if (demandeEnCoursAffichee.photo) {
    bannierePhoto.src = demandeEnCoursAffichee.photo;
    bannierePhoto.classList.remove("hidden");
  } else {
    bannierePhoto.classList.add("hidden");
    bannierePhoto.src = "";
  }
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
    console.error("cirrestour: échec repondre", e);
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
    const validateurs = conteneur.dataset.validateurs ? conteneur.dataset.validateurs.split(",") : null;
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
      p.textContent = `⏳ En attente de validation par ${enCours.versPrenoms.join(" ou ")}...`;
      const btnAnnuler = document.createElement("button");
      btnAnnuler.className = "validation-annuler";
      btnAnnuler.textContent = "Annuler";
      btnAnnuler.addEventListener("click", () => window.CIRRESTOUR_annulerDemande(defiId));
      conteneur.appendChild(p);
      conteneur.appendChild(btnAnnuler);
    } else {
      const btn = document.createElement("button");
      btn.className = "defi-photo-btn";
      btn.textContent = validateurs
        ? `🤝 Demander une validation à ${validateurs.join(" ou ")}`
        : "🤝 Demander une validation";
      btn.addEventListener("click", () => {
        if (validateurs) envoyerDemandeGroupee(defiId, defiTitre, validateurs);
        else window.CIRRESTOUR_ouvrirDemandeValidation(defiId, defiTitre);
      });
      conteneur.appendChild(btn);
    }
  });
}

window.addEventListener("cirrestour:liste-rendue", peuplerWidgets);
peuplerWidgets();
