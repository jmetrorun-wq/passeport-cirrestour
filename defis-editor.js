// Éditeur de défis organisateur : modifie config/defis dans Firestore.
// Tester/itérer avec des collègues avant le jour J, puis figer la liste définitivement.
import { db, authReady } from "./firebase-init.js";
import { estOrganisateur } from "./organisateur.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

if (estOrganisateur) {
  const btnToggle = document.getElementById("btn-editor-toggle");
  const elEditor = document.getElementById("defis-editor");
  const listeEditor = document.getElementById("editor-liste");
  const editorStatus = document.getElementById("editor-status");
  const btnAjouter = document.getElementById("btn-editor-ajouter");
  const btnAnnuler = document.getElementById("btn-editor-annuler");
  const btnSauvegarder = document.getElementById("btn-editor-sauvegarder");
  const btnFermer = document.getElementById("btn-fermer-editor");

  btnToggle.classList.remove("hidden");

  let brouillon = [];
  let versionActuelle = 0;

  function slugify(s) {
    return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "defi";
  }

  function idUnique(titre, idsExistants) {
    const base = slugify(titre);
    let id = base;
    let n = 2;
    while (idsExistants.has(id)) {
      id = `${base}-${n}`;
      n++;
    }
    return id;
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  async function chargerDepuisFirestore() {
    editorStatus.textContent = "Chargement de la config actuelle...";
    try {
      const snap = await getDoc(doc(db, "config", "defis"));
      const data = snap.exists() ? snap.data() : null;
      if (data && Array.isArray(data.liste) && data.liste.length) {
        brouillon = JSON.parse(JSON.stringify(data.liste));
        versionActuelle = data.version || 0;
        editorStatus.textContent = `Version actuelle : ${versionActuelle}`;
      } else {
        brouillon = JSON.parse(JSON.stringify(window.CIRRESTOUR_DEFIS_DEFAUT || []));
        versionActuelle = 0;
        editorStatus.textContent = "Aucune config publiée — jeu de défis par défaut chargé.";
      }
    } catch (e) {
      editorStatus.textContent = "Impossible de charger la config (hors-ligne ?).";
    }
    rendre();
  }

  function rendre() {
    listeEditor.innerHTML = "";
    brouillon.forEach((d, i) => {
      const li = document.createElement("li");
      li.className = "editor-carte";
      li.innerHTML = `
        <div class="editor-ligne1">
          <input class="editor-icone" data-champ="icone" value="${escapeAttr(d.icone)}" maxlength="4">
          <input class="editor-titre" data-champ="titre" value="${escapeAttr(d.titre)}" maxlength="60">
        </div>
        <textarea class="editor-desc" data-champ="desc" rows="2" maxlength="140">${escapeAttr(d.desc)}</textarea>
        <div class="editor-actions">
          <select class="editor-type" data-champ="type">
            <option value="check" ${d.type === "check" ? "selected" : ""}>Case à cocher</option>
            <option value="note" ${d.type === "note" ? "selected" : ""}>Note texte</option>
            <option value="photo" ${d.type === "photo" ? "selected" : ""}>Photo</option>
            <option value="validation" ${d.type === "validation" ? "selected" : ""}>Validation par un·e collègue</option>
          </select>
          <span>
            <button type="button" data-action="up" ${i === 0 ? "disabled" : ""}>▲</button>
            <button type="button" data-action="down" ${i === brouillon.length - 1 ? "disabled" : ""}>▼</button>
            <button type="button" data-action="del">🗑️</button>
          </span>
        </div>
        <p class="editor-id">id : ${escapeAttr(d.id)}</p>`;

      li.querySelectorAll("[data-champ]").forEach((el) => {
        el.addEventListener("input", () => { brouillon[i][el.dataset.champ] = el.value; });
      });
      li.querySelector('[data-action="up"]').addEventListener("click", () => deplacer(i, -1));
      li.querySelector('[data-action="down"]').addEventListener("click", () => deplacer(i, 1));
      li.querySelector('[data-action="del"]').addEventListener("click", () => { brouillon.splice(i, 1); rendre(); });

      listeEditor.appendChild(li);
    });
  }

  function deplacer(i, delta) {
    const j = i + delta;
    if (j < 0 || j >= brouillon.length) return;
    const tmp = brouillon[i];
    brouillon[i] = brouillon[j];
    brouillon[j] = tmp;
    rendre();
  }

  btnAjouter.addEventListener("click", () => {
    const ids = new Set(brouillon.map((d) => d.id));
    brouillon.push({ id: idUnique("nouveau-defi", ids), titre: "Nouveau défi", desc: "", type: "check", icone: "⭐" });
    rendre();
  });

  btnAnnuler.addEventListener("click", chargerDepuisFirestore);

  btnSauvegarder.addEventListener("click", async () => {
    const titresVides = brouillon.some((d) => !d.titre.trim());
    if (!brouillon.length || titresVides) {
      alert("Chaque défi doit avoir un titre, et il doit y en avoir au moins un.");
      return;
    }
    const ok = confirm(`Publier cette liste de ${brouillon.length} défi(s) pour tous les téléphones ?`);
    if (!ok) return;
    btnSauvegarder.disabled = true;
    try {
      await authReady;
      const nouvelleVersion = versionActuelle + 1;
      await setDoc(doc(db, "config", "defis"), {
        version: nouvelleVersion,
        liste: brouillon,
        updatedAt: serverTimestamp()
      });
      versionActuelle = nouvelleVersion;
      editorStatus.textContent = `Sauvegardé ✅ — version ${nouvelleVersion}`;
    } catch (e) {
      alert("Échec de la sauvegarde (vérifie ta connexion et les Security Rules Firestore).");
    } finally {
      btnSauvegarder.disabled = false;
    }
  });

  btnToggle.addEventListener("click", () => {
    document.querySelectorAll(".screen").forEach((s) => s.classList.add("hidden"));
    elEditor.classList.remove("hidden");
    chargerDepuisFirestore();
  });

  btnFermer.addEventListener("click", () => {
    elEditor.classList.add("hidden");
    window.dispatchEvent(new CustomEvent("cirrestour:retour-app"));
  });
}
