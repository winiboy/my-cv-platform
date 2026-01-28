# PRD: Job Applications Page – TealHQ Job Tracker Visual & Functional Parity

## Introduction

La page **Job Applications** de la plateforme (`/en/dashboard/job-applications`) doit être mise à jour afin de reproduire une version **visuellement et fonctionnellement équivalente** de la page **Job Tracker** de **TealHQ** (`https://app.tealhq.com/job-tracker`).

L’objectif est d’obtenir un résultat **visuellement indiscernable** pour un utilisateur final en termes de :
- structure de page
- hiérarchie visuelle
- composants UI
- spacing et alignements
- typographie
- interactions et micro-animations
- états (empty, loading, populated, hover, focus, selected)

⚠️ Contraintes strictes :
- **AUCUN code source TealHQ ne doit être utilisé**
- **AUCUN asset propriétaire** (logos, images, icônes de marque, textes protégés) ne doit être copié
- Les fonctionnalités doivent être **réimplémentées** à partir d’observations visuelles et comportementales uniquement

Ce PRD couvre **UNIQUEMENT** la page **Job Applications**.  
Aucune autre page n’est en scope.

---

## Goals

- Reproduire la page **TealHQ Job Tracker** avec une **parité visuelle et fonctionnelle maximale**
- Obtenir une page **indiscernable à l’œil nu** pour un utilisateur final
- Conserver la compatibilité avec les données existantes
- Maintenir le support multilingue (fr, de, en, it)
- Ne pas introduire de dépendance légale ou technique à TealHQ
- **Imposer un 3-way automatic linking strict entre Resume, Cover Letter et Job Application via des composants partagés**

---

## User Stories

### US-001: Structure globale identique à TealHQ Job Tracker
**Description:**  
En tant qu’utilisateur, je veux que la page Job Applications ait la **même structure globale** que le Job Tracker de TealHQ, afin de reconnaître immédiatement l’interface.

**Acceptance Criteria:**
- [ ] Même organisation header / contenu principal / colonnes
- [ ] Même hiérarchie visuelle des sections
- [ ] Même logique de grille ou liste
- [ ] Même densité d’information
- [ ] Vérification visuelle côte à côte sans différence perceptible

---

### US-002: Parité complète des composants UI
**Description:**  
En tant qu’utilisateur, je veux que chaque composant visible (cards, lignes, boutons, menus, badges) corresponde fonctionnellement et visuellement à ceux de TealHQ.

**Acceptance Criteria:**
- [ ] Même types de composants (cards, rows, dropdowns, status pills, etc.)
- [ ] Même tailles relatives et alignements
- [ ] Même états hover / active / focus
- [ ] Icônes équivalentes (open-source ou neutres)
- [ ] Aucun composant manquant ou ajouté

---

### US-003: Parité des interactions et comportements
**Description:**  
En tant qu’utilisateur, je veux que les interactions se comportent exactement comme sur TealHQ.

**Acceptance Criteria:**
- [ ] Même comportements au clic
- [ ] Même navigation interne
- [ ] Même ouvertures de menus / panneaux
- [ ] Même animations et transitions (durée, easing)
- [ ] Même gestion du focus clavier

---

### US-004: États fonctionnels identiques
**Description:**  
En tant qu’utilisateur, je veux que tous les états visibles correspondent à ceux de TealHQ.

**Acceptance Criteria:**
- [ ] Empty state équivalent
- [ ] Loading state équivalent
- [ ] États avec données partiellement remplies
- [ ] États d’erreur ou d’absence de données
- [ ] Aucun état non justifié

---

### US-005: Données et contenu fonctionnel équivalent
**Description:**  
En tant qu’utilisateur, je veux retrouver le **même type d’informations** affichées pour chaque candidature.

**Acceptance Criteria:**
- [ ] Même champs visibles (poste, entreprise, statut, date, etc.)
- [ ] Même ordre et hiérarchie
- [ ] Même logique de regroupement
- [ ] Les données proviennent du backend existant
- [ ] Aucun champ décoratif sans utilité

---

