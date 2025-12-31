# 🔧 DÉPANNAGE: Erreur "Échec de la création du CV"

## 🐛 Problème

Lors de la tentative de création d'un CV avec le template "Professional", vous recevez l'erreur:
```
Échec de la création du CV
```

## 🔍 Diagnostic

Le problème vient de la **contrainte CHECK** dans la base de données Supabase qui n'accepte pas encore 'professional' comme valeur valide pour le champ `template`.

### Pourquoi ce problème?

Nous avons modifié le fichier de migration `001_initial_schema.sql`, mais cette modification ne s'applique **PAS automatiquement** à votre base de données existante. Les migrations ne sont exécutées qu'une seule fois lors de leur création initiale.

## ✅ SOLUTIONS (Choisissez une option)

---

### 🚀 SOLUTION 1: SQL Editor Supabase (RECOMMANDÉ - 2 minutes)

C'est la solution la plus rapide si vous utilisez Supabase Cloud.

#### Étapes:

1. **Ouvrir le Supabase Dashboard:**
   - Aller sur [https://app.supabase.com](https://app.supabase.com)
   - Sélectionner votre projet

2. **Ouvrir le SQL Editor:**
   - Cliquer sur "SQL Editor" dans la sidebar gauche
   - Cliquer sur "New query"

3. **Copier-coller ce SQL:**

   ```sql
   -- Drop the existing CHECK constraint
   ALTER TABLE public.resumes DROP CONSTRAINT IF EXISTS resumes_template_check;

   -- Add the new CHECK constraint with 'professional' included
   ALTER TABLE public.resumes ADD CONSTRAINT resumes_template_check
     CHECK (template IN ('modern', 'classic', 'minimal', 'creative', 'professional'));

   -- Verify the constraint was added
   SELECT conname, pg_get_constraintdef(oid) as definition
   FROM pg_constraint
   WHERE conname = 'resumes_template_check';
   ```

4. **Exécuter la requête:**
   - Cliquer sur "Run" (ou Ctrl/Cmd + Enter)
   - Vous devriez voir dans les résultats:
     ```
     resumes_template_check | CHECK ((template IN ('modern', 'classic', 'minimal', 'creative', 'professional')))
     ```

5. **Tester:**
   - Retourner sur votre application
   - Essayer de créer un CV avec le template "Professional"
   - ✅ Ça devrait fonctionner maintenant!

---

### 🛠️ SOLUTION 2: Supabase CLI (Si vous utilisez Supabase local)

Si vous avez Supabase CLI installé et utilisez une instance locale:

#### Étapes:

1. **Appliquer la nouvelle migration:**
   ```bash
   # Depuis le dossier racine du projet
   cd E:\website\cv-website\my-cv-platform

   # Appliquer la migration
   supabase migration up
   ```

2. **OU réinitialiser complètement la base de données:**
   ```bash
   # ⚠️ ATTENTION: Ceci supprime toutes vos données!
   supabase db reset
   ```

3. **Tester:**
   ```bash
   pnpm dev
   # Créer un CV avec template Professional
   ```

---

### 🔧 SOLUTION 3: Modification manuelle via Table Editor

Si vous préférez modifier via l'interface graphique (moins recommandé):

#### Étapes:

1. **Ouvrir Supabase Dashboard → Table Editor**
2. **Sélectionner la table `resumes`**
3. **Cliquer sur l'engrenage ⚙️ à côté de la colonne `template`**
4. **Modifier le type/contrainte:**
   - Malheureusement, l'interface ne permet pas de modifier facilement les CHECK constraints
   - ❌ Cette méthode n'est pas recommandée
   - Utilisez plutôt la Solution 1 (SQL Editor)

---

## 🧪 VÉRIFICATION

Pour vérifier que la contrainte a été correctement mise à jour:

### Via SQL Editor:

```sql
-- Vérifier la contrainte
SELECT conname, pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conname = 'resumes_template_check';

-- Résultat attendu:
-- resumes_template_check | CHECK ((template IN ('modern', 'classic', 'minimal', 'creative', 'professional')))
```

### Via l'application:

1. Aller sur `/fr/dashboard/resumes/new`
2. Vérifier que "Professional" apparaît dans les options (icône Briefcase)
3. Sélectionner "Professional"
4. Entrer un titre: "Test Professional Template"
5. Cliquer sur "Create Resume"
6. ✅ Vous devriez être redirigé vers l'éditeur de CV

---

## 🔍 DIAGNOSTIC AVANCÉ

Si le problème persiste après avoir appliqué la Solution 1:

### 1. Vérifier les logs du navigateur

Ouvrir la console du navigateur (F12) et regarder les erreurs:

```javascript
// Vous devriez voir quelque chose comme:
// POST /api/... 400 Bad Request
// Error: new row for relation "resumes" violates check constraint "resumes_template_check"
```

### 2. Vérifier les logs Supabase

Dans le Supabase Dashboard → Logs:
- Chercher les erreurs récentes
- Filtrer par "Database"
- Regarder les erreurs SQL

### 3. Tester manuellement l'insertion

Dans le SQL Editor, essayer d'insérer un CV avec template 'professional':

```sql
-- Récupérer votre user_id
SELECT id FROM auth.users LIMIT 1;

-- Insérer un CV de test (remplacer 'YOUR_USER_ID' par l'ID récupéré)
INSERT INTO public.resumes (user_id, title, template)
VALUES ('YOUR_USER_ID', 'Test Professional', 'professional')
RETURNING *;
```

**Si ça échoue:**
- La contrainte n'a pas été mise à jour → Réessayer la Solution 1
- Vérifier qu'il n'y a pas de typo dans le nom de la contrainte

**Si ça fonctionne:**
- Le problème vient peut-être du code frontend
- Vérifier le fichier `create-resume-form.tsx`

---

## 🆘 SI LE PROBLÈME PERSISTE

### Vérifier le code Frontend

1. **Ouvrir la console navigateur (F12)**
2. **Aller dans l'onglet Network**
3. **Essayer de créer un CV avec template Professional**
4. **Regarder la requête POST qui échoue**
5. **Cliquer sur la requête → Onglet "Payload"**
6. **Vérifier le JSON envoyé:**

   ```json
   {
     "user_id": "...",
     "title": "Mon CV",
     "template": "professional",  // ← Vérifier que c'est bien "professional"
     ...
   }
   ```

### Vérifier le code TypeScript

Si vous voyez une erreur TypeScript dans la console:

```bash
# Depuis le dossier du projet
pnpm tsc --noEmit

# Si erreurs de type sur 'professional':
# → Vérifier que src/types/supabase.ts a été modifié correctement
```

### Vérifier que tous les fichiers ont été sauvegardés

```bash
# Vérifier le statut git
git status

# Vous devriez voir:
# M src/components/dashboard/create-resume-form.tsx
# M src/components/dashboard/resume-preview.tsx
# M src/types/supabase.ts
# ...
```

---

## 📋 CHECKLIST DE RÉSOLUTION

- [ ] J'ai exécuté le SQL dans le SQL Editor de Supabase
- [ ] J'ai vérifié que la contrainte a été mise à jour (requête SELECT)
- [ ] J'ai rafraîchi la page de l'application (Ctrl+F5)
- [ ] J'ai vérifié la console navigateur (F12) pour les erreurs
- [ ] J'ai essayé de créer un CV avec template "Professional"
- [ ] ✅ Ça fonctionne! OU ❌ J'ai encore une erreur

---

## 📞 CONTACT

Si le problème persiste après avoir suivi toutes ces étapes:

1. **Copier les informations suivantes:**
   - Le message d'erreur exact
   - Les logs de la console navigateur (F12)
   - Le résultat de la requête de vérification SQL
   - La version de Supabase (Dashboard → Settings → General)

2. **Partager ces informations** pour un diagnostic plus approfondi

---

## 🎯 PRÉVENTION FUTURE

Pour éviter ce type de problème à l'avenir:

### Si vous ajoutez une nouvelle valeur à un enum/constraint:

1. **Ne jamais modifier** une migration existante
2. **Toujours créer** une nouvelle migration
3. **Exemple:**
   ```bash
   # Créer une nouvelle migration
   supabase migration new add_new_template_type

   # Éditer le fichier créé
   # supabase/migrations/YYYYMMDDHHMMSS_add_new_template_type.sql
   ```

### Workflow recommandé:

```bash
# 1. Modifier le code (types, components)
git add .
git commit -m "feat: add new template"

# 2. Créer et appliquer la migration
supabase migration new update_schema
# Éditer le fichier de migration
supabase migration up

# 3. Tester en local
pnpm dev

# 4. Déployer
git push
supabase db push  # Applique les migrations sur le cloud
```

---

**Dernière mise à jour:** 2025-12-14
**Fichier de fix rapide:** `FIX_PROFESSIONAL_TEMPLATE.sql`
