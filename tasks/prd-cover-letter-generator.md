# PRD: Cover Letter Generator

## Introduction

AI-powered cover letter generator with strict 1:1 visual and functional parity with TealHQ's Cover Letter Generator. Users select a resume, provide a job description, configure generation settings (length, tone, job details), and receive a tailored cover letter they can edit and export. The feature is isolated to `/[locale]/tools/cover-letter-generator`.

## Goals

- Achieve **1:1 visual parity** with TealHQ's Cover Letter Generator UI
- Achieve **1:1 functional parity** with TealHQ's Cover Letter Generator features
- Deliver an experience **indistinguishable** from TealHQ
- Maintain **complete isolation** to the cover letter generator route
- Reuse existing shared components (ResumeLinker, JobDescriptionInput, etc.)
- Support all 4 locales (en, fr, de, it)

## User Stories

### US-001: Page Structure & Layout
**Description:** As a user, I want to access the cover letter generator from the tools page so that I can create tailored cover letters.

**Acceptance Criteria:**
- [ ] Route exists at `/[locale]/tools/cover-letter-generator`
- [ ] Page follows existing tools page pattern (server component with auth gate)
- [ ] Unauthenticated users see benefits list + login CTA
- [ ] Authenticated users see the generator interface
- [ ] Back link to tools page present
- [ ] Hero section with title and subtitle
- [ ] Typecheck passes (`pnpm tsc --noEmit`)
- [ ] Lint passes (`pnpm lint`)

---

### US-002: Two-Column Layout (TealHQ Parity)
**Description:** As a user, I want a clean two-column layout matching TealHQ so that inputs are on the left and the generated letter is on the right.

**Acceptance Criteria:**
- [ ] Left column: Input section (resume selector, job description, settings)
- [ ] Right column: Cover letter output (empty state → generated letter)
- [ ] Responsive: stacks vertically on mobile
- [ ] Column proportions match TealHQ (roughly 40/60 or 1/2 split)
- [ ] Consistent spacing and padding with existing tools
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser using dev server

---

### US-003: Resume Selection via ResumeLinker
**Description:** As a user, I want to select one of my saved resumes so that the cover letter is tailored to my experience.

**Acceptance Criteria:**
- [ ] ResumeLinker component integrated in left column
- [ ] Dropdown shows all user's resumes (title + last updated)
- [ ] Selected resume ID stored in component state
- [ ] Resume content extracted using `convertResumeToText()` pattern
- [ ] Error state if no resumes exist (prompt to create one)
- [ ] Typecheck passes
- [ ] Lint passes

---

### US-004: Job Description Input (Tabbed Interface)
**Description:** As a user, I want to provide a job description via text paste or saved job so that the cover letter targets the specific role.

**Acceptance Criteria:**
- [ ] Tabbed interface: "Paste Text" | "Saved Jobs"
- [ ] "Paste Text" tab: JobDescriptionInput textarea (min 100 chars)
- [ ] "Saved Jobs" tab: JobLinker dropdown for saved job applications
- [ ] Job description stored in component state
- [ ] Clear visual indication of selected/active tab
- [ ] Typecheck passes
- [ ] Lint passes

---

### US-005: Generation Settings Panel (TealHQ Parity)
**Description:** As a user, I want to configure generation settings (length, tone, job details) so that the cover letter matches my needs.

**Acceptance Criteria:**
- [ ] **Length selector:** Short | Medium (default) | Long
- [ ] **Tone selector:** Casual | Formal (default) | Match Job Description
- [ ] **Job details picker:** Checkboxes to select key requirements/responsibilities from job description
- [ ] **Custom prompt field:** Optional textarea for additional instructions
- [ ] Settings grouped in a collapsible/expandable panel (default expanded)
- [ ] Visual styling matches TealHQ (clean, minimal)
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser using dev server

---

### US-006: Job Details Extraction
**Description:** As a user, I want the system to extract key requirements and responsibilities from the job description so that I can select which to emphasize.

