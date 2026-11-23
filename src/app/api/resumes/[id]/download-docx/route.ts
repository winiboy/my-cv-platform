import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { type Locale } from '@/lib/i18n'
import { resolveResumeLayout } from '@/lib/layout-settings'
import { type DocxGeneratorSettings } from './docx-helpers'
import { generateProfessionalDocx } from './docx-professional'
import { generateModernDocx } from './docx-modern'
import { generateClassicDocx } from './docx-classic'
import { generateMinimalDocx } from './docx-minimal'
import { generateCreativeDocx } from './docx-creative'
import { generateSwissVocationalDocx } from './docx-swiss-vocational'
import { generateSwissCommerceDocx } from './docx-swiss-commerce'
import { generateSwissTradesDocx } from './docx-swiss-trades'
import { generateSwissHealthDocx } from './docx-swiss-health'
import { generateSwissFinanceDocx } from './docx-swiss-finance'
import { generateSwissEngineeringDocx } from './docx-swiss-engineering'
// The supported templates and the professional fallback: `docx-templates.ts`.
import { docxTemplateFor } from './docx-templates'
import { boundedPhoto } from './docx-photo-bound'

// ============================================================
// THE PHOTO — THE ONE NAMED EXCEPTION
// ============================================================

/**
 * The photo is the ONLY resume property this route accepts from the client, and
 * it is a deliberate, bounded exception rather than an oversight.
 *
 * WHY IT IS AN EXCEPTION
 *
 * Every other property this route needs — typography, colour, spacing, section
 * order, section visibility and the template itself — is read from the resume
 * record below, because the account is the one authority for them. The photo is
 * not stored on the account at all: it lives in the browser under
 * `resume_photo_${id}` in localStorage, a decision taken on 2026-09-07 and left
 * deliberately unchanged. There is therefore no record to read it from, and the
 * request body is the only transport available.
 *
 * THE SCOPE OF THE EXCEPTION
 *
 * The photo, and nothing else. No layout property may be added to this body: a
 * property the account owns must be read from the account, or the export stops
 * matching what a second device would show. `DocxGeneratorSettings` is built in
 * exactly one place below so this stays checkable at a glance.
 *
 * WHY IT IS BOUNDED HERE RATHER THAN IN THE GENERATOR
 *
 * This is the trust boundary. The value arrives as arbitrary JSON from the
 * network — it need not be a string, need not be an image, and need not be
 * small. `docx-modern.ts` does recognise a handful of image prefixes, but it is
 * downstream of a `Buffer.from(value, 'base64')` sized entirely by the caller,
 * and it is one generator rather than the door every generator comes through.
 */

// The bound itself, its accepted types and its size limit: `docx-photo-bound.ts`.

// ============================================================
// SHARED LOGIC: Resolve the resume's layout and generate the DOCX
// ============================================================

