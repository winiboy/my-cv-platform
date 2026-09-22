# PRD: Responsive Frame for the Resume Preview Page

**Status:** DRAFT

## Objective

The resume preview page (`/[locale]/dashboard/resumes/[id]/preview`) is usable at 375, 768, 1024 and 1280px: the header controls never overlap, the dashboard navigation never takes width from the page below 1024px, and the whole resume document is visible without cropping. The resume templates and the printed PDF stay exactly as they are today.

## Context / Current Behavior

A `ui-expert` diagnosis on a production build (`origin/main` a4942b4, widths 1280/1024/1023/768/375) returned FAIL. The frame files it measured are unchanged on `origin/main` cf4a363, the base of this PRD.

**Preview header** (`src/components/dashboard/resume-preview-page-client.tsx`)
- The Show Controls toggle wrapper is `absolute left-1/2 -translate-x-1/2` (`:43`) and has no positioned ancestor. It is centred on the viewport and takes no space in the header row. It overlaps the resume title at 1280 and 1024, covers the Back link at 768 (a hit test on Back returns the toggle), and is drawn over the dashboard sidebar at 375. It stays put when `<main>` scrolls, so it slides under the document.
- The header row is `flex items-center justify-between` (`:25`) with no wrapping, and the title (`:35`) is not truncated. A 51-character title wraps to five lines at 768.
- The download buttons sit in a `flex gap-2` (`src/components/dashboard/download-button.tsx:84`), and their labels wrap inside the buttons at 1024 and below.

**Dashboard layout** (`src/app/[locale]/(dashboard)/layout.tsx`, shared by every page under `(dashboard)`)
- The sidebar wrapper (`:34`) has no responsive variant. The 256px sidebar (`src/components/dashboard/sidebar.tsx:57`, `w-64`) shows at every width and takes 68% of a 375px screen.
- The content area is `h-[calc(100vh-64px)] overflow-hidden` (`:32`), but the site header measures 65–81px depending on width. The page therefore scrolls a few pixels and shows two vertical scrollbars.
- The `<aside>` has no `h-full`, so the sidebar's border and background stop partway down the column.
- The site header (`src/components/marketing/header.tsx`) already switches to a hamburger menu below `lg` (1024px) (`:73`, `:166`). Its menu lists only Dashboard, Tools and Pricing, not the dashboard's own links.
- No drawer or Sheet component exists in `src`, and `@radix-ui/react-dialog` is not a dependency.

**Document**
- Each template fixes the document width inline: 816px in professional and modern, `8.5in` (816px) in classic, minimal and creative. The document needs 816px plus the page padding. With the sidebar shown it needs 1135px, so it is cropped already at 1024 (102px lost), at 768 (358px) and at 375 (only 65px visible).

**Supported viewports.** No official list exists: `.claude/rules/frontend.md` names none, and every Playwright config runs desktop only. Earlier PRDs used 375/768/1024. This PRD adopts **375, 768, 1024 and 1280** as the verification widths for this surface (decision D6).

**Constraints already enforced elsewhere**
- `e2e/visual/resume-templates.spec.ts` captures `[data-testid=resume-document]` on this route at a 1280×2600 viewport. It takes a screen baseline with the toggle unchecked and a print baseline with it checked. It unchecks the toggle via `data-testid="controls-toggle"` and asserts it is checked by default.
- **Download PDF** is `window.print()` (`download-button.tsx:86`). The printed page depends on:
  - the `print:` classes in `layout.tsx:25,27,32,34,39,41`, `resume-preview-page-client.tsx:24,60` and `resume-preview-wrapper.tsx:70`;
  - the print block in `src/app/globals.css`: letter `@page` with no margin, and a professional-template body gradient positioned at `calc(50% - 408px)`, which assumes the document is centred on the page.

## Proposed Decisions (approved together with this PRD)

The owner has not yet chosen between these. The user stories are written against the recommended option. Choosing an alternative changes the listed story before `prd.json` is created.