**Acceptance Criteria:**
- [ ] Parse job description to identify 5-10 key points
- [ ] Display as selectable checkboxes with truncated text
- [ ] Default: top 3-5 items pre-selected
- [ ] User can toggle selections on/off
- [ ] Selected items passed to AI prompt
- [ ] Graceful handling if extraction yields < 3 items
- [ ] Typecheck passes
- [ ] Lint passes

---

### US-007: "Write with AI" Button
**Description:** As a user, I want to click a primary action button to generate my cover letter so that I can quickly create tailored content.

**Acceptance Criteria:**
- [ ] Button labeled "Write with AI" (or translated equivalent)
- [ ] Button disabled until resume AND job description are provided
- [ ] Button shows loading state during generation
- [ ] Button uses primary color styling (teal/brand color)
- [ ] Keyboard accessible (Enter/Space triggers)
- [ ] Typecheck passes
- [ ] Lint passes

---

### US-008: API Endpoint for Cover Letter Generation
**Description:** As a developer, I need an API endpoint that generates cover letters using AI so that the client can request tailored content.

**Acceptance Criteria:**
- [ ] Endpoint: `POST /api/tools/generate-cover-letter`
- [ ] Request body: `{ resumeText, jobDescription, length, tone, selectedDetails, customPrompt, locale }`
- [ ] Uses Groq SDK (BALANCED model: `llama-3.3-70b-versatile`)
- [ ] Prompt engineering for professional cover letters
- [ ] Response: `{ success, coverLetter, metadata? }`
- [ ] Error handling with user-friendly messages
- [ ] Rate limiting consideration (future)
- [ ] Typecheck passes
- [ ] Lint passes

---

### US-009: Cover Letter Display (Right Column)
**Description:** As a user, I want to see the generated cover letter in a clean display area so that I can review it immediately.

**Acceptance Criteria:**
- [ ] Empty state before generation: helpful placeholder text
- [ ] Generated letter displays with proper formatting (paragraphs, spacing)
- [ ] Loading skeleton during generation
- [ ] Smooth transition from loading to content
- [ ] Scroll if content exceeds viewport
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser using dev server

---

### US-010: WYSIWYG Editor for Cover Letter
**Description:** As a user, I want to edit the generated cover letter directly so that I can make manual adjustments.

**Acceptance Criteria:**
- [ ] Rich text editor (similar to skills section editor)
- [ ] Basic formatting: bold, italic, underline
- [ ] Paragraph handling preserved
- [ ] Undo/redo support
- [ ] Changes persist in component state
- [ ] Editor matches TealHQ styling (clean, minimal chrome)
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser using dev server

---

### US-011: "Improve with AI" Button
**Description:** As a user, I want to regenerate or refine the cover letter with new settings so that I can iterate on the content.

**Acceptance Criteria:**
- [ ] Button appears after initial generation
- [ ] Opens settings panel (same as US-005) with current values
- [ ] Allows changing length, tone, details, custom prompt
- [ ] Regenerates cover letter preserving any manual edits as context (optional)
- [ ] Loading state during regeneration
- [ ] Typecheck passes
- [ ] Lint passes

---

### US-012: Copy to Clipboard
**Description:** As a user, I want to copy the cover letter to clipboard so that I can paste it into job applications.

**Acceptance Criteria:**
- [ ] "Copy" button in cover letter action bar
- [ ] Copies plain text (strips formatting if needed)
- [ ] Visual feedback on copy (toast or button text change)
- [ ] Keyboard shortcut: Ctrl/Cmd+C when editor focused
- [ ] Typecheck passes
- [ ] Lint passes

---

### US-013: Download as PDF
**Description:** As a user, I want to download the cover letter as PDF so that I can attach it to applications.

**Acceptance Criteria:**
- [ ] "Download PDF" button in action bar
- [ ] Uses html2pdf.js (same as resume export)
- [ ] Clean formatting: proper margins, readable font
- [ ] Filename: `Cover_Letter_[JobTitle].pdf` or similar
- [ ] Loading state during PDF generation
- [ ] Typecheck passes
- [ ] Lint passes

---

### US-014: Download as DOCX
**Description:** As a user, I want to download the cover letter as DOCX so that I can edit it in Word.

