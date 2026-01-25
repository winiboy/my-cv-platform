PRD: Resume Card 3-Way Linking Parity Fix
Introduction

In the dashboard, entity cards (Resume, Cover Letter, Job Application) provide cross-navigation between related objects.

Currently:

Cover Letter cards correctly link to both Resume and Job Application.

Job Application cards correctly link to both Resume and Cover Letter.

Resume cards only link to the Cover Letter and do NOT link to the associated Job Application, even when that association exists indirectly.

This creates an asymmetry in navigation and breaks the expectation that relationships between Resume, Cover Letter, and Job Application are fully bidirectional and transitive.

This PRD defines the work required to achieve full 3-way automatic linking parity, so that any relationship visible from one card is also visible from the two others.

Goals

Ensure Resume cards link to both:

the associated Cover Letter

the associated Job Application

Preserve all existing correct linking behavior (no regressions)

Enforce automatic 3-directional bonding between Resume, Cover Letter, and Job Application

Maintain consistent navigation behavior across all card types

Support all 4 locales (fr, de, en, it)

User Stories
US-001: Display Job Application link on Resume card

Description:
As a user, I want to see a link to the associated Job Application on my Resume card so I can navigate the full application context from the Resume.

Acceptance Criteria:

 Resume card displays Job Application link (icon + text)

 Link style matches existing links on Cover Letter and Job Application cards

 Link navigates to /[locale]/dashboard/job-applications/[id]

 Link appears when a Job Application is associated directly or indirectly

 Typecheck passes (pnpm tsc --noEmit)

 Lint passes (pnpm lint)

 Verify in browser: Resume card shows Job Application link when association exists

US-002: Preserve existing Cover Letter link on Resume card

Description:
As a user, I want the existing Cover Letter link on the Resume card to continue working exactly as before.

Acceptance Criteria:

 Cover Letter link remains visible when associated

 Cover Letter link navigates correctly

 No visual or functional regression

 Typecheck passes

 Lint passes

 Verify in browser: Cover Letter link behaves unchanged

US-003: Enforce automatic 3-way linking consistency

Description:
As a system, I want relationships between Resume, Cover Letter, and Job Application to be transitive and consistently visible across all cards.

Acceptance Criteria:

 If Resume ↔ Cover Letter exists AND Cover Letter ↔ Job Application exists, then Resume ↔ Job Application MUST be visible

 Resume card reflects all existing associations without manual user action

 No duplicate links are rendered

 Logic is deterministic and centralized

 Typecheck passes

 Lint passes

US-004: Verify linking parity across all locales

Description:
As a user in any supported locale, I want Resume card links to work correctly regardless of language.

Acceptance Criteria:

 Links work in /fr/dashboard/

 Links work in /de/dashboard/

 Links work in /en/dashboard/

 Links work in /it/dashboard/

 Link labels are properly translated (if applicable)

 Verify in browser: navigation works in all locales

Functional Requirements

FR-1: Resume card MUST display associated Cover Letter link (existing behavior)

FR-2: Resume card MUST display associated Job Application link when one exists

FR-3: Job Application link MUST navigate to /[locale]/dashboard/job-applications/[id]

FR-4: Linking MUST be transitive across Resume, Cover Letter, and Job Application

FR-5: Resume card MUST surface indirect associations automatically

FR-6: No duplicate links MUST be rendered

FR-7: Existing Cover Letter and Job Application card behavior MUST remain unchanged

FR-8: All links MUST work in all supported locales (fr, de, en, it)

Non-Goals (Out of Scope)

Visual redesign of cards

Database schema changes

Backend API changes

Creation of new associations

Permissions or access control changes

AI logic changes

Performance optimizations unrelated to linking logic

Design Considerations

Match existing icon + text link pattern used on other cards

Respect existing card layout, spacing, and hierarchy

Reuse existing link components where possible

Avoid adding new UI elements unless strictly necessary

Technical Considerations

Resume card component likely located in src/components/dashboard/

Association data should already be available from existing queries

No additional API calls should be required

Linking logic should be centralized (not card-specific ad-hoc logic)

Use existing locale-aware routing utilities

Success Metrics

Resume cards consistently display both Cover Letter and Job Application links when associations exist

No regressions on Cover Letter or Job Application cards

Navigation parity across all three entity types

Behavior verified in all locales

code-reviewer agent returns PASS

Open Questions

None — requirements are fully specified.

Risks

Edge cases where association data is incomplete or partially loaded

Potential duplication if transitive logic is applied multiple times

Risk of divergence if cards compute associations independently

Rollback Plan

New logic is additive and guarded by association checks

Rollback by removing Job Application link rendering from Resume card

Existing Cover Letter and Job Application card logic remains untouched