import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { linkResumeToJobApplication } from '@/lib/job-applications/link-resume'

/**
 * POST /api/job-applications/[id]/link-resume
 *
 * Links one of the caller's existing CVs to one of the caller's job
 * applications, both ways ("Lier un CV existant" on a Kanban card,
 * job-cv-linking US-002). The client sends identifiers only (FR-1):
 * the application in the path and `{ resumeId }` in the body. Ownership of
 * both is enforced by `linkResumeToJobApplication`, with the session's user.
 *
 * 200 `{ resume: { id, title, template } }`: the linked CV, for the card's
 * badge. 400 for ids that are not UUIDs; 404 for an application or a CV that
 * is missing or another user's, alike, so another user's ids cannot be told
 * apart from unknown ones; 500 when the link could not be written, in which
 * case the previous links are kept. Step names and database codes are
 * logged, never CV or offer content.
 */

export const dynamic = 'force-dynamic'

const LOG_PREFIX = '[job-applications/link-resume]'

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({ resumeId: z.uuid() })

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsedParams = paramsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: 'Invalid job application id' }, { status: 400 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsedBody = bodySchema.safeParse(body)
    if (!parsedBody.success) {
      return NextResponse.json({ error: 'Invalid resume id' }, { status: 400 })
    }

    const result = await linkResumeToJobApplication(supabase, {
      userId: user.id,
      resumeId: parsedBody.data.resumeId,
      jobApplicationId: parsedParams.data.id,
    })

    if (result.ok) {
      // The link the caller asked for is written either way; a previous link
      // that could not be cleared is logged.
      if (result.staleLink) {
        console.error(`${LOG_PREFIX} Linked, but a previous link could not be cleared:`, result.staleLink.step, result.staleLink.code)
      }
      return NextResponse.json({ resume: result.resume })
    }

    if ((result.step === 'load_application' || result.step === 'load_resume') && result.code === null) {
      return NextResponse.json(
        { error: result.step === 'load_application' ? 'Job application not found' : 'Resume not found' },
        { status: 404 }
      )
    }

    console.error(`${LOG_PREFIX} Link failed:`, result.step, result.code)
    return NextResponse.json({ error: 'Failed to link resume' }, { status: 500 })
  } catch (error) {
    console.error(`${LOG_PREFIX} Unexpected error:`, error instanceof Error ? error.name : 'unknown')
    return NextResponse.json({ error: 'Failed to link resume' }, { status: 500 })
  }
}
