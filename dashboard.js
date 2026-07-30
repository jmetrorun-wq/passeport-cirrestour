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
import { zipSync } from "https://cdn.jsdelivr.net/npm/fflate@0.8.2/+esm";

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
  let defisListe = (window.CIRRESTOUR_DEFIS_DEFAUT || []).slice();
  const deplies = new Set(); // ids des participants dont le détail est ouvert, préservé entre les re-rendus

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

  function dataUrlVersOctets(dataUrl) {
    const base64 = dataUrl.split(",")[1];
    const binaire = atob(base64);
    const octets = new Uint8Array(binaire.length);
    for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
    return octets;
  }

  btnTelechargerPhotos.addEventListener("click", async () => {
    btnTelechargerPhotos.disabled = true;
    try {
      const snap = await getDocs(collection(db, "photos_validees"));
      if (snap.empty) {
        alert("Aucune photo validée pour l'instant.");
        return;
      }
      const noms = new Set();
      const fichiers = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        let nom = `${data.prenom || "participant"}-${data.defiId}.jpg`;
        if (noms.has(nom)) nom = `${data.prenom || "participant"}-${data.defiId}-${d.id}.jpg`;
        noms.add(nom);
        fichiers[nom] = dataUrlVersOctets(data.photo);
      });
      const zipOctets = zipSync(fichiers);
      const url = URL.createObjectURL(new Blob([zipOctets], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `photos-cirrestour-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
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
          defisListe = snap.data().liste;
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

  function defisRestants(p) {
    const faits = p.defis || {};
    return defisListe.filter((d) => !faits[d.id]);
  }

  function rendre(participants) {
    participants.sort((a, b) => compte(b) - compte(a));
    dernierParticipants = participants;
    listeDashboard.innerHTML = "";
    participants.forEach((p) => {
      const n = compte(p);
      const pct = totalDefis ? Math.round((n / totalDefis) * 100) : 0;
      const ouvert = deplies.has(p.id);
      const restants = defisRestants(p);
      const li = document.createElement("li");
      li.className = "dashboard-carte" + (totalDefis > 0 && n === totalDefis ? " complet" : "");
      li.innerHTML = `
        <div class="dashboard-ligne">
          <span class="dashboard-nom">${escapeHtml(p.prenom || "(sans nom)")}</span>
          <span class="dashboard-droite">
            <button class="dashboard-suppr" title="Supprimer ce participant">🗑️</button>
          </span>
        </div>
        <button class="dashboard-avancement" aria-expanded="${ouvert}">
          <span class="dashboard-score">${n} / ${totalDefis}</span>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
          <span class="dashboard-chevron">${ouvert ? "▲" : "▼"}</span>
        </button>
        <ul class="dashboard-restants${ouvert ? "" : " hidden"}">
          ${
            n === totalDefis
              ? `<li class="dashboard-restant-vide">🎉 Tous les défis sont terminés !</li>`
              : restants.map((d) => `<li>${escapeHtml(d.icone || "•")} ${escapeHtml(d.titre)}</li>`).join("")
          }
        </ul>`;
      li.querySelector(".dashboard-suppr").addEventListener("click", async (e) => {
        e.stopPropagation();
        const ok = confirm(`Supprimer "${p.prenom || "(sans nom)"}" de Firestore ? (n'efface pas son passeport local sur son téléphone, utile pour retirer un doublon)`);
        if (!ok) return;
        try {
          await deleteDoc(doc(db, "participants", p.id));
        } catch (err) {
          alert("Échec de la suppression (vérifie ta connexion et les Security Rules Firestore).");
        }
      });
      li.querySelector(".dashboard-avancement").addEventListener("click", () => {
        if (deplies.has(p.id)) deplies.delete(p.id); else deplies.add(p.id);
        rendre(dernierParticipants);
      });
      listeDashboard.appendChild(li);
    });
    dashboardStatus.textContent = `${participants.length} participant(s) — mis à jour en direct`;
  }
}
