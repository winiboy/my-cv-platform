# PRD: Resume Reviewer Tool

## Introduction

Complete redesign of the Resume Reviewer page at `/[locale]/tools/resume-reviewer` to achieve strict visual and functional parity with TealHQ's Resume Reviewer tool. The page allows users to submit their resume via multiple input methods (PDF upload, text paste, or select existing resume) and receive comprehensive AI-powered analysis including ATS score, section-by-section feedback, and improvement suggestions. Optionally, users can include a job description for targeted matching analysis.

The page is fully public (no authentication required).

## Goals

- Achieve 1:1 visual parity with TealHQ Resume Reviewer layout and styling
- Implement all three input methods: PDF upload, text paste, select existing resume
- Provide comprehensive analysis: ATS score, categorized scores, detailed feedback
- Support optional job description input for targeted analysis
- Ensure the page works without authentication
- Isolate all changes to the resume-reviewer page (no side effects)

## User Stories

### US-001: Create page layout structure matching TealHQ

**Description:** As a user, I want the Resume Reviewer page to have the same visual structure as TealHQ so the experience feels professional and familiar.

**Acceptance Criteria:**
- [ ] Hero section with title, subtitle, and brief description
- [ ] Main content area with input section prominently displayed
- [ ] Results section (hidden until analysis complete)
- [ ] Responsive layout matching TealHQ breakpoints
- [ ] Proper spacing and padding matching TealHQ
- [ ] Typecheck passes (`pnpm tsc --noEmit`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Verify in browser at `/en/tools/resume-reviewer`

---

### US-002: Implement PDF upload input method

**Description:** As a user, I want to upload my resume as a PDF so I can get it analyzed without retyping.

**Acceptance Criteria:**
- [ ] Drag-and-drop zone with visual feedback on hover/drag
- [ ] Click to browse file picker (PDF only)
- [ ] File size limit displayed (e.g., "Max 5MB")
- [ ] Upload progress indicator
- [ ] Error state for invalid file type or size
- [ ] Uploaded file name displayed with remove option
- [ ] PDF text extraction via existing API or new endpoint
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser: upload a PDF and see filename displayed

---

### US-003: Implement text paste input method

**Description:** As a user, I want to paste my resume text directly so I can quickly get feedback without uploading a file.

**Acceptance Criteria:**
- [ ] Large textarea with placeholder text
- [ ] Character count display
- [ ] Clear button to reset textarea
- [ ] Minimum character validation before analysis
- [ ] Tab switching between input methods (Upload / Paste / Select)
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser: paste text and see character count update

---

### US-004: Implement select existing resume input method

**Description:** As a logged-in user, I want to select one of my existing resumes so I don't have to re-upload.

**Acceptance Criteria:**
- [ ] Dropdown or card selector showing user's resumes (if authenticated)
- [ ] Shows "Sign in to access your resumes" message if not authenticated
- [ ] Resume preview/name displayed when selected
- [ ] Graceful handling when user has no resumes
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser: shows sign-in prompt when not logged in

---

### US-005: Implement optional job description input

**Description:** As a user, I want to optionally add a job description so the analysis can tell me how well my resume matches.

**Acceptance Criteria:**
- [ ] Collapsible/expandable section for job description
- [ ] Textarea for pasting job description text
- [ ] Clear indication this is optional
- [ ] Job description included in analysis request when provided
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser: expand section and paste job description

---

### US-006: Create analysis loading state

**Description:** As a user, I want clear feedback while my resume is being analyzed so I know the system is working.

**Acceptance Criteria:**
- [ ] "Analyze Resume" button with loading spinner when processing
- [ ] Button disabled during analysis
- [ ] Progress indication or animated placeholder in results area
- [ ] Estimated time or "This may take a moment" message
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser: click analyze and see loading state

---

### US-007: Create API endpoint for resume analysis

**Description:** As a developer, I need an API endpoint that accepts resume text and optional job description, returning comprehensive analysis.

**Acceptance Criteria:**
- [ ] POST `/api/ai/analyze-resume` endpoint
- [ ] Accepts: `{ resumeText: string, jobDescription?: string }`
- [ ] Returns: `{ overallScore, categories[], suggestions[], jobMatch? }`
- [ ] Uses Groq SDK for AI analysis
- [ ] Proper error handling with meaningful messages
- [ ] Rate limiting consideration (public endpoint)
- [ ] Typecheck passes
- [ ] Lint passes

---

### US-008: Display overall ATS score

**Description:** As a user, I want to see my overall ATS score prominently so I quickly understand how my resume performs.

**Acceptance Criteria:**
- [ ] Large circular or semi-circular score indicator (0-100)
- [ ] Color coding: red (<50), yellow (50-75), green (>75)
- [ ] Score label (e.g., "ATS Score" or "Resume Score")
- [ ] Brief interpretation text (e.g., "Good", "Needs Improvement")
- [ ] Animation on score reveal
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser: see animated score after analysis

---

### US-009: Display categorized section scores

**Description:** As a user, I want to see scores for different categories (Impact, Brevity, Style, etc.) so I know which areas need work.

**Acceptance Criteria:**
- [ ] Category cards/rows matching TealHQ layout
- [ ] Categories: Impact, Brevity, Style, Sections, Skills (or TealHQ equivalents)
- [ ] Individual score per category (percentage or out of 10)
- [ ] Visual indicator (progress bar or similar)
- [ ] Color coding per category score
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser: see all category scores displayed

---

### US-010: Display detailed feedback and suggestions

**Description:** As a user, I want detailed, actionable feedback for each category so I can improve my resume.

**Acceptance Criteria:**
- [ ] Expandable sections per category
- [ ] Bullet-point list of specific issues found
- [ ] Actionable improvement suggestions
- [ ] Highlight specific text/sections when possible
- [ ] Positive feedback for strong areas
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser: expand category and see detailed feedback

---

### US-011: Display job match analysis (when job description provided)

**Description:** As a user, I want to see how well my resume matches the job description so I can tailor it appropriately.

**Acceptance Criteria:**
- [ ] Job match score displayed (percentage)
- [ ] Keywords found vs. missing comparison
- [ ] Skills alignment analysis
- [ ] Specific suggestions to improve match
- [ ] Section only visible when job description was provided
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser: provide job description and see match analysis

---

### US-012: Implement error states and edge cases

**Description:** As a user, I want clear error messages when something goes wrong so I can take corrective action.

**Acceptance Criteria:**
- [ ] Error state for API failure
- [ ] Error state for empty/invalid resume
- [ ] Error state for PDF parsing failure
- [ ] Retry button on error
- [ ] Friendly error messages (not technical jargon)
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser: trigger error and see friendly message

---

### US-013: Add "Analyze Another" reset functionality

**Description:** As a user, I want to easily analyze another resume without refreshing the page.

**Acceptance Criteria:**
- [ ] "Analyze Another Resume" button in results section
- [ ] Resets form to initial state
- [ ] Clears previous results
- [ ] Scrolls to input section
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser: click reset and see form cleared

---

### US-014: Ensure responsive design parity

**Description:** As a user on mobile/tablet, I want the same quality experience as desktop.

**Acceptance Criteria:**
- [ ] Mobile layout matches TealHQ mobile view
- [ ] Tablet layout matches TealHQ tablet view
- [ ] Touch-friendly input areas
- [ ] Readable text at all breakpoints
- [ ] No horizontal scroll
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser: test at 375px, 768px, 1024px widths

---

### US-015: Final visual parity review

**Description:** As a product owner, I want side-by-side visual parity confirmed before release.

**Acceptance Criteria:**
- [ ] Screenshot comparison: hero section
- [ ] Screenshot comparison: input section (all 3 tabs)
- [ ] Screenshot comparison: loading state
- [ ] Screenshot comparison: results section
- [ ] Screenshot comparison: mobile view
- [ ] No visible differences in spacing, colors, typography
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] `code-reviewer` agent returns PASS

