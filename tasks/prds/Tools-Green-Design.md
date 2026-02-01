# PRD: Harmonisation des en-têtes – Pages Tools (Toutes langues)

## Introduction

Toutes les pages situées sous le chemin  
`/tools/` (toutes langues confondues)  
ainsi que la page racine  
`/{locale}/tools/`  
doivent voir leur **en-tête (header)** mis à jour afin d’utiliser **exactement la même couleur**, **indépendamment de la langue sélectionnée par l’utilisateur**.

La **référence visuelle unique** pour la couleur de l’en-tête est la page suivante :

`http://localhost:3000/fr/tools/resume-job-match`

Cette couleur doit être appliquée **à l’identique** pour toutes les langues disponibles du site (fr, en, de, it, etc.).

⚠️ Cette PRD **ignore explicitement** tout autre sujet (Linked Job, sidebar, Cover Letter, Resume, IA, export, logique métier, etc.).

---

## Objectif Global (Authoritative)

Mettre à jour **tous les en-têtes** des pages Tools, **quelle que soit la langue du site choisie par l’utilisateur**, afin que leur **couleur soit strictement identique** à celle utilisée sur la page de référence `/fr/tools/resume-job-match`.

Le choix de langue **ne doit avoir aucun impact** sur la couleur de l’en-tête.

---

## Périmètre (Scope)

### Inclus
- `/{locale}/tools/`
- Toutes les pages enfants `/{locale}/tools/*`
- Toutes les langues supportées par le site (fr, en, de, it, etc.)
- **L’en-tête (header) uniquement**

### Exclu
- Contenu des pages
- Layout global (hors en-tête)
- Autres composants UI
- Pages hors `/tools/`
- Toute variation dépendante de la langue

---

## Référence Visuelle Unique

- **Source de vérité absolue** :  
  `http://localhost:3000/fr/tools/resume-job-match`

La **valeur CSS finale rendue** (après cascade, variables, thèmes, dark/light, etc.) de l’en-tête de cette page est la référence.

---

## Goals

- Uniformiser la **couleur des en-têtes** sur toutes les pages Tools
- Garantir une **parité visuelle stricte**, indépendamment de la langue
- Éliminer toute variation liée à l’i18n ou au routing
- Éviter tout effet de bord hors de l’en-tête

---

## User Stories

### US-001: Uniformisation multi-langue de la couleur des en-têtes Tools

**Description**  
En tant qu’utilisateur, je veux que la couleur de l’en-tête des pages Tools soit identique, quelle que soit la langue du site que j’ai sélectionnée.

**Acceptance Criteria**
- [ ] L’en-tête de `/{locale}/tools/` utilise la même couleur que `/fr/tools/resume-job-match`
- [ ] L’en-tête de chaque page `/{locale}/tools/*` utilise exactement la même couleur
- [ ] Le changement de langue (fr ↔ en ↔ de ↔ it) n’entraîne **aucune variation**
- [ ] Aucune différence de teinte, d’opacité ou de dégradé
- [ ] Vérification visuelle côte à côte validée entre langues

---

### US-002: Aucun impact hors en-tête et hors Tools

**Description**  
En tant que mainteneur, je veux que la modification soit strictement isolée aux en-têtes des pages Tools.

**Acceptance Criteria**
- [ ] Aucun changement sur le contenu des pages
- [ ] Aucun changement sur les layouts
- [ ] Aucun changement sur les pages hors `/tools/`
- [ ] Aucun impact lié à la langue ou au système i18n

---

## Functional Requirements

- FR-1: Le scope est limité aux **en-têtes des pages `/tools/`**
- FR-2: La couleur de référence est celle de `/fr/tools/resume-job-match`
- FR-3: La couleur doit être **identique pour toutes les langues**
- FR-4: Aucune logique conditionnelle basée sur la langue
- FR-5: Toute différence visuelle est un **FAIL**

---

## Non-Goals (Out of Scope)

- Refonte UI globale
- Harmonisation du design system complet
- Modification des headers hors `/tools/`
- Changements typographiques ou responsive
- Thématisation dépendante de la langue

---

## Design Considerations

- Aucune interprétation créative
- La langue ne doit **jamais** influencer le style
- Utiliser une source de couleur unique et déterministe
- Consistance pixel-perfect requise

---

## Technical Considerations

- Identifier la couleur effective de l’en-tête sur `/fr/tools/resume-job-match`
- Appliquer cette couleur de manière globale et non conditionnelle
- Éviter toute duplication liée aux routes i18n
- Vérifier l’absence d’override CSS spécifique à une langue

---

## Success Metrics

- Toutes les pages `/{locale}/tools/*` ont une en-tête identique
- Aucune variation lors du changement de langue
- Correspondance exacte avec `/fr/tools/resume-job-match`
- Validation manuelle multi-langue réussie
- `code-reviewer` retourne **PASS**

---

## Risks

- Styles hérités ou override spécifiques à une locale
- Variables CSS dépendantes du contexte i18n
- Différences subtiles d’opacité ou de thème

---

## Rollback Plan

- Modifications limitées à l’en-tête
- Rollback par restauration du style précédent
- Aucun impact fonctionnel ou data

---

## Clarifications (Confirmed)

- La **langue sélectionnée par l’utilisateur ne doit jamais influencer la couleur**
- `/fr/tools/resume-job-match` est la **référence unique**
- Le scope est strict, fermé et approuvé
- Toute modification supplémentaire est hors scope