### US-006: Filtrage, tri et navigation équivalents
**Description:**  
En tant qu’utilisateur, je veux que les mécanismes de tri et de navigation correspondent à ceux de TealHQ.

**Acceptance Criteria:**
- [ ] Filtres équivalents (visuellement et fonctionnellement)
- [ ] Même position et interaction des contrôles
- [ ] Même feedback visuel
- [ ] Pas de fonctionnalités manquantes ou superflues

---

### US-007: Support multilingue sans divergence visuelle
**Description:**  
En tant qu’utilisateur multilingue, je veux que la page conserve sa structure et son rendu quel que soit le langage.

**Acceptance Criteria:**
- [ ] `/en`, `/fr`, `/de`, `/it` supportés
- [ ] Aucun débordement ou casse de layout
- [ ] Longueurs de textes anticipées
- [ ] Aucune traduction codée en dur

---

### US-008: 3-way automatic linking obligatoire via composants partagés
**Description:**  
En tant qu’utilisateur, je veux que chaque Job Application soit **automatiquement et bidirectionnellement liée** à son Resume et à sa Cover Letter associée, afin d’assurer une navigation cohérente et une continuité fonctionnelle parfaite entre les trois entités.

**Acceptance Criteria:**
- [ ] Le linking **Resume ↔ Job Application** est automatique
- [ ] Le linking **Cover Letter ↔ Job Application** est automatique
- [ ] Le linking **Resume ↔ Cover Letter ↔ Job Application** est transitif et cohérent
- [ ] Le linking utilise **exclusivement des composants partagés existants ou dédiés**
- [ ] Aucun composant spécifique ou logique ad-hoc à Job Applications
- [ ] Toute navigation latérale respecte la parité Resume / Cover Letter / Job Application
- [ ] Toute divergence de linking est un **FAIL bloquant**

---

## Functional Requirements

- FR-1: La page Job Applications DOIT être visuellement indiscernable de TealHQ Job Tracker
- FR-2: Les comportements utilisateurs DOIVENT correspondre 1:1
- FR-3: Les données existantes doivent être réutilisées
- FR-4: Aucun asset propriétaire TealHQ ne doit être utilisé
- FR-5: Aucune autre page n’est modifiée
- FR-6: Le **3-way automatic linking est obligatoire**
- FR-7: Le linking DOIT passer par des **composants partagés uniques**
- FR-8: Toute duplication de logique de linking est interdite

---

## Non-Goals (Out of Scope)

- Reproduction du backend TealHQ
- Scraping ou import de données TealHQ
- Copie de textes propriétaires
- Refonte globale du dashboard
- Optimisation UX au-delà de la parité
- IA, export, analytics, ou automatisations

---

## Design Considerations

- Approche **pixel-accurate**
- Mesure visuelle systématique (spacing, tailles, alignements)
- Icônes génériques (Heroicons, Lucide, etc.)
- Animations CSS/JS équivalentes, pas approximatives
- Zéro créativité ajoutée

---

## Technical Considerations

- Observations via navigateur (DevTools, inspection CSS)
- Recréation manuelle des composants
- Aucun partage de logique TealHQ
- **Utilisation obligatoire de composants partagés pour le linking**
- Aucun composant Job Applications spécifique pour le linking
- Respect strict des performances

---

## Success Metrics

- Impossible de distinguer la page de TealHQ à l’œil nu
- Tous les états et interactions présents
- Aucun élément manquant ou superflu
- 3-way linking fonctionnel et cohérent
- Validation manuelle complète
- `code-reviewer` retourne **PASS**

---

## Risks

- Sous-estimation de micro-interactions
- Différences subtiles de spacing
- Animations légèrement divergentes
- Rupture de parité dans le linking
- Évolutions futures de TealHQ

---

## Rollback Plan

- Changement isolé à la page Job Applications
- Rollback par restauration de l’ancienne implémentation
- Aucun impact données

---

## Clarifications (Confirmed)

- L’objectif est la **parité**, pas l’inspiration
- Aucune contrainte légale violée
- Toute approximation visuelle est un **FAIL**
- Le scope est strictement limité à cette page
- Le **3-way automatic linking avec composants partagés est obligatoire et non négociable**
