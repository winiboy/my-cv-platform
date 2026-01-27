# PRD: Global Header – Active Branch & Version Visibility

## Introduction

During development, debugging, review, and PR validation, it is critical to know **exactly which branch and version** is currently running.

This PRD defines the work required to display, on **every page of the application**, a clear and consistent indicator showing:

- The **active Git branch name**
- The **version associated with that branch** (as defined in `package.json`)

This information must be visible **at the top of each page**, across the entire application, without impacting existing features or layouts.

This PRD introduces a **global, read-only informational UI element** only.  
No business logic, data model, or page-specific behavior is in scope.

---

## Goals

- Display the **active Git branch name** at the top of every page
- Display the **version of the active branch** next to its name
- Ensure visibility is consistent across all pages and routes
- Maintain full locale compatibility (fr, de, en, it)
- Avoid any impact on existing UI behavior or layout logic

---

## User Stories

### US-001: Display active branch name globally
**Description:**  
As a developer or reviewer, I want to see the **currently active Git branch name** at the top of every page, so I can immediately identify the running context.

**Acceptance Criteria:**
- [ ] Active branch name is visible at the top of every page
- [ ] Branch name is read-only and cannot be modified from the UI
- [ ] Branch name is identical across all pages during a session
- [ ] Branch name updates correctly when switching branches and rebuilding
- [ ] Verify in browser: branch name is clearly visible on all pages

---

### US-002: Display active branch version globally
**Description:**  
As a developer or reviewer, I want to see the **version associated with the active branch** next to the branch name, so I can confirm exactly which build is running.

**Acceptance Criteria:**
- [ ] Version displayed matches `package.json` version
- [ ] Version is displayed next to the branch name
- [ ] Version format is consistent with existing versioning scheme (e.g. `v0.53.38`)
- [ ] Version updates correctly after version bump and rebuild
- [ ] Verify in browser: version matches the expected build

---

### US-003: Global visibility on all pages
**Description:**  
As a user navigating the application, I want the branch and version indicator to remain visible regardless of which page I am on.

**Acceptance Criteria:**
- [ ] Indicator is visible on:
  - Resume pages
  - Cover Letter pages
  - Job Application pages
  - Dashboard pages
  - Any other routed pages
- [ ] No page hides or overrides the indicator
- [ ] Indicator positioning is consistent across all pages

---

### US-004: Locale-safe rendering
**Description:**  
As a multilingual user, I want the branch/version indicator to work correctly regardless of the active locale.

**Acceptance Criteria:**
- [ ] Indicator renders correctly under `/en`
- [ ] Indicator renders correctly under `/fr`
- [ ] Indicator renders correctly under `/de`
- [ ] Indicator renders correctly under `/it`
- [ ] Branch name and version are not translated
- [ ] No locale-specific formatting issues occur

---

## Functional Requirements

- FR-1: The branch name and version MUST be visible at the top of every page
- FR-2: Display MUST include both branch name and version
- FR-3: Information MUST be read-only
- FR-4: Version MUST be sourced from `package.json`
- FR-5: Branch name MUST reflect the active build context
- FR-6: Rendering MUST be consistent across all locales

---

## Non-Goals (Out of Scope)

- Editing or switching branches from the UI
- Editing or bumping versions from the UI
- Any Resume, Cover Letter, or Job Application feature changes
- Backend schema or database changes
- API changes
- Authentication or authorization changes
- Styling redesign beyond minimal integration

---

## Design Considerations

- Minimal, non-intrusive UI element
- Must not interfere with existing page layouts
- Should be clearly readable but visually secondary
- Same placement and styling across all pages

---

## Technical Considerations

- Branch name and version should be injected at build time
- No runtime Git commands in the browser
- No additional API calls if avoidable
- Prefer a single shared layout or header component
- Avoid hardcoding values; rely on build-time configuration

---

## Success Metrics

- Active branch name is visible on every page
- Version number is visible and correct
- No UI regressions introduced
- No behavior changes outside this indicator
- Verified manually across multiple pages and locales
- `code-reviewer` agent returns **PASS**

---

## Risks

- Incorrect branch name due to build-time misconfiguration
- Version mismatch with deployed artifact
- Indicator accidentally hidden by page-specific layouts

---

## Rollback Plan

- Change is isolated to a global header / layout element
- Rollback by removing the indicator component
- No data or schema rollback required

---

## Open Questions

- Should the indicator be visible in production builds or dev-only?
- Should the indicator be toggleable via environment flag?

---

## Clarifications (Confirmed)

- Indicator is informational only
- No interaction or mutation is allowed
- Scope is global and cross-page
- PRD scope is final and approved
