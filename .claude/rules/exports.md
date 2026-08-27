---
paths:
  - "src/app/api/resumes/**/download-*/**/*"
  - "src/components/dashboard/download-*.tsx"
  - "src/components/dashboard/resume-preview*.tsx"
  - "src/components/dashboard/resume-templates/**/*"
  - "src/lib/layout-settings.ts"
---
# Export Rules

- Resume exports must be generated only for an authenticated user authorized to access the requested resume.
- The rendered Preview is the visual/content contract for export fidelity; export implementations must not invent independent content, ordering, visibility, or styling defaults when canonical resume state exists.
- PDF/DOCX format-specific rendering is allowed, but it must preserve the resume's semantic content, section order, visibility, typography intent, colors, photo behavior, and layout choices to the degree the target format supports them.
- Do not add URL parameters, localStorage values, or export-only state as a new canonical source of resume layout or content; transport mechanisms must remain derived from authoritative resume state.
- Export code must not silently omit, rewrite, or reorder supported resume content and then claim Preview parity.
- Export filenames and response metadata must be safe for user-controlled resume names and must not expose internal paths, identifiers, or secrets.
- A fidelity limitation or unsupported target-format behavior must be treated as an explicit validation finding, not as a PASS by assumption.
