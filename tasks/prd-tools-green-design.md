# PRD: Tools Header Color Harmonization

## Introduction

All pages under `/tools/` (across all locales) must have their header updated to use exactly the same color. The visual reference is `/fr/tools/resume-job-match`. The user's selected language must have zero impact on header color.

This PRD focuses **exclusively** on header color harmonization. No other UI elements, layouts, or functionality are in scope.

## Goals

- Identify the exact header color used on `/fr/tools/resume-job-match`
- Audit all existing Tools pages across the codebase
- Update each Tools page header to use the reference color
- Ensure color consistency across all supported locales (fr, en, de, it)
- Zero visual variation when switching languages

## User Stories

### US-001: Identify Reference Header Color
**Description:** As a developer, I need to identify the exact CSS color value used for the header on `/fr/tools/resume-job-match` so I can apply it consistently.

**Acceptance Criteria:**
- [ ] Inspect `/fr/tools/resume-job-match` header component
- [ ] Document the exact color value (hex, RGB, or CSS variable)
- [ ] Note any gradient, opacity, or backdrop effects if present
- [ ] Typecheck passes (`pnpm lint`)

---

### US-002: Audit All Tools Pages
**Description:** As a developer, I need to identify all pages under `/tools/` to understand the full scope of changes required.

**Acceptance Criteria:**
- [ ] List all files/routes under `src/app/[locale]/tools/`
- [ ] Identify which component renders the header for each page
- [ ] Document current header color implementation per page
- [ ] Note any shared vs. page-specific header components
- [ ] Typecheck passes (`pnpm lint`)

---

### US-003: Update Tools Root Page Header
**Description:** As a user, I want the `/tools/` root page header to match the reference color so the experience is consistent.

**Acceptance Criteria:**
- [ ] Header on `/{locale}/tools/` uses exact reference color
- [ ] Color is identical across fr, en, de, it locales
- [ ] No language-conditional styling logic
- [ ] Typecheck passes (`pnpm lint`)
- [ ] Build passes (`pnpm build`)
- [ ] Verify in browser: compare `/fr/tools/` with `/en/tools/`

---

### US-004: Update All Tools Child Page Headers
**Description:** As a user, I want every Tools sub-page header to use the same color as the reference page.

**Acceptance Criteria:**
- [ ] Each `/{locale}/tools/*` page header uses the reference color
- [ ] Color is identical across all supported locales
- [ ] No page-specific color overrides remain
- [ ] Typecheck passes (`pnpm lint`)
- [ ] Build passes (`pnpm build`)
- [ ] Verify in browser using dev-browser skill for each page

---

### US-005: Cross-Locale Visual Verification
**Description:** As a QA tester, I want to verify that switching languages produces zero header color variation.

**Acceptance Criteria:**
- [ ] Open each Tools page in fr locale, note header color
- [ ] Switch to en, de, it locales - header color unchanged
- [ ] Side-by-side comparison shows pixel-perfect match
- [ ] No opacity, gradient, or tint differences
- [ ] Typecheck passes (`pnpm lint`)
- [ ] Build passes (`pnpm build`)

---

## Functional Requirements

- FR-1: The header color source of truth is `/fr/tools/resume-job-match`
- FR-2: All pages under `/{locale}/tools/` must use this exact color
- FR-3: Language selection must not affect header color
- FR-4: No conditional styling based on locale
- FR-5: Changes must be isolated to header components only

## Non-Goals (Out of Scope)

- Page content changes
- Layout modifications
- Headers outside `/tools/` pages
- Typography or font changes
- Responsive design changes
- Dark/light theme variations (unless affecting reference)
- Any i18n system changes
- Sidebar, footer, or other UI elements

## Design Considerations

- Use a single, deterministic color source (CSS variable or constant)
- Avoid per-locale or per-route color definitions
- Pixel-perfect consistency is required
- No creative interpretation - exact match only

## Technical Considerations

- Identify if a shared Tools header component exists
- If headers are per-page, update each individually
- Remove any locale-based CSS overrides
- Consider extracting to a shared component if not existing
- Verify no CSS cascade issues cause variations

## Success Metrics

- All `/{locale}/tools/*` pages have identical header color
- Zero variation when changing locale
- Exact match with `/fr/tools/resume-job-match`
- `pnpm lint` passes
- `pnpm build` passes
- `code-reviewer` returns PASS

## Open Questions

- Are there any Tools pages with intentionally different headers?
- Is there a design system color token that should be used?
- Should this color be added to the design system for future consistency?