**Acceptance Criteria:**
- [ ] "Download DOCX" button in action bar
- [ ] Uses html-to-docx (same as resume export)
- [ ] Preserves formatting (paragraphs, basic styles)
- [ ] Filename: `Cover_Letter_[JobTitle].docx` or similar
- [ ] Loading state during DOCX generation
- [ ] Typecheck passes
- [ ] Lint passes

---

### US-015: Language/Locale Support
**Description:** As a user, I want to generate cover letters in my preferred language so that they match the job market I'm targeting.

**Acceptance Criteria:**
- [ ] Language selector: English, French, German, Italian
- [ ] Default: current page locale
- [ ] AI generates content in selected language
- [ ] UI strings translated in all 4 locales
- [ ] Typecheck passes
- [ ] Lint passes

---

### US-016: Translation Keys
**Description:** As a developer, I need all UI strings externalized to translation files so that the feature supports i18n.

**Acceptance Criteria:**
- [ ] All strings in `src/locales/{en,fr,de,it}/tools.json`
- [ ] Namespace: `coverLetterGenerator`
- [ ] Keys for: title, subtitle, buttons, labels, placeholders, errors, empty states
- [ ] No hardcoded strings in components
- [ ] Typecheck passes
- [ ] Lint passes

---

### US-017: Error Handling & Edge Cases
**Description:** As a user, I want clear error messages when something goes wrong so that I know how to fix it.

**Acceptance Criteria:**
- [ ] Error if AI generation fails (retry option)
- [ ] Error if resume has insufficient content
- [ ] Error if job description too short
- [ ] Error if network fails
- [ ] All errors displayed in user-friendly format (not technical)
- [ ] Errors are dismissible
- [ ] Typecheck passes
- [ ] Lint passes

---

### US-018: Empty States
**Description:** As a user, I want helpful empty states that guide me through the process.

**Acceptance Criteria:**
- [ ] No resume selected: "Select a resume to get started"
- [ ] No job description: "Add a job description to tailor your letter"
- [ ] No generated letter yet: Placeholder with instructions
- [ ] Empty states include relevant icons/illustrations
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser using dev server

---

### US-019: Accessibility (a11y)
**Description:** As a user with accessibility needs, I want the feature to be fully accessible so that I can use it with assistive technologies.

**Acceptance Criteria:**
- [ ] All interactive elements keyboard accessible
- [ ] ARIA labels on buttons, inputs, regions
- [ ] Focus management (focus moves logically)
- [ ] Color contrast meets WCAG AA
- [ ] Screen reader announcements for state changes
- [ ] Respects `prefers-reduced-motion`
- [ ] Typecheck passes
- [ ] Lint passes

---

### US-020: Visual Polish (TealHQ Parity)
**Description:** As a user, I want the UI to visually match TealHQ's cover letter generator so that the experience feels premium and familiar.

**Acceptance Criteria:**
- [ ] Typography matches TealHQ (font sizes, weights, line heights)
- [ ] Spacing/padding matches TealHQ patterns
- [ ] Button styles match TealHQ (rounded, hover states)
- [ ] Input styles match TealHQ (borders, focus states)
- [ ] Color palette aligned with brand (teal accents)
- [ ] Icons consistent with existing tools
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser using dev server

## Functional Requirements

- **FR-1:** Route `/[locale]/tools/cover-letter-generator` renders the cover letter generator page
- **FR-2:** Unauthenticated users see benefits + login CTA; authenticated users see full interface
- **FR-3:** User must select a resume before generation is enabled
- **FR-4:** User must provide job description (paste or saved job) before generation is enabled
- **FR-5:** Generation settings include: Length (Short/Medium/Long), Tone (Casual/Formal/Match JD), Job Details (multi-select), Custom Prompt (optional)
- **FR-6:** "Write with AI" button triggers API call to generate cover letter
- **FR-7:** Generated cover letter displays in right column with WYSIWYG editor
- **FR-8:** "Improve with AI" allows regeneration with modified settings
- **FR-9:** Export options: Copy to clipboard, Download PDF, Download DOCX
- **FR-10:** Language selector controls output language (en/fr/de/it)
- **FR-11:** All UI strings are translated in 4 locales
- **FR-12:** Errors are displayed with user-friendly messages and recovery options

