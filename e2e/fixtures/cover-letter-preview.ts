import { expect, type Locator } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, assertLocalSupabase } from '../../src/test/local-stack'

/**
 * Seeding and geometry shared by the cover-letter preview specs
 * (cover-letter-preview-and-card-language): the preview window and its zoom.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E cover letter preview')

export function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** The letter's last line: the sender's name, under the sign-off. */
export const SENDER_NAME = 'Zoë Lovelace'

/** Enough body text that the letter runs well past one window's height, and past its first page. */
const LONG_BODY = Array.from(
  { length: 12 },
  (_, index) =>
    `<p>Paragraph ${index + 1}: over several years I have led projects from their first sketch to their release, ` +
    'working with designers, engineers and clients to ship reliable software on time and within budget, ' +
    'and I would bring the same care and attention to detail to your team.</p>',
)

/** Inserts a long English letter for `userId` and returns its id. */
export async function insertLetter(userId: string): Promise<string> {
  const { data, error } = await admin()
    .from('cover_letters')
    .insert({
      user_id: userId,
      title: 'Preview window letter',
      sender_name: SENDER_NAME,
      company_name: 'Acme SA',
      job_title: 'Software Engineer',
      greeting: 'Dear Hiring Manager,',
      opening_paragraph: '<p>I am writing to apply for the Software Engineer position at Acme SA.</p>',
      body_paragraphs: LONG_BODY,
      closing_paragraph: '<p>Thank you for your time and consideration.</p>',
      sign_off: 'Sincerely,',
    })
    .select('id')
    .single()
  expect(error, error?.message).toBeNull()
  return (data as { id: string }).id
}

/** The element's visible rectangle, in viewport pixels. */
export async function rect(locator: Locator) {
  return locator.evaluate((element) => {
    const { top, bottom, left, right, width, height } = element.getBoundingClientRect()
    return { top, bottom, left, right, width, height }
  })
}

export type Box = Awaited<ReturnType<typeof rect>>
