import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { toLocale } from '@/lib/i18n'
import { pdfContentDisposition } from '@/lib/pdf/filename'
import { MAX_PDF_REQUEST_BYTES, parsePdfRequestBody, readBoundedBody } from '@/lib/pdf/payload'
import { resolveRenderOrigin, selectSessionCookies } from '@/lib/pdf/render-policy'
import { PdfRenderError, renderPreviewPdf } from '@/lib/pdf/render-preview'

/**
 * POST /api/resumes/[id]/download-pdf?locale=fr
 *
 * The resume's PDF, as the Preview page prints it: the route opens that very
 * page in a headless Chromium, signed in as the requesting user, and prints it
 * (see `src/lib/pdf/render-preview.ts`). The body optionally carries the two
 * things only the browser holds — `{ draft, photoBase64 }`, the
 * `resume_draft_${id}` and `resume_photo_${id}` localStorage values — and is
 * bounded and validated by `src/lib/pdf/payload.ts`.
 *
 * Order of checks, cheapest and least revealing first: session (401), JSON
 * content type (415), ownership (404), body size and shape (413, 400). No
 * browser is launched until all of them pass.
 *
 * Nothing is persisted: the stored resume is read, never written, and the
 * renderer's network policy refuses every write the page could attempt.
 */

// A headless browser needs Node APIs, and is far beyond the default duration.
export const runtime = 'nodejs'
export const maxDuration = 60

/** The whole render, browser launch included. Under `maxDuration`, with room for the checks before it. */
const RENDER_TIMEOUT_MS = 30_000

/**
 * Renders one instance runs at once. Each is a Chromium process; a burst of
 * requests beyond this is told to retry rather than allowed to exhaust memory.
 */
const MAX_CONCURRENT_RENDERS = 2
let activeRenders = 0

/**
 * The session must outlive the render by this much.
 *
 * The renderer's page asks the server for the Preview with the user's session.
 * If the access token were close enough to expiry for that request to refresh
 * it, the refresh would rotate the refresh token inside the headless browser,
 * where the new one is thrown away — leaving the user's own browser holding a
 * spent token. So a session closer to expiry than this is refreshed here,
 * where the new cookies reach both the renderer and, through this response,
 * the user. 90 s is supabase-js's own refresh margin.
 */
const SESSION_HEADROOM_MS = RENDER_TIMEOUT_MS + 90_000 + 30_000

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

    // A JSON body only. Besides stating the contract, this keeps a cross-site
    // HTML form from triggering a render: a form cannot send this type.
    const contentType = request.headers.get('content-type') ?? ''
    if (!/^application\/json\s*(?:;|$)/i.test(contentType)) return json('Unsupported Media Type', 415)

    const { data: resume, error } = await supabase
      .from('resumes')
      .select('id, title')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()
    if (error || !resume) return json('Resume not found', 404)

    const body = await readBoundedBody(request, MAX_PDF_REQUEST_BYTES)
    if (!body.ok) return json('Payload too large', 413)
    const content = parsePdfRequestBody(body.text, resume.id, user.id)
    if (!content.ok) return json(content.reason, content.status)

    const origin = resolveRenderOrigin({
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
      authUrl: process.env.NEXTAUTH_URL,
      vercelEnv: process.env.VERCEL_ENV,
      vercelUrl: process.env.VERCEL_URL,
    })
    if (!origin) {
      console.error('PDF route: no valid trusted origin to render from (VERCEL_URL on a preview, else NEXT_PUBLIC_APP_URL or NEXTAUTH_URL).')
      return json('Service unavailable', 503)
    }
    const protectionBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || undefined

    const { error: sessionError } = await ensureSessionHeadroom(supabase)
    if (sessionError) return json('Unauthorized', 401)

    // Read after the checks above, which may have refreshed the session: the
    // cookie store then holds the new tokens, and those are what the page needs.
    const sessionCookies = selectSessionCookies((await cookies()).getAll())

    // Checked and claimed with no await in between, so two requests cannot
    // both take the last slot.
    if (activeRenders >= MAX_CONCURRENT_RENDERS) {
      return json('Too many PDF renders in progress', 503, { 'Retry-After': '5' })
    }
    activeRenders++
    let pdf: Buffer
    try {
      pdf = await renderPreviewPdf({
        origin,
        locale: toLocale(request.nextUrl.searchParams.get('locale') ?? ''),
        resumeId: resume.id,
        sessionCookies,
        draft: content.draft,
        photo: content.photo,
        protectionBypassSecret,
        timeoutMs: RENDER_TIMEOUT_MS,
      })
    } catch (renderError) {
      logRenderFailure(renderError, [...sessionCookies.map(({ value }) => value), protectionBypassSecret])
      return json('Failed to generate PDF', renderError instanceof PdfRenderError && renderError.stage === 'timeout' ? 504 : 500)
    } finally {
      activeRenders--
    }

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': pdfContentDisposition(resume.title),
        'Content-Length': String(pdf.byteLength),
        // The document is one user's CV, rendered from their session.
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('PDF route failed:', error instanceof Error ? error.name : 'unknown error')
    return json('Failed to generate PDF', 500)
  }
}

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabaseClient>>

/**
 * Refresh the session now if it would expire during the render. See
 * `SESSION_HEADROOM_MS`. `getSession` is read for its expiry only; who the user
 * is was settled by `getUser` above.
 */
async function ensureSessionHeadroom(supabase: ServerSupabase): Promise<{ error: unknown }> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()
  if (error || !session) return { error: error ?? new Error('No session') }

  const expiresAtMs = (session.expires_at ?? 0) * 1000
  if (expiresAtMs - Date.now() > SESSION_HEADROOM_MS) return { error: null }

  const { error: refreshError } = await supabase.auth.refreshSession()
  return { error: refreshError }
}

/**
 * Log a failed render without anything the request carried.
 *
 * The stage says where it failed; the cause's message says why, with every
 * forwarded cookie value and the protection bypass secret cut out of it
 * first, so neither can reach a log however a browser error happens to be
 * worded. Resume content is never part of these messages: the page is
 * addressed by id only.
 */
function logRenderFailure(error: unknown, secrets: readonly (string | undefined)[]): void {
  const redact = (text: string) =>
    secrets.reduce<string>((result, secret) => (secret ? result.split(secret).join('[redacted]') : result), text)
  const stage = error instanceof PdfRenderError ? error.stage : 'unknown'
  const cause = error instanceof PdfRenderError ? error.cause : error
  const detail = cause instanceof Error ? `${cause.name}: ${redact(cause.message.split('\n')[0])}` : ''
  console.error(`PDF render failed at ${stage}.`, detail)
}
