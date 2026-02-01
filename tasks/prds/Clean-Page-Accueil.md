# PRD: Suppression de “Resources” (Accueil) et de l’outil “CV Checker” (Tools FR)

## Introduction

Cette PRD définit **exclusivement** deux actions de suppression ciblées sur le site.  
Tout autre sujet, amélioration, refactor, modification visuelle ou fonctionnelle est **explicitement hors scope**.

Les actions concernent :
1. La suppression de **Resources** depuis l’en-tête de la page d’accueil **et de sa page correspondante**.
2. La suppression de la **carte CV Checker** depuis la page Tools (FR) **et de sa page correspondante**.

---

## Objectif Global (Authoritative)

- Supprimer **Resources** du header de la page d’accueil **et supprimer la page associée**
- Supprimer la **carte CV Checker** de la page `/fr/tools/` **et supprimer la page associée**

Toute action en dehors de ces deux objectifs est un **FAIL**.

---

## Périmètre (Scope)

### Inclus
- En-tête (header) de la page d’accueil
- Page `/fr/resources`
- Page `/fr/tools/`
- Carte **CV Checker**
- Page `/fr/tools/cv-checker`

### Exclu
- Autres éléments du header
- Autres cartes ou outils
- Autres langues (`/en`, `/de`, `/it`, etc.)
- Backend, base de données
- SEO, redirections, sitemap
- Design system ou refactor global

---

## User Stories

### US-001: Suppression de “Resources” depuis l’en-tête de la page d’accueil

**Description**  
En tant qu’utilisateur, je ne dois plus voir **Resources** dans l’en-tête de la page d’accueil.

**Acceptance Criteria**
- [ ] Le lien ou libellé **Resources** n’apparaît plus dans le header
- [ ] Aucun autre élément du header n’est modifié
- [ ] Aucun espace vide ou désalignement visuel n’est introduit

---

### US-002: Suppression de la page `/fr/resources`

**Description**  
En tant qu’utilisateur, je ne dois plus pouvoir accéder à la page **Resources**.

**Acceptance Criteria**
- [ ] La page `/fr/resources` n’est plus accessible via URL directe
- [ ] Aucun contenu de cette page n’est rendu
- [ ] Aucun impact sur les autres pages

---

### US-003: Suppression de la carte CV Checker depuis la page Tools (FR)

**Description**  
En tant qu’utilisateur, je ne dois plus voir la carte **CV Checker** sur la page Tools en français.

**Acceptance Criteria**
- [ ] La carte **CV Checker** n’apparaît plus sur `/fr/tools/`
- [ ] Les autres cartes restent inchangées (contenu, ordre, design)
- [ ] Aucun trou visuel ou artefact n’est laissé

---

### US-004: Suppression de la page `/fr/tools/cv-checker`

**Description**  
En tant qu’utilisateur, je ne dois plus pouvoir accéder à la page **CV Checker**.

**Acceptance Criteria**
- [ ] La page `/fr/tools/cv-checker` n’est plus accessible via URL directe
- [ ] Aucun contenu de cette page n’est rendu
- [ ] Aucun impact sur les autres outils

---

## Functional Requirements

- FR-1: **Resources** doit être supprimé du header de la page d’accueil
- FR-2: La page `/fr/resources` doit être supprimée
- FR-3: La carte **CV Checker** doit être supprimée de `/fr/tools/`
- FR-4: La page `/fr/tools/cv-checker` doit être supprimée
- FR-5: Aucune autre page ou fonctionnalité ne doit être modifiée
- FR-6: Toute modification hors de ces suppressions est un **FAIL**

---

## Non-Goals (Out of Scope)

- Mise en place de redirections
- Nettoyage SEO
- Suppression des liens résiduels ailleurs dans le site
- Modifications multilingues
- Refactor technique
- Changement de navigation globale

---

## Design Considerations

- Suppression simple, sans remplacement
- Aucun ajustement visuel non nécessaire
- Maintien strict du layout existant après suppression

---

## Technical Considerations

- Supprimer uniquement :
  - la référence **Resources** dans le header
  - la route/page `/fr/resources`
  - la carte **CV Checker** dans `/fr/tools/`
  - la route/page `/fr/tools/cv-checker`
- Ne pas introduire de logique conditionnelle supplémentaire
- Ne pas modifier d’autres routes ou composants partagés

---

## Success Metrics

- **Resources** absent du header de la page d’accueil
- `/fr/resources` inaccessible
- **CV Checker** absent de `/fr/tools/`
- `/fr/tools/cv-checker` inaccessible
- Aucun autre changement visible
- Validation manuelle réussie
- `code-reviewer` retourne **PASS**

---

## Risks

- Suppression involontaire d’autres liens du header
- Décalage visuel après suppression d’une carte
- Lien résiduel non fonctionnel ailleurs (accepté car hors scope)

---

## Rollback Plan

- Restaurer le lien **Resources** dans le header
- Restaurer la page `/fr/resources`
- Restaurer la carte **CV Checker** dans `/fr/tools/`
- Restaurer la page `/fr/tools/cv-checker`
- Aucun rollback de données requis

---

## Clarifications (Confirmed)

- Seules **ces deux suppressions** sont autorisées
- Aucune amélioration ou nettoyage supplémentaire n’est attendu
- Le scope est strict, fermé et approuvé
- Toute action supplémentaire est hors scope
