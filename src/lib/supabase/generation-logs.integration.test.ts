/**
 * Integration test for the cv_generation_logs write path.
 *
 * This exists for one acceptance criterion of Phase 26 / US-004 (finding D3):
 * after cv_generation_logs_user_id_fkey is repointed from auth.users(id) to
 * public.profiles(id), the application must still be able to write a log for an
 * authenticated user. That is a claim about application code, so it is asserted
 * where application code runs, against the real local stack: the real function,
 * the real client, real RLS, and the real foreign key. The SQL-level evidence
 * for the constraint itself lives in supabase/tests/rls-audit.sql; neither
 * suite substitutes for the other.
 *
 * WHY THESE READ THE ROW BACK RATHER THAN AWAITING THE CALL.
 *
 * logGenerationAttempt is deliberately fail-safe: it catches every error, logs
 * to the console and resolves regardless, so that audit logging can never break
 * the generation flow it observes. The promise resolving therefore proves
 * nothing - it resolves identically when the insert was rejected. The only
 * assertion that distinguishes the two is reading the row back, so that is what
 * these tests do. console.error is captured as well, so a silent failure
 * surfaces as the database's own message rather than an unexplained empty read.
 *
 * The positive read-back goes through the owner's own RLS-subject client, so it
 * exercises the SELECT policy the application relies on; a service-role read
 * would confirm the row exists while saying nothing about whether its owner can
 * see it. The negative case inverts that and reads as service-role on purpose:
 * an RLS-subject read returns 0 rows both when nothing was written and when
 * something was written but is invisible, which are not the same outcome.
 *
 * Each test owns its own resume, so none depends on the rows another left
 * behind or on the order they run in.
 *
 * The table is absent from src/types/supabase.ts - the generated types have not
 * been regenerated since migration 005, which is why the function under test
 * carries a type assertion. Regenerating them and removing that assertion are
 * both explicitly out of scope here, so this test casts at the same seam rather
 * than changing the source.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  adminClient,
  assertStackReachable,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from '@/test/integration/supabase'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { logGenerationAttempt } from './generation-logs'

const asClient = vi.mocked(createServerSupabaseClient)

/** Act as this user for the next call into the module under test. */
function actAs(user: TestUser) {
  asClient.mockResolvedValue(user.client as never)
}

interface GenerationLogRow {
  id: string
  user_id: string
  resume_id: string
  job_id: string | null
  score: number | null
  iteration: number
}

const LOG_COLUMNS = 'id, user_id, resume_id, job_id, score, iteration'

/**
 * Read cv_generation_logs through a client whose generated types do not
 * describe it. Confined to this helper so the cast appears exactly once.
 */
function readLogs(
  client: TestUser['client'],
  resumeId: string
): PromiseLike<{ data: GenerationLogRow[] | null; error: { message: string } | null }> {
  return (client as unknown as SupabaseClient)
    .from('cv_generation_logs')
    .select(LOG_COLUMNS)
    .eq('resume_id', resumeId)
    .returns<GenerationLogRow[]>()
}

describe('logGenerationAttempt', () => {
  let alice: TestUser
  let consoleError: ReturnType<typeof vi.spyOn>

  /** resume_id is NOT NULL and references public.resumes, so a log needs a parent. */
  async function seedResume(owner: TestUser, title: string): Promise<string> {
    const { data, error } = await owner.client
      .from('resumes')
      .insert({ user_id: owner.id, title })
      .select('id')
      .single()
    if (error || !data) {
      throw new Error(`Could not seed resume "${title}": ${error?.message ?? 'no row returned'}`)
    }
    return data.id
  }

  beforeAll(async () => {
    await assertStackReachable()
    alice = await createTestUser()
  })

  afterAll(async () => {
    // Deleting the user removes her resumes and their logs by cascade.
    if (alice) await deleteTestUser(alice.id)
  })

  afterEach(() => {
    consoleError?.mockRestore()
  })

  it('writes a log row that the owner can read back', async () => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const resumeId = await seedResume(alice, 'generation log parent')
    actAs(alice)

    await logGenerationAttempt({
      userId: alice.id,
      resumeId,
      jobId: 'adzuna-1234',
      score: 72,
      gaps: [{ type: 'skill', description: 'Missing Python experience' }],
      iteration: 2,
    })

    // The function swallows errors, so surface the reason before asserting on
    // the row - otherwise a rejected insert shows up only as an empty read.
    expect(consoleError).not.toHaveBeenCalled()

    const { data, error } = await readLogs(alice.client, resumeId)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0]).toMatchObject({
      user_id: alice.id,
      resume_id: resumeId,
      job_id: 'adzuna-1234',
      score: 72,
      iteration: 2,
    })
  })

  it('applies its documented defaults for the optional fields', async () => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const resumeId = await seedResume(alice, 'defaults parent')
    actAs(alice)

    await logGenerationAttempt({ userId: alice.id, resumeId })

    expect(consoleError).not.toHaveBeenCalled()

    const { data } = await readLogs(alice.client, resumeId)

    expect(data).toHaveLength(1)
    expect(data?.[0]).toMatchObject({
      user_id: alice.id,
      job_id: null,
      score: null,
      iteration: 1,
    })
  })

  it('does not write a log owned by a different user', async () => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const resumeId = await seedResume(alice, 'forgery target')
    const bob = await createTestUser()

    try {
      // Bob's session, Alice's id in the payload. The INSERT policy checks
      // auth.uid() = user_id, so this must not produce a row. The function
      // swallows the refusal, which is why the assertion is on the table.
      actAs(bob)
      await logGenerationAttempt({ userId: alice.id, resumeId })

      const { data } = await readLogs(
        adminClient() as unknown as TestUser['client'],
        resumeId
      )
      expect(data).toEqual([])
    } finally {
      await deleteTestUser(bob.id)
    }
  })
})
