(function () {
  "use strict";

  const STORAGE_KEY = "cirrestour_passeport_v1";
  const MAX_PHOTO_WIDTH = 900;
  const PHOTO_QUALITY = 0.72;

  const DEFIS = [
    { id: "papangue", titre: "Photo d'un papangue", desc: "Immortalise ce rapace emblématique de Mafate", type: "photo", icone: "🦅" },
    { id: "compliment", titre: "Un compliment offert", desc: "Fais un compliment sincère à quelqu'un", type: "note", icone: "💬" },
    { id: "encourager", titre: "Encourager un·e collègue", desc: "Un mot qui redonne des jambes dans la montée", type: "note", icone: "📣" },
    { id: "montee", titre: "Une montée conquise", desc: "Termine une bonne montée sans craquer", type: "check", icone: "⛰️" },
    { id: "tunnel", titre: "Sous un tunnel", desc: "Passe sous un tunnel du parcours", type: "check", icone: "🕳️" },
    { id: "selfie", titre: "Selfie original", desc: "Le plus créatif possible !", type: "photo", icone: "🤳" },
    { id: "rire", titre: "Faire rire quelqu'un", desc: "Une bonne blague, une grimace...", type: "note", icone: "😂" },
    { id: "aider", titre: "Aider une personne", desc: "Un coup de main, un sac porté...", type: "note", icone: "🤝" },
    { id: "secret", titre: "Un secret dévoilé", desc: "Apprends une info perso sur un·e collègue", type: "note", icone: "🕵️" },
    { id: "esprit-equipe", titre: "Esprit d'équipe", desc: "Photo/selfie qui représente le groupe", type: "photo", icone: "🌟" }
  ];

  // ---------- État ----------
  function etatParDefaut() {
    const defis = {};
    DEFIS.forEach((d) => { defis[d.id] = { done: false, note: "", photo: null }; });
    return { prenom: "", defis, celebrated: false };
  }

  function chargerEtat() {
    try {
      const brut = localStorage.getItem(STORAGE_KEY);
      if (!brut) return etatParDefaut();
      const parse = JSON.parse(brut);
      const base = etatParDefaut();
      base.prenom = parse.prenom || "";
      base.celebrated = !!parse.celebrated;
      DEFIS.forEach((d) => {
        if (parse.defis && parse.defis[d.id]) {
          base.defis[d.id] = Object.assign(base.defis[d.id], parse.defis[d.id]);
        }
      });
      return base;
    } catch (e) {
      return etatParDefaut();
    }
  }

  let state = chargerEtat();

  function sauvegarder() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // ---------- Éléments DOM ----------
  const elOnboarding = document.getElementById("onboarding");
  const elApp = document.getElementById("app");
  const formPrenom = document.getElementById("form-prenom");
  const inputPrenom = document.getElementById("prenom");
  const prenomAffiche = document.getElementById("prenom-affiche");
  const prenomFinal = document.getElementById("prenom-final");
  const listeDefis = document.getElementById("liste-defis");
  const progressFill = document.getElementById("progress-fill");
  const progressLabel = document.getElementById("progress-label");
  const btnRevoir = document.getElementById("btn-revoir");
  const btnReset = document.getElementById("btn-reset");
  const elCelebration = document.getElementById("celebration");
  const btnFermerCelebration = document.getElementById("btn-fermer-celebration");
  const photoInput = document.getElementById("photo-input");

  let photoDefiIdEnCours = null;

  // ---------- Démarrage ----------
  function demarrer() {
    if (state.prenom) {
      afficherApp();
    } else {
      elOnboarding.classList.remove("hidden");
      elApp.classList.add("hidden");
    }
  }

  formPrenom.addEventListener("submit", (e) => {
    e.preventDefault();
    const val = inputPrenom.value.trim();
    if (!val) return;
    state.prenom = val;
    sauvegarder();
    afficherApp();
  });

  function afficherApp() {
    elOnboarding.classList.add("hidden");
    elApp.classList.remove("hidden");
    prenomAffiche.textContent = state.prenom;
    prenomFinal.textContent = state.prenom;
    renderListe();
    renderProgress();
  }

  // ---------- Rendu de la liste ----------
  function renderListe() {
    listeDefis.innerHTML = "";
    DEFIS.forEach((d) => {
      const s = state.defis[d.id];
      const li = document.createElement("li");
      li.className = "defi-carte" + (s.done ? " done" : "");

      const top = document.createElement("div");
      top.className = "defi-top";

      const icone = document.createElement("div");
      icone.className = "defi-icone";
      icone.textContent = d.icone;

      const texte = document.createElement("div");
      texte.className = "defi-texte";
      texte.innerHTML = `<p class="defi-titre">${d.titre}</p><p class="defi-desc">${d.desc}</p>`;

      const check = document.createElement("button");
      check.className = "defi-check";
      check.setAttribute("aria-label", "Marquer comme réalisé");
      check.textContent = s.done ? "✓" : "";
      check.addEventListener("click", () => basculerDone(d.id));

      top.appendChild(icone);
      top.appendChild(texte);
      top.appendChild(check);
      li.appendChild(top);

      if (d.type === "note") {
        const textarea = document.createElement("textarea");
        textarea.className = "defi-note";
        textarea.rows = 2;
        textarea.placeholder = "Un petit détail à noter (optionnel)...";
        textarea.value = s.note || "";
        textarea.addEventListener("input", () => {
          state.defis[d.id].note = textarea.value;
          sauvegarder();
        });
        li.appendChild(textarea);
      }

      if (d.type === "photo") {
        if (s.photo) {
          const img = document.createElement("img");
          img.className = "defi-photo-preview";
          img.src = s.photo;
          img.alt = d.titre;
          img.addEventListener("click", () => ouvrirCapturePhoto(d.id));
          li.appendChild(img);
        } else {
          const btnPhoto = document.createElement("button");
          btnPhoto.className = "defi-photo-btn";
          btnPhoto.textContent = "📷 Ajouter une photo";
          btnPhoto.addEventListener("click", () => ouvrirCapturePhoto(d.id));
          li.appendChild(btnPhoto);
        }
      }

      listeDefis.appendChild(li);
    });
  }

  function basculerDone(id) {
    state.defis[id].done = !state.defis[id].done;
    sauvegarder();
    renderListe();
    renderProgress();
    verifierCompletion();
  }

  function ouvrirCapturePhoto(id) {
    photoDefiIdEnCours = id;
    photoInput.value = "";
    photoInput.click();
  }

  photoInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file || !photoDefiIdEnCours) return;
    redimensionnerImage(file, MAX_PHOTO_WIDTH, PHOTO_QUALITY)
      .then((dataUrl) => {
        state.defis[photoDefiIdEnCours].photo = dataUrl;
        state.defis[photoDefiIdEnCours].done = true;
        sauvegarder();
        renderListe();
        renderProgress();
        verifierCompletion();
      })
      .catch(() => {});
  });

  function redimensionnerImage(file, maxWidth, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const ratio = Math.min(1, maxWidth / img.width);
          const w = Math.round(img.width * ratio);
          const h = Math.round(img.height * ratio);
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ---------- Progression ----------
  function compterDone() {
    return DEFIS.filter((d) => state.defis[d.id].done).length;
  }

  function renderProgress() {
    const n = compterDone();
    const pct = Math.round((n / DEFIS.length) * 100);
    progressFill.style.width = pct + "%";
    progressLabel.textContent = `${n} / ${DEFIS.length} défis relevés`;
    btnRevoir.classList.toggle("hidden", !(state.celebrated && n === DEFIS.length));
  }

  function verifierCompletion() {
    const n = compterDone();
    if (n === DEFIS.length && !state.celebrated) {
      state.celebrated = true;
      sauvegarder();
      lancerCelebration();
    }
  }

  btnRevoir.addEventListener("click", lancerCelebration);

  // ---------- Réinitialisation ----------
  btnReset.addEventListener("click", () => {
    const ok = confirm("Réinitialiser complètement ton passeport (défis, notes et photos) ?");
    if (!ok) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });

  // ---------- Célébration / feu d'artifice ----------
  const canvas = document.getElementById("fireworks-canvas");
  const ctx2d = canvas.getContext("2d");
  let animId = null;
  let particules = [];
  let dernierLancement = 0;
  const COULEURS = ["#e8b84b", "#c99a2e", "#8fb083", "#ffffff", "#f2d98a"];

  function redimensionnerCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function lancerFusee() {
    const x = Math.random() * canvas.width;
    const y = canvas.height * (0.25 + Math.random() * 0.35);
    const couleur = COULEURS[Math.floor(Math.random() * COULEURS.length)];
    const nbParticules = 46;
    for (let i = 0; i < nbParticules; i++) {
      const angle = (Math.PI * 2 * i) / nbParticules;
      const vitesse = 1.5 + Math.random() * 2.5;
      particules.push({
        x, y,
        vx: Math.cos(angle) * vitesse,
        vy: Math.sin(angle) * vitesse,
        vie: 1,
        couleur
      });
    }
  }

  function boucleAnimation(t) {
    ctx2d.fillStyle = "rgba(92, 113, 84, 0.18)";
    ctx2d.fillRect(0, 0, canvas.width, canvas.height);

    if (t - dernierLancement > 750) {
      lancerFusee();
      dernierLancement = t;
    }

    particules.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.035;
      p.vie -= 0.012;
    });
    particules = particules.filter((p) => p.vie > 0);

    particules.forEach((p) => {
      ctx2d.globalAlpha = Math.max(p.vie, 0);
      ctx2d.fillStyle = p.couleur;
      ctx2d.beginPath();
      ctx2d.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
      ctx2d.fill();
    });
    ctx2d.globalAlpha = 1;

    animId = requestAnimationFrame(boucleAnimation);
  }

  function lancerCelebration() {
    elCelebration.classList.remove("hidden");
    redimensionnerCanvas();
    particules = [];
    dernierLancement = 0;
    ctx2d.fillStyle = "#5c7154";
    ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    if (animId) cancelAnimationFrame(animId);
    animId = requestAnimationFrame(boucleAnimation);
  }

  function arreterCelebration() {
    elCelebration.classList.add("hidden");
    if (animId) cancelAnimationFrame(animId);
    animId = null;
  }

  btnFermerCelebration.addEventListener("click", arreterCelebration);
  window.addEventListener("resize", () => {
    if (!elCelebration.classList.contains("hidden")) redimensionnerCanvas();
  });

  // ---------- Service worker (hors-ligne) ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  demarrer();
})();