| # | Decision | Recommended (used below) | Alternative | Stories affected |
|---|---|---|---|---|
| D1 | Scope of the navigation change | Change the shared dashboard layout, so every dashboard page gets the mobile navigation | Change the preview route only; every other dashboard page keeps the squeezed sidebar on phones | US-002 |
| D2 | Dashboard navigation below 1024px | One menu: add the dashboard links to the site header's existing mobile menu | A separate dashboard drawer with its own trigger (new component, likely a new Radix dependency) | US-002 |
| D3 | Document between 1024 and 1134px | Scale the document to the available width | Hide the sidebar below 1135px on the preview route only | US-003 |
| D4 | Show Controls while the document is scaled | Hide the toggle and treat the controls as off while scaled; restore the user's choice at full size | Keep the controls available when scaled | US-003 |
| D5 | Second preview route `src/app/[locale]/(dashboard)/resumes/[id]/preview/page.tsx` | Out of scope. It still inherits the D1 layout change, but its own header is not touched. | Give it the same header and scaling treatment | — |
| D6 | Verification widths | 375, 768, 1024, 1280 for this surface | Another set named by the owner | all |

## Scope

- Preview page header layout: Back, title, Show Controls toggle, Download PDF, Download Word.
- The dashboard layout's sidebar visibility below 1024px, the sidebar's full height, and the content area's height, which currently subtracts a hard-coded 64px.
- Adding the dashboard navigation links to the site header's existing mobile menu when the current route is under `/[locale]/dashboard` (D2).
- Scaling the resume document on the preview route to fit the available width when it is narrower than the document (D3).
- Hiding Show Controls while the document is scaled (D4).
- Automated responsive coverage for these behaviours at the D6 widths.

## Out of Scope

- Any change to the resume template components or to how the document renders at full size.
- The editor, Live Preview, and DOCX generation.
- The print stylesheet's content, except for rules that are needed only to cancel the new scaling under print.
- The second preview route's own header (D5).
- Redesigning the sidebar, the site header's desktop layout, or any other dashboard page's content.
- The site header shows the "Sign In" label as the account-menu trigger for a signed-in user (`header.tsx:114`). This was observed during diagnosis and needs its own follow-up.
- Adding a mobile or tablet project to the Playwright configs. The new coverage sets its viewport per test instead.
- New dependencies.

## Impact Assessment

- **Frontend / UI:** Affected. The preview header, the dashboard layout, the site header's mobile menu, and a new fit-to-width wrapper around the document.
- **Internationalization:** Affected. Existing keys are reused (`common.back`, `resumes.preview`, `resumes.showControls`, `resumes.downloadPDF`, `resumes.downloadWord`, `dashboard.nav.*`, `aria.openMainMenu`). Any new string needs all four locales, and German is the longest.
- **Resume model / templates:** Not affected. No template file changes; the scaling lives in the frame, and no layout state is added or moved.
- **Exports:** Affected, as a regression risk only. Download PDF is `window.print()` of this page, and the scaling must not reach the printed output. DOCX is unaffected.
- **Database / persistence:** Not affected.
- **Security / authorization:** Not affected. The layout's server-side auth redirect is unchanged.
- **Testing / validation:** Affected. New responsive e2e coverage; the visual suite must stay green without updating baselines.

## User Stories

### US-001: Preview header controls never overlap and wrap cleanly

**Description:**
As a user viewing my resume preview at any width, I want Back, the title, Show Controls and the download buttons laid out without overlapping, so that I can read the title and reach every control.

**Acceptance Criteria:**

- [ ] The toggle is part of the header's normal layout flow: its wrapper has no `absolute` or `fixed` positioning, and it scrolls with the header.
- [ ] At 1280, 1024, 768 and 375 (`en` and `de`), no two of Back, title, toggle, Download PDF and Download Word have intersecting bounding boxes, measured in a test.
- [ ] At each of those widths, a hit test at the centre of Back and at the centre of each of the other controls returns that control or one of its descendants.
- [ ] Where the row does not fit, the header wraps: first row Back and title, second row the toggle and download buttons.
- [ ] The title is at most two lines at every tested width, and the full title stays available as the element's accessible text.
- [ ] Download button labels do not wrap inside their buttons at any tested width.
- [ ] Below 640px, Back, the toggle's clickable area, Download PDF and Download Word are each at least 44px tall.
- [ ] The Tab order is Back, toggle, Download PDF, Download Word at 1280 and at 375, and each shows a visible focus indicator.
- [ ] `data-testid="controls-toggle"` stays a checkbox, checked by default.
- [ ] `pnpm test:visual` passes without updating baselines.