---

## Functional Requirements

- FR-1: Page accessible at `/[locale]/tools/resume-reviewer` for all supported locales
- FR-2: Three input methods available: PDF upload, text paste, select existing resume
- FR-3: PDF upload accepts only .pdf files up to 5MB
- FR-4: Text paste requires minimum 100 characters
- FR-5: Select existing resume requires authentication (shows prompt if not logged in)
- FR-6: Job description input is optional and collapsible
- FR-7: Analysis returns overall score (0-100) and category scores
- FR-8: Analysis returns actionable suggestions per category
- FR-9: Job match analysis only appears when job description provided
- FR-10: All states (empty, loading, success, error) have appropriate UI
- FR-11: Page works without authentication for upload and paste methods

## Non-Goals (Out of Scope)

- Saving analysis results to database
- Analysis history for users
- Sharing analysis results via link
- PDF export of analysis
- Comparison between multiple resumes
- A/B testing of different resume versions
- Integration with external ATS systems
- Premium/paid analysis tiers
- Changes to any other tools pages

## Design Considerations

- Match TealHQ's color palette for score indicators
- Use existing shadcn/ui components where they achieve parity
- Create custom components only when necessary for visual match
- Animations should be subtle and match TealHQ timing
- Typography hierarchy must match TealHQ exactly

## Technical Considerations

- Reuse existing PDF parsing logic if available, or use `pdf-parse` library
- AI analysis via Groq SDK (existing pattern in `/api/ai/` endpoints)
- Consider caching analysis prompts for consistency
- Rate limit public endpoint to prevent abuse
- Resume text extraction should handle multi-page PDFs
- Job description matching uses same AI endpoint with additional context

## Success Metrics

- Visual parity confirmed via side-by-side comparison
- All three input methods functional
- Analysis completes in under 10 seconds
- Error rate below 5%
- Mobile usability score above 90
- `pnpm lint` and `pnpm build` pass
- `code-reviewer` returns PASS

## Open Questions

- Exact category names to use (need to verify against TealHQ)
- Specific AI prompt structure for comprehensive analysis
- Rate limiting strategy for public endpoint (requests per IP per hour?)
- Should we store anonymous analytics on usage?
