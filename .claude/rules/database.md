---
paths:
  - "supabase/**/*.sql"
  - "src/lib/supabase/**/*"
  - "src/types/database.ts"
  - "src/types/supabase.ts"
  - "src/app/api/**/*"
---
# Database Rules

- Version-controlled Supabase migrations are the source of truth for schema, constraint, index, function, trigger, and RLS-policy changes.
- Change deployed database structure with a new forward migration; do not rewrite already-applied migration history to represent a new state.
- User-owned data must remain protected by RLS with explicit policies for the operations the application permits.
- Server-side data access must derive ownership from authenticated identity; do not use client-provided ownership fields as authorization.
- Supabase service-role access is server-only and exceptional; never use it as a shortcut around correct RLS or user-scoped authorization.
- Destructive or lossy schema/data changes require an explicit approved requirement and must not be introduced incidentally.
- Keep checked-in database/Supabase TypeScript types aligned with schema changes that affect application code.
