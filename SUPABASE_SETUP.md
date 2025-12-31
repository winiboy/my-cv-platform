# 🗄️ Supabase Setup Guide

Complete guide to set up Supabase for the CV Platform (TealHQ Clone)

---

## 📋 Prerequisites

- [Supabase Account](https://supabase.com) (free tier is sufficient)
- pnpm installed
- Project cloned and dependencies installed

---

## 🚀 Quick Start (5 minutes)

### 1. Create Supabase Project

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Click **"New Project"**
3. Fill in:
   - **Name**: `cv-platform` (or your choice)
   - **Database Password**: Generate a strong password (save it!)
   - **Region**: Choose closest to your users
4. Click **"Create new project"** (takes ~2 minutes)

### 2. Get API Keys

1. Go to **Settings** → **API**
2. Copy these values:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon public** key (starts with `eyJh...`)
   - **service_role** key (starts with `eyJh...`) ⚠️ **Keep secret!**

### 3. Configure Environment Variables

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Fill in your Supabase credentials in `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   ```

### 4. Run Database Migration

**Option A: Via Supabase Dashboard (Recommended for beginners)**

1. Go to **SQL Editor** in your Supabase dashboard
2. Click **"New Query"**
3. Copy the entire content of `supabase/migrations/001_initial_schema.sql`
4. Paste it into the SQL editor
5. Click **"Run"** (green button)
6. ✅ You should see: "Success. No rows returned"

**Option B: Via Supabase CLI (Advanced)**

1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Login:
   ```bash
   supabase login
   ```

3. Link project:
   ```bash
   supabase link --project-ref your-project-ref
   ```

4. Apply migration:
   ```bash
   supabase db push
   ```

### 5. Verify Setup

1. Go to **Table Editor** in Supabase dashboard
2. You should see 6 tables:
   - ✅ `profiles`
   - ✅ `resumes`
   - ✅ `resume_analyses`
   - ✅ `job_applications`
   - ✅ `career_goals`
   - ✅ `ai_suggestions`

3. Click on `profiles` → **Policies** → You should see RLS policies enabled

---

## 🔐 Configure Authentication

### Enable Email/Password Auth

1. Go to **Authentication** → **Providers**
2. Enable **Email** provider
3. Configure settings:
   - ✅ Enable email confirmations (recommended)
   - Set **Site URL**: `http://localhost:3000` (dev) or your production URL
   - Set **Redirect URLs**: Add your callback URLs

### Enable OAuth Providers (Optional)

#### GitHub OAuth

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **"New OAuth App"**
3. Fill in:
   - **Application name**: CV Platform
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `https://your-project.supabase.co/auth/v1/callback`
4. Copy **Client ID** and **Client Secret**
5. In Supabase Dashboard → **Authentication** → **Providers** → **GitHub**:
   - Enable GitHub
   - Paste Client ID and Client Secret
   - Save

6. Add to `.env.local`:
   ```env
   GITHUB_ID=your-github-client-id
   GITHUB_SECRET=your-github-client-secret
   ```

#### Google OAuth (Optional)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create OAuth credentials
3. Add callback URL: `https://your-project.supabase.co/auth/v1/callback`
4. Enable in Supabase → Authentication → Providers → Google
5. Add credentials to `.env.local`

---

## 🧪 Test the Setup

### Test Authentication

1. Start dev server:
   ```bash
   pnpm dev
   ```

2. Go to `http://localhost:3000/en/login`

3. Try to sign up with email/password or OAuth

4. Check Supabase Dashboard → **Authentication** → **Users**
   - You should see your new user
   - Check **Table Editor** → `profiles` → You should see a profile automatically created

### Test Database Queries

Create a test file to verify Supabase connection:

```typescript
// test-supabase.ts
import { createClient } from '@/lib/supabase/client'

async function testSupabase() {
  const supabase = createClient()

  // Test query
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .limit(1)

  if (error) {
    console.error('❌ Supabase error:', error)
  } else {
    console.log('✅ Supabase working!', data)
  }
}

testSupabase()
```

---

## 📊 Database Schema Overview

### Tables

| Table | Description | Key Fields |
|-------|-------------|------------|
| **profiles** | User profiles (extends auth.users) | id, email, plan, credits |
| **resumes** | User CVs with all sections | id, user_id, contact, experience, education |
| **resume_analyses** | AI analysis results | id, resume_id, scores, recommendations |
| **job_applications** | Job tracking | id, company, status, interviews |
| **career_goals** | Career planning | id, title, progress, milestones |
| **ai_suggestions** | AI-generated suggestions | id, type, content, rating |

### Row Level Security (RLS)

All tables have RLS enabled with policies ensuring:
- ✅ Users can only see their own data
- ✅ Users can only modify their own data
- ✅ Automatic profile creation on signup
- ✅ Multi-tenant isolation by `user_id`

---

## 🔧 Common Operations

### Add a Resume (Example)

```typescript
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

const { data, error } = await supabase
  .from('resumes')
  .insert({
    user_id: 'user-uuid',
    title: 'My Professional Resume',
    contact: {
      name: 'John Doe',
      email: 'john@example.com',
      phone: '+1234567890'
    },
    experience: [
      {
        company: 'TechCorp',
        position: 'Senior Developer',
        startDate: '2020-01',
        endDate: '2023-12',
        current: false,
        description: 'Led team of 5 developers'
      }
    ]
  })
  .select()
  .single()
```

### Query with Filters

```typescript
// Get all active job applications
const { data: jobs } = await supabase
  .from('job_applications')
  .select('*')
  .eq('user_id', userId)
  .in('status', ['applied', 'interviewing'])
  .order('created_at', { ascending: false })
```

### Real-time Subscriptions

```typescript
// Subscribe to resume changes
const channel = supabase
  .channel('resumes-changes')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'resumes',
      filter: `user_id=eq.${userId}`
    },
    (payload) => {
      console.log('Resume changed:', payload)
    }
  )
  .subscribe()
```

---

## 🐛 Troubleshooting

### Issue: "Invalid API key"
**Solution**: Check that environment variables are correct and restart dev server

### Issue: "Row Level Security policy violation"
**Solution**: Ensure you're passing the correct `user_id` and user is authenticated

### Issue: "relation does not exist"
**Solution**: Migration not applied. Run the SQL migration in Supabase dashboard

### Issue: "Cannot read properties of undefined"
**Solution**: Check that Supabase client is initialized correctly and env vars are set

---

## 📚 Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Next.js Guide](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase JS Client Docs](https://supabase.com/docs/reference/javascript/introduction)

---

## ✅ Setup Complete!

You now have:
- ✅ Supabase project created
- ✅ Database schema migrated (6 tables)
- ✅ RLS policies enabled
- ✅ Authentication configured
- ✅ Environment variables set
- ✅ Type-safe database client ready

**Next steps:**
1. Build the Resume Builder UI
2. Implement Job Tracker
3. Create Resume Analyzer
4. Add AI features

Happy coding! 🚀
