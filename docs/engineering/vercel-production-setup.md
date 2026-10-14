# Fiche de mise en ligne — Vercel

Pour mettre en service le site hébergé `https://my-cv-platform.vercel.app`.

Constaté le 2026-10-14 : le site n'a jamais reçu ses réglages Supabase dans Vercel. Toutes les pages répondaient `500 MIDDLEWARE_INVOCATION_FAILED`, y compris avant #108. En local, tout fonctionne : les valeurs viennent de `.env.local`.

Ne colle jamais une valeur de variable dans une discussion, un ticket ou une capture. Seuls les **noms** peuvent circuler.

## 1. Les variables d'environnement

Dans Vercel → projet **my-cv-platform** → **Settings** → **Environment Variables** → **Add Environment Variable**.

**Les noms doivent être exactement ceux-ci, préfixe `NEXT_PUBLIC_` compris.** Vercel suggère de retirer `NEXT_PUBLIC_` pour garder une variable secrète. Ne le fais pas pour les trois premières : le code les lit sous ce nom exact, et sans elles le site plante.

| Nom | Valeur | Environnements | Sensitive |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | l'URL du projet Supabase (`https://….supabase.co`), comme dans `.env.local` | Production, Preview | non |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | la clé `anon` du projet, comme dans `.env.local` | Production, Preview | non |
| `NEXT_PUBLIC_APP_URL` | `https://my-cv-platform.vercel.app` (sans `/` final) | Production seulement | non |
| `GROQ_API_KEY` | comme dans `.env.local` | Production, Preview | oui |
| `GROQ_MODEL`, `GROQ_MODEL_FAST` | comme dans `.env.local` | Production, Preview | non |
| `ADZUNA_APP_ID` | comme dans `.env.local` | Production, Preview | non |
| `ADZUNA_APP_KEY` | comme dans `.env.local` | Production, Preview | oui |
| `HEALTH_CHECK_TOKEN` | seulement si tu l'utilises | Production | oui |

Ce qu'il **ne faut pas** mettre :

- **`SUPABASE_SERVICE_ROLE_KEY`** : l'application n'en a pas besoin, et cette clé contourne toutes les protections de la base.
- **Les variables `TEST_…`** : elles ne servent qu'aux tests.
- **Une copie de `NEXT_PUBLIC_APP_URL` ou `NEXTAUTH_URL` pointant sur `localhost`.**

La clé `anon` et l'URL Supabase sont publiques par conception : chaque navigateur les reçoit. Tes données sont protégées par les règles d'accès de la base (RLS), pas par le secret de cette clé. Les vrais secrets sont `GROQ_API_KEY` et `ADZUNA_APP_KEY`, et ils n'ont pas le préfixe.

## 2. Supabase : l'adresse du site

Dans le tableau de bord Supabase du projet → **Authentication** → **URL Configuration** :

- **Site URL** : `https://my-cv-platform.vercel.app`
- **Redirect URLs** : ajoute `https://my-cv-platform.vercel.app/**`

Sans ce réglage, les e-mails de réinitialisation de mot de passe renvoient vers `localhost`.

## 3. Node.js

**Settings** → **Build and Deployment** → **Node.js Version** : **22.x**.

La génération du PDF (`@sparticuz/chromium` 153) ne fonctionne pas en Node 20.

## 4. Construire et mettre en ligne

Les variables `NEXT_PUBLIC_…` sont intégrées **au moment de la construction**. Après tout changement de variable :

1. **Deployments** → le dernier déploiement de `main` → **⋯** → **Redeploy**, en **décochant** « Use existing Build Cache ».
2. Quand il est **Ready** : **⋯** → **Promote to Production**.
   Si un « Instant Rollback » a été fait, la production reste figée sur l'ancien déploiement tant qu'on ne promeut pas le nouveau.

## 5. Vérifier

Depuis une fenêtre de navigation privée :

| Adresse | Attendu |
|---|---|
| `https://my-cv-platform.vercel.app/fr` | la page d'accueil, pas d'erreur 500 |
| `https://my-cv-platform.vercel.app/fr/login` | la page de connexion |

La route PDF doit répondre **401** à un appel anonyme. Un **500** veut dire que les variables Supabase manquent ; un **404**, que l'ancienne version est encore en ligne. Test en ligne de commande :

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "content-type: application/json" -d "{}" https://my-cv-platform.vercel.app/api/resumes/00000000-0000-0000-0000-000000000000/download-pdf
```

Ensuite :

1. Crée ton compte sur le site hébergé. Les comptes du Supabase local n'y existent pas.
2. Crée un CV et ouvre l'**Aperçu**.
3. Clique sur **Télécharger PDF** : le fichier doit arriver en quelques secondes, sans boîte d'impression.

## 6. Si ça ne marche pas

| Ce que tu vois | Cause probable |
|---|---|
| `500 MIDDLEWARE_INVOCATION_FAILED` sur toutes les pages | `NEXT_PUBLIC_SUPABASE_URL` ou `NEXT_PUBLIC_SUPABASE_ANON_KEY` absente, mal nommée, non cochée pour Production, ou déploiement construit avant leur ajout |
| La route PDF répond 404 | l'ancien déploiement est encore en production : promouvoir le nouveau (étape 4) |
| La route PDF répond 503 | `NEXT_PUBLIC_APP_URL` absente en Production |
| Le PDF échoue avec « Failed to generate PDF » une fois connecté | Chromium ne démarre pas : vérifier Node 22.x (étape 3), puis lire le journal |
| Redirection vers une page de connexion Vercel sur une prévisualisation | « Deployment Protection » est active sur les Preview ; activer **Protection Bypass for Automation** (voir `pdf-export-runtime.md`) |

Pour un diagnostic précis : Vercel → **Logs** → clique sur une requête en erreur → copie le message. Ce message ne contient pas les valeurs des variables.

## Voir aussi

- `docs/engineering/pdf-export-runtime.md` : fonctionnement de la génération du PDF sur Vercel.
