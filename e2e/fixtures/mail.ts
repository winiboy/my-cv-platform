/**
 * Reading the mail the local Supabase stack actually sent.
 *
 * WHY THIS EXISTS
 * A password-reset test that stops at "a success message appeared" proves the
 * form submitted. It does not prove an email was sent, that the link in it
 * points anywhere useful, that the locale survived, or that the link works. The
 * local stack runs a mail catcher precisely so those things can be checked
 * rather than assumed, and this module is the only thing standing between the
 * suite and that evidence.
 *
 * WHICH CATCHER
 * Mailpit, on the port `supabase/config.toml` gives `[local_smtp]` — 54324. The
 * Supabase CLI replaced Inbucket with Mailpit and renamed the config section, so
 * an older `[inbucket]` section and the Inbucket REST API (`/api/v1/mailbox/…`)
 * are both gone; that path answers 404 on this stack, measured. The API used
 * here is Mailpit's: `/api/v1/messages`, `/api/v1/message/{id}`.
 *
 * The web UI on the same port is worth knowing about when a test fails: open
 * http://127.0.0.1:54324 and the message this module could not find is either
 * there or it is not, which settles "did the app send it" in one look.
 */

import { expect } from '@playwright/test'
import { assertLocalSupabase, LOCAL_SUPABASE_URL } from '../../src/test/local-stack'

/**
 * Derived from the Supabase URL rather than hardcoded, so a suite pointed at a
 * different local stack does not silently read an empty mailbox belonging to
 * another one and report "no email was sent".
 */
const MAILPIT_URL = (() => {
  const supabaseUrl = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
  assertLocalSupabase(supabaseUrl, 'E2E mail fixture')
  return `http://${new URL(supabaseUrl).hostname}:54324`
})()

interface MailpitSummary {
  readonly ID: string
  readonly To: ReadonlyArray<{ readonly Address: string }>
  readonly Subject: string
}

export interface DeliveredEmail {
  readonly id: string
  readonly to: readonly string[]
  readonly subject: string
  /** The HTML and plain-text parts concatenated, which is what links are hunted in. */
  readonly body: string
}

async function mailpit<T>(path: string): Promise<T> {
  const response = await fetch(`${MAILPIT_URL}${path}`)
  if (!response.ok) {
    throw new Error(
      `Mailpit ${path} answered ${response.status}. Is the local stack's mail catcher ` +
        `running? "pnpm supabase status" lists it; a stack started without it leaves ` +
        `port 54324 closed and every mail assertion in this suite unverifiable.`
    )
  }
  return (await response.json()) as T
}

/**
 * Empty the mailbox.
 *
 * Called before a scenario that is about to assert on "the" message for an
 * address. Addresses are unique per test user, so this is belt and braces rather
 * than load-bearing — but a mailbox holding a hundred messages from previous
 * runs makes every failure here harder to read than it needs to be.
 */
export async function purgeMailbox(): Promise<void> {
  const response = await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' })
  if (!response.ok) {
    throw new Error(`Could not purge the local mailbox: Mailpit answered ${response.status}`)
  }
}

/**
 * The most recent message delivered to `address`, or `null` if there is none.
 *
 * Case-insensitive on the address because SMTP is, and because GoTrue does not
 * promise to preserve the case a caller submitted.
 */
export async function findEmailTo(address: string): Promise<DeliveredEmail | null> {
  const { messages } = await mailpit<{ messages: MailpitSummary[] }>(
    '/api/v1/messages?limit=200'
  )

  const wanted = address.toLowerCase()
  const summary = messages.find((message) =>
    message.To?.some((recipient) => recipient.Address.toLowerCase() === wanted)
  )
  if (!summary) {
    return null
  }

  const full = await mailpit<{ HTML?: string; Text?: string }>(
    `/api/v1/message/${summary.ID}`
  )

  return {
    id: summary.ID,
    to: summary.To.map((recipient) => recipient.Address),
    subject: summary.Subject,
    body: `${full.HTML ?? ''}\n${full.Text ?? ''}`,
  }
}

/**
 * Wait for a message to `address` to arrive, and fail loudly if it does not.
 *
 * Polled rather than awaited on a single read: `/recover` returns as soon as
 * GoTrue has queued the message, so the delivery races the assertion. The
 * failure message says what the absence means, because "expected not null" on
 * its own sends the reader looking in the wrong place.
 */
export async function waitForEmailTo(
  address: string,
  options: { timeoutMs?: number } = {}
): Promise<DeliveredEmail> {
  const timeoutMs = options.timeoutMs ?? 20_000
  const deadline = Date.now() + timeoutMs

  for (;;) {
    const email = await findEmailTo(address)
    if (email) {
      return email
    }
    if (Date.now() > deadline) {
      throw new Error(
        `No email was delivered to ${address} within ${timeoutMs}ms. Either the ` +
          `application did not ask Supabase to send one, or GoTrue refused to: its ` +
          `[auth.rate_limit] email_sent counter is global and hourly, so a suite that ` +
          `sends more messages than that value will see exactly this failure and it ` +
          `will look like a product bug. Check http://127.0.0.1:54324 and the auth ` +
          `container's log before suspecting the app.`
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

/**
 * Assert no message reaches `address` within `quietMs`.
 *
 * Necessarily a negative assertion over a window, which is the weakest kind —
 * but the alternative for "the rate-limited request sent no mail" is to assert
 * nothing at all. Kept short, and only used where the interesting outcome is
 * fast.
 */
export async function expectNoEmailTo(address: string, quietMs = 5_000): Promise<void> {
  const deadline = Date.now() + quietMs
  while (Date.now() < deadline) {
    const email = await findEmailTo(address)
    expect(email, `no email should have been sent to ${address}`).toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

/**
 * The recovery link out of a delivered message.
 *
 * Two details that were each a failed first attempt:
 *
 *   The HTML part carries the URL with `&` written as the entity `&amp;`, so a
 *   link lifted verbatim from it has `amp;type=recovery` in place of
 *   `type=recovery` and GoTrue rejects it. Decoded here.
 *
 *   Both the HTML and text parts contain the same link, so the first match is
 *   taken rather than asserting there is exactly one.
 */
export function extractRecoveryLink(email: DeliveredEmail): string {
  const candidates = (email.body.match(/https?:\/\/[^"'\s<>)]+/g) ?? []).map((url) =>
    url.replace(/&amp;/g, '&')
  )

  const link = candidates.find(
    (url) => url.includes('/auth/v1/verify') && url.includes('type=recovery')
  )

  if (!link) {
    throw new Error(
      `No recovery link found in the message to ${email.to.join(', ')}. Links seen: ` +
        `${JSON.stringify(candidates)}. A message that arrived but carries no verify ` +
        `link usually means the email template was changed.`
    )
  }

  return link
}

/**
 * Where a recovery link will actually land, without consuming it.
 *
 * `redirect_to` is a query parameter on the verify URL, so this reads the
 * destination GoTrue was asked for rather than following the link — which
 * matters, because following it is a one-shot action and a test that checked the
 * destination that way would have spent the token before using it.
 */
export function recoveryLinkDestination(recoveryLink: string): string {
  const redirectTo = new URL(recoveryLink).searchParams.get('redirect_to')
  if (!redirectTo) {
    throw new Error(`The recovery link carries no redirect_to: ${recoveryLink}`)
  }
  return redirectTo
}
