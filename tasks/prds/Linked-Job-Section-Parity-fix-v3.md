# PRD: Full 3-Way Automatic Linking Parity (Resume · Cover Letter · Job Application)

## Introduction

The platform exposes **three core entities**:
- Resume
- Cover Letter
- Job Application

Each entity currently contains sidebar sections that reference the others, but the **design, behavior, and automatic linking logic are not fully consistent** across pages.

The following sidebar sections are in scope:

1. **Resume page**
   - "Linked Job" section
   - "Cover Letters" section

2. **Cover Letter page**
   - "Linked Job" section
   - "Linked CV" section

3. **Job Application page**
   - "Cover Letters" section
   - "Linked CV" section

This PRD defines a **strict parity and automatic linking requirement**:

- All six sections MUST behave as a **single coherent 3-way linking system**
- Linking or unlinking any entity MUST propagate correctly to the other two
- Design, layout, states, and interactions MUST be consistent across pages
- The **Cover Letter sidebar implementations** are the **reference source of truth**
- Any deviation, partial implementation, or manual-only linking is considered a **FAIL**

---

## Goals

- Achieve **full automatic 3-way linking parity** between Resume, Cover Letter, and Job Application
- Extract Cover Letter components into **shared reusable components**
- Create a **centralized `useEntityLinking` hook** for all 3-way linking logic
- Implement **auto-repair for inconsistent legacy links** on page load
- Ensure all related sidebar sections are **visually and behaviorally consistent**
- Maintain full locale consistency (fr, de, en, it)

---

## User Stories

### US-001: Create shared useEntityLinking hook
**Description:**
As a developer, I need a centralized hook that manages all 3-way linking operations so that linking logic is consistent and reusable across all pages.

**Acceptance Criteria:**
- [ ] Create `src/hooks/useEntityLinking.ts`
- [ ] Hook accepts entity type and ID as parameters
- [ ] Hook provides functions: `linkJob`, `unlinkJob`, `linkResume`, `unlinkResume`, `linkCoverLetter`, `unlinkCoverLetter`
- [ ] All linking functions propagate changes to related entities (3-way)
- [ ] Hook returns loading and error states
- [ ] Typecheck passes (`pnpm tsc --noEmit`)
- [ ] Lint passes (`pnpm lint`)

---

### US-002: Add auto-repair logic for inconsistent links
**Description:**
As a developer, I need the linking hook to detect and auto-repair inconsistent legacy links on page load so that users always see a consistent state.

**Acceptance Criteria:**
- [ ] Hook detects orphaned or one-way links on mount
- [ ] Hook automatically repairs links to ensure 3-way consistency
- [ ] Repair happens silently without user intervention
- [ ] Repair is logged to console in development mode
- [ ] No data loss occurs during repair
- [ ] Typecheck passes
- [ ] Lint passes

---

### US-003: Extract LinkedJobSection as shared component
**Description:**
As a developer, I need to extract the Cover Letter's Linked Job section into a shared component so it can be reused on the Resume page.

**Acceptance Criteria:**
- [ ] Create `src/components/dashboard/shared/LinkedJobSection.tsx`
- [ ] Component accepts `entityType` ('resume' | 'coverLetter') and `entityId` props
- [ ] Component uses `useEntityLinking` hook internally
- [ ] Component matches Cover Letter's Linked Job section exactly (layout, spacing, icons)
- [ ] Component handles empty, linked, loading, and error states
- [ ] Typecheck passes
- [ ] Lint passes

---

### US-004: Extract LinkedCVSection as shared component
**Description:**
As a developer, I need to extract the Cover Letter's Linked CV section into a shared component so it can be reused on the Job Application page.

**Acceptance Criteria:**
- [ ] Create `src/components/dashboard/shared/LinkedCVSection.tsx`
- [ ] Component accepts `entityType` ('coverLetter' | 'jobApplication') and `entityId` props
- [ ] Component uses `useEntityLinking` hook internally
- [ ] Component matches Cover Letter's Linked CV section exactly
- [ ] Component handles empty, linked, loading, and error states
- [ ] Typecheck passes
- [ ] Lint passes

---

### US-005: Extract CoverLettersSection as shared component
**Description:**
As a developer, I need to extract the Cover Letters listing section into a shared component so it can be reused on Resume and Job Application pages.

