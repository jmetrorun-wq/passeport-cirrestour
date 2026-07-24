# 🎒 Passeport Cirres'Tour à Mafate

Un passeport de randonnée numérique, conçu pour une sortie entre collègues à Mafate (Réunion) — une zone sans réseau mobile. Chaque participant installe l'app sur son téléphone et coche des défis tout au long du parcours. Quand tous les défis sont relevés : feu d'artifice et visa souvenir personnalisé à télécharger. 🎉

**👉 [Ouvrir l'app](https://jmetrorun-wq.github.io/passeport-cirrestour/)**

## Fonctionnement

- **100% hors-ligne** : une fois l'app chargée une première fois, tout fonctionne sans réseau (`localStorage` + Service Worker). Pensé pour Mafate, où il n'y a pas de couverture mobile.
- **Un passeport par personne** : chacun installe l'app sur son propre téléphone (icône "Ajouter à l'écran d'accueil") et progresse à son rythme.
- **Défis variés** : coche simple, note à écrire, ou photo à prendre (dont une photo à reproduire à partir d'un repère fourni).
- **Validation par un pair** : certains défis se valident en demandant confirmation à un·e référent·e du groupe plutôt qu'en se cochant soi-même. La demande est envoyée en simultané à tou·te·s les référent·e·s désigné·e·s, avec la photo jointe s'il y en a une — la case à cocher manuelle reste toujours disponible en secours.
- **Célébration + visa souvenir** : une fois les défis complétés, animation de feu d'artifice et génération d'un visa personnalisé (avec le prénom incrusté) téléchargeable comme souvenir.

Une couche de synchronisation Firebase, optionnelle et best-effort, se superpose à cette base 100% locale (uniquement utile quand il y a du réseau, plutôt avant/après la rando ou aux gîtes) :

- suivi en direct de la progression de chacun,
- réception des demandes de validation par les référent·e·s,
- petit dashboard organisateur (masqué, accessible via un lien dédié) pour suivre les participants, gérer la liste des défis sans redéploiement, et télécharger d'un coup (en `.zip`) toutes les photos validées pour un montage souvenir.

## Stack technique

HTML/CSS/JS vanille, sans framework ni étape de build. Les modules Firebase sont chargés en ESM directement depuis un CDN et communiquent avec la logique principale (`app.js`) via des évènements custom, jamais par import direct — l'app reste pleinement fonctionnelle même si Firebase est indisponible.

```
index.html          Structure de l'app
app.js               Logique participant (défis, progression, célébration, visa) + localStorage
style.css            Styles

firebase-init.js      Initialisation Firebase (config publique, sans donnée perso)
sync.js               Synchronisation de la progression d'un participant
defis-sync.js         Réception d'une config de défis personnalisée publiée par l'organisateur
validation.js         Demandes de validation par un pair
dashboard.js          Dashboard organisateur (suivi participants, export photos)
defis-editor.js       Édition de la liste des défis par l'organisateur
organisateur.js       Contrôle d'accès au mode organisateur

manifest.json                PWA — participant
manifest-organisateur.json   PWA — icône dédiée en mode organisateur
sw.js                        Service Worker (cache hors-ligne)
assets/                       Images (logo, photo repère, visa)
icons/                        Icônes PWA
```

## Mode organisateur

Une vue cachée, invisible pour les participants, permet à l'organisateur de suivre la progression du groupe, d'éditer la liste des défis (titres, descriptions, référent·e·s de validation) sans toucher au code, et d'exporter les photos validées. Elle s'active via un lien dédié contenant un code secret, à retrouver dans `organisateur.js`.

## Statut

Projet développé pour un usage privé ponctuel entre collègues. Le dépôt est public (nécessaire pour l'hébergement gratuit via GitHub Pages) — aucune donnée personnelle n'y est stockée.
