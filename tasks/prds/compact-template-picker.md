# PRD: Compact template picker cards

**Status:** APPROVED 2026-10-08

## Objective

The shared template picker becomes about three times shorter. Each card puts a
small live thumbnail beside the template's name and description, so that all
five templates and the submit button fit in far less scrolling on
`/dashboard/resumes/new` and in the "Create CV from Job" modal.

## Context / Current Behavior

- **Picker layout.** `src/components/dashboard/template-picker.tsx` (shipped in
  #92) is a `grid grid-cols-1 md:grid-cols-2 gap-4` radiogroup (`:202-207`).
  Each card (`:215-255`) stacks a header row (icon tile, name, description) above
  a full-width A4 thumbnail window (`:128-136`, `aspect-ratio: 210/297`).
  - The window's width alone sets the thumbnail size: a ResizeObserver computes
    `scale = width / 794` (`:112-125`).
  - At 375 px, a card is about 533 px tall and the picker about 2,800 px.
  - In the modal at 1440 px, the cards add about 1,650 px.
  - This is recorded as open in
    `tasks/ralph/archive/2026-10-06-job-cv-template-picker/progress.txt`.
- **Containers.**
  - Create page: `max-w-3xl` (`dashboard/resumes/new/page.tsx`).
  - Modal: `max-w-4xl max-h-[90vh]`, with a scrolling body
    (`cv-adaptation-modal.tsx:273, 291`).
- **Contract carried over from `tasks/prds/job-cv-template-picker.md`:**
  - one picker, with the order modern, classic, minimal, creative, professional;
  - thumbnails only from `ResumePreview` with the fixed sample, in A4 proportion;
  - inert and `aria-hidden` thumbnails;
  - radio semantics and keyboard support;
  - teal/slate styling;
  - no overflow at 375 px.
- **Tests that constrain layout.**
  - `e2e/template-picker.spec.ts:198-222`: no overflow; each option and
    thumbnail in view after scrolling; ratio 297:210 within 0.01.
  - `e2e/job-cv-template-picker.spec.ts:386-418`: every option inside the modal
    body.
  - No test asserts card size or column count.
- **Owner decision, 2026-10-06:** compact cards with a small thumbnail beside the
  text.

## Scope

- Card layout: the thumbnail beside the text instead of below it. The thumbnail
  window gets a fixed width between 96 and 128 px at every breakpoint and keeps
  the A4 proportion.
- The grid stays one column below `md` and two columns from `md`.
- Both surfaces get the change automatically, through the shared component.
- New e2e assertions on card and picker height.

## Out of Scope

- What a thumbnail renders: still `ResumePreview` with the sample. No static
  images.
- Option order, defaults, labels, translations, radio semantics and keyboard
  behaviour.
- A thumbnail enlargement or hover preview.
- The modal's other fields and its overall width.

## Impact Assessment

- **Frontend / UI:** Affected. `template-picker.tsx` card layout.
- **Internationalization:** Not affected. Same strings, but long descriptions
  (de, fr) must wrap without overflow.
- **Resume model / templates:** Not affected.
- **Exports:** Not affected.
- **Database / persistence:** Not affected.
- **Security / authorization:** Not affected.
- **Testing / validation:** Affected. Height assertions and `ui-expert` on both
  surfaces.

## User Stories

### US-001: Compare all five templates without long scrolling

**Description:**
As a user creating a CV, I want compact template cards, so that I can see and
compare the templates and reach the create button quickly.

**Acceptance Criteria:**

- [ ] Each card shows its thumbnail beside the name and description (thumbnail
      on the leading side). The thumbnail window is 96–128 px wide, has a
      297:210 ratio within 0.01, is still drawn by `ResumePreview`, and is
      `inert` and `aria-hidden`.
- [ ] At 375×812 and at 1440×900, every card is at most 200 px tall, in fr, en,
      de and it.
- [ ] On `/fr/dashboard/resumes/new` at 375 px, the radiogroup is at most
      1,100 px tall. In the "Create CV from Job" modal at 1440×900, the
      radiogroup is at most 650 px tall.
- [ ] No horizontal overflow at 375 px on either surface. Every option is fully
      visible by scrolling (page, or modal body).
- [ ] Selection style (teal border, background and icon tile), focus ring,
      keyboard behaviour, order and defaults are unchanged. The existing e2e and
      unit assertions pass unmodified.
- [ ] Each thumbnail still shows its own template recognisably. `ui-expert`
      confirms that the five layouts can be told apart at the new size.

## Functional Requirements

- **FR-1:** Only `template-picker.tsx` changes in `src/`. Its callers and props
  are unchanged.
- **FR-2:** The scale is still derived from the measured window width. No new
  rendering path.
- **FR-3:** Only existing Tailwind tokens. No new colour or font.

## Regression Constraints

- All assertions in `e2e/template-picker.spec.ts`, `e2e/job-cv-template-picker.spec.ts`
  and `template-picker.test.ts` pass without edits.
- `pnpm test:visual` and `pnpm test:parity` results are unchanged. Parity is
  compared against `main`'s failing-name set if the parity PRD has not landed
  yet.

## Required Verification

- The `CLAUDE.md` §14 baseline.
- An e2e measuring card heights and radiogroup height on both surfaces at 375
  and 1440 px, in fr and de (longest descriptions).
- `ui-expert` with captures of both surfaces at 375, 768 and 1440 px.
- `code-reviewer`.

## FAIL Conditions

- Any card over 200 px tall, or a radiogroup over the ceilings above.
- A thumbnail not drawn by `ResumePreview`, or not inert.
- Horizontal overflow, or clipped text in any locale.
- An existing assertion edited to pass.

## BLOCKER Conditions

- At 96–128 px, the five thumbnails cannot be told apart (`ui-expert` FAIL on
  recognisability). The width range or the approach needs an owner decision.

## Risks

- At a scale of about 0.15, thumbnail text is unreadable. Recognition relies on
  the layout (sidebar, header band, columns). This is accepted by the owner's
  choice.

## Evidence / References

- `src/components/dashboard/template-picker.tsx:112-144, 202-255`.
- `src/components/dashboard/cv-adaptation-modal.tsx:267-291, 363-377`.
- `src/app/[locale]/(dashboard)/dashboard/resumes/new/page.tsx`.
- `e2e/template-picker.spec.ts:198-222`, `e2e/job-cv-template-picker.spec.ts:386-470`.
- `tasks/prds/job-cv-template-picker.md`: the contract carried over.
- Owner decision, 2026-10-06: "Cartes compactes".

## Open Questions

- None.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to
`prd.json` or implementation.