## Non-Goals (Out of Scope)

- **No saved cover letters:** Cover letters are not persisted to database (copy-paste/download only)
- **No cover letter templates:** Single generation style, no template selection
- **No cover letter history:** No version tracking or generation history
- **No Chrome extension integration:** Job import via extension not in scope
- **No credit/usage limits:** No metering for free vs paid users
- **No A/B testing:** Single implementation, no variants
- **No analytics tracking:** Beyond standard page views

## Design Considerations

### UI/UX Requirements
- Two-column layout: Input (left) | Output (right)
- Responsive: Stack vertically on mobile (< 768px)
- Reuse existing shared components where possible
- Match TealHQ's clean, minimal aesthetic
- Primary action button prominently placed
- Settings panel collapsible but default expanded

### Existing Components to Reuse
- `ResumeLinker` - Resume selection dropdown
- `JobLinker` - Saved jobs selection
- `JobDescriptionInput` - Job description textarea
- `Button` (shadcn/ui) - All buttons
- `Tabs` (shadcn/ui) - Input method tabs
- `Skeleton` (shadcn/ui) - Loading states
- Rich text editor pattern from skills section

## Technical Considerations

### API Endpoint
- `POST /api/tools/generate-cover-letter`
- Uses Groq SDK with `llama-3.3-70b-versatile` model
- Temperature: 0.4 (slightly creative but consistent)
- Max tokens: 1500 (cover letters are concise)
- Structured prompt with resume, job, settings, locale

### Prompt Engineering
- System prompt establishes cover letter expert persona
- Include resume highlights, job requirements, tone guidance
- Enforce professional formatting (greeting, body paragraphs, closing)
- Language-aware generation based on locale parameter

### State Management
- Client-side state via `useState` hooks
- No server-side persistence required
- Form state: selectedResume, jobDescription, settings
- Output state: generatedLetter, isLoading, error

### Performance
- Debounce job description parsing for detail extraction
- Streaming response optional (nice-to-have)
- PDF/DOCX generation client-side (no server round-trip)

## Success Metrics

- User can generate a cover letter in under 30 seconds
- Generated letters require minimal manual editing (< 2 minutes of edits on average)
- Export functionality works reliably (PDF/DOCX match preview)
- No visual discrepancies from TealHQ reference
- All acceptance criteria pass for every user story

## Open Questions

1. **Job details extraction:** Should this be AI-powered or regex-based? (Recommend: simple AI extraction in same API call)
2. **Streaming:** Should the cover letter stream in word-by-word for better UX? (Recommend: v1 without streaming, v2 add if needed)
3. **Save to resume:** Should there be an option to attach cover letter to resume record? (Recommend: out of scope for v1)
4. **Character limits:** What is the maximum job description length to send to AI? (Recommend: 10,000 chars with truncation warning)

---

## Implementation Order (Suggested)

1. US-001: Page structure
2. US-002: Two-column layout
3. US-003: Resume selection
4. US-004: Job description input
5. US-016: Translation keys (can parallel)
6. US-005: Settings panel
7. US-006: Job details extraction
8. US-008: API endpoint
9. US-007: Write with AI button
10. US-009: Cover letter display
11. US-010: WYSIWYG editor
12. US-011: Improve with AI
13. US-012: Copy to clipboard
14. US-013: Download PDF
15. US-014: Download DOCX
16. US-015: Language support
17. US-017: Error handling
18. US-018: Empty states
19. US-019: Accessibility
20. US-020: Visual polish

---

*Generated based on TealHQ Cover Letter Generator reference and existing my-cv-platform tools architecture.*

**Sources:**
- [TealHQ Cover Letter Generator](https://www.tealhq.com/tool/cover-letter-generator)
- [Teal Review 2025 - Features](https://www.toolsforhumans.ai/ai-tools/teal)
- [TealHQ Knowledge Base - Using AI Cover Letter](https://help.tealhq.com/en/articles/9519269-using-ai-cover-letter)
