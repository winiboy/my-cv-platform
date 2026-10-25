import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * GET /api/resumes
 *
 * The caller's own CVs, most recently updated first, with only what a picker
 * shows: `id`, `title` and `updated_at`. Used by "Lier un CV existant" on a
 * Kanban card (job-cv-linking US-002), which, like the rest of the board,
 * talks to the server through API routes rather than the browser client.
 *
 * Filtered on the session's user explicitly, on top of RLS.
 */

export const dynamic = 'force-dynamic'

export interface ResumeListItem {
  id: string
  title: string
  updated_at: string
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('resumes')
      .select('id, title, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('[resumes GET] Error loading resumes:', error.code)
      return NextResponse.json({ error: 'Failed to load resumes' }, { status: 500 })
    }

    const resumes: ResumeListItem[] = data ?? []
    return NextResponse.json({ resumes })
  } catch (error) {
    console.error('[resumes GET] Unexpected error:', error instanceof Error ? error.name : 'unknown')
    return NextResponse.json({ error: 'Failed to load resumes' }, { status: 500 })
  }
}
