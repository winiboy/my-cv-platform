# 🔍 DIAGNOSTIC: Compétences non sauvegardées/affichées

## 🐛 Problème Rapporté

Les compétences (skills) ne sont pas sauvegardées et n'apparaissent pas dans l'aperçu du CV.

## 📋 ÉTAPES DE DIAGNOSTIC

### Test 1: Vérifier que les compétences sont bien dans le state local

1. **Ouvrir la console navigateur** (F12)
2. **Aller dans l'éditeur de CV** (`/dashboard/resumes/[id]/edit`)
3. **Cliquer sur la section "Skills"**
4. **Ajouter une catégorie** (ex: "Programming Languages")
5. **Ajouter des skills** (ex: "JavaScript", "TypeScript")
6. **Dans la console, taper:**

   ```javascript
   // Vérifier le state React
   // (Vous devriez voir vos skills dans les React DevTools)
   ```

**Résultat attendu:** Les skills apparaissent immédiatement dans l'interface (badges verts avec les noms)

**Si ça ne fonctionne pas:** Le problème est dans `SkillsSection.tsx` (state local)

**Si ça fonctionne:** Passer au Test 2

---

### Test 2: Vérifier que les compétences sont sauvegardées dans la base de données

1. **Après avoir ajouté des skills (Test 1)**
2. **Cliquer sur le bouton "Save"**
3. **Attendre la confirmation** ("Last saved at...")
4. **Ouvrir Supabase Dashboard → Table Editor**
5. **Sélectionner la table `resumes`**
6. **Trouver votre CV (par titre ou ID)**
7. **Regarder la colonne `skills`**

**Résultat attendu:**
```json
[
  {
    "category": "Programming Languages",
    "items": ["JavaScript", "TypeScript"]
  }
]
```

**Si la colonne est vide (`[]` ou `null`):** Le problème est dans la sauvegarde (ResumeEditor)

**Si la colonne contient vos skills:** Passer au Test 3

---

### Test 3: Vérifier que les compétences sont chargées depuis la base de données

1. **Après avoir sauvegardé (Test 2)**
2. **Rafraîchir la page** (Ctrl+F5)
3. **Aller dans la section "Skills"**
4. **Vérifier si les skills sont toujours là**

**Résultat attendu:** Les skills que vous avez ajoutées sont toujours présentes

**Si les skills ont disparu:** Le problème est dans le chargement (page.tsx)

**Si les skills sont là:** Passer au Test 4

---

### Test 4: Vérifier que les compétences s'affichent dans le template

1. **Avec des skills sauvegardées**
2. **Cliquer sur "Preview"**
3. **Vérifier si les skills apparaissent dans la sidebar (gauche)**

**Résultat attendu:** Section "SKILLS" visible avec vos catégories et compétences

**Si les skills n'apparaissent pas:** Le problème est dans le template (professional-template.tsx)

**Si les skills apparaissent:** Le problème est résolu !

---

## 🔧 CORRECTIONS POTENTIELLES

Basé sur les tests ci-dessus, voici les corrections possibles:

### Problème 1: Skills pas dans le state (Test 1 échoue)

**Cause:** Problème dans `SkillsSection.tsx`

**Solution:** Vérifier que le composant est bien monté et que `updateResume` est appelé

### Problème 2: Skills pas sauvegardées (Test 2 échoue)

**Cause:** Le champ `skills` n'est peut-être pas correctement sérialisé pour Supabase

**Solution:** Modifier `resume-editor.tsx` ligne 79:

```typescript
// AVANT
skills: resume.skills,

// APRÈS
skills: JSON.parse(JSON.stringify(resume.skills || [])),
```

OU vérifier les logs de la requête:

```typescript
console.log('Saving skills:', resume.skills)
console.log('Saving skills JSON:', JSON.stringify(resume.skills))
```

### Problème 3: Skills pas chargées (Test 3 échoue)

**Cause:** Les skills ne sont pas parsées correctement depuis JSONB

**Solution:** Vérifier le type de données retourné par Supabase

Dans `page.tsx` (edit), ajouter un log:

```typescript
console.log('Loaded resume:', resume)
console.log('Loaded skills:', resume.skills)
console.log('Skills type:', typeof resume.skills)
```

