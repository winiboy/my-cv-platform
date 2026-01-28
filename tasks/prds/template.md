# PRD: Resume Sidebar – Linked Job (Strict 1:1 Parity with Cover Letter)

## Introduction
On the **Resume editing page**, the sidebar contains a section labeled **"Linked Job"**.
A similar section already exists on the **Cover Letter editing page sidebar**, also labeled **"Linked Job"**, and is considered the **reference implementation**.

This PRD defines a **strict parity requirement**:

- The **Resume sidebar Linked Job section MUST match 100%** the **Cover Letter sidebar Linked Job section**.
- This includes **design, layout, behavior, states, actions, and interactions**.
- The Cover Letter Linked Job implementation is the **single source of truth**.
- Any deviation, omission, or approximation is considered a **FAIL**.

No other part of the Resume page is in scope.

---

## Goals
- Achieve **absolute 1:1 parity** between Resume and Cover Letter Linked Job sidebar sections
- Ensure Resume sidebar Linked Job is **visually indistinguishable** from Cover Letter Linked Job
- Ensure Resume sidebar Linked Job **behaves identically** in all states
- Guarantee zero impact outside the Resume sidebar Linked Job section
- Maintain full locale consistency (fr, de, en, it)

---

## User Stories

### US-001: Resume sidebar Linked Job must match Cover Letter Linked Job visually
**Description:**  
As a user, when editing a Resume, I want the Linked Job section in the sidebar to look **exactly the same** as the Linked Job section in the Cover Letter sidebar, so there is no visual distinction between the two.

**Acceptance Criteria:**
- [ ] Same spacing, typography, colors, and layout
- [ ] Same icons and icon placement
- [ ] Same section structure and hierarchy
- [ ] Same empty state layout
- [ ] Same linked-job state layout
- [ ] No Resume-specific styling differences
- [ ] Verify in browser: side-by-side comparison shows no visual differences

---

### US-002: Resume sidebar Linked Job must match Cover Letter Linked Job behavior
**Description:**  
As a user, I want the Linked Job section in the Resume sidebar to behave **exactly like** the Linked Job section in the Cover Letter sidebar, so the interaction model is consistent.

**Acceptance Criteria:**
- [ ] Same empty state behavior
- [ ] Same add / link / manage actions
- [ ] Same unlink or replace behavior (if applicable)
- [ ] Same loading and disabled states
- [ ] Same error handling and messages
- [ ] Same navigation and CTA behavior
- [ ] No Resume-specific logic or shortcuts
- [ ] Verify in browser: interactions are indistinguishable

---

### US-003: Resume page scope must remain strictly unchanged
**Description:**  
As a user, I want the Resume page to behave exactly as before, except for the Linked Job sidebar section, so no unrelated behavior is affected.

**Acceptance Criteria:**
- [ ] Resume editor logic is unchanged
- [ ] Resume layout outside the sidebar is unchanged
- [ ] Resume preview and export logic are untouched
- [ ] Resume navigation and dashboard behavior are unchanged
- [ ] Only the Linked Job sidebar section is modified

---

### US-004: Locale parity with Cover Letter Linked Job
**Description:**  
As a multilingual user, I want the Resume sidebar Linked Job section to use the **exact same translations** as the Cover Letter sidebar Linked Job section.

**Acceptance Criteria:**
- [ ] `/en` terminology matches Cover Letter exactly
- [ ] `/fr` terminology matches Cover Letter exactly
- [ ] `/de` terminology matches Cover Letter exactly
- [ ] `/it` terminology matches Cover Letter exactly
- [ ] No new translation wording is introduced
- [ ] Verify in browser across all locales

---

## Functional Requirements
- FR-1: ONLY the Resume page **Linked Job sidebar section** is in scope
- FR-2: Cover Letter Linked Job sidebar is the **reference implementation**
- FR-3: Resume Linked Job sidebar MUST be **1:1 identical** to Cover Letter Linked Job
- FR-4: Any visual or behavioral deviation is a **FAIL**
- FR-5: Existing Resume ↔ Job data associations MUST remain unchanged
- FR-6: Locale handling MUST reuse Cover Letter Linked Job translations exactly

---

## Non-Goals (Out of Scope)
- Resume editor logic changes
- Resume layout changes outside the sidebar
- Backend schema or database changes
- Job / Resume / Cover Letter data model changes
- Dashboard cards or navigation changes
- AI, export, or preview logic changes
- Any redesign or UX improvement beyond parity

---

## Design Considerations
- No redesign: **strict parity only**
- Cover Letter Linked Job UI is authoritative
- Resume sidebar must reuse or mirror the same component
- Pixel-level consistency is required

---

## Technical Considerations
- Prefer direct reuse of the Cover Letter Linked Job component
- If reuse is impossible, implementation must be functionally and visually identical
- No new API calls
- No conditional Resume-specific logic
- No hardcoded strings; reuse existing i18n keys

---

## Success Metrics
- Resume sidebar Linked Job is visually indistinguishable from Cover Letter Linked Job
- Resume sidebar Linked Job behavior is indistinguishable from Cover Letter Linked Job
- No Resume page regressions
- All locales verified
- `code-reviewer` agent returns **PASS**

---

## Risks
- Partial parity (visual but not behavioral, or vice versa)
- Hidden Resume-specific conditionals
- Subtle spacing or state differences
- Translation drift

---

## Rollback Plan
- Change is isolated to the Resume sidebar Linked Job section
- Rollback by restoring previous Resume sidebar implementation
- No data rollback required

---

## Open Questions
- **Data Linking Mechanism:** Confirm that Resume ↔ Job linkage uses the same mechanism as Cover Letter ↔ Job, or define the minimal adapter required for parity.

---

## Clarifications (Confirmed)
- Cover Letter Linked Job sidebar is the **single source of truth**
- Parity is required at **design, behavior, and interaction** levels
- Any deviation from Cover Letter behavior is unacceptable
- PRD scope is final and approved