async function handleDocxGeneration(
  request: NextRequest,
  id: string,
  body?: { photoBase64?: unknown }
): Promise<NextResponse> {
  const supabase = await createServerSupabaseClient()

  // Check authentication.
  //
  // Four `JSON.parse` calls used to run on unvalidated QUERY PARAMETERS above
  // this check, so a malformed one turned an unauthenticated request into a
  // 500. Those parameters are gone, and with them that surface.
  //
  // Narrowed, not closed. `POST` still awaits `request.json()` before this
  // function is entered, so an unauthenticated caller can still make the
  // server parse a body of any size — App Router route handlers impose no
  // default cap, and the 9 MB photo case in `e2e/docx-export-layout.spec.ts`
  // shows a large one is accepted. That is unchanged from before this story
  // and is not this story's to fix; a body bound needs its own.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch resume
  const result: any = await supabase
    .from('resumes')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (result.error || !result.data) {
    return NextResponse.json({ error: 'Resume not found' }, { status: 404 })
  }

  const resume = result.data

  /**
   * The layout, from the record.
   *
   * `resolveResumeLayout` is the one precedence rule, shared with the editor
   * and the preview, so an export cannot disagree with what those surfaces
   * render. The cache argument is `null` because there is no browser here —
   * server-side the rule collapses to defaults, then the legacy
   * `custom_sections.layoutSettings` blob, then `layout_settings`.
   *
   * That absent cache is the whole point of the story. The browser used to
   * describe its layout to this route in fourteen query parameters; it no
   * longer does, so a DOCX requested from a device that has never opened this
   * resume comes out of the account's settings rather than out of defaults.
   */
  const layout = resolveResumeLayout(resume, null)

  /**
   * The one thing still read from the query string, and it is not layout.
   *
   * `locale` selects the language of generated date strings. It is a property
   * of the REQUEST — which localized route the user is on — not of the resume:
   * the `resumes` table has no locale column, and the same resume is
   * deliberately viewable under `/fr`, `/en`, `/de` and `/it`. There is
   * therefore no record to derive it from, and dropping it would pin every
   * export to French.
   */
  const { searchParams } = new URL(request.url)
  const locale = (searchParams.get('locale') || 'fr') as Locale

  // Build generator settings (shared across all template generators).
  //
  // The arrays are copied rather than passed through: the resolved model hands
  // out the frozen shared defaults by reference where a resume has chosen
  // nothing, and the generators' settings type declares them mutable.
  const settings: DocxGeneratorSettings = {
    fontFamily: layout.fontFamily,
    fontScale: layout.fontScale,
    titleFontSize: layout.titleFontSize,
    contactFontSize: layout.contactFontSize,
    sectionTitleFontSize: layout.sectionTitleFontSize,
    sectionDescFontSize: layout.sectionDescFontSize,
    locale,
    sidebarHue: layout.sidebarHue,
    sidebarSaturation: layout.sidebarSaturation,
    sidebarBrightness: layout.sidebarBrightness,
    sidebarWidth: layout.sidebarWidth,
    sidebarTopMargin: layout.sidebarTopMargin,
    mainContentTopMargin: layout.mainContentTopMargin,
    sidebarOrder: [...layout.sidebarOrder],
    mainContentOrder: [...layout.mainContentOrder],
    hiddenSidebarSections: [...layout.hiddenSidebarSections],
    hiddenMainSections: [...layout.hiddenMainSections],
    // The stored list, not a request value: the body's photo is a transport,
    // and whether it is drawn is decided here by the same list the Preview reads.
    hiddenContactFields: layout.hiddenContactFields,
    photoBase64: boundedPhoto(body?.photoBase64),
  }

  /**
   * The template, from the record.
   *
   * It used to be overridable by a query parameter. Both call sites passed
   * `resume.template` into it, so the browser was echoing this very column
   * back to the server; reading it here directly is the same value by a
   * shorter path, and closes a parameter that could have selected a template
   * the resume is not.
   */
  const template = docxTemplateFor(resume.template)

  // Dispatch to the appropriate template generator
  let buffer: Buffer

  switch (template) {
    case 'professional':
      buffer = await generateProfessionalDocx(resume, settings)
      break

    case 'modern':
      buffer = await generateModernDocx(resume, settings)
      break

    case 'classic':
      buffer = await generateClassicDocx(resume, settings)
      break

    case 'minimal':
      buffer = await generateMinimalDocx(resume, settings)
      break

    case 'creative':
      buffer = await generateCreativeDocx(resume, settings)
      break

    case 'swissVocational':
      buffer = await generateSwissVocationalDocx(resume, settings)
      break

    case 'swissCommerce':
      buffer = await generateSwissCommerceDocx(resume, settings)
      break

    case 'swissTrades':
      buffer = await generateSwissTradesDocx(resume, settings)
      break

    case 'swissHealth':
      buffer = await generateSwissHealthDocx(resume, settings)
      break

    case 'swissFinance':
      buffer = await generateSwissFinanceDocx(resume, settings)
      break

    case 'swissEngineering':
      buffer = await generateSwissEngineeringDocx(resume, settings)
      break

    default:
      // Fallback to professional for any unknown template
      buffer = await generateProfessionalDocx(resume, settings)
      break
  }

  // Return as downloadable file
  return new NextResponse(buffer as any, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${resume.title || 'resume'}.docx"`,
    },
  })
}

// ============================================================
// GET HANDLER — backward-compatible (no photo support)
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    return await handleDocxGeneration(request, id)
  } catch (error) {
    console.error('Error generating Word document:', error)
    return NextResponse.json(
      { error: 'Failed to generate Word document' },
      { status: 500 }
    )
  }
}

// ============================================================
// POST HANDLER — supports photo data in request body
// ============================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Parse body for photo data. Typed as `unknown` because it is: whatever
    // the caller sent, bounded by `boundedPhoto` before it goes any further.
    let body: { photoBase64?: unknown } = {}
    try {
      body = await request.json()
    } catch {
      // If body parsing fails, continue without photo
    }

    return await handleDocxGeneration(request, id, body)
  } catch (error) {
    console.error('Error generating Word document:', error)
    return NextResponse.json(
      { error: 'Failed to generate Word document' },
      { status: 500 }
    )
  }
}
