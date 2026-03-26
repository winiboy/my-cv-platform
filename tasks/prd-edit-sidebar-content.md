# PRD: Fix Drag-and-Drop Section Reordering for Modern CV Template

## Introduction

The Modern CV template supports drag-and-drop reordering for both sidebar and main content sections in the editor. While the drag interaction visually works, the reordered state is **not propagated** to Live Preview, Preview (Aperçu), PDF export, or DOCX export. This is a blocking defect: users believe they have reordered sections, but the output never reflects their changes. This PRD defines the fix to make drag-and-drop reordering fully functional end-to-end, scoped exclusively to the Modern template.

## Goals

- Drag-and-drop reordering in the editor must update section order in Live Preview in real time
- Reordered sections must persist to Supabase immediately on drop
- Preview (Aperçu), PDF export, and DOCX export must all reflect the persisted order
- Fix must be scoped exclusively to the Modern template — no other templates affected
- No regressions to existing save, export, or rendering behavior

## User Stories

### US-001: Persist sidebar section order on drag-and-drop
**Description:** As a user editing a Modern CV, I want my sidebar section reordering to be saved to the database immediately when I drop a section, so that my changes are not lost.

**Acceptance Criteria:**
- [ ] When a user drags and drops a sidebar section to a new position, the new order is saved to Supabase immediately
- [ ] The order persists across page refreshes
- [ ] The order is stored in a way that the Modern template renderer can consume it
- [ ] No changes to other templates' data or behavior
- [ ] Typecheck/lint passes

### US-002: Persist main content section order on drag-and-drop
**Description:** As a user editing a Modern CV, I want my main content section reordering to be saved to the database immediately when I drop a section, so that my changes are not lost.

**Acceptance Criteria:**
- [ ] When a user drags and drops a main content section to a new position, the new order is saved to Supabase immediately
- [ ] The order persists across page refreshes
- [ ] The order is stored in a way that the Modern template renderer can consume it
- [ ] No changes to other templates' data or behavior
- [ ] Typecheck/lint passes

### US-003: Live Preview reflects sidebar reorder in real time
**Description:** As a user, I want the Live Preview to immediately reflect the new sidebar section order after I drag-and-drop, so I get instant visual feedback.

**Acceptance Criteria:**
- [ ] After dropping a sidebar section, the Live Preview updates within the same render cycle (no refresh needed)
- [ ] The order in Live Preview matches exactly what the user arranged
- [ ] Only the Modern template preview is affected
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-004: Live Preview reflects main content reorder in real time
**Description:** As a user, I want the Live Preview to immediately reflect the new main content section order after I drag-and-drop, so I get instant visual feedback.

**Acceptance Criteria:**
- [ ] After dropping a main content section, the Live Preview updates within the same render cycle (no refresh needed)
- [ ] The order in Live Preview matches exactly what the user arranged
- [ ] Only the Modern template preview is affected
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-005: Preview (Aperçu) reflects persisted section order
**Description:** As a user, I want the full-page Preview to show sections in the order I arranged them, so that what I see matches what I configured.

**Acceptance Criteria:**
- [ ] Opening Preview (Aperçu) after reordering sidebar sections shows the correct order
- [ ] Opening Preview (Aperçu) after reordering main content sections shows the correct order
- [ ] Only the Modern template preview is affected
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-006: PDF export reflects persisted section order
**Description:** As a user, I want my PDF export to reflect the section order I configured via drag-and-drop, so the exported document matches my intent.

**Acceptance Criteria:**
- [ ] PDF export of a Modern CV renders sidebar sections in the persisted order
- [ ] PDF export of a Modern CV renders main content sections in the persisted order
- [ ] No changes to PDF export for other templates
- [ ] Typecheck/lint passes

### US-007: DOCX export reflects persisted section order
**Description:** As a user, I want my DOCX export to reflect the section order I configured via drag-and-drop, so the exported document matches my intent.

**Acceptance Criteria:**
- [ ] DOCX export of a Modern CV renders sidebar sections in the persisted order
- [ ] DOCX export of a Modern CV renders main content sections in the persisted order
- [ ] No changes to DOCX export for other templates
- [ ] The existing `docx-modern.ts` generator consumes the order data correctly
- [ ] Typecheck/lint passes

## Functional Requirements

- FR-1: The resume data model must support storing section order for sidebar and main content regions (e.g., as ordered arrays in the JSONB `content` field)
- FR-2: When a user drops a section in a new position in the editor, the new order must be persisted to Supabase immediately (no explicit save action required)
- FR-3: The Modern template renderer (`resume-preview.tsx` / Modern template component) must read section order from the persisted data and render sections accordingly
- FR-4: Live Preview must re-render in real time when section order changes — no page refresh or debounce delay
- FR-5: Preview (Aperçu) must read the same persisted order and render sections in that order
- FR-6: PDF export must render Modern CV sections in the persisted order
- FR-7: DOCX export (`docx-modern.ts`) must render Modern CV sections in the persisted order
- FR-8: All other templates must be unaffected — they must not read, write, or depend on the new ordering data
- FR-9: If no custom order is stored (e.g., existing resumes created before this fix), the default section order must be used as fallback

## Non-Goals

- No changes to any template other than Modern
- No new drag-and-drop UI — the existing drag interaction already works visually
- No redesign of the editor layout or section management
- No changes to the export engines beyond consuming the ordering data
- No undo/redo for section reordering

## Design Considerations

- The editor already has drag-and-drop UI for sidebar and main content — this fix is about **wiring the state through** to preview and exports
- The Modern template has a 2-column layout (dark sidebar + main content) — section order applies independently to each column
- Reuse existing Supabase save mechanisms (likely the same auto-save or immediate-save pattern used for other fields)

## Technical Considerations

- Section order should be stored in the resume JSONB content field (e.g., `sidebarSectionOrder: string[]` and `mainSectionOrder: string[]`)
- The Modern template renderer must sort sections by the stored order before rendering
- `docx-modern.ts` must apply the same sorting logic when generating the document
- Backward compatibility: resumes without order data must render with the default order (no migration needed)
- Only the Modern template's rendering path should be modified — shared components must not change behavior for other templates

## Success Metrics

- Sidebar drag-and-drop reorder reflected in Live Preview, Aperçu, PDF, and DOCX
- Main content drag-and-drop reorder reflected in Live Preview, Aperçu, PDF, and DOCX
- Order persists across page refresh
- Zero regressions on other templates
- Zero regressions on existing save/export functionality

## Open Questions

- What is the current data model for section ordering? Is there an existing field being written but not read, or is the ordering never persisted at all?
- Are sidebar and main content sections identified by stable keys (e.g., "skills", "experience") that can be used in an order array?
- Does the editor's drag-and-drop already call a save/update function, or does it only update local React state?
