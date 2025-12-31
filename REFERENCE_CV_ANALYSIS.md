# 📐 ANALYSE DU DESIGN DE RÉFÉRENCE

> **Objectif:** Reproduction strictement fidèle du CV de référence (reference-cv.png)
> **Date:** 2025-12-14
> **Phase:** Phase 0 - Fondations techniques

---

## 1️⃣ STRUCTURE GLOBALE

### Layout Principal
- **Type:** 2 colonnes asymétriques (sidebar + main content)
- **Ratio:** ~30/70 (sidebar/main)
- **Orientation:** Portrait A4
- **Marges:**
  - Externes: ~40px
  - Entre colonnes: 0px (collées)

### Grille de Colonnes

```
┌─────────────────────────────────────────────┐
│                                             │
│  ┌──────────┬───────────────────────────┐  │
│  │          │                           │  │
│  │ SIDEBAR  │      MAIN CONTENT         │  │
│  │  30%     │          70%              │  │
│  │          │                           │  │
│  │  Navy    │         White             │  │
│  │  Blue    │                           │  │
│  │          │                           │  │
│  └──────────┴───────────────────────────┘  │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 2️⃣ COLONNE GAUCHE (SIDEBAR)

### 2.1 Fond et Style
- **Background:** Navy blue foncé
  - Couleur approximative: `#1e3a5f` ou `oklch(0.25 0.05 240)`
