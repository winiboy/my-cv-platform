import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { COVER_LETTER_EXPORT_COLUMNS, formatCoverLetterPdfDate } from '@/lib/cover-letter-pdf-html'
import { isCoverLetterWithinPdfGuard } from '@/lib/cover-letter-limits'
import { attachmentContentDisposition } from '@/lib/pdf/filename'
import { CoverLetterDocxTooLargeError, buildCoverLetterDocx } from './cover-letter-docx'

/**
 * POST /api/cover-letters/[id]/download-docx
 *
 * The SAVED cover letter as a Word file, built server-side with the `docx`
 * library from the same parts as its PDF (see `cover-letter-docx.ts`). The
 * request carries nothing but the id: the letter is read from the database
 * with the user's session, so an unsaved edit in the browser is never what is
 * exported.
 *
 * The checks of the PDF route, in the same order: session (401), JSON content
 * type (415, so a cross-site form cannot trigger it), id shape and ownership
 * (404, the same for a letter that does not exist and one that belongs to
 * someone else), the letter's size (422). Nothing is built until all of them
 * pass. The builder's own paragraph bound
 * (`COVER_LETTER_DOCX_LIMITS`) answers 422 as well.
 */

export const runtime = 'nodejs'

/** The file name when the title has nothing usable left once cleaned. */
const FALLBACK_FILENAME = 'cover-letter'

const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const idSchema = z.uuid()

const json = (error: string, status: number) => NextResponse.json({ error }, { status })

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return json('Unauthorized', 401)

    const contentType = request.headers.get('content-type') ?? ''
    if (!/^application\/json\s*(?:;|$)/i.test(contentType)) return json('Unsupported Media Type', 415)

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
      console.error('Cover letter DOCX route: reading the letter failed:', error.code ?? 'unknown code')
      return json('Failed to generate Word document', 500)
    }
    if (!coverLetter) return json('Cover letter not found', 404)

    // The PDF's resource bound: the Word file holds the same parts, so a row
    // the PDF refuses is refused here too, before any work.
    if (!isCoverLetterWithinPdfGuard(coverLetter)) return json('Cover letter too large to export', 422)

    let docx: Buffer
    try {
      docx = await buildCoverLetterDocx({ coverLetter, currentDate: formatCoverLetterPdfDate(new Date()) })
    } catch (buildError) {
      // The Word-specific bound, met while the letter is read and before any
      // paragraph is built: the same answer as the size guard.
      if (buildError instanceof CoverLetterDocxTooLargeError) return json('Cover letter too large to export', 422)
      // The error's NAME only: its message could quote the letter.
      console.error('Cover letter DOCX build failed.', buildError instanceof Error ? buildError.name : 'unknown error')
      return json('Failed to generate Word document', 500)
    }

    return new NextResponse(new Uint8Array(docx), {
      headers: {
        'Content-Type': DOCX_CONTENT_TYPE,
        'Content-Disposition': attachmentContentDisposition(coverLetter.title, FALLBACK_FILENAME, 'docx'),
        'Content-Length': String(docx.byteLength),
        // One user's letter.
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('Cover letter DOCX route failed:', error instanceof Error ? error.name : 'unknown error')
    return json('Failed to generate Word document', 500)
  }
}
