// Vue "organisateur" cachée : activée via ?organisateur=CODE, persistée en localStorage.
// Aucune UI visible pour les participants normaux.
import { db, authReady } from "./firebase-init.js";
import { estOrganisateur } from "./organisateur.js";
import {
  collection,
  onSnapshot,
  getDocs,
  doc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const TOTAL_DEFIS_PAR_DEFAUT = 10; // repli si config/defis n'a jamais été publié

if (estOrganisateur) {
  const btnToggle = document.getElementById("btn-dashboard-toggle");
  const elDashboard = document.getElementById("dashboard");
  const listeDashboard = document.getElementById("dashboard-liste");
  const dashboardStatus = document.getElementById("dashboard-status");
  const btnFermer = document.getElementById("btn-fermer-dashboard");
  const btnResetTous = document.getElementById("btn-reset-tous");
  const btnTelechargerPhotos = document.getElementById("btn-telecharger-photos");

  btnToggle.classList.remove("hidden");
  let abonne = false;
  let dernierParticipants = [];
  let totalDefis = TOTAL_DEFIS_PAR_DEFAUT;

  btnToggle.addEventListener("click", () => {
    document.querySelectorAll(".screen").forEach((s) => s.classList.add("hidden"));
    elDashboard.classList.remove("hidden");
    if (!abonne) { abonne = true; demarrerEcoute(); }
  });

  btnFermer.addEventListener("click", () => {
    elDashboard.classList.add("hidden");
    window.dispatchEvent(new CustomEvent("cirrestour:retour-app"));
  });

  btnResetTous.addEventListener("click", async () => {
    if (!dernierParticipants.length) return;
    const ok = confirm(`Supprimer les ${dernierParticipants.length} participant(s) de Firestore ? (n'efface pas leur passeport local sur leur téléphone)`);
    if (!ok) return;
    btnResetTous.disabled = true;
    try {
      await Promise.all(dernierParticipants.map((p) => deleteDoc(doc(db, "participants", p.id))));
    } catch (err) {
      alert("Échec de la suppression (vérifie ta connexion et les Security Rules Firestore).");
    } finally {
      btnResetTous.disabled = false;
    }
  });

  function dataUrlVersBlob(dataUrl) {
    const [entete, base64] = dataUrl.split(",");
    const mime = (entete.match(/data:(.*?);base64/) || [, "image/jpeg"])[1];
    const binaire = atob(base64);
    const octets = new Uint8Array(binaire.length);
    for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
    return new Blob([octets], { type: mime });
  }

  btnTelechargerPhotos.addEventListener("click", async () => {
    btnTelechargerPhotos.disabled = true;
    try {
      const snap = await getDocs(collection(db, "photos_validees"));
      if (snap.empty) {
        alert("Aucune photo validée pour l'instant.");
        return;
      }
      for (const d of snap.docs) {
        const data = d.data();
        const blob = dataUrlVersBlob(data.photo);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${data.prenom || "participant"}-${data.defiId}.jpg`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        await new Promise((r) => setTimeout(r, 200)); // laisse le navigateur accepter chaque téléchargement
      }
    } catch (err) {
      alert("Échec du téléchargement (vérifie ta connexion et les Security Rules Firestore).");
    } finally {
      btnTelechargerPhotos.disabled = false;
    }
  });

  function demarrerEcoute() {
    authReady.then(() => {
      onSnapshot(doc(db, "config", "defis"), (snap) => {
        if (snap.exists() && Array.isArray(snap.data().liste) && snap.data().liste.length) {
          totalDefis = snap.data().liste.length;
        }
        rendre(dernierParticipants);
      });
      onSnapshot(
        collection(db, "participants"),
        (snap) => {
          const participants = [];
          snap.forEach((d) => participants.push({ id: d.id, ...d.data() }));
          rendre(participants);
        },
        () => { dashboardStatus.textContent = "Connexion indisponible, nouvelle tentative automatique..."; }
      );
    });
  }

  function compte(p) {
    // Toujours recalculé depuis `defis`, jamais depuis le champ dénormalisé `total`.
    return p.defis ? Object.values(p.defis).filter(Boolean).length : 0;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function rendre(participants) {
    participants.sort((a, b) => compte(b) - compte(a));
    dernierParticipants = participants;
    listeDashboard.innerHTML = "";
    participants.forEach((p) => {
      const n = compte(p);
      const pct = totalDefis ? Math.round((n / totalDefis) * 100) : 0;
      const li = document.createElement("li");
      li.className = "dashboard-carte" + (totalDefis > 0 && n === totalDefis ? " complet" : "");
      li.innerHTML = `
        <div class="dashboard-ligne">
          <span class="dashboard-nom">${escapeHtml(p.prenom || "(sans nom)")}</span>
          <span class="dashboard-droite">
            <span class="dashboard-score">${n} / ${totalDefis}</span>
            <button class="dashboard-suppr" title="Supprimer ce participant">🗑️</button>
          </span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>`;
      li.querySelector(".dashboard-suppr").addEventListener("click", async () => {
        const ok = confirm(`Supprimer "${p.prenom || "(sans nom)"}" de Firestore ? (n'efface pas son passeport local sur son téléphone, utile pour retirer un doublon)`);
        if (!ok) return;
        try {
          await deleteDoc(doc(db, "participants", p.id));
        } catch (err) {
          alert("Échec de la suppression (vérifie ta connexion et les Security Rules Firestore).");
        }
      });
      listeDashboard.appendChild(li);
    });
    dashboardStatus.textContent = `${participants.length} participant(s) — mis à jour en direct`;
  }
}
