# PRD: Header Visibility on Dashboard Pages

## Introduction

Make the marketing site header visible on all dashboard pages to provide consistent branding and navigation across the entire platform. Currently, the marketing pages (`/fr`) use a full-featured header with logo, navigation, language switcher, and auth controls, while dashboard pages (`/fr/dashboard/*`) use only a minimal header with user menu. This change adds the marketing header to dashboard pages while preserving the existing sidebar navigation.

## Goals

- Provide consistent branding and navigation experience across all pages
- Allow users to access marketing navigation (Tools, Pricing) from dashboard
- Enable language switching from any page in the application
- Highlight the active section (Dashboard) in the header navigation
- Maintain existing sidebar navigation for dashboard-specific pages
- Ensure responsive mobile behavior with hamburger menu on dashboard

## User Stories

### US-001: Import marketing header into dashboard layout
**Description:** As a developer, I need to integrate the marketing header component into the dashboard layout so it appears above the existing sidebar/content structure.

**Acceptance Criteria:**
- [ ] Marketing header component is imported in dashboard layout (`src/app/[locale]/(dashboard)/layout.tsx`)
- [ ] Header renders above the existing flex container (sidebar + content)
- [ ] Header maintains sticky positioning (`sticky top-0 z-50`)
- [ ] Typecheck passes (`pnpm lint`)
- [ ] Build passes (`pnpm build`)

### US-002: Adjust dashboard content area for header height
**Description:** As a user, I want the dashboard content to be properly positioned below the header so nothing is hidden or overlapping.

**Acceptance Criteria:**
- [ ] Dashboard flex container accounts for header height
- [ ] Sidebar starts below the header (not behind it)
- [ ] Main content area is fully visible without overlap
- [ ] Scrolling behavior works correctly (header stays fixed, content scrolls)
- [ ] Typecheck passes (`pnpm lint`)
- [ ] Build passes (`pnpm build`)
- [ ] Verify in browser: navigate to `/fr/dashboard` and confirm no content is hidden behind header

### US-003: Highlight active Dashboard link in header
**Description:** As a user, I want to see the "Dashboard" navigation link highlighted when I'm on any dashboard page so I know where I am in the site.

**Acceptance Criteria:**
- [ ] "Dashboard" link in header shows active state styling when on `/[locale]/dashboard/*` routes
- [ ] Active state uses visual differentiation (e.g., `text-teal-600`, underline, or bold)
- [ ] Other navigation links (Tools, Pricing) show default inactive state
- [ ] Active state logic uses `usePathname()` to detect current route
- [ ] Typecheck passes (`pnpm lint`)
- [ ] Build passes (`pnpm build`)
- [ ] Verify in browser: navigate between dashboard and marketing pages, confirm correct highlight state

### US-004: Mobile header behavior on dashboard
**Description:** As a mobile user, I want the hamburger menu to work on dashboard pages so I can access navigation on small screens.

**Acceptance Criteria:**
- [ ] Hamburger menu icon appears on mobile viewport (< 768px)
- [ ] Tapping hamburger opens mobile navigation menu
- [ ] Mobile menu includes all navigation links (Dashboard, Tools, Pricing)
- [ ] Mobile menu includes language switcher
- [ ] Mobile menu includes auth controls (account dropdown or login/signup)
- [ ] Menu closes when a link is tapped
- [ ] Menu closes when tapping outside
- [ ] Typecheck passes (`pnpm lint`)
- [ ] Build passes (`pnpm build`)
- [ ] Verify in browser: resize to mobile width, test hamburger menu functionality

### US-005: Ensure sidebar and header coexist without conflict
**Description:** As a user, I want both the header and sidebar to be usable without visual or functional conflicts.

**Acceptance Criteria:**
- [ ] Sidebar remains at full height below the header
- [ ] Sidebar navigation items are all accessible
- [ ] No z-index conflicts between header and sidebar
- [ ] Print styles still hide both header and sidebar (`print:hidden`)
- [ ] Typecheck passes (`pnpm lint`)
- [ ] Build passes (`pnpm build`)
- [ ] Verify in browser: test clicking sidebar links while header is visible

### US-006: Remove duplicate user menu from dashboard header
**Description:** As a developer, I need to remove or hide the existing minimal dashboard header's user menu since the marketing header now provides auth controls.

**Acceptance Criteria:**
- [ ] Existing `DashboardHeader` component is either removed or simplified
- [ ] No duplicate user account dropdowns on the page
- [ ] Single source of auth controls (marketing header's account dropdown)
- [ ] Logout functionality works from the marketing header on dashboard pages
- [ ] Typecheck passes (`pnpm lint`)
- [ ] Build passes (`pnpm build`)
- [ ] Verify in browser: confirm only one user menu exists, test logout

## Functional Requirements

- FR-1: The marketing header (`src/components/marketing/header.tsx`) MUST render on all dashboard pages
- FR-2: The header MUST be positioned sticky at `top-0` with `z-50` z-index
- FR-3: The dashboard layout MUST adjust its height calculation to account for header (approx. 64-72px)
- FR-4: The "Dashboard" navigation link MUST show active state when pathname starts with `/[locale]/dashboard`
- FR-5: The mobile hamburger menu MUST function identically on dashboard as on marketing pages
- FR-6: The existing dashboard-specific header (`DashboardHeader`) MUST be removed or hidden to avoid duplicate UI
- FR-7: The sidebar MUST remain functional and positioned correctly below the header
- FR-8: Auth state changes (login/logout) from the header MUST work correctly on dashboard pages

## Non-Goals

- No changes to the sidebar navigation structure or items
- No changes to the marketing header's visual design
- No new navigation links specific to dashboard in the header
- No changes to the footer (dashboard has no footer, marketing has footer)
- No merging of sidebar and header navigation systems
- No changes to authentication flow or providers

## Design Considerations

- **Layout structure change:**
  ```
  Before:
  <div class="flex h-screen">
    <Sidebar />
    <div class="flex-1">
      <DashboardHeader />
      <main>{children}</main>
    </div>
  </div>

  After:
  <div class="flex flex-col h-screen">
    <MarketingHeader />
    <div class="flex flex-1 overflow-hidden">
      <Sidebar />
      <main class="flex-1 overflow-auto">{children}</main>
    </div>
  </div>
  ```

- **Active link styling:** Reuse existing Tailwind classes from sidebar active states (`text-teal-600` or similar)
- **Height calculation:** Header is approximately `h-16` (64px); sidebar and content should use `calc(100vh - 64px)` or equivalent

## Technical Considerations

- The marketing header uses client-side auth state via `createClient()` and `onAuthStateChange`
- The dashboard layout uses server-side auth check via `createServerSupabaseClient()`
- Both auth approaches must coexist without conflicts
- The header component must handle being rendered in both marketing and dashboard contexts
- Consider whether to pass a prop to header to indicate "dashboard mode" for active link logic, or detect via pathname

## Success Metrics

- Header is visible on all dashboard pages without layout issues
- Users can switch languages from any dashboard page
- Users can navigate to Tools/Pricing from dashboard via header
- Active state correctly highlights "Dashboard" when on dashboard routes
- No duplicate UI elements (single user menu)
- Mobile navigation works on dashboard pages
- No regressions in existing functionality

## Open Questions

- Should the header's "Dashboard" link navigate to `/[locale]/dashboard` or stay on current page if already on dashboard?
- Should we add a visual separator between header and sidebar/content area?
- Should the sidebar's logo section be removed since the header now has the logo?