### US-002: Dashboard navigation moves into the site menu below 1024px

**Description:**
As a user on a phone or tablet, I want the dashboard navigation in the site's menu instead of a fixed column, so that dashboard pages get the full screen width.

**Acceptance Criteria:**

- [ ] Below 1024px, the dashboard sidebar is not rendered visibly and takes no horizontal space on any dashboard page. At 1024px and above it shows as today.
- [ ] Below 1024px on a route under `/[locale]/dashboard`, opening the site header's menu shows every dashboard navigation link (Home, My Resumes, Cover Letters, My Applications, Job Search, Goals, Settings) with the same localized labels and destinations as the sidebar, and marks the current route as active.
- [ ] Following any of those links closes the menu.
- [ ] On routes outside `/[locale]/dashboard`, the menu's contents are unchanged.
- [ ] The menu trigger has an accessible name and `aria-expanded` that reflects its state. It opens and closes from the keyboard, and every link in it is reachable with Tab.
- [ ] At 1280, 1024, 768 and 375, the page has no horizontal scrollbar, and only one element scrolls vertically: no double scrollbar.
- [ ] At 1024px and above, the sidebar's border and background run the full height of the content area.
- [ ] Printing any dashboard page still hides the site header, the menu and the sidebar. `pnpm test:visual` passes without updating baselines.

### US-003: The resume document scales to fit instead of being cropped

**Description:**
As a user previewing my resume on a narrow screen, I want the whole document shown scaled down, so that I can see all of it without scrolling sideways.

**Acceptance Criteria:**

- [ ] When the space available to the document is narrower than the document, the document is scaled uniformly by `available width ÷ document width`. The whole document width is visible, and the preview area has no horizontal scrollbar at 1024, 768 and 375.
- [ ] When the available width is at least the document width (including 1280 in the visual suite), the document and its wrapper carry no `transform`, `zoom` or scale-related inline style at all.
- [ ] While scaled, the space reserved below the document equals the document's scaled height (within 2px). This holds after layout settings finish applying and after the window is resized.
- [ ] The scale factor follows the container's width, not viewport breakpoints. Resizing from 375 to 1280 and back leaves the document at the correct scale each time.
- [ ] While scaled, the Show Controls toggle is not shown, and the document renders with controls off. Returning to full size shows the toggle again with the value the user last chose.
- [ ] The PDF printed from the preview is identical when printed from a 375px window and from a 1280px window, and identical to `origin/main` for the same resume: same page count, and rasterized pages matching within the visual suite's tolerance.
- [ ] `pnpm test:visual` passes without updating baselines.

## Functional Requirements

- **FR-1:** No change to any file under `src/components/dashboard/resume-templates/`, and none to the document's rendered output at full size.
- **FR-2:** The scale factor is derived from measured layout at render time and is never persisted. It must not become resume or layout state (`.claude/rules/resumes.md`).
- **FR-3:** Scaling is cancelled whenever the page prints, whatever the window width at the time. The printed output is the one the unscaled document produces.
- **FR-4:** Every new or moved control keeps an accessible name from the existing i18n keys. Any new user-facing string is added to `fr`, `en`, `de` and `it`.
- **FR-5:** The 1024px sidebar threshold uses the same `lg` breakpoint as the site header's menu switch, so at no width is dashboard navigation unreachable, and at no width do both the sidebar and the header menu trigger show.
- **FR-6:** No new dependencies (D2).

## Regression Constraints

- The visual baselines in `e2e/visual/__screenshots__/` are not updated, and `pnpm test:visual` passes.
- At 1280px, the preview page's document is pixel-identical to `origin/main`: same position and centring, and no new element over it or wrapping it with typography classes.
- Every existing `print:` class listed under Context keeps its effect.
- The professional template's print gradient still lines up with the document.
- Show Controls defaults to on, and switching it still adds and removes the in-document controls at full size.
- The unsaved-changes banner still shows and is still hidden in print.
- The site header's desktop layout (1024px and above) is unchanged.
- Every dashboard page keeps its server-side auth redirect.

## Required Verification

