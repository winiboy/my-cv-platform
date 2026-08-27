---
paths:
  - "src/app/api/**/*"
  - "src/lib/auth.ts"
  - "src/lib/supabase/**/*"
  - "src/middleware.ts"
  - "src/components/dashboard/rich-text-editor.tsx"
  - "src/lib/html-utils.tsx"
  - "supabase/**/*"
  - "sentry*.config.ts"
---
# Security Rules

- Authentication and authorization decisions must be enforced server-side; never trust client-supplied user IDs, ownership claims, roles, or access flags.
- Secrets, service-role credentials, OAuth secrets, private tokens, and signing keys must never enter client bundles, committed source, logs, or user-visible errors.
- Treat uploads, URLs, rich HTML, AI output, external responses, and request payloads as untrusted; validate at the relevant trust boundary and sanitize HTML before unsafe rendering.
- Server-side URL fetching must reject unsafe schemes and prevent access to unintended private/internal network targets.
- Upload handling must enforce intended file type and size constraints and must not trust filenames or client MIME metadata as proof of safety.
- Avoid logging resume content, authentication material, secrets, or unnecessary personal data; error responses must not disclose privileged implementation details.
- Never weaken authorization, RLS, validation, sanitization, or other security controls merely to make a feature or test pass.
