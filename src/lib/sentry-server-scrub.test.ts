import type { ErrorEvent, Event } from '@sentry/nextjs'

/** A transaction event, as `beforeSendTransaction` receives it. */
type TransactionEvent = Event & { type: 'transaction' }
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { scrubServerEvent } from './sentry-server-scrub'

// The real config files call `Sentry.init` on import; the options they pass
// are captured here so their hooks can be run on synthetic events.
const init = vi.fn()
vi.mock('@sentry/nextjs', () => ({ init }))

const SECRET = 'bypass-secret-value'

/**
 * A sampled server transaction for the Preview page as the PDF renderer
 * requests it, shaped as @sentry/nextjs 10 builds one: headers and cookies in
 * `request` (requestDataIntegration) and every header again as a root-span
 * attribute in `contexts.trace.data`, unmasked unless its name looks secret.
 */
function previewTransaction(): TransactionEvent {
  return {
    type: 'transaction',
    transaction: 'GET /[locale]/dashboard/resumes/[id]/preview',
    request: {
      url: 'https://my-cv-platform-abc123.vercel.app/en/dashboard/resumes/1/preview',
      method: 'GET',
      headers: { 'x-vercel-protection-bypass': SECRET, cookie: 'sb-x-auth-token=t', accept: 'text/html' },
      cookies: { 'sb-x-auth-token': 't' },
      data: '{"draft":"..."}',
    },
    user: { id: 'u1', ip_address: '203.0.113.1' },
    contexts: {
      trace: {
        trace_id: 't',
        span_id: 's',
        data: {
          'http.request.header.x_vercel_protection_bypass': SECRET,
          'http.request.header.cookie': '[Filtered]',
          'http.request.header.authorization': '[Filtered]',
          'http.request.header.accept': 'text/html',
          'http.route': '/[locale]/dashboard/resumes/[id]/preview',
          'sentry.op': 'http.server',
        },
      },
    },
    spans: [
      {
        span_id: 'c',
        trace_id: 't',
        start_timestamp: 0,
        data: { 'http.request.header.x_vercel_protection_bypass': SECRET, 'next.span_type': 'BaseServer.handleRequest' },
      },
    ],
  }
}

function expectNoSecret(event: Event | null) {
  expect(event).not.toBeNull()
  expect(JSON.stringify(event)).not.toContain(SECRET)
}

describe('scrubServerEvent', () => {
  it('removes the payload, cookies, headers and user, and every request-header span attribute', () => {
    const event = scrubServerEvent(previewTransaction())
    expectNoSecret(event)
    expect(event.request).toEqual({
      url: 'https://my-cv-platform-abc123.vercel.app/en/dashboard/resumes/1/preview',
      method: 'GET',
    })
    expect(event.user).toBeUndefined()
    expect(event.contexts?.trace?.data).toEqual({
      'http.route': '/[locale]/dashboard/resumes/[id]/preview',
      'sentry.op': 'http.server',
    })
    expect(event.spans?.[0].data).toEqual({ 'next.span_type': 'BaseServer.handleRequest' })
  })

  it('returns the event it was given, also when it carries none of those fields', () => {
    const bare: ErrorEvent = { type: undefined, message: 'boom' }
    expect(scrubServerEvent(bare)).toBe(bare)
    expect(bare).toEqual({ type: undefined, message: 'boom' })
  })
})

describe.each([
  ['server', '../../sentry.server.config'],
  ['edge', '../../sentry.edge.config'],
])('sentry.%s.config.ts', (_runtime, configPath) => {
  type Options = {
    sendDefaultPii: boolean
    beforeSend: (event: ErrorEvent) => ErrorEvent | null
    beforeSendTransaction: (event: TransactionEvent) => TransactionEvent | null
  }
  let options: Options

  beforeEach(async () => {
    vi.resetModules()
    init.mockClear()
    await import(configPath)
    expect(init).toHaveBeenCalledTimes(1)
    options = init.mock.calls[0][0] as Options
  })

  it('keeps personal data off', () => {
    expect(options.sendDefaultPii).toBe(false)
  })

  it('strips the bypass secret, cookies and headers from a sampled transaction', () => {
    expect(typeof options.beforeSendTransaction).toBe('function')
    expectNoSecret(options.beforeSendTransaction(previewTransaction()))
  })

  it('strips them from an error event too', () => {
    const error: ErrorEvent = { ...previewTransaction(), type: undefined, spans: undefined }
    const scrubbed = options.beforeSend(error)
    expectNoSecret(scrubbed)
    expect(scrubbed?.request?.headers).toBeUndefined()
    expect(scrubbed?.request?.cookies).toBeUndefined()
  })
})
