(function () {
  "use strict";

  const STORAGE_KEY = "cirrestour_passeport_v1";
  const MAX_PHOTO_WIDTH = 900;
  const PHOTO_QUALITY = 0.72;
  window.CIRRESTOUR_STORAGE_KEY = STORAGE_KEY;

  // Jeu de défis bundlé, utilisé tant qu'aucune config organisateur n'a été reçue.
  // "compliment" reste en validation ouverte (n'importe quel·le participant·e).
  // Tous les autres défis demandent une validation restreinte à Manu ou Chnick.
  const VALIDATEURS_REFERENTS = ["Manu", "Chnick"];
  const DEFIS_DEFAUT = [
    { id: "papangue", titre: "Photo d'un papangue", desc: "Immortalise ce rapace emblématique de Mafate", type: "photo", icone: "🦅", validateurs: VALIDATEURS_REFERENTS },
    { id: "compliment", titre: "Un compliment offert", desc: "Fais un compliment sincère à quelqu'un", type: "validation", icone: "💬" },
    { id: "encourager", titre: "Encourager un·e collègue", desc: "Un mot qui redonne des jambes dans la montée", type: "note", icone: "📣", validateurs: VALIDATEURS_REFERENTS },
    { id: "montee", titre: "Le même endroit, en photo", desc: "Retrouve cet endroit du parcours et prends la même photo (repère ci-dessous)", type: "photo", icone: "⛰️", photoRef: "assets/repere-montee.jpg", validateurs: VALIDATEURS_REFERENTS },
    { id: "tunnel", titre: "Sous un tunnel", desc: "Passe sous un tunnel du parcours", type: "check", icone: "🕳️", validateurs: VALIDATEURS_REFERENTS },
    { id: "selfie", titre: "Selfie original", desc: "Le plus créatif possible !", type: "photo", icone: "🤳", validateurs: VALIDATEURS_REFERENTS },
    { id: "rire", titre: "Faire rire quelqu'un", desc: "Une bonne blague, une grimace...", type: "note", icone: "😂", validateurs: VALIDATEURS_REFERENTS },
    { id: "aider", titre: "Aider une personne", desc: "Un coup de main, un sac porté...", type: "note", icone: "🤝", validateurs: VALIDATEURS_REFERENTS },
    { id: "secret", titre: "Un secret dévoilé", desc: "Apprends une info perso sur un·e collègue", type: "note", icone: "🕵️", validateurs: VALIDATEURS_REFERENTS },
    { id: "esprit-equipe", titre: "Esprit d'équipe", desc: "Photo/selfie qui représente le groupe", type: "photo", icone: "🌟", validateurs: VALIDATEURS_REFERENTS }
  ];
  window.CIRRESTOUR_DEFIS_DEFAUT = DEFIS_DEFAUT;

  const DEFIS_CONFIG_KEY = "cirrestour_defis_config_v1";
  window.CIRRESTOUR_DEFIS_CONFIG_KEY = DEFIS_CONFIG_KEY;

  function chargerDefisLocal() {
    try {
      const brut = localStorage.getItem(DEFIS_CONFIG_KEY);
      if (!brut) return null;
      const p = JSON.parse(brut);
      if (!p || !Array.isArray(p.liste) || !p.liste.length) return null;
      return p;
    } catch (e) {
      return null;
    }
  }

  const defisConfigCache = chargerDefisLocal();
  let DEFIS = (defisConfigCache && defisConfigCache.liste) || DEFIS_DEFAUT.slice();
  let defisVersion = (defisConfigCache && defisConfigCache.version) || 0;

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

  // Notifie sync.js (module séparé, optionnel) qu'il peut pousser l'état vers Firestore.
  // N'envoie jamais notes ni photos, seulement le prénom et les statuts "done".
  function notifierSyncDistant() {
    window.dispatchEvent(new CustomEvent("cirrestour:etat-modifie", {
      detail: {
        prenom: state.prenom,
        defis: Object.fromEntries(DEFIS.map((d) => [d.id, !!state.defis[d.id].done])),
        celebrated: state.celebrated
      }
    }));
  }

  // Applique une nouvelle config de défis reçue de defis-sync.js (organisateur -> téléphone).
  // Préserve toujours la progression déjà cochée pour les défis dont l'id existe encore.
  function appliquerConfigDefis(nouvelleListe, version) {
    if (!Array.isArray(nouvelleListe) || !nouvelleListe.length) return;
    if (version <= defisVersion) return;

    const ancien = state.defis;
    DEFIS = nouvelleListe;
    defisVersion = version;

    const nouveauxDefis = {};
    DEFIS.forEach((d) => {
      nouveauxDefis[d.id] = ancien[d.id] || { done: false, note: "", photo: null };
    });
    state.defis = nouveauxDefis;
    sauvegarder();
    majTextesStatiques();

    if (!elApp.classList.contains("hidden")) {
      renderListe();
      renderProgress();
    }
  }

  window.addEventListener("cirrestour:defis-config", (e) => {
    appliquerConfigDefis(e.detail.liste, e.detail.version);
  });

  // ---------- Éléments DOM ----------
  const elOnboarding = document.getElementById("onboarding");
  const elApp = document.getElementById("app");
  const elOnboardingSubtitle = document.getElementById("onboarding-subtitle");
  const elCelebrationText = document.getElementById("celebration-text");
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

  function majTextesStatiques() {
    elOnboardingSubtitle.textContent = `${DEFIS.length} défis t'attendent tout au long du parcours. Coche-les au fur et à mesure !`;
    elCelebrationText.textContent = `Tu as relevé les ${DEFIS.length} défis du Cirres'Tour à Mafate.`;
  }
  const btnFermerCelebration = document.getElementById("btn-fermer-celebration");
  const photoInput = document.getElementById("photo-input");
  const btnTelechargerVisa = document.getElementById("btn-telecharger-visa");
  const visaModal = document.getElementById("visa-modal");
  const visaImage = document.getElementById("visa-image");

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
    notifierSyncDistant();
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

      if (d.type === "note" || d.type === "validation") {
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

      if (d.photoRef) {
        const repere = document.createElement("div");
        repere.className = "defi-repere";
        const label = document.createElement("p");
        label.className = "defi-repere-label";
        label.textContent = "📍 Photo repère — reproduis ce cadrage :";
        const imgRepere = document.createElement("img");
        imgRepere.className = "defi-repere-img";
        imgRepere.src = d.photoRef;
        imgRepere.alt = "Photo de référence de l'endroit à retrouver";
        imgRepere.addEventListener("click", () => ouvrirLightboxRepere(d.photoRef));
        repere.appendChild(label);
        repere.appendChild(imgRepere);
        li.appendChild(repere);
      }

      if (d.type === "photo") {
        if (s.photo) {
          const img = document.createElement("img");
          img.className = "defi-photo-preview";
          img.src = s.photo;
          img.alt = d.titre;
          li.appendChild(img);

          const actions = document.createElement("div");
          actions.className = "defi-photo-actions";

          const btnReprendre = document.createElement("button");
          btnReprendre.className = "defi-photo-btn";
          btnReprendre.textContent = "🔄 Reprendre";
          btnReprendre.addEventListener("click", () => ouvrirCapturePhoto(d.id));

          const btnSupprimer = document.createElement("button");
          btnSupprimer.className = "defi-photo-btn defi-photo-supprimer";
          btnSupprimer.textContent = "🗑️ Supprimer";
          btnSupprimer.addEventListener("click", () => supprimerPhoto(d.id));

          actions.appendChild(btnReprendre);
          actions.appendChild(btnSupprimer);
          li.appendChild(actions);
        } else {
          const btnPhoto = document.createElement("button");
          btnPhoto.className = "defi-photo-btn";
          btnPhoto.textContent = "📷 Ajouter une photo";
          btnPhoto.addEventListener("click", () => ouvrirCapturePhoto(d.id));
          li.appendChild(btnPhoto);
        }
      }

      if (d.type === "validation" || Array.isArray(d.validateurs)) {
        const conteneur = document.createElement("div");
        conteneur.className = "defi-validation";
        conteneur.dataset.defiId = d.id;
        conteneur.dataset.titre = d.titre;
        if (Array.isArray(d.validateurs)) conteneur.dataset.validateurs = d.validateurs.join(",");
        li.appendChild(conteneur);
      }

      listeDefis.appendChild(li);
    });
    window.dispatchEvent(new CustomEvent("cirrestour:liste-rendue"));
  }

  function basculerDone(id) {
    state.defis[id].done = !state.defis[id].done;
    sauvegarder();
    renderListe();
    renderProgress();
    verifierCompletion();
    notifierSyncDistant();
  }

  // Appelé par validation.js quand une demande de validation a été acceptée par la personne concernée.
  window.CIRRESTOUR_marquerValide = function (id, parPrenom) {
    if (!state.defis[id] || state.defis[id].done) return;
    state.defis[id].done = true;
    state.defis[id].valideePar = parPrenom;
    sauvegarder();
    if (!elApp.classList.contains("hidden")) {
      renderListe();
      renderProgress();
    }
    verifierCompletion();
    notifierSyncDistant();
  };

  // ---------- Aperçu plein écran d'une photo repère ----------
  const elLightboxRepere = document.getElementById("photo-repere-lightbox");
  const imgLightboxRepere = document.getElementById("photo-repere-lightbox-img");

  function ouvrirLightboxRepere(src) {
    imgLightboxRepere.src = src;
    elLightboxRepere.classList.remove("hidden");
  }

  elLightboxRepere.addEventListener("click", () => elLightboxRepere.classList.add("hidden"));

  function ouvrirCapturePhoto(id) {
    photoDefiIdEnCours = id;
    photoInput.value = "";
    photoInput.click();
  }

  function supprimerPhoto(id) {
    state.defis[id].photo = null;
    sauvegarder();
    renderListe();
    renderProgress();
    notifierSyncDistant();
  }

  photoInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file || !photoDefiIdEnCours) return;
    const defi = DEFIS.find((d) => d.id === photoDefiIdEnCours);
    redimensionnerImage(file, MAX_PHOTO_WIDTH, PHOTO_QUALITY)
      .then((dataUrl) => {
        state.defis[photoDefiIdEnCours].photo = dataUrl;
        // Si une validation par pair est requise, la photo seule ne suffit pas à
        // marquer le défi comme fait : il faut ensuite le faire valider (ou cocher soi-même).
        if (!defi || !Array.isArray(defi.validateurs)) {
          state.defis[photoDefiIdEnCours].done = true;
        }
        sauvegarder();
        renderListe();
        renderProgress();
        verifierCompletion();
        notifierSyncDistant();
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
    ouvrirVisa();
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

  // ---------- Visa souvenir (image téléchargeable) ----------
  const VISA_TEMPLATE_SRC = "assets/visa-template.jpg";
  let visaTemplateImg = null;

  function chargerVisaTemplate() {
    if (visaTemplateImg) return Promise.resolve(visaTemplateImg);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { visaTemplateImg = img; resolve(img); };
      img.onerror = reject;
      img.src = VISA_TEMPLATE_SRC;
    });
  }

  function genererVisaDataUrl(img, prenom) {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    const cx = canvas.width * 0.645;
    const baseline = canvas.height * 0.54;
    const label = "TITULAIRE DU VISA : ";
    const largeurMax = canvas.width * 0.52;
    const fontLabel = (t) => `italic bold ${Math.round(t * 0.6)}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
    const fontNom = (t) => `700 ${t}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;

    ctx.textAlign = "left";
    let tailleNom = 40;
    let largeurLabel, largeurNom;
    do {
      ctx.font = fontLabel(tailleNom);
      largeurLabel = ctx.measureText(label).width;
      ctx.font = fontNom(tailleNom);
      largeurNom = ctx.measureText(prenom).width;
      if (largeurLabel + largeurNom <= largeurMax || tailleNom <= 20) break;
      tailleNom -= 2;
    } while (true);

    let x = cx - (largeurLabel + largeurNom) / 2;
    ctx.font = fontLabel(tailleNom);
    ctx.fillStyle = "#5c7154";
    ctx.fillText(label, x, baseline);
    x += largeurLabel;

    ctx.font = fontNom(tailleNom);
    ctx.fillStyle = "#a0781e";
    ctx.fillText(prenom, x, baseline);

    return canvas.toDataURL("image/png");
  }

  async function ouvrirVisa() {
    try {
      const img = await chargerVisaTemplate();
      const dataUrl = genererVisaDataUrl(img, state.prenom || "Cirres'Touriste");
      visaImage.src = dataUrl;
      visaModal.classList.remove("hidden");
    } catch (e) {
      alert("Impossible de générer le visa pour l'instant.");
    }
  }

  btnTelechargerVisa.addEventListener("click", ouvrirVisa);
  visaModal.addEventListener("click", (e) => {
    if (e.target === visaModal) visaModal.classList.add("hidden");
  });

  // ---------- Service worker (hors-ligne) ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  // ---------- Badge d'installation PWA ----------
  const btnInstall = document.getElementById("btn-install");
  const installInstructions = document.getElementById("install-instructions");
  const btnFermerInstallInstructions = document.getElementById("btn-fermer-install-instructions");

  const estInstallee =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  const estIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  let promptInstallDiffere = null;

  if (!estInstallee) {
    if (estIOS) {
      btnInstall.classList.remove("hidden");
    } else {
      window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        promptInstallDiffere = e;
        btnInstall.classList.remove("hidden");
      });
    }
  }

  btnInstall.addEventListener("click", async () => {
    if (promptInstallDiffere) {
      promptInstallDiffere.prompt();
      await promptInstallDiffere.userChoice;
      promptInstallDiffere = null;
      btnInstall.classList.add("hidden");
    } else {
      installInstructions.classList.remove("hidden");
    }
  });

  btnFermerInstallInstructions.addEventListener("click", () => {
    installInstructions.classList.add("hidden");
  });

  window.addEventListener("appinstalled", () => {
    btnInstall.classList.add("hidden");
    installInstructions.classList.add("hidden");
  });

  window.addEventListener("cirrestour:retour-app", demarrer);

  majTextesStatiques();
  demarrer();
})();
