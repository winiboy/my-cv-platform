# PRD: Resume Card Linking Parity Fix

## Introduction

In the dashboard, entity cards (Resume, Cover Letter, Job Application) provide cross-navigation between related objects. Currently, Cover Letter and Job Application cards correctly link to all their associated entities, but the Resume card only links to its Cover Letter — it does NOT link to its associated Job Application.

This creates an inconsistency in navigation and breaks user expectations. This PRD defines the work to achieve full bidirectional linking parity so the Resume card links to BOTH the Cover Letter AND the Job Application.

## Goals

- Add Job Application link to Resume card, matching the style of other card links
- Provide "Add Job" action when no Job Application is associated
- Maintain existing Cover Letter link behavior (no regression)
- Ensure navigation consistency across all three card types
- Support all 4 locales (fr, de, en, it)

## User Stories

### US-001: Display Job Application link on Resume card
**Description:** As a user, I want to see a link to the associated Job Application on my Resume card so I can quickly navigate to it.

**Acceptance Criteria:**
- [ ] Resume card displays Job Application link with icon + text label
- [ ] Link style matches Cover Letter and Job Application cards' link style
- [ ] Link navigates to `/[locale]/dashboard/job-applications/[id]`
- [ ] Link only appears when a Job Application is associated
- [ ] Typecheck passes (`pnpm tsc --noEmit`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Verify in browser: Resume card shows Job Application link when associated

### US-002: Show "Add Job" action when no Job Application linked
**Description:** As a user, I want to see an "Add Job" button on my Resume card when no Job Application is linked, so I can easily create the association.

**Acceptance Criteria:**
- [ ] "Add Job" button appears when Resume has no associated Job Application
- [ ] Button opens the job association flow (existing UI pattern)
- [ ] Button uses consistent styling with other card actions
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser: Resume card without job shows "Add Job" action

### US-003: Preserve existing Cover Letter link behavior
**Description:** As a user, I want the existing Cover Letter link on Resume cards to continue working exactly as before.

**Acceptance Criteria:**
- [ ] Cover Letter link remains visible when Cover Letter is associated
- [ ] Cover Letter link navigates to correct destination
- [ ] No visual or functional regression
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser: Cover Letter link works as before

### US-004: Verify linking parity across all locales
**Description:** As a user in any locale, I want Resume card links to work correctly regardless of my language setting.

**Acceptance Criteria:**
- [ ] Links work in `/fr/dashboard/`
- [ ] Links work in `/de/dashboard/`
- [ ] Links work in `/en/dashboard/`
- [ ] Links work in `/it/dashboard/`
- [ ] Link text is properly translated (if applicable)
- [ ] Verify in browser: Test navigation in all 4 locales

## Functional Requirements

- FR-1: Resume card MUST display a link to the associated Job Application when one exists
- FR-2: Job Application link MUST use icon + text label format, matching other cards
- FR-3: Job Application link MUST navigate to `/[locale]/dashboard/job-applications/[id]`
- FR-4: Resume card MUST display "Add Job" action button when no Job Application is associated
- FR-5: "Add Job" button MUST trigger the existing job association flow
- FR-6: Existing Cover Letter link MUST remain unchanged
- FR-7: Link behavior MUST be symmetrical across Resume, Cover Letter, and Job Application cards
- FR-8: All links MUST work correctly in all 4 supported locales (fr, de, en, it)

## Non-Goals (Out of Scope)

- Visual redesign of cards beyond adding the link
- Database schema changes
- Backend API changes
- New data associations (only surfacing existing associations)
- Permissions or access control changes
- AI logic changes
- Performance optimizations unrelated to this feature

## Design Considerations

- Match existing icon + text link pattern used on Cover Letter and Job Application cards
- "Add Job" button should use existing button/action styling from other cards
- Respect existing card layout and spacing
- Reuse existing link components where possible

## Technical Considerations

- Resume card component location: `src/components/dashboard/` (likely `resume-card.tsx` or similar)
- Job Application association data should already be available from existing queries
- No additional API calls should be needed if association data is already fetched
- Use existing routing patterns for locale-aware navigation
- Reuse existing "Add" action patterns from other card types

## Success Metrics

- All Resume cards with associated Job Applications display working links
- All Resume cards without Job Applications display "Add Job" action
- Zero regressions to Cover Letter link functionality
- Navigation works correctly in all 4 locales
- Code-reviewer agent returns PASS

## Open Questions

- None — all clarifications received.

## Risks

- Incomplete data association between Resume and Job Application in edge cases
- Conditional rendering edge cases when entities are missing
- Translation strings may need to be added for "Add Job" text

## Rollback Plan

- Guard new link behind existing association checks
- New functionality is additive — can be reverted by removing the link component
- Existing Cover Letter link is preserved and unmodified
