// Gating organisateur partagé : activé via ?organisateur=CODE, persisté en localStorage.
const CODE_ORGANISATEUR = "MAFATE2026"; // à personnaliser
const FLAG_KEY = "cirrestour_organisateur_ok";

const params = new URLSearchParams(location.search);
if (params.get("organisateur") === CODE_ORGANISATEUR) {
  localStorage.setItem(FLAG_KEY, "1");
  params.delete("organisateur");
  const reste = params.toString();
  history.replaceState(null, "", location.pathname + (reste ? "?" + reste : ""));
}

export const estOrganisateur = localStorage.getItem(FLAG_KEY) === "1";