- **Padding:** ~32px vertical, ~24px horizontal
- **Text color:** Blanc (#FFFFFF)

### 2.2 Structure et Ordre (NON NÉGOCIABLE)

#### BLOC 1: HEADER
1. **Nom complet**
   - Style: UPPERCASE, Bold, très large (~32px)
   - Couleur: Blanc
   - Espacement: Tight line-height

2. **Titre professionnel**
   - Style: Regular, ~14px
   - Couleur: Cyan/Teal accent (`#00bcd4` ou `oklch(0.7 0.15 200)`)
   - Format: "Title | Specialty | Focus Area"

3. **Contact Info**
   - Téléphone: format US ou international
   - Email: clickable link
   - LinkedIn: URL ou handle
   - Taille: ~12px, regular
   - Couleur: Blanc
   - Espacement: ~4px entre items

#### BLOC 2: KEY ACHIEVEMENTS
- **Titre:** "KEY ACHIEVEMENTS" (uppercase, bold, blanc)
- **Spacing:** ~32px margin-top depuis contact
- **Contenu:**
  - Liste à puces avec bullets custom (checkmark ou dot)
  - 4 achievements (titres bold)
  - Sous-texte descriptif (regular, plus petit)
  - Espacement entre items: ~16px

#### BLOC 3: SKILLS
- **Titre:** "SKILLS" (uppercase, bold, blanc)
- **Spacing:** ~32px margin-top depuis achievements
- **Contenu:**
  - Liste de compétences séparées par virgules
  - Multi-lignes, wrap automatique
  - Taille: ~12px, regular
  - Couleur: Blanc

#### BLOC 4: TRAINING / COURSES
- **Titre:** "TRAINING / COURSES" (uppercase, bold, blanc)
- **Spacing:** ~32px margin-top depuis skills
- **Contenu:**
  - 2-3 cours/certifications
  - Titre du cours en bold
  - Description en regular, plus petite
  - Espacement entre cours: ~16px

---

## 3️⃣ COLONNE DROITE (MAIN CONTENT)

### 3.1 Fond et Style
- **Background:** Blanc (#FFFFFF)
- **Padding:** ~32px vertical, ~40px horizontal
- **Text color:** Dark gray/black (#1a202c)

### 3.2 Structure et Ordre (NON NÉGOCIABLE)

#### SECTION 1: SUMMARY
- **Titre:** "SUMMARY" (uppercase, bold, ~16px, dark)
- **Contenu:**
  - Paragraphe de 3-5 lignes
  - Taille: ~14px, regular, line-height ~1.6
  - Couleur: Dark gray
  - Margin-bottom: ~24px

#### SECTION 2: EXPERIENCE
- **Titre:** "EXPERIENCE" (uppercase, bold, ~16px, dark)
- **Spacing:** ~32px margin-top depuis summary
- **Contenu (par poste):**

  **Ligne 1: Titre du poste + Dates**
  - Titre: Bold, ~16px, dark
  - Dates: Regular, ~14px, alignées à droite (MM/YYYY - MM/YYYY)
  - Display: Flex row avec space-between

  **Ligne 2: Nom de l'entreprise**
  - Regular ou italic, ~14px
  - Couleur: Medium gray
  - Margin-bottom: ~8px

  **Ligne 3+: Réalisations**
  - Liste à puces (bullets noirs standard)
  - 3-5 bullet points par poste
  - Taille: ~13px, regular, line-height ~1.5
  - Espacement entre bullets: ~4px
  - Margin-bottom entre postes: ~24px

#### SECTION 3: EDUCATION
- **Titre:** "EDUCATION" (uppercase, bold, ~16px, dark)
- **Spacing:** ~32px margin-top depuis experience
- **Contenu (par diplôme):**

  **Ligne 1: Titre du diplôme + Dates**
  - Titre: Bold, ~16px, dark
  - Dates: Regular, ~14px, alignées à droite (MM/YYYY - MM/YYYY)
  - Display: Flex row avec space-between

  **Ligne 2: Université + Localisation**
  - Université: Couleur bleue/cyan (lien cliquable)
  - Localisation: Regular, alignée à droite
  - Taille: ~14px
  - Espacement entre diplômes: ~16px

---

## 4️⃣ HIÉRARCHIE TYPOGRAPHIQUE

### Tailles de Police (approximatives)
```
Nom (sidebar):              32px - Bold - Uppercase - White
Titres sections (sidebar):  14px - Bold - Uppercase - White
Titres sections (main):     16px - Bold - Uppercase - Dark
Titres de postes:           16px - Bold - Dark
Sous-titre professionnel:   14px - Regular - Cyan
Corps de texte principal:   14px - Regular - Dark gray
Corps de texte sidebar:     12px - Regular - White
Metadata/dates:             13px - Regular - Medium gray
Contact info:               12px - Regular - White
```

### Poids de Police
- **Bold (700):** Nom, titres de sections, titres de postes, achievements
- **Regular (400):** Tout le reste

### Line Heights
- **Nom:** ~1.1 (tight)
- **Titres:** ~1.2
- **Corps de texte:** ~1.6 (confortable pour lecture)
- **Listes:** ~1.5

---

## 5️⃣ PALETTE DE COULEURS

### Couleurs Principales
```css
--cv-navy-dark:     oklch(0.25 0.05 240)   /* Sidebar background */
--cv-cyan-accent:   oklch(0.7 0.15 200)    /* Links, subtitle */
--cv-white:         oklch(1 0 0)           /* Sidebar text */
--cv-dark:          oklch(0.2 0 0)         /* Main text */
--cv-gray-medium:   oklch(0.5 0 0)         /* Metadata */
--cv-gray-light:    oklch(0.95 0 0)        /* Backgrounds si nécessaire */
```

### Application des Couleurs
- **Sidebar:**
  - Background: Navy dark
  - All text: White
  - Subtitle: Cyan accent

- **Main Content:**
  - Background: White
  - Headings: Dark
  - Body text: Dark
  - Links: Cyan accent
  - Metadata: Medium gray

---

## 6️⃣ ESPACEMENTS CRITIQUES

### Marges Verticales entre Sections
```
Header → Key Achievements:     32px
Key Achievements → Skills:      32px
Skills → Training/Courses:      32px

Summary → Experience:           32px
Experience → Education:         32px
```

### Espacements Internes
```
Entre items de liste (achievements):  16px
Entre items de liste (skills):        inline, séparés par ", "
Entre postes (experience):            24px
Entre diplômes (education):           16px
Entre bullet points:                  4px
Padding sidebar (horizontal):         24px
Padding sidebar (vertical):           32px
Padding main content (horizontal):    40px
Padding main content (vertical):      32px
```

---

## 7️⃣ CONTRAINTES NON NÉGOCIABLES

### ❌ Éléments à EXCLURE
- Logo "Powered by" en footer (mentionné dans l'image)
- Toute image décorative
- Icônes (même pour bullets)
- Graphiques ou charts
- Photos de profil

### ✅ Éléments OBLIGATOIRES
- Respect strict du ratio 30/70
- Ordre exact des sections (voir ci-dessus)
- Couleur navy pour sidebar
- Couleur blanche pour main content
- Titres en uppercase
- Alignement à droite des dates
- Format des dates: MM/YYYY - MM/YYYY

### 🎯 Points de Fidélité Critique
1. **Sidebar doit être navy foncé** (pas bleu clair, pas gris)
2. **Nom en très gros, blanc, uppercase**
3. **Subtitle en cyan/teal** (pas blanc, pas bleu)
4. **Main content sur fond blanc pur** (pas beige, pas gris)
5. **Dates toujours alignées à droite**
6. **Experience avant Education** (pas l'inverse)
7. **Key Achievements en première section sidebar** (pas Skills)

---

## 8️⃣ RESPONSIVE / PRINT CONSIDERATIONS

### Pour Impression (A4)
- **Page size:** 210mm x 297mm
- **DPI:** 300 pour qualité print
- **Marges:** ~15mm de chaque côté
- **Break pages:** Éviter de couper les sections

### Pour ATS Compatibility
- **Pas de tables pour layout** (utiliser flexbox/grid)
- **Texte sélectionnable** (pas d'images de texte)
- **Semantic HTML** (h1, h2, ul, li, p)
- **Pas de colonnes CSS complexes** (certains ATS ne les parsent pas)
- **Ordre DOM:** Sidebar avant Main content (pour lecture séquentielle)

---

## 9️⃣ MAPPING DONNÉES PLATEFORME → SECTIONS CV

### Sections de la Plateforme → Sections du Template

| Section Plateforme      | Section CV (Position)           | Transformation IA Requise |
|-------------------------|---------------------------------|---------------------------|
| Contact                 | Sidebar Header                  | Formatage contact         |
| Summary                 | Main Content (1ère section)     | ✅ Réécriture IA          |
| Experience              | Main Content (2ème section)     | ✅ Réécriture IA          |
| Education               | Main Content (3ème section)     | Formatage standard        |
| Skills                  | Sidebar (2ème bloc)             | Sélection/priorisation    |
| Certifications          | Sidebar "Training/Courses"      | Sélection top 2-3         |
| Projects                | ❌ Non utilisé dans ce template | N/A                       |
| Languages               | ❌ Non utilisé dans ce template | N/A                       |

### Nouvelle Section Requise: KEY ACHIEVEMENTS
**Source:** DOIT être générée par IA à partir de:
- Experience (extraction des top réalisations)
- Skills (identification des expertises clés)
- Summary (extraction des points forts)

**Format attendu:**
```json
{
  "keyAchievements": [
    {
      "title": "Market Share Leader",
      "description": "Court texte descriptif (1 ligne max)"
    },
    {
      "title": "Brand Engagement Innovator",
      "description": "Court texte descriptif (1 ligne max)"
    },
    ...
  ]
}
```

---

## 🔟 CHECKLIST DE VALIDATION

Avant de considérer le template comme "fidèle à la référence":

- [ ] Sidebar représente ~30% de la largeur totale
- [ ] Sidebar a un fond navy foncé (#1e3a5f ou équivalent)
- [ ] Nom en blanc, uppercase, très large (32px+)
- [ ] Sous-titre en cyan/teal, pas blanc
- [ ] Contact info en blanc, petit (12px)
- [ ] "KEY ACHIEVEMENTS" est la 1ère section du sidebar
- [ ] "SKILLS" est après "KEY ACHIEVEMENTS"
- [ ] "TRAINING / COURSES" est la dernière section du sidebar
- [ ] Main content a un fond blanc pur
- [ ] "SUMMARY" est la 1ère section du main content
- [ ] "EXPERIENCE" est la 2ème section du main content
- [ ] "EDUCATION" est la 3ème section du main content
- [ ] Dates alignées à droite dans Experience et Education
- [ ] Format dates: MM/YYYY - MM/YYYY
- [ ] Titres de sections en uppercase
- [ ] Espacement 32px entre sections principales
- [ ] Pas de logo, icône, image ou graphique
- [ ] Compatible ATS (sémantique HTML)

---

## 📚 RÉFÉRENCES TECHNIQUES

### Polices Recommandées
1. **Inter** (déjà utilisée dans le projet)
2. **Roboto** (fallback)
3. **Arial** (fallback système)

### Tailwind Classes Clés
```
Sidebar background:     bg-[oklch(0.25_0.05_240)]
Sidebar text:           text-white
Accent color:           text-[oklch(0.7_0.15_200)]
Main text:              text-[oklch(0.2_0_0)]
Uppercase:              uppercase
Bold:                   font-bold
Grid layout:            grid grid-cols-[30%_70%]
```

---

**FIN DE L'ANALYSE**

Ce document sert de spécification technique absolue pour la création du template.
Toute déviation de ces règles résulterait en un rendu non-fidèle.
