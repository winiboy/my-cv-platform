---
paths:
  - "src/app/**/resumes/**/*"
  - "src/components/dashboard/resume-*.tsx"
  - "src/components/dashboard/resume-sections/**/*"
  - "src/components/dashboard/resume-templates/**/*"
  - "src/lib/layout-settings.ts"
  - "src/lib/format-text.tsx"
  - "src/lib/html-utils.tsx"
  - "src/types/resume-analysis.ts"
  - "src/types/cv-adaptation.ts"
---
# Resume Rules

- Do not introduce new competing sources of truth for resume content, layout, section order, section visibility, template choice, typography, colors, or photo state.
- Existing resume state may be transformed for rendering, but derived or transport state must not silently become an independent authoritative copy.
- Supported template identifiers remain `modern`, `classic`, `minimal`, `creative`, and `professional` unless an approved requirement intentionally changes the template set.
- Template-specific presentation must remain isolated; a change intended for one template must not alter unrelated templates through shared fallbacks or defaults unless explicitly required.
- Resume section order, visibility, placement, and layout settings must remain semantically consistent between Editor, Live Preview, and Preview.
- Preserve intended rich-text semantics and formatting through resume editing and rendering; do not flatten meaningful formatting as a shortcut.
- Never hardcode user resume content, reference-fixture values, or one-off template data to satisfy visual acceptance criteria.
