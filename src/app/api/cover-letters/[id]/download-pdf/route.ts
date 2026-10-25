import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { formatCoverLetterPdfDate } from '@/lib/cover-letter-pdf-html'
import { isCoverLetterWithinPdfGuard } from '@/lib/cover-letter-limits'
import { pdfContentDisposition } from '@/lib/pdf/filename'
import { renderCoverLetterPdf } from '@/lib/pdf/render-cover-letter'
import { PdfRenderError } from '@/lib/pdf/render-preview'
import { tryAcquirePdfRenderSlot } from '@/lib/pdf/render-slots'

/**
 * POST /api/cover-letters/[id]/download-pdf
 *
 * The SAVED cover letter as a PDF file, printed server-side from the export's
 * own markup (see `src/lib/pdf/render-cover-letter.ts`). The request carries
 * nothing but the id: the letter is read from the database with the user's
 * session, so an unsaved edit in the browser is never what is printed.
 *
 * Order of checks, cheapest and least revealing first: session (401), JSON
 * content type (415), id shape and ownership (404, the same for a letter that
 * does not exist and one that belongs to someone else), the letter's size
 * (422, only for a row far beyond any real letter), a free render slot (503). No
 * browser is launched until all of them pass.
 */

// A headless browser needs Node APIs, and is far beyond the default duration.
export const runtime = 'nodejs'
export const maxDuration = 60

/** The whole render, browser launch included; the resume PDF's budget. */
const RENDER_TIMEOUT_MS = 30_000

/** The file name when the title has nothing usable left once cleaned. */
const FALLBACK_FILENAME = 'cover-letter'

/**
 * What the PDF prints, and the title it is named after. Nothing else is read.
 * One literal, so supabase-js can type the row from it.
 */
const PDF_COLUMNS =
  'title, sender_name, recipient_name, recipient_title, company_name, company_address, job_title, greeting, opening_paragraph, body_paragraphs, closing_paragraph, sign_off'

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

    if (!idSchema.safeParse(id).success) return json('Cover letter not found', 404)

    // RLS already hides other users' rows; the explicit owner filter does not
    // rely on it.
    const { data: coverLetter, error } = await supabase
      .from('cover_letters')
      .select(PDF_COLUMNS)
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

    const slot = tryAcquirePdfRenderSlot()
    if (!slot) return json('Too many PDF renders in progress', 503, { 'Retry-After': '5' })
    let pdf: Buffer
    try {
      pdf = await renderCoverLetterPdf({
        coverLetter,
        currentDate: formatCoverLetterPdfDate(new Date()),
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
 * The stage and the cause's error NAME only. A browser error's message can
 * quote what it was evaluating, and here that is the user's letter, which is
 * never logged.
 */
function logRenderFailure(error: unknown): void {
  const stage = error instanceof PdfRenderError ? error.stage : 'unknown'
  const cause = error instanceof PdfRenderError ? error.cause : error
  console.error(`Cover letter PDF render failed at ${stage}.`, cause instanceof Error ? cause.name : '')
}
