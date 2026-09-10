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

// ============================================================
// SUPPORTED TEMPLATES
// ============================================================
const SUPPORTED_TEMPLATES = ['professional', 'modern', 'classic', 'minimal', 'creative'] as const
type TemplateId = (typeof SUPPORTED_TEMPLATES)[number]

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

/**
 * The largest photo payload this route will look at, in base64 characters.
 *
 * Sized to be unreachable by any photo the application can legitimately
 * produce, so that it can never cost a user their photo, while still bounding
 * what an attacker can make this process decode.
 *
 * The application's own limit is 2 MB of BINARY, enforced on the file picker in
 * `modern-template.tsx`. Base64 inflates that by 4/3, to roughly 2.8 MB of
 * characters. The stored value can legitimately be larger than the uploaded
 * file — background removal re-encodes the image as PNG and writes the result
 * back under the same key — so the bound is set well above that re-encode
 * rather than at the upload limit itself.
 *
 * 8 MB of characters is also above what a browser could have stored: the value
 * is held in localStorage, whose per-origin quota is around 5 MB in every
 * engine the application targets. A request over this bound therefore did not
 * come from this application's own storage.
 */
const MAX_PHOTO_BASE64_LENGTH = 8 * 1024 * 1024

/**
 * The image data-URL forms `docx-modern.ts` can actually decode.
 *
 * A superset check, not a second implementation of the generator's own
 * detection: anything accepted here is still identified — or rejected — there.
 * Kept as a superset deliberately, so that narrowing this list is the only way
 * to lose a photo that used to work, and so a format the generator drops
 * cannot be smuggled past on the strength of its prefix alone.
 */
const SUPPORTED_PHOTO_DATA_URL = /^data:image\/(?:jpeg|jpg|png|gif|bmp);base64,/

/** Base64 as `FileReader` and `btoa` emit it: no whitespace, no line breaks. */
const BASE64_PAYLOAD = /^[A-Za-z0-9+/]+={0,2}$/

/**
 * The photo, if the request carried one this route is willing to hand on.
 *
 * Returns `undefined` for anything unusable rather than failing the request.
 * That is the behaviour a caller already gets for an unrecognised image — the
 * generator skips it and produces the document without a photo — and matching
 * it means this bound cannot turn an export that used to succeed into an error
 * response. The document is still produced; it simply has no photo in it.
 */
function boundedPhoto(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (value.length === 0 || value.length > MAX_PHOTO_BASE64_LENGTH) return undefined

  // A supported data URL contributes its prefix; anything else must be raw
  // base64 in full. An unsupported data URL (`data:image/svg+xml;base64,...`,
  // say) reaches the payload check with its own prefix still attached and
  // fails it on the characters that prefix contains.
  const prefix = SUPPORTED_PHOTO_DATA_URL.exec(value)
  const payload = prefix ? value.slice(prefix[0].length) : value

  if (payload.length === 0 || !BASE64_PAYLOAD.test(payload)) return undefined
  return value
}

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
    /**
     * Always true, and that is what it already was for every real export.
     *
     * This flag used to mean "the browser sent colour parameters", which
     * `docx-modern.ts` reads as "the user chose these colours". It was never a
     * record of a user's choice, only of whether the request happened to
     * mention colour.
     *
     * TWO colours move with it, not one. The same `else` branch
     * (`docx-modern.ts:336-338`) pins the sidebar to a flat #333333 AND the
     * accent to #D4A843; the `if` derives both from the resolved HSL, the
     * sidebar through `hslToHex` and the accent through
     * `deriveAccentColorHex`. Anyone auditing the residual, or retiring the
     * branch in the modern story, is looking at a pair.
     *
     * It was true in every reachable flow. The Word button exists on the two
     * preview pages and nowhere else, both mount `resume-preview-wrapper.tsx`,
     * and that wrapper caches the COMPLETE resolved model — all three colour
     * properties included — before any click is possible. The parameters were
     * therefore always present, and the false branch was reached only when
     * localStorage was unavailable.
     *
     * The Preview agrees with true and not with false, for both. The wrapper
     * always passes `hsl(...)` built from the resolved values, and
     * `modern-template.tsx:191` derives its accent from that very string via
     * `deriveAccentColor` — so neither #333333 nor #D4A843 is a colour the
     * on-screen document can show, and both moves are toward Preview parity
     * rather than away from it. Per `.claude/rules/exports.md` the Preview is
     * the fidelity contract, which makes the false branch a mismatch rather
     * than a feature.
     *
     * Left as a constant here rather than removed: the flag lives in
     * `DocxGeneratorSettings` and is read inside `docx-modern.ts`, and the
     * generators belong to US-003 to US-007. Retiring the dead branch is
     * recorded for the modern story.
     */
    hasCustomColors: true,
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
  const templateRaw = resume.template || 'professional'
  const template = (SUPPORTED_TEMPLATES as readonly string[]).includes(templateRaw)
    ? (templateRaw as TemplateId)
    : 'professional'

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
