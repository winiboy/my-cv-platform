# PRD: Resume Sidebar – Job Application → Linked Job (Scoped Parity Fix)

## Introduction

On the **Resume editing page**, the sidebar contains a section currently labeled **"Job Application"**. This section is conceptually equivalent to the **"Linked Job"** section found on the **Cover Letter editing page sidebar**, but the naming and implementation differ.

The initial PRD caused a misinterpretation where the scope appeared to affect the **entire Resume page feature set**, which is **NOT** the intent.

This PRD explicitly defines a **strictly scoped fix**:
- **ONLY** the sidebar section named **"Job Application"** on the **Resume page** is in scope.
- The change consists of **copying the existing "Linked Job" sidebar feature from the Cover Letter page** and **pasting/adapting it** into the Resume page sidebar.
- The rest of the Resume page (editor, layout, logic, features) **MUST remain untouched**.

---

## Goals

- Rename the **sidebar section title** from **"Job Application"** to **"Linked Job"** on the Resume page
- Replace the Resume sidebar Job Application implementation with the **exact same feature** used in the Cover Letter sidebar Linked Job section
- Ensure **no changes** are made to the Resume page feature set outside of this sidebar section
- Maintain full locale support (fr, de, en, it)
- Avoid any behavioral or visual regressions

---

## User Stories

### US-001: Rename Resume sidebar "Job Application" section to "Linked Job"
**Description:**  
As a user editing a Resume, I want the sidebar section currently labeled "Job Application" to be renamed to **"Linked Job"**, so it uses consistent terminology across the platform.

**Acceptance Criteria:**
- [ ] Resume page sidebar displays section title **"Linked Job"**
- [ ] The label "Job Application" is no longer visible in the Resume sidebar
- [ ] Change is limited to the Resume sidebar section only
- [ ] Translation keys exist for fr, de, en, it
- [ ] Typecheck passes (`pnpm tsc --noEmit`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Verify in browser: only the sidebar label is renamed

---

### US-002: Copy Cover Letter sidebar Linked Job feature into Resume sidebar
**Description:**  
As a user, I want the Resume sidebar Linked Job section to behave **exactly like** the Linked Job section in the Cover Letter sidebar, so the interaction model is identical.

**Acceptance Criteria:**
- [ ] Resume sidebar Linked Job uses the same component behavior as Cover Letter sidebar Linked Job
- [ ] Same empty state behavior when no job is linked
- [ ] Same actions (add, link, manage, unlink if applicable)
- [ ] Same icons, labels, and CTA placement
- [ ] Implementation is a direct reuse or copy of the Cover Letter sidebar Linked Job feature
- [ ] No additional features are introduced
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser: Resume sidebar Linked Job is indistinguishable from Cover Letter sidebar Linked Job

---

### US-003: Ensure Resume page feature scope is unchanged
**Description:**  
As a user, I want the Resume page to behave exactly as before, except for the renamed and updated sidebar section, so no unrelated behavior is affected.

**Acceptance Criteria:**
- [ ] Resume editor behavior is unchanged
- [ ] Resume layout outside the sidebar is unchanged
- [ ] No logic related to Resume content editing is modified
- [ ] No navigation, export, or preview logic is affected
- [ ] Only the sidebar Job Application section is modified

---

### US-004: Locale consistency for Resume sidebar Linked Job
**Description:**  
As a multilingual user, I want the Resume sidebar Linked Job section to be correctly translated in all supported locales.

**Acceptance Criteria:**
- [ ] Correct label in `/fr` locale
- [ ] Correct label in `/de` locale
- [ ] Correct label in `/en` locale
- [ ] Correct label in `/it` locale
- [ ] Terminology matches Cover Letter sidebar translations exactly
- [ ] Verify in browser: Resume sidebar displays correct wording in all locales

---

## Functional Requirements

- FR-1: ONLY the Resume page **sidebar section** labeled "Job Application" is in scope
- FR-2: That section MUST be renamed to **"Linked Job"**
- FR-3: The Resume sidebar Linked Job feature MUST be copied from the Cover Letter sidebar Linked Job feature
- FR-4: No other part of the Resume page MUST be modified
- FR-5: Existing Resume ↔ Job associations MUST remain unchanged
- FR-6: Locale handling MUST match Cover Letter sidebar behavior exactly

---

## Non-Goals (Out of Scope)

- Any change to the Resume page editor logic
- Any change to Resume page layout outside the sidebar
- Renaming backend entities or database tables
- Changing Job Application data model
- Modifying Cover Letter page behavior
- Dashboard cards or navigation changes
- AI logic or export logic changes

---

## Design Considerations

- Sidebar-only change
- Reuse the Cover Letter sidebar Linked Job component as-is where possible
- No visual redesign beyond strict parity
- Ensure spacing, icons, and typography are identical to Cover Letter sidebar

---

## Technical Considerations

- Resume sidebar component should reuse or mirror the Cover Letter sidebar Linked Job component
- No new API calls
- No schema or backend changes
- No hardcoded strings; use existing i18n keys
- Avoid duplicating logic if a shared component already exists

---

## Success Metrics

- Resume sidebar displays **"Linked Job"** instead of "Job Application"
- Resume sidebar Linked Job behavior matches Cover Letter sidebar **1:1**
- Resume page behavior outside the sidebar is unchanged
- All locales verified
- `code-reviewer` agent returns **PASS**

---

## Risks

- Accidental scope creep affecting the Resume editor
- Partial reuse instead of full parity
- Missing translation keys

---

## Rollback Plan

- Change is isolated to one sidebar section
- Rollback by restoring previous Resume sidebar component
- No data rollback required

---

## Open Questions

- **Database Association:** How are jobs currently linked to Resumes vs Cover Letters? Needs exploration during Phase 1 to determine if the same mechanism is used or if adaptation is required.

---

## Clarifications (Confirmed)

- Reusable "Linked Job" component exists on Cover Letter sidebar → proceed with direct reuse
- Empty state behavior must be **1:1 identical** to Cover Letter sidebar
- PRD scope is complete and approved for implementation
