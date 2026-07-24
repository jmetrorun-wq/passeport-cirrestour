// Gating organisateur partagé : activé via ?organisateur=CODE, persisté en localStorage.
// Le paramètre n'est plus retiré de l'URL après lecture : sur les iOS antérieurs à 16.4
// (pas de support du Web App Manifest pour "Ajouter à l'écran d'accueil"), l'icône créée
// reprend l'URL affichée dans la barre d'adresse à cet instant — elle doit donc encore
// contenir ?organisateur=CODE pour que l'icône relance toujours en mode organisateur.
const CODE_ORGANISATEUR = "MAFATE2026"; // à personnaliser
const FLAG_KEY = "cirrestour_organisateur_ok";

const params = new URLSearchParams(location.search);
if (params.get("organisateur") === CODE_ORGANISATEUR) {
  localStorage.setItem(FLAG_KEY, "1");
}

export const estOrganisateur = localStorage.getItem(FLAG_KEY) === "1";