**Acceptance Criteria:**
- [ ] Create `src/components/dashboard/shared/CoverLettersSection.tsx`
- [ ] Component accepts `entityType` ('resume' | 'jobApplication') and `entityId` props
- [ ] Component uses `useEntityLinking` hook internally
- [ ] Component handles list rendering and empty state
- [ ] Component provides add/link/navigate actions
- [ ] Typecheck passes
- [ ] Lint passes

---

### US-006: Integrate shared LinkedJobSection on Resume page
**Description:**
As a user editing a Resume, I want the Linked Job sidebar section to behave and look exactly like the Linked Job section on the Cover Letter page.

**Acceptance Criteria:**
- [ ] Replace Resume's existing Linked Job section with shared `LinkedJobSection`
- [ ] Pass correct `entityType='resume'` and `entityId` props
- [ ] Verify layout matches Cover Letter page exactly
- [ ] Verify linking/unlinking propagates to Cover Letters and Job Applications
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser: side-by-side comparison shows no differences

---

### US-007: Integrate shared CoverLettersSection on Resume page
**Description:**
As a user editing a Resume, I want the Cover Letters sidebar section to behave exactly like corresponding sections on other pages.

**Acceptance Criteria:**
- [ ] Replace Resume's existing Cover Letters section with shared `CoverLettersSection`
- [ ] Pass correct `entityType='resume'` and `entityId` props
- [ ] Verify list rendering matches Cover Letter page
- [ ] Verify add/link actions work correctly
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser: functionality matches Cover Letter page

---

### US-008: Integrate shared LinkedCVSection on Job Application page
**Description:**
As a user editing a Job Application, I want the Linked CV sidebar section to behave exactly like the Linked CV section on the Cover Letter page.

**Acceptance Criteria:**
- [ ] Replace Job Application's existing Linked CV section with shared `LinkedCVSection`
- [ ] Pass correct `entityType='jobApplication'` and `entityId` props
- [ ] Verify layout matches Cover Letter page exactly
- [ ] Verify linking/unlinking propagates correctly
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser: side-by-side comparison shows no differences

---

### US-009: Integrate shared CoverLettersSection on Job Application page
**Description:**
As a user editing a Job Application, I want the Cover Letters sidebar section to behave identically to corresponding sections on other pages.

**Acceptance Criteria:**
- [ ] Replace Job Application's existing Cover Letters section with shared `CoverLettersSection`
- [ ] Pass correct `entityType='jobApplication'` and `entityId` props
- [ ] Verify list rendering and actions match other pages
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser: functionality is identical to other pages

---

### US-010: Update Cover Letter page to use shared components
**Description:**
As a developer, I need to update the Cover Letter page to use the same shared components to ensure a single source of truth.

**Acceptance Criteria:**
- [ ] Replace Cover Letter's Linked Job section with shared `LinkedJobSection`
- [ ] Replace Cover Letter's Linked CV section with shared `LinkedCVSection`
- [ ] No visual or behavioral regression
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser: no changes from current behavior

---

### US-011: Verify 3-way automatic linking from Resume entry point
**Description:**
As a user, when I link a Job from the Resume page, I want all related Cover Letters and the Job Application to update automatically.

**Acceptance Criteria:**
- [ ] Link a Job from Resume page
- [ ] Navigate to linked Cover Letter → Job is shown as linked
- [ ] Navigate to Job Application → Resume is shown as linked
- [ ] Unlink Job from Resume → propagates to all related entities
- [ ] No stale or orphaned links remain
- [ ] Verify in browser: complete flow works from Resume entry

---

### US-012: Verify 3-way automatic linking from Cover Letter entry point
**Description:**
As a user, when I link entities from the Cover Letter page, I want all related Resumes and Job Applications to update automatically.

**Acceptance Criteria:**
- [ ] Link a Job from Cover Letter page → Resume updates
- [ ] Link a Resume from Cover Letter page → Job Application updates
- [ ] Unlink operations propagate correctly
- [ ] Verify in browser: complete flow works from Cover Letter entry

---

### US-013: Verify 3-way automatic linking from Job Application entry point
**Description:**
As a user, when I link entities from the Job Application page, I want all related Resumes and Cover Letters to update automatically.

