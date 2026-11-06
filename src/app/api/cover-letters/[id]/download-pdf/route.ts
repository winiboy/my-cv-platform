import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  COVER_LETTER_EXPORT_COLUMNS,
  MAX_COVER_LETTER_EXPORT_REQUEST_BYTES,
  coverLetterExportLanguage,
} from '@/lib/cover-letter-pdf-html'
import { coverLetterRequestLanguage } from '@/lib/cover-letter-language'
import { isCoverLetterWithinPdfGuard } from '@/lib/cover-letter-limits'
import { effectiveSenderDetails } from '@/lib/cover-letter-sender'
import { pdfContentDisposition } from '@/lib/pdf/filename'
import { readBoundedBody } from '@/lib/pdf/payload'
import { renderCoverLetterPdf } from '@/lib/pdf/render-cover-letter'
import { PdfRenderError } from '@/lib/pdf/render-preview'
import { tryAcquirePdfRenderSlot } from '@/lib/pdf/render-slots'

/**
 * POST /api/cover-letters/[id]/download-pdf
 *
 * The SAVED cover letter as a PDF file, printed server-side from the export's
 * own markup (see `src/lib/pdf/render-cover-letter.ts`). The request carries
 * the id and, in its JSON body, the page's `locale`: the letter is read from
 * the database with the user's session, so an unsaved edit in the browser is
 * never what is printed. The locale only chooses the wording of the date,
 * subject and default formulas when the letter's own language cannot be told
 * (`coverLetterLanguage`). The sender details are the stored ones with the
 * linked CV's contact as fallback (`effectiveSenderDetails`), the CV read with
 * the same session and owner filter as the letter.
 *
 * Order of checks, cheapest and least revealing first: session (401), JSON
 * content type (415), a body within `MAX_COVER_LETTER_EXPORT_REQUEST_BYTES`
 * (413) that is JSON (400), id shape and ownership (404, the same for a letter
 * that does not exist and one that belongs to someone else), the letter's size
 * (422, only for a row far beyond any real letter), a free render slot (503).
 * No browser is launched until all of them pass.
 */

// A headless browser needs Node APIs, and is far beyond the default duration.
export const runtime = 'nodejs'
export const maxDuration = 60

/** The whole render, browser launch included; the resume PDF's budget. */
const RENDER_TIMEOUT_MS = 30_000

/** The file name when the title has nothing usable left once cleaned. */
const FALLBACK_FILENAME = 'cover-letter'

const idSchema = z.uuid()

const json = (error: string, status: number, headers?: HeadersInit) =>
  NextResponse.json({ error }, { status, headers })

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return json('Unauthorized', 401)

    // A JSON request only, as for the resume PDF: a cross-site HTML form
    // cannot send this type, so it cannot make this server start a browser.
    const contentType = request.headers.get('content-type') ?? ''
    if (!/^application\/json\s*(?:;|$)/i.test(contentType)) return json('Unsupported Media Type', 415)

    // The page's language, for a letter whose own language cannot be told.
    const body = await readBoundedBody(request, MAX_COVER_LETTER_EXPORT_REQUEST_BYTES)
    if (!body.ok) return json('Payload too large', 413)
    let parsedBody: unknown
    try {
      parsedBody = JSON.parse(body.text)
    } catch {
      return json('Invalid request body', 400)
    }
    const pageLanguage = coverLetterRequestLanguage(parsedBody)

    if (!idSchema.safeParse(id).success) return json('Cover letter not found', 404)

    // RLS already hides other users' rows; the explicit owner filter does not
    // rely on it.
    const { data: coverLetter, error } = await supabase
      .from('cover_letters')
      .select(COVER_LETTER_EXPORT_COLUMNS)
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) {
      console.error('Cover letter PDF route: reading the letter failed:', error.code ?? 'unknown code')
      return json('Failed to generate PDF', 500)
    }
    if (!coverLetter) return json('Cover letter not found', 404)

    // Before a slot is taken: a row far beyond any real letter must not hold the
    // browser every other PDF export shares. A resource bound, not a content
    // rule: see `COVER_LETTER_PDF_GUARD`.
    if (!isCoverLetterWithinPdfGuard(coverLetter)) return json('Cover letter too large to export', 422)

    // Read before a slot is taken, so no slot waits on the database.
    const senderDetails = effectiveSenderDetails(
      coverLetter,
      await linkedResumeContact(supabase, coverLetter.resume_id, user.id),
    )

    const slot = tryAcquirePdfRenderSlot()
    if (!slot) return json('Too many PDF renders in progress', 503, { 'Retry-After': '5' })
    const { language, currentDate } = coverLetterExportLanguage(coverLetter, pageLanguage, new Date())
    let pdf: Buffer
    try {
      pdf = await renderCoverLetterPdf({
        coverLetter,
        senderDetails,
        currentDate,
        language,
        timeoutMs: RENDER_TIMEOUT_MS,
      })
    } catch (renderError) {
      logRenderFailure(renderError)
      return json('Failed to generate PDF', renderError instanceof PdfRenderError && renderError.stage === 'timeout' ? 504 : 500)
    } finally {
      slot.release()
    }

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': pdfContentDisposition(coverLetter.title, FALLBACK_FILENAME),
        'Content-Length': String(pdf.byteLength),
        // One user's letter.
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('Cover letter PDF route failed:', error instanceof Error ? error.name : 'unknown error')
    return json('Failed to generate PDF', 500)
  }
}

/**
 * The `contact` of the CV linked to the letter, the sender details' fallback;
 * `null` when the letter has no CV, the CV is gone, or it cannot be read. The
 * export never fails for want of it: the letter then prints its stored
 * details only. RLS hides other users' CVs; the explicit owner filter does
 * not rely on it.
 */
async function linkedResumeContact(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  resumeId: string | null,
  userId: string,
): Promise<unknown> {
  if (!resumeId) return null
  try {
    const { data, error } = await supabase
      .from('resumes')
      .select('contact')
      .eq('id', resumeId)
      .eq('user_id', userId)
      .maybeSingle()
    if (error) {
      console.error('Cover letter PDF route: reading the linked CV failed:', error.code ?? 'unknown code')
      return null
    }
    return data?.contact ?? null
  } catch (readError) {
    console.error('Cover letter PDF route: reading the linked CV failed:', readError instanceof Error ? readError.name : 'unknown error')
    return null
  }
}

/**
 * The stage and the cause's error NAME only. A browser error's message can
 * quote what it was evaluating, and here that is the user's letter, which is
 * never logged.
 */
function logRenderFailure(error: unknown): void {
  const stage = error instanceof PdfRenderError ? error.stage : 'unknown'
  const cause = error instanceof PdfRenderError ? error.cause : error
  console.error(`Cover letter PDF render failed at ${stage}.`, cause instanceof Error ? cause.name : '')
}