- `pnpm lint`: no new problems compared with `origin/main`, measured at story start.
- `pnpm build` succeeds.
- `pnpm test:visual` succeeds, with no baseline file changed in the diff.
- New Playwright coverage at the D6 widths asserting US-001 to US-003:
  - bounding-box overlap and hit tests;
  - the horizontal-overflow check;
  - sidebar visibility and menu links;
  - `transform` absent at full size and present below it;
  - reserved height;
  - the toggle hidden while scaled.

  It runs against the local Supabase stack in the existing `playwright.config.ts` suite, and the `pnpm` command and its passing output are recorded.
- Print: `page.pdf()` of a seeded professional resume, from a 375px and a 1280px viewport on this branch and a 1280px viewport on `origin/main`. Record the page count, and compare rasterized pages within the visual suite's tolerance.
- `ui-expert` rendered evidence at 375, 768, 1024 and 1280 in `en` and `de`, for:
  - the preview route: controls on and off, scaled and full size;
  - one other dashboard page, to cover D1;
  - the header menu opened on a dashboard route.
- Keyboard walk-through with real Tab key presses at 1280 and 375.
- `code-reviewer` review of each story.

## FAIL Conditions

- Any visual baseline changes, or `pnpm test:visual` fails.
- Any file under `src/components/dashboard/resume-templates/` is modified.
- At any tested width, two header controls overlap, a hit test on a control lands elsewhere, or the page scrolls horizontally.
- A `transform`, `zoom` or scale style is present on the document or its wrapper at 1280.
- The printed PDF differs from `origin/main`, or between a narrow and a wide window.
- Any dashboard navigation link is unreachable at some width, or the sidebar and the header menu trigger show at the same time.
- A new user-facing string is missing from any locale.
- A new dependency is added.

## BLOCKER Conditions

- The PRD is not approved, or the owner picks an alternative for D1–D6 without the affected story being revised.
- The local Supabase stack is unavailable, so the preview route cannot be rendered with a seeded resume.
- A print-to-PDF comparison with `origin/main` cannot be produced.

## Risks

- **Print leakage.** A real print lays out at about 816px. A width-driven scale computed before printing could reach the PDF. FR-3 and the PDF comparison exist for this.
- **Reserved height drift.** Layout settings apply after mount and change the document's height. A stale measurement leaves a gap or clips the bottom.
- **Scaled text rendering.** Text scaled to about 0.4 at 375px may render soft. `ui-expert` must judge it on a real capture.
- **Other dashboard pages (D1).** Pages that relied on the sidebar at narrow widths now rely on the header menu. The wider layout may also expose overflow on other dashboard pages that the sidebar was hiding.
- **Links inside a scaled document** shrink below usable tap sizes. That is acceptable for a preview, but should be noted.

## Evidence / References

- `src/components/dashboard/resume-preview-page-client.tsx`: the header row, the absolutely positioned toggle, and the default `showControls`.
- `src/components/dashboard/controls-toggle.tsx`: the checkbox with `data-testid="controls-toggle"`.
- `src/components/dashboard/download-button.tsx`: Download PDF (`window.print()`) and Download Word.
- `src/components/dashboard/resume-preview-wrapper.tsx`: the unsaved-changes banner, and controls wired only when shown.
- `src/app/[locale]/(dashboard)/layout.tsx`: the sidebar wrapper, the 64px height calc, and the print classes.
- `src/components/dashboard/sidebar.tsx`: navigation items and `dashboard.nav.*` keys.
- `src/components/marketing/header.tsx`: the `lg` mobile-menu switch and the menu contents.
- `src/components/dashboard/resume-templates/*-template.tsx`: the inline 816px / `8.5in` document width (read only).
- `src/app/globals.css`: the print block.
- `e2e/visual/resume-templates.spec.ts` and `playwright.visual.config.ts`: the baseline route, the viewport, and the toggle interaction.
- `playwright.config.ts`: the functional suite where the responsive coverage will live.
- The `ui-expert` diagnosis, 2026-09-15: screenshots and measurements at 1280/1024/1023/768/375.

## Open Questions

- D1–D6 above must be decided by the owner. Each is blocking until then. Approving this PRD as written adopts the recommended option for each.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to `prd.json` or implementation.
