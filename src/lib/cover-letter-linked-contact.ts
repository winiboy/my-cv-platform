import type { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * SERVER ONLY: reads with the request's Supabase session. Shared by the letter
 * exports (PDF and Word), so both print the same sender details
 * (`effectiveSenderDetails`) for the same stored letter.
 */

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

/**
 * The `contact` of the CV linked to the letter, the sender details' fallback;
 * `null` when the letter has no CV, the CV is gone, or it cannot be read. The
 * export never fails for want of it: the letter then prints its stored
 * details only. RLS hides other users' CVs; the explicit owner filter does
 * not rely on it.
 *
 * Logs only an error code or name, prefixed with `logLabel` (the route), never
 * a message, which could quote the CV.
 */
export async function linkedResumeContact(
  supabase: ServerSupabaseClient,
  resumeId: string | null,
  userId: string,
  logLabel: string,
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
      console.error(`${logLabel}: reading the linked CV failed:`, error.code ?? 'unknown code')
      return null
    }
    return data?.contact ?? null
  } catch (readError) {
    console.error(`${logLabel}: reading the linked CV failed:`, readError instanceof Error ? readError.name : 'unknown error')
    return null
  }
}
