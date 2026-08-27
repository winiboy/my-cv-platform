---
paths:
  - "src/app/**/*.tsx"
  - "src/app/**/*.css"
  - "src/components/**/*.tsx"
  - "src/locales/**/*.json"
---
# Frontend Rules

- Preserve the existing Next.js App Router architecture and server/client boundary; add client components only when browser APIs, client state, or interactivity require them.
- Reuse existing shared components, shadcn/ui primitives, design tokens, and layout conventions before introducing parallel UI abstractions.
- User-facing localized copy must use the existing i18n architecture and preserve parity across `fr`, `en`, `de`, and `it` where the surface is localized.
- Interactive UI must preserve semantic HTML, keyboard operation, visible focus behavior, and accessible names for controls.
- Responsive changes must remain usable across the viewports already supported by the affected surface and must not introduce accidental overflow or clipping.
- Do not introduce framework, dependency, package-manager, or toolchain changes as incidental frontend work unless the approved scope explicitly requires them.
- Visual changes must stay within the requested component or surface; do not redesign unrelated screens while satisfying a local UI requirement.
