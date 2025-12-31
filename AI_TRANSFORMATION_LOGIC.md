# 🤖 LOGIQUE DE TRANSFORMATION IA

> **Objectif:** Définir les règles et algorithmes de transformation des données utilisateur brutes en contenu CV optimisé
> **Date:** 2025-12-14
> **Phase:** Phase 0 - Spécification conceptuelle

---

## 📋 TABLE DES MATIÈRES

1. [Principes Fondamentaux](#principes-fondamentaux)
2. [Fonction: transformSummary()](#fonction-transformsummary)
3. [Fonction: transformExperience()](#fonction-transformexperience)
4. [Fonction: transformEducation()](#fonction-transformeducation)
5. [Fonction: generateKeyAchievements()](#fonction-generatekeyachievements)
6. [Fonction: selectTopSkills()](#fonction-selecttopskills)
7. [Fonction: selectTopCertifications()](#fonction-selecttopcertifications)
8. [Standards ATS 2024-2025](#standards-ats-2024-2025)
9. [Implémentation Technique](#implémentation-technique)

---

## 1️⃣ PRINCIPES FONDAMENTAUX

### Objectifs de Transformation

Toute transformation doit respecter les principes suivants:

1. **Clarté:** Le texte doit être immédiatement compréhensible par un recruteur
2. **Concision:** Maximum d'impact en minimum de mots
3. **Action-oriented:** Utiliser des verbes d'action forts
4. **Quantifiable:** Inclure des métriques et résultats mesurables quand possible
5. **ATS-friendly:** Utiliser des mots-clés pertinents pour l'industrie
6. **Professionnalisme:** Ton formel mais engageant
7. **Authenticité:** Ne jamais inventer de faits, seulement reformuler

### Contraintes Absolues

- ❌ Ne JAMAIS inventer de faits, chiffres ou accomplissements
- ❌ Ne JAMAIS changer le sens ou la véracité des informations
- ❌ Ne JAMAIS ajouter de compétences non mentionnées
- ✅ TOUJOURS préserver les dates, noms d'entreprises, titres exacts
- ✅ TOUJOURS améliorer la formulation sans altérer le contenu factuel

### Critères de Qualité

Chaque transformation sera évaluée sur:

- **Lecture RH:** Le texte peut-il être scanné en < 8 secondes?
- **Impact:** Les accomplissements sont-ils mis en valeur?
- **Pertinence:** Le contenu est-il ciblé pour le poste?
- **Grammaire:** 0 faute, syntaxe parfaite
- **Longueur:** Respect des limites (summary ≤ 4 lignes, bullets ≤ 2 lignes)

---

## 2️⃣ FONCTION: transformSummary()

### Signature

```typescript
interface TransformSummaryInput {
  rawSummary: string | null
  experience: ResumeExperience[]
  skills: ResumeSkillCategory[]
  targetRole?: string
  seniority?: 'junior' | 'mid' | 'senior' | 'executive'
}

interface TransformSummaryOutput {
  transformedSummary: string
  wordCount: number
  keywordsUsed: string[]
  confidence: number // 0-100
}

function transformSummary(input: TransformSummaryInput): TransformSummaryOutput
```

### Règles de Transformation

#### Si rawSummary existe:

1. **Analyser** le contenu pour identifier:
   - Niveau de séniorité (junior/mid/senior/executive)
   - Domaine d'expertise principal
   - Compétences clés mentionnées
   - Accomplissements quantifiables

2. **Restructurer** selon le format:
   ```
   [Titre professionnel] with [X years] of experience in [domain].
   [Top accomplissement avec métrique].
   [Compétences clés] expert with proven track record in [résultats].
   [Valeur ajoutée pour employeur futur].
   ```

3. **Optimiser**:
   - Longueur: 60-100 mots (3-4 lignes max)
   - Première phrase: Qui vous êtes + années d'expérience
   - Deuxième phrase: Votre top accomplissement (avec chiffres)
   - Troisième phrase: Vos expertises clés
   - Quatrième phrase: Ce que vous apportez (orienté futur)

4. **Verbes d'action forts**:
   - Remplacer "fait" → "Directed", "Led", "Spearheaded"
   - Remplacer "travaillé sur" → "Drove", "Executed", "Delivered"
   - Remplacer "aidé" → "Enabled", "Facilitated", "Accelerated"

#### Si rawSummary est vide:

1. **Générer** à partir de l'expérience:
   ```typescript
   // Pseudo-code
   const yearsOfExperience = calculateTotalYears(experience)
   const currentRole = experience[0].position
   const topSkills = extractTopSkills(skills, 3)
   const topAchievement = extractBestAchievement(experience)

   const summary = `${currentRole} with ${yearsOfExperience}+ years of experience in ${extractIndustry(experience)}. ${topAchievement}. Expertise in ${topSkills.join(', ')} with a proven track record of delivering measurable results.`
   ```

### Exemples de Transformation

#### Exemple 1: Summary Générique → Professionnel

**Input (brut):**
```
Je suis un marketing manager avec de l'expérience dans le digital.
J'ai travaillé sur plusieurs campagnes et j'aime le travail d'équipe.
```

**Output (transformé):**
```
Marketing Director with 8+ years of experience driving global brand strategies
and digital transformation initiatives. Achieved a 35% increase in brand
engagement through innovative omni-channel campaigns. Expertise in SEO, SEM,
content marketing, and data-driven decision-making, with a proven track record
of leading cross-functional teams to exceed revenue targets.
```

#### Exemple 2: Summary avec Métriques → Optimisé

**Input (brut):**
```
Senior Director of Global Marketing. I managed teams and increased revenue.
I have experience with product launches and customer acquisition.
```

**Output (transformé):**
```
Senior Director of Global Marketing with 12+ years of experience leading
high-performing teams and driving revenue growth. Spearheaded product launches
that generated $50M+ in annual revenue and reduced customer acquisition costs
by 30%. Proven expertise in market analysis, brand positioning, and strategic
partnerships across North America and EMEA regions.
```

### Critères de Validation

- [ ] Longueur: 60-100 mots (3-4 lignes imprimées)
- [ ] Contient: Titre + années d'expérience
- [ ] Contient: Au moins 1 métrique quantifiable
- [ ] Contient: 3-5 compétences clés
- [ ] Ton: Professionnel, actif, orienté résultats
- [ ] Grammaire: 0 faute
- [ ] ATS: Inclut mots-clés du secteur

---

## 3️⃣ FONCTION: transformExperience()

### Signature

```typescript
interface TransformExperienceInput {
  rawExperience: ResumeExperience
  allExperiences: ResumeExperience[]
  targetRole?: string
  includeMetrics?: boolean
}

interface TransformExperienceOutput {
  position: string // Unchanged
  company: string // Unchanged
  location: string // Unchanged
  startDate: string // Unchanged
  endDate: string // Unchanged
  current: boolean // Unchanged
  description: string // Transformed
  achievements: string[] // Transformed (max 5)
  keywordsUsed: string[]
  impactScore: number // 0-100
}

function transformExperience(
  input: TransformExperienceInput
): TransformExperienceOutput
```

### Règles de Transformation

#### Description (Paragraphe principal)

1. **Format attendu:**
   ```
   [Contexte du poste en 1 phrase: taille équipe, budget, scope géographique]
   ```

2. **Exemple:**
   ```
   "Led a team of 15 marketing professionals across North America, managing
   a $10M annual budget and overseeing brand strategy for 50+ product lines."
   ```

3. **Si description brute manque de contexte:**
   - Inférer le contexte depuis:
     - Le titre du poste (e.g., "Director" → probablement gestion d'équipe)
     - Les achievements (e.g., mention d'équipe, budget, projets)
   - Ne PAS inventer de chiffres, utiliser "large team", "significant budget"

#### Achievements (Bullets)

1. **Structure STAR optimisée:**
   ```
   [Action Verb] + [What you did] + [How/Method] + [Quantifiable Result]
   ```

2. **Exemples:**
   ```
   ❌ Mauvais: "Worked on marketing campaigns"
   ✅ Bon: "Launched 3 omni-channel marketing campaigns, optimizing spend
             allocation by 25% and increasing ROI from 2.1x to 3.4x"

   ❌ Mauvais: "Improved customer satisfaction"
   ✅ Bon: "Implemented customer feedback loop and personalized journey mapping,
             increasing NPS from 42 to 68 within 6 months"

   ❌ Mauvais: "Managed social media"
   ✅ Bon: "Grew social media following from 50K to 200K followers across
             platforms, driving 35% increase in qualified leads"
   ```

3. **Verbes d'action par niveau:**

   **Individual Contributor (IC):**
   - Executed, Developed, Designed, Created, Built, Implemented, Analyzed

   **Team Lead:**
   - Coordinated, Facilitated, Mentored, Guided, Collaborated, Streamlined

   **Manager:**
   - Managed, Led, Directed, Oversaw, Supervised, Optimized, Delivered

   **Senior/Executive:**
   - Spearheaded, Drove, Transformed, Scaled, Pioneered, Architected, Established

4. **Priorisation des achievements:**
   - Trier par impact (quantifiable > qualitatif)
   - Limiter à 3-5 bullets par poste
   - Plus le poste est récent, plus il peut avoir de bullets
   - Postes > 5 ans: max 3 bullets
   - Poste actuel: max 5 bullets

5. **Métriques à privilégier:**
   - Revenue impact ($, %, growth)
   - Cost reduction (%, $)
   - Efficiency gains (time saved, process improvement %)
   - Team growth (headcount, productivity)
   - Customer metrics (NPS, satisfaction, retention)
   - Market metrics (share %, ranking, reach)

### Exemples de Transformation

#### Exemple 1: Achievements Vagues → Quantifiés

**Input (brut):**
```
- Managed marketing team
- Improved brand awareness
- Worked on product launches
- Handled budget
```

**Output (transformé):**
```
- Led cross-functional team of 12 marketing professionals, achieving 98%
  on-time delivery rate for 20+ product launches annually
- Increased brand awareness by 45% year-over-year through integrated campaigns
  across digital, print, and events, resulting in 35% boost in inbound leads
- Spearheaded go-to-market strategy for flagship product line, generating $8M
  in first-year revenue and capturing 12% market share within 6 months
- Optimized marketing budget allocation using data-driven insights, reducing
  cost-per-acquisition by 30% while maintaining lead quality standards
```

#### Exemple 2: Achievements Techniques → Impact Business

**Input (brut - Dev/Tech):**
```
- Built new features for the platform
- Fixed bugs
- Improved code quality
- Worked with APIs
```

**Output (transformé):**
```
- Architected and delivered 15+ high-impact features using React and Node.js,
  improving user engagement by 40% and reducing churn by 18%
- Reduced production incidents by 60% through implementation of comprehensive
  testing suite (Jest, Cypress) and CI/CD pipeline optimization
- Refactored legacy codebase, decreasing page load time by 3.2s (65%
  improvement) and improving Lighthouse score from 45 to 92
- Integrated 8 third-party APIs (Stripe, SendGrid, Twilio), enabling new
  revenue streams that contributed $500K to annual recurring revenue
```

### Critères de Validation

- [ ] Description: 1-2 phrases de contexte
- [ ] Achievements: 3-5 bullets maximum
- [ ] Chaque bullet: 1-2 lignes imprimées (≤ 150 caractères)
- [ ] Au moins 50% des bullets contiennent des métriques
- [ ] Verbes d'action adaptés au niveau de séniorité
- [ ] Pas de répétition de verbes entre bullets
- [ ] Ton: Actif, orienté résultats
- [ ] Grammaire: 0 faute

---

## 4️⃣ FONCTION: transformEducation()

### Signature

```typescript
interface TransformEducationInput {
  rawEducation: ResumeEducation
}

interface TransformEducationOutput {
  degree: string // Potentially standardized
  field: string // Potentially standardized
  school: string // Unchanged
  location: string // Unchanged
  startDate: string // Unchanged
  endDate: string // Unchanged
  gpa: string // Formatted
  honors: string[] // Extracted/formatted
}

function transformEducation(
  input: TransformEducationInput
): TransformEducationOutput
```

### Règles de Transformation

#### Standardisation des Diplômes

Normaliser les appellations de diplômes selon les standards internationaux:

```typescript
const degreeMapping = {
  // Bachelor's variations
  "Bachelor": "Bachelor of Arts",
  "BA": "Bachelor of Arts",
  "BS": "Bachelor of Science",
  "B.A.": "Bachelor of Arts",
  "B.S.": "Bachelor of Science",
  "Licence": "Bachelor of Arts", // France
  "Licenciatura": "Bachelor of Arts", // Spain/LATAM

  // Master's variations
  "Master": "Master of Business Administration",
  "MBA": "Master of Business Administration",
  "MA": "Master of Arts",
  "MS": "Master of Science",
  "M.A.": "Master of Arts",
  "M.S.": "Master of Science",
  "Maîtrise": "Master of Arts", // France

  // Doctorate variations
  "PhD": "Doctor of Philosophy",
  "Ph.D.": "Doctor of Philosophy",
  "Doctorat": "Doctor of Philosophy",
}
```

#### Formatage du GPA

```typescript
function formatGPA(gpa: string | number): string {
  // Convert to number
  const numericGPA = typeof gpa === 'string' ? parseFloat(gpa) : gpa

  // Standard US GPA (4.0 scale)
  if (numericGPA <= 4.0) {
    return numericGPA.toFixed(2) + " / 4.0"
  }

  // European scale (20 points)
  if (numericGPA <= 20.0) {
    return numericGPA.toFixed(1) + " / 20"
  }

  // Percentage
  if (numericGPA <= 100) {
    return numericGPA.toFixed(0) + "%"
  }

  return gpa.toString()
}
```

#### Extraction des Honneurs

Si le champ `description` ou `notes` contient des mentions:

```typescript
const honorKeywords = [
  "summa cum laude",
  "magna cum laude",
  "cum laude",
  "honors",
  "honours",
  "distinction",
  "dean's list",
  "valedictorian",
  "salutatorian",
]

function extractHonors(educationText: string): string[] {
  const honors: string[] = []
  const lowerText = educationText.toLowerCase()

  honorKeywords.forEach((keyword) => {
    if (lowerText.includes(keyword)) {
      honors.push(capitalize(keyword))
    }
  })

  return honors
}
```

### Critères de Validation

- [ ] Degree: Format standardisé (Bachelor of X, Master of X)
- [ ] Field: Capitalisé correctement
- [ ] GPA: Formaté avec échelle (X.XX / 4.0)
- [ ] Honors: Extraits et formatés si présents
- [ ] Pas de transformation du nom d'université (préserver exactement)

---

## 5️⃣ FONCTION: generateKeyAchievements()

### Signature

```typescript
interface GenerateKeyAchievementsInput {
  experiences: ResumeExperience[]
  skills: ResumeSkillCategory[]
  summary: string
  maxAchievements?: number // Default: 4
}

interface KeyAchievement {
  title: string // 3-6 words, impactful
  description: string // 1 line, ≤ 80 chars
}

interface GenerateKeyAchievementsOutput {
  achievements: KeyAchievement[]
  confidence: number // 0-100
}

function generateKeyAchievements(
  input: GenerateKeyAchievementsInput
): GenerateKeyAchievementsOutput
```

### Règles de Génération

#### Objectif de la Section

La section "Key Achievements" est unique au template Professional.
Elle sert à mettre en avant 4 accomplissements ou expertises majeures de façon
ultra-visible (sidebar, haut de page).

#### Stratégie d'Extraction

1. **Priorisation:**
   - Accomplissements avec métriques quantifiables > qualitatifs
   - Réalisations récentes (< 5 ans) > anciennes
   - Accomplissements pertinents pour le secteur cible

2. **Sources:**
   - **Priorité 1:** Achievements des 2 postes les plus récents
   - **Priorité 2:** Summary (si mentionne des accomplissements clés)
   - **Priorité 3:** Compétences principales transformées en "expertise"

3. **Sélection des Top 4:**
   ```typescript
   // Pseudo-algorithme
   const scoredAchievements = []

   // 1. Extraire tous les achievements de tous les postes
   experiences.forEach(exp => {
     exp.achievements.forEach(achievement => {
       const score = scoreAchievement(achievement, {
         hasMetrics: /\d+%|\$\d+|increased|decreased|grew/i.test(achievement),
         recency: calculateRecency(exp.startDate, exp.endDate),
         relevance: calculateRelevance(achievement, targetRole),
         impact: estimateImpact(achievement),
       })

       scoredAchievements.push({ achievement, score, source: exp })
     })
   })

   // 2. Trier par score décroissant
   scoredAchievements.sort((a, b) => b.score - a.score)

   // 3. Prendre les 4 meilleurs
   const top4 = scoredAchievements.slice(0, 4)

   // 4. Transformer en format KeyAchievement
   return top4.map(item => ({
     title: extractTitle(item.achievement),
     description: summarize(item.achievement, maxLength: 80)
   }))
   ```

#### Format du Title

Le titre doit être accrocheur, 3-6 mots maximum:

```typescript
// Exemples de transformation achievement → title
const titleExamples = [
  {
    achievement: "Increased market share from 8% to 23% in EMEA region",
    title: "Market Share Leader",
  },
  {
    achievement: "Grew social media following from 50K to 200K, driving 35% increase in leads",
    title: "Brand Engagement Innovator",
  },
  {
    achievement: "Spearheaded product launch generating $50M first-year revenue",
    title: "Revenue Growth Strategist",
  },
  {
    achievement: "Built referral program that contributed 40% of new customer acquisition",
    title: "Referral Program Developer",
  },
]

// Pattern: [Domain/Metric] + [Action/Result Noun]
// Examples:
// - "Market Share" + "Leader"
// - "Brand Engagement" + "Innovator"
// - "Revenue Growth" + "Strategist"
// - "Process Optimization" + "Expert"
```

#### Format de la Description

La description doit être ultra-concise (1 ligne, max 80 chars):

```typescript
function summarizeAchievement(achievement: string, maxLength: number = 80): string {
  // Si déjà court, retourner tel quel
  if (achievement.length <= maxLength) {
    return achievement
  }

  // Extraire l'essentiel: métrique + action
  // "Increased X from Y to Z, resulting in W" → "Increased X from Y to Z"
  const core = achievement.split(',')[0] // Première clause

  if (core.length <= maxLength) {
    return core
  }

  // Tronquer intelligemment
  return core.substring(0, maxLength - 3) + "..."
}
```

### Exemples de Génération

#### Exemple 1: Marketing Executive

**Input (experiences):**
```typescript
[
  {
    position: "VP of Marketing",
    achievements: [
      "Led rebranding initiative that increased brand awareness by 65% in target demographics",
      "Launched omni-channel campaign resulting in 40% increase in customer engagement",
      "Grew revenue from $20M to $85M over 4 years through strategic market expansion"
    ]
  },
  {
    position: "Marketing Director",
    achievements: [
      "Built and scaled marketing team from 5 to 25 professionals across 3 countries",
      "Implemented marketing automation, reducing cost-per-lead by 45%",
      "Secured partnerships with 10+ Fortune 500 companies"
    ]
  }
]
```

**Output (Key Achievements):**
```typescript
[
  {
    title: "Revenue Growth Leader",
    description: "Grew company revenue from $20M to $85M in 4 years"
  },
  {
    title: "Brand Awareness Expert",
    description: "Increased brand recognition by 65% through rebranding initiative"
  },
  {
    title: "Team Scaling Strategist",
    description: "Built and scaled high-performing team from 5 to 25 professionals"
  },
  {
    title: "Partnership Developer",
    description: "Secured strategic partnerships with 10+ Fortune 500 companies"
  }
]
```

#### Exemple 2: Software Engineer

**Input (experiences):**
```typescript
[
  {
    position: "Senior Software Engineer",
    achievements: [
      "Architected microservices migration, reducing infrastructure costs by $500K annually",
      "Improved application performance by 85% through database optimization",
      "Mentored 8 junior engineers, with 6 promoted within 18 months"
    ]
  }
]
```

**Output (Key Achievements):**
```typescript
[
  {
    title: "Cost Optimization Leader",
    description: "Saved $500K annually through microservices architecture migration"
  },
  {
    title: "Performance Expert",
    description: "Improved application speed by 85% via database optimization"
  },
  {
    title: "Technical Mentor",
    description: "Coached 8 engineers with 75% promotion rate within 18 months"
  },
  {
    title: "Architecture Innovator",
    description: "Led migration to scalable microservices infrastructure"
  }
]
```

### Critères de Validation

- [ ] Nombre: Exactement 4 achievements
- [ ] Title: 3-6 mots maximum
- [ ] Title: Capitalisé (Title Case)
- [ ] Title: Impactful, contient un verbe ou nom d'action
- [ ] Description: ≤ 80 caractères
- [ ] Description: Contient idéalement une métrique
- [ ] Description: 1 ligne imprimée
- [ ] Diversité: Pas de répétition de concepts entre les 4
- [ ] Authenticité: Basé sur des faits réels de l'expérience

---

## 6️⃣ FONCTION: selectTopSkills()

### Signature

```typescript
interface SelectTopSkillsInput {
  skills: ResumeSkillCategory[]
  experiences: ResumeExperience[]
  targetRole?: string
  maxCategories?: number // Default: 3
}

interface SelectTopSkillsOutput {
  selectedSkills: ResumeSkillCategory[]
  reasoning: string
}

function selectTopSkills(input: SelectTopSkillsInput): SelectTopSkillsOutput
```

### Règles de Sélection

#### Objectif

L'espace dans le sidebar est limité. Il faut sélectionner et afficher uniquement
les compétences les plus pertinentes (3-4 catégories max).

#### Critères de Priorisation

1. **Pertinence pour le rôle cible**
   - Si targetRole fourni: privilégier les skills en lien avec ce rôle
   - Sinon: privilégier les skills du poste actuel/récent

2. **Fréquence dans l'industrie**
   - Skills avec fort volume de recherche ATS
   - Skills mentionnées dans >50% des offres similaires

3. **Niveau de séniorité**
   - Senior/Executive: Privilégier leadership, strategy, business skills
   - IC/Junior: Privilégier technical skills, tools, frameworks

4. **Diversité**
   - Éviter les catégories redondantes
   - Préférer: "Technical Skills", "Languages", "Leadership" vs 3 catégories techniques

#### Algorithme de Sélection

```typescript
function selectTopSkills(input: SelectTopSkillsInput): SelectTopSkillsOutput {
  const { skills, experiences, targetRole, maxCategories = 3 } = input

  // 1. Scorer chaque catégorie
  const scoredCategories = skills.map(category => {
    let score = 0

    // +Points si mentionnée dans expériences récentes
    const mentionedInRecent = experiences.slice(0, 2).some(exp =>
      exp.description?.toLowerCase().includes(category.category.toLowerCase()) ||
      exp.achievements.some(a => a.toLowerCase().includes(category.category.toLowerCase()))
    )
    if (mentionedInRecent) score += 50

    // +Points si catégorie pertinente pour rôle
    if (targetRole && isRelevantForRole(category.category, targetRole)) {
      score += 30
    }

    // +Points selon le nombre de skills dans la catégorie
    score += Math.min(category.items.length * 2, 20) // Max +20

    // +Points pour catégories standard
    const standardCategories = [
      "Technical Skills",
      "Programming Languages",
      "Frameworks",
      "Tools",
      "Soft Skills",
      "Leadership",
      "Languages",
    ]
    if (standardCategories.includes(category.category)) {
      score += 10
    }

    return { category, score }
  })

  // 2. Trier par score décroissant
  scoredCategories.sort((a, b) => b.score - a.score)

  // 3. Sélectionner top N
  const selectedSkills = scoredCategories.slice(0, maxCategories).map(s => s.category)

  return {
    selectedSkills,
    reasoning: `Selected top ${maxCategories} skill categories based on relevance and recency`,
  }
}
```

### Critères de Validation

- [ ] Nombre: 3-4 catégories maximum (sidebar space constraint)
- [ ] Pertinence: Au moins 2 catégories en lien avec le rôle actuel/cible
- [ ] Diversité: Pas de catégories redondantes
- [ ] Complétude: Chaque catégorie contient 3-10 skills

---

## 7️⃣ FONCTION: selectTopCertifications()

### Signature

```typescript
interface SelectTopCertificationsInput {
  certifications: ResumeCertification[]
  targetRole?: string
  maxCertifications?: number // Default: 3
}

interface SelectTopCertificationsOutput {
  selectedCertifications: ResumeCertification[]
  reasoning: string
}

function selectTopCertifications(
  input: SelectTopCertificationsInput
): SelectTopCertificationsOutput
```

### Règles de Sélection

#### Objectif

Afficher uniquement les 2-3 certifications les plus pertinentes et récentes.

#### Critères de Priorisation

1. **Récence:**
   - Certifications < 2 ans: score +50
   - Certifications 2-5 ans: score +30
   - Certifications > 5 ans: score +10

2. **Pertinence:**
   - Certification directement liée au rôle cible: +40
   - Certification du même domaine: +20
   - Certification générique (PMP, MBA, etc.): +10

3. **Prestige:**
   - Certifications reconnues mondialement (AWS, Google, Microsoft, etc.): +30
   - Certifications d'universités top-tier: +20
   - Autres: +5

#### Algorithme de Sélection

```typescript
function selectTopCertifications(
  input: SelectTopCertificationsInput
): SelectTopCertificationsOutput {
  const { certifications, targetRole, maxCertifications = 3 } = input

  // 1. Scorer chaque certification
  const scoredCerts = certifications.map(cert => {
    let score = 0

    // Récence
    if (cert.date) {
      const yearsDiff = new Date().getFullYear() - new Date(cert.date).getFullYear()
      if (yearsDiff < 2) score += 50
      else if (yearsDiff < 5) score += 30
      else score += 10
    } else {
      score += 5 // Pas de date = probablement vieux
    }

    // Prestige de l'émetteur
    const prestigiousIssuers = [
      "Google", "Microsoft", "AWS", "Amazon", "Meta", "Facebook",
      "Stanford", "MIT", "Harvard", "Yale", "Oxford", "Cambridge",
      "PMI", "Scrum Alliance", "ISACA", "CompTIA",
    ]
    if (prestigiousIssuers.some(issuer => cert.issuer.includes(issuer))) {
      score += 30
    }

    // Pertinence pour le rôle (si fourni)
    if (targetRole && isRelevantForRole(cert.name, targetRole)) {
      score += 40
    }

    return { cert, score }
  })

  // 2. Trier par score décroissant
  scoredCerts.sort((a, b) => b.score - a.score)

  // 3. Sélectionner top N
  const selectedCertifications = scoredCerts.slice(0, maxCertifications).map(s => s.cert)

  return {
    selectedCertifications,
    reasoning: `Selected top ${maxCertifications} certifications based on recency, relevance, and prestige`,
  }
}
```

### Critères de Validation

- [ ] Nombre: 2-3 certifications maximum
- [ ] Récence: Au moins 1 certification < 3 ans si disponible
- [ ] Pertinence: Certifications en lien avec le rôle
- [ ] Pas de certifications obsolètes (ex: Windows XP Certified en 2025)

---

## 8️⃣ STANDARDS ATS 2024-2025

### Compatibilité ATS (Applicant Tracking Systems)

Tous les CV générés doivent respecter les standards ATS pour maximiser
les chances de passage des filtres automatiques.

#### Règles Générales

1. **Pas de tables pour le layout**
   - Utiliser Flexbox ou Grid (pas détecté par ATS, mais rendu HTML propre)
   - Le texte doit être extractible en mode sélection

2. **Semantic HTML**
   - `<h1>` pour le nom
   - `<h2>` pour les titres de section
   - `<h3>` pour les sous-titres (postes, diplômes)
   - `<ul>` et `<li>` pour les listes
   - `<p>` pour les paragraphes

3. **Mots-clés pertinents**
   - Inclure les skills exactement comme dans l'offre d'emploi
   - Utiliser les termes standards de l'industrie
   - Éviter les abréviations non-standard

4. **Format des dates**
   - Standard: MM/YYYY - MM/YYYY
   - Acceptable: Jan 2020 - Dec 2023
   - Éviter: 1/20 - 12/23 (trop court)

5. **Pas de headers/footers complexes**
   - Certains ATS ignorent les headers/footers
   - Toutes les infos importantes doivent être dans le body

#### Mots-Clés par Secteur (Exemples)

**Marketing:**
```
SEO, SEM, PPC, Content Marketing, Social Media Marketing, Marketing Automation,
Google Analytics, HubSpot, Salesforce, Brand Strategy, Digital Strategy,
Campaign Management, Lead Generation, Customer Acquisition, ROI, KPI, A/B Testing
```

**Software Engineering:**
```
JavaScript, TypeScript, React, Node.js, Python, SQL, AWS, Docker, Kubernetes,
CI/CD, REST API, GraphQL, Microservices, Agile, Scrum, Git, Test-Driven Development,
Object-Oriented Programming, System Design, Cloud Computing
```

**Finance:**
```
Financial Modeling, Excel, VBA, Bloomberg Terminal, Risk Management, Portfolio Management,
Equity Research, Financial Analysis, Valuation, DCF, M&A, Due Diligence, GAAP,
IFRS, CFA, Financial Reporting
```

#### Outils ATS Communs (2024-2025)

- Workday
- Greenhouse
- Lever
- iCIMS
- Taleo
- SmartRecruiters
- BambooHR
- JazzHR

Tous doivent pouvoir parser correctement le CV généré.

---

## 9️⃣ IMPLÉMENTATION TECHNIQUE

### Architecture Proposée

```
┌─────────────────────────────────────────────────┐
│              User Input (Raw Data)              │
│        (From platform: forms, database)         │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│           AI Transformation Layer               │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │   OpenAI / Anthropic Claude / Gemini    │   │
│  │                                         │   │
│  │   Prompts:                              │   │
│  │   - transformSummary()                  │   │
│  │   - transformExperience()               │   │
│  │   - generateKeyAchievements()           │   │
│  │   - ...                                 │   │
│  └─────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│          Transformed Data (Optimized)           │
│       (Stored in database: resume_analyses)     │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│              Resume Template                    │
│          (professional-template.tsx)            │
│                                                 │
│              Renders Final CV                   │
└─────────────────────────────────────────────────┘
```

### Endpoints API Proposés

#### 1. POST /api/ai/transform-resume

Transforme toutes les sections d'un CV en une seule requête.

```typescript
// Request
POST /api/ai/transform-resume
{
  "resumeId": "uuid",
  "transformations": ["summary", "experience", "keyAchievements"],
  "options": {
    "targetRole": "Marketing Director",
    "includeMetrics": true
  }
}

// Response
{
  "success": true,
  "transformed": {
    "summary": "...",
    "experience": [...],
    "keyAchievements": [...]
  },
  "usage": {
    "tokensUsed": 1250,
    "cost": 0.025
  }
}
```

#### 2. POST /api/ai/transform-section

Transforme une section spécifique.

```typescript
// Request
POST /api/ai/transform-section
{
  "section": "experience",
  "data": {
    "position": "Marketing Manager",
    "company": "Acme Corp",
    "achievements": ["Did stuff", "Improved things"]
  },
  "options": {
    "targetRole": "Senior Marketing Manager"
  }
}

// Response
{
  "success": true,
  "transformed": {
    "description": "Led a team of...",
    "achievements": [
      "Increased revenue by 35% through...",
      "Optimized marketing spend, reducing cost-per-acquisition by 28%..."
    ]
  }
}
```

### Prompts d'IA (Exemples)

#### Prompt: transformSummary

```
You are a professional CV writer specializing in creating impactful,
ATS-optimized resume summaries.

Transform the following raw summary into a professional, compelling summary
that follows these rules:

1. Length: 60-100 words (3-4 sentences)
2. Structure:
   - Sentence 1: Professional title + years of experience + domain
   - Sentence 2: Top quantifiable achievement
   - Sentence 3: Key expertise areas
   - Sentence 4: Value proposition for future employer
3. Use strong action verbs (Drove, Spearheaded, Led, Delivered)
4. Include specific metrics when possible
5. Maintain professional tone
6. Optimize for ATS with relevant keywords

IMPORTANT: Do NOT invent facts or metrics. Only enhance the writing.

Raw Summary:
"""
{{rawSummary}}
"""

Context:
- Current Role: {{currentRole}}
- Years of Experience: {{yearsOfExperience}}
- Top Skills: {{topSkills}}

Transformed Summary:
```

#### Prompt: generateKeyAchievements

```
You are a CV optimization expert.

Based on the user's experience history, generate 4 "Key Achievements" that
highlight their most impactful accomplishments.

Each achievement must have:
1. Title: 3-6 words, impactful, title case (e.g., "Revenue Growth Leader")
2. Description: 1 line, max 80 characters, includes a metric if possible

Rules:
- Prioritize achievements with quantifiable results
- Focus on recent accomplishments (last 5 years)
- Ensure diversity: don't repeat similar concepts
- Use the STAR method implicitly (Situation, Task, Action, Result)
- Do NOT invent metrics or facts

Experience History:
"""
{{experienceJSON}}
"""

Return as JSON:
{
  "achievements": [
    {
      "title": "...",
      "description": "..."
    },
    // ... 3 more
  ]
}
```

### Technologies Recommandées

#### AI Providers

1. **OpenAI (GPT-4o)**
   - Excellent pour la réécriture créative
   - Coût: ~$0.005 / 1K tokens input, ~$0.015 / 1K tokens output
   - Latence: ~2-5s

2. **Anthropic (Claude Sonnet)**
   - Excellent pour le respect strict des consignes
   - Coût: ~$0.003 / 1K tokens input, ~$0.015 / 1K tokens output
   - Latence: ~1-3s

3. **Google (Gemini 1.5 Pro)**
   - Bon rapport qualité/prix
   - Coût: ~$0.00125 / 1K tokens input, ~$0.005 / 1K tokens output
   - Latence: ~1-4s

#### Implementation Stack

```typescript
// Example: src/lib/ai/transformations.ts

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function transformSummary(
  input: TransformSummaryInput
): Promise<TransformSummaryOutput> {
  const prompt = buildSummaryPrompt(input)

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  })

  const transformedSummary = message.content[0].text

  return {
    transformedSummary,
    wordCount: transformedSummary.split(' ').length,
    keywordsUsed: extractKeywords(transformedSummary),
    confidence: 85, // Could be calculated based on API response
  }
}
```

### Stockage des Transformations

Les transformations doivent être stockées dans la table `resume_analyses`:

```sql
-- Exemple de stockage
INSERT INTO resume_analyses (
  resume_id,
  analysis_type,
  analysis_data,
  created_at
) VALUES (
  'resume-uuid',
  'ai_transformation',
  '{
    "summary": {
      "original": "...",
      "transformed": "...",
      "transformedAt": "2025-12-14T10:30:00Z"
    },
    "experience": [...],
    "keyAchievements": [...],
    "metadata": {
      "model": "claude-sonnet-4",
      "tokensUsed": 1250,
      "cost": 0.025
    }
  }'::jsonb,
  NOW()
);
```

### Caching Strategy

Pour éviter de re-transformer le même contenu:

```typescript
// Pseudo-code
async function getOrTransformSummary(resumeId: string, rawSummary: string) {
  // 1. Check cache
  const cached = await db.resumeAnalyses.findFirst({
    where: {
      resumeId,
      analysisType: 'summary_transformation',
      analysisData: {
        path: ['summary', 'original'],
        equals: rawSummary,
      },
    },
  })

  if (cached && !isStale(cached.createdAt)) {
    return cached.analysisData.summary.transformed
  }

  // 2. Transform
  const transformed = await transformSummary({ rawSummary, ... })

  // 3. Cache
  await db.resumeAnalyses.create({
    data: {
      resumeId,
      analysisType: 'summary_transformation',
      analysisData: { summary: { original: rawSummary, transformed } },
    },
  })

  return transformed
}
```

---

## 🎯 CHECKLIST D'IMPLÉMENTATION

### Phase 1: Fondations (1-2 semaines)
- [ ] Créer route API `/api/ai/transform-summary`
- [ ] Créer route API `/api/ai/transform-experience`
- [ ] Créer route API `/api/ai/generate-key-achievements`
- [ ] Implémenter le caching dans `resume_analyses`
- [ ] Ajouter gestion d'erreurs et retry logic
- [ ] Tests unitaires pour chaque fonction de transformation

### Phase 2: Intégration UI (1 semaine)
- [ ] Ajouter bouton "Optimize with AI" dans Resume Editor
- [ ] Afficher preview avant/après transformation
- [ ] Permettre édition manuelle après transformation
- [ ] Ajouter indicateur de coût (tokens/crédits)

### Phase 3: Optimisation (1 semaine)
- [ ] A/B testing de différents prompts
- [ ] Optimisation des coûts (choix du modèle)
- [ ] Monitoring de la qualité (user feedback)
- [ ] Rate limiting et quotas par user

### Phase 4: Advanced Features (optionnel)
- [ ] Transformation contextuelle par industrie
- [ ] Adaptation automatique selon l'offre d'emploi
- [ ] Multi-langue (transformation EN/FR/DE)
- [ ] Suggestions en temps réel (lors de la frappe)

---

**FIN DE LA SPÉCIFICATION**

Ce document définit la logique complète de transformation IA pour le système de CV.
Chaque fonction doit être implémentée en respectant strictement ces règles pour
garantir la qualité et la cohérence des CV générés.