### Problème 4: Skills pas affichées (Test 4 échoue)

**Cause:** Le template ne détecte pas les skills ou le format est incorrect

**Solution:** Vérifier dans `professional-template.tsx` ligne 131:

```typescript
// Ajouter des logs
console.log('Skills in template:', skills)
console.log('Skills length:', skills.length)
console.log('Skills array:', JSON.stringify(skills))
```

---

## 🛠️ FIX RAPIDE (Hypothèse la plus probable)

Le problème le plus courant est que les skills ne sont pas correctement initialisées ou le type JSONB n'est pas parsé correctement.

### Solution 1: Forcer la sérialisation JSON

Modifier `src/components/dashboard/resume-editor.tsx`:

```typescript
// Ligne 65-101
const handleSave = async () => {
  setIsSaving(true)
  setSaveError('')

  try {
    const supabase = createClient()

    // Ajouter cette fonction helper
    const serializeJSONB = (data: any) => {
      if (data === null || data === undefined) return null
      if (Array.isArray(data)) return data
      return data
    }

    const updates: any = {
      title: resume.title,
      template: resume.template,
      contact: serializeJSONB(resume.contact),
      summary: resume.summary,
      experience: serializeJSONB(resume.experience),
      education: serializeJSONB(resume.education),
      skills: serializeJSONB(resume.skills), // ← FIX ICI
      languages: serializeJSONB(resume.languages),
      certifications: serializeJSONB(resume.certifications),
      projects: serializeJSONB(resume.projects),
      custom_sections: serializeJSONB(resume.custom_sections),
    }

    // Ajouter des logs pour debug
    console.log('Saving resume with skills:', updates.skills)

    const result = await (supabase.from('resumes') as any)
      .update(updates)
      .eq('id', resume.id)

    const { error } = result

    if (error) {
      console.error('Error saving resume:', error)
      setSaveError(dict.resumes?.errors?.saveFailed || 'Failed to save resume')
    } else {
      console.log('Resume saved successfully')
      setLastSaved(new Date())
    }
  } catch (err) {
    console.error('Unexpected error:', err)
    setSaveError(dict.resumes?.errors?.saveFailed || 'Failed to save resume')
  } finally {
    setIsSaving(false)
  }
}
```

### Solution 2: Vérifier l'initialisation des skills

Modifier `src/components/dashboard/resume-sections/skills-section.tsx`:

```typescript
// Ligne 12
// AVANT
const skills = (resume.skills as unknown as ResumeSkillCategory[]) || []

// APRÈS
const skills = (() => {
  const s = resume.skills as unknown as ResumeSkillCategory[]
  console.log('Skills in SkillsSection:', s)
  return Array.isArray(s) ? s : []
})()
```

### Solution 3: Vérifier le template

Modifier `src/components/dashboard/resume-templates/professional-template.tsx`:

```typescript
// Ligne 42 (dans le composant)
const skills = (() => {
  const s = (resume.skills as unknown as ResumeSkillCategory[]) || []
  console.log('Skills in ProfessionalTemplate:', s)
  console.log('Skills is array?', Array.isArray(s))
  console.log('Skills length:', s.length)
  return s
})()
```

---

## 📞 PROCHAINES ÉTAPES

1. **Effectuer les 4 tests de diagnostic** ci-dessus
2. **Noter quel test échoue** (1, 2, 3 ou 4)
3. **Appliquer la correction correspondante**
4. **Partager les logs de la console** si le problème persiste

---

## 🔍 LOGS À PARTAGER

Si le problème persiste après avoir appliqué les solutions, partagez les informations suivantes:

### Console du navigateur (F12):

```
[Copier tous les logs qui mentionnent "skills" ou "Saving resume"]
```

### Contenu de la base de données:

```sql
-- Exécuter dans Supabase SQL Editor
SELECT id, title, skills FROM resumes WHERE user_id = auth.uid() LIMIT 5;
```

```
[Copier le résultat, notamment la colonne skills]
```

### State React:

```javascript
// Dans la console, après avoir ouvert React DevTools
// Trouver le composant ResumeEditor
// Copier la valeur de resume.skills
```

---

**Dernière mise à jour:** 2025-12-14
**Fichier de corrections:** Ce document