**Acceptance Criteria:**
- [ ] Link a Resume from Job Application page → Cover Letters update
- [ ] Link a Cover Letter from Job Application page → Resume updates
- [ ] Unlink operations propagate correctly
- [ ] Verify in browser: complete flow works from Job Application entry

---

### US-014: Locale parity for all shared components
**Description:**
As a multilingual user, I want all linking sections to use consistent terminology across all pages and locales.

**Acceptance Criteria:**
- [ ] Audit i18n keys used in shared components
- [ ] Ensure `/en`, `/fr`, `/de`, `/it` labels are consistent
- [ ] Remove any page-specific wording variations
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser: all 4 locales display correct labels

---

## Functional Requirements

- FR-1: All six sidebar sections listed in the Introduction are in scope
- FR-2: Cover Letter sidebar implementations are the **single source of truth**
- FR-3: Shared components must be extracted to `src/components/dashboard/shared/`
- FR-4: A centralized `useEntityLinking` hook must handle all linking operations
- FR-5: Linking is **automatic, bidirectional, and transitive** across all entities
- FR-6: Inconsistent legacy links must be **auto-repaired on page load**
- FR-7: Any visual or behavioral deviation is a **FAIL**
- FR-8: No backend schema changes or data migration
- FR-9: Existing data must remain valid and intact
- FR-10: Locale handling must be consistent and reused

---

## Non-Goals (Out of Scope)

- Resume editor content changes
- Cover Letter editor content changes
- Job Application editor logic unrelated to linking
- Dashboard cards or navigation changes
- AI logic or export logic changes
- Backend schema redesign
- Manual data repair tools (auto-repair only)

---

## Design Considerations

- No redesign: **strict parity only**
- Components must be extracted and reused
- Pixel-level consistency is required
- Empty and linked states must match exactly
- All shared components in `src/components/dashboard/shared/`

---

## Technical Considerations

- Create `src/hooks/useEntityLinking.ts` for centralized linking logic
- Shared components: `LinkedJobSection`, `LinkedCVSection`, `CoverLettersSection`
- Avoid page-specific conditionals in shared components
- No new API endpoints unless strictly required
- No hardcoded strings; reuse existing i18n keys
- Auto-repair logic runs on component mount

---

## Success Metrics

- All six sidebar sections use shared components
- Automatic 3-way linking works from any entry point
- Auto-repair corrects inconsistent links silently
- No stale or inconsistent links observed
- All locales verified
- `pnpm lint` and `pnpm build` pass
- `code-reviewer` agent returns **PASS**

---

## Risks

- Partial propagation (2-way instead of 3-way)
- UI parity without logic parity
- Auto-repair causing unintended data changes
- Regression in existing links

---

## Rollback Plan

- Changes are isolated to sidebar linking logic
- Rollback by restoring previous components
- Shared components can be removed and originals restored
- No data rollback required (auto-repair is additive)

---

## Open Questions

- None remaining (all clarified)

---

## Implementation Order

1. **US-001** — Create shared `useEntityLinking` hook
2. **US-002** — Add auto-repair logic for inconsistent links
3. **US-003** — Extract `LinkedJobSection` as shared component
4. **US-004** — Extract `LinkedCVSection` as shared component
5. **US-005** — Extract `CoverLettersSection` as shared component
6. **US-010** — Update Cover Letter page to use shared components
7. **US-006** — Integrate shared `LinkedJobSection` on Resume page
8. **US-007** — Integrate shared `CoverLettersSection` on Resume page
9. **US-008** — Integrate shared `LinkedCVSection` on Job Application page
10. **US-009** — Integrate shared `CoverLettersSection` on Job Application page
11. **US-011** — Verify 3-way linking from Resume entry point
12. **US-012** — Verify 3-way linking from Cover Letter entry point
13. **US-013** — Verify 3-way linking from Job Application entry point
14. **US-014** — Locale parity for all shared components

---

## Clarifications (Confirmed)

- Cover Letter page is the reference implementation
- Extract shared components and reuse them (not copy/adapt)
- Create centralized `useEntityLinking` hook for all linking logic
- Each story is verifiable in isolation with browser check
- Auto-repair inconsistent links on page load
- Automatic 3-way linking is mandatory
- Manual-only linking is unacceptable
