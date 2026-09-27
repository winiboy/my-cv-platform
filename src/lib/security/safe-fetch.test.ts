import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  BlockedRequestError,
  assertFetchAllowed,
  exactHost,
  hostWithSubdomains,
  isHostAllowed,
  isPrivateAddress,
  safeFetch,
  type AllowedHost,
  type FetchImpl,
  type HostResolver,
} from './safe-fetch'

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '127.1.2.3',
    '0.0.0.0',
    '10.0.0.5',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254', // AWS/GCP/Azure instance metadata
    '169.254.1.1',
    '100.64.0.1', // CGNAT
    '224.0.0.1', // multicast
    '255.255.255.255',
    '::1',
    '::',
    '::ffff:127.0.0.1', // IPv4-mapped loopback
    '::ffff:169.254.169.254',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'ff02::1',
    '2001:db8::1',
    '64:ff9b::7f00:1', // NAT64-wrapped loopback
    'fe80::1%eth0', // zone id
  ])('refuses %s', (address) => {
    expect(isPrivateAddress(address)).toBe(true)
  })

  it.each([
    '93.184.216.34',
    '8.8.8.8',
    '172.15.255.255', // just below the RFC1918 block
    '172.32.0.1', // just above it
    '100.63.255.255', // just below CGNAT
    '100.128.0.1', // just above it
    '2606:2800:220:1:248:1893:25c8:1946',
    '2a00:1450:4001:80b::200e',
  ])('allows %s', (address) => {
    expect(isPrivateAddress(address)).toBe(false)
  })

  it.each([
    'not-an-ip',
    '',
    '1.2.3',
    '1.2.3.4.5',
    '999.1.1.1',
    '0x7f.0.0.1', // hex octet notation some resolvers accept
    '2130706433', // decimal form of 127.0.0.1
    'gg::1',
  ])('refuses the unparseable input %s rather than guessing', (address) => {
    expect(isPrivateAddress(address)).toBe(true)
  })
})

describe('isHostAllowed', () => {
  const allowlist: readonly AllowedHost[] = [
    hostWithSubdomains('jobs.ch'),
    exactHost('boards.greenhouse.io'),
  ]

  it('matches an exact host', () => {
    expect(isHostAllowed('jobs.ch', allowlist)).toBe(true)
  })

  it('matches a subdomain of a wildcard entry', () => {
    expect(isHostAllowed('www.jobs.ch', allowlist)).toBe(true)
    expect(isHostAllowed('a.b.jobs.ch', allowlist)).toBe(true)
  })

  it('rejects a subdomain of an exact-only entry', () => {
    expect(isHostAllowed('boards.greenhouse.io', allowlist)).toBe(true)
    expect(isHostAllowed('evil.boards.greenhouse.io', allowlist)).toBe(false)
    expect(isHostAllowed('greenhouse.io', allowlist)).toBe(false)
  })

  it('is case-insensitive and tolerates a trailing dot', () => {
    expect(isHostAllowed('WWW.Jobs.CH', allowlist)).toBe(true)
    expect(isHostAllowed('www.jobs.ch.', allowlist)).toBe(true)
  })

  it('rejects a host that merely ends with the allowed string', () => {
    expect(isHostAllowed('evil-jobs.ch', allowlist)).toBe(false)
    expect(isHostAllowed('jobs.ch.attacker.test', allowlist)).toBe(false)
    expect(isHostAllowed('', allowlist)).toBe(false)
  })
})

describe('assertFetchAllowed', () => {
  const allowlist = [hostWithSubdomains('jobs.ch')]
  const resolvePublic: HostResolver = async () => ['93.184.216.34']

  it('rejects a non-http scheme', async () => {
    await expect(
      assertFetchAllowed(new URL('file:///etc/passwd'), allowlist, resolvePublic)
    ).rejects.toMatchObject({ reason: 'scheme-not-allowed' })
  })

  it('rejects an off-allowlist host', async () => {
    await expect(
      assertFetchAllowed(new URL('https://evil.example.com/'), allowlist, resolvePublic)
    ).rejects.toMatchObject({ reason: 'host-not-allowed' })
  })

  it('rejects an allowlisted host that resolves into private space', async () => {
    await expect(
      assertFetchAllowed(new URL('https://internal.jobs.ch/'), allowlist, async () => [
        '169.254.169.254',
      ])
    ).rejects.toMatchObject({ reason: 'private-address' })
  })

  it('rejects when any one resolved address is private, not only the first', async () => {
    await expect(
      assertFetchAllowed(new URL('https://mixed.jobs.ch/'), allowlist, async () => [
        '93.184.216.34',
        '10.0.0.5',
      ])
    ).rejects.toMatchObject({ reason: 'private-address' })
  })

  it('rejects a private IP literal even when the literal is allowlisted', async () => {
    await expect(
      assertFetchAllowed(
        new URL('http://127.0.0.1:8080/'),
        [hostWithSubdomains('127.0.0.1')],
        resolvePublic
      )
    ).rejects.toMatchObject({ reason: 'private-address' })
  })

  it('rejects a bracketed IPv6 loopback literal', async () => {
    await expect(
      assertFetchAllowed(
        new URL('http://[::1]:8080/'),
        [hostWithSubdomains('[::1]')],
        resolvePublic
      )
    ).rejects.toMatchObject({ reason: 'private-address' })
  })

  it('rejects a host with no DNS records', async () => {
    await expect(
      assertFetchAllowed(new URL('https://jobs.ch/'), allowlist, async () => [])
    ).rejects.toMatchObject({ reason: 'unresolvable-host' })
  })

  it('accepts an allowlisted host resolving to a public address', async () => {
    await expect(
      assertFetchAllowed(new URL('https://www.jobs.ch/job/1'), allowlist, resolvePublic)
    ).resolves.toBeUndefined()
  })
})

/**
 * These cases drive `safeFetch` against a real HTTP server on loopback, so the
 * redirect handling is exercised through undici rather than through a stub.
 *
 * `/secret` stands in for an internal service. Every redirect target the guard
 * is supposed to refuse points at it, so a regression is not merely a missing
 * error: the server would record a request for `/secret`, which is the
 * assertion that the refusal happened before any body was read.
 */
describe('safeFetch against a local server', () => {
  let server: Server
  let port = 0
  let requestedPaths: string[] = []
  /** Hosts fetched by the rewriting fetchImpl, including refused-then-fetched bugs. */
  let fetchedHosts: string[] = []

  const JOB_BODY = 'LEGITIMATE JOB BODY'
  const SECRET_BODY = 'INTERNAL SECRET THAT MUST NOT BE FETCHED'

  beforeAll(async () => {
    server = createServer((req, res) => {
      const path = req.url ?? ''
      requestedPaths.push(path)

      const redirect = (location: string) => {
        res.writeHead(302, { Location: location })
        res.end()
      }

      if (path === '/job') {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(`<html><body>${JOB_BODY}</body></html>`)
        return
      }
      if (path === '/secret') {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(SECRET_BODY)
        return
      }
      if (path === '/redirect-to-loopback-literal') {
        redirect(`http://127.0.0.1:${port}/secret`)
        return
      }
      if (path === '/redirect-to-metadata-literal') {
        redirect('http://169.254.169.254/latest/meta-data/iam/security-credentials/')
        return
      }
      if (path === '/redirect-to-private-dns') {
        // Allowlisted host whose DNS answer is loopback: only the address check
        // can stop this one, and this local server would serve /secret if it did not.
        redirect(`http://internal.jobs.ch/secret`)
        return
      }
      if (path === '/redirect-to-metadata-dns') {
        redirect('http://metadata.jobs.ch/secret')
        return
      }
      if (path === '/redirect-to-mixed-dns') {
        redirect('http://mixed.jobs.ch/secret')
        return
      }
      if (path === '/redirect-off-allowlist') {
        redirect('https://evil.example.com/payload')
        return
      }
      if (path === '/redirect-relative') {
        redirect('/job')
        return
      }
      if (path.startsWith('/redirect-loop/')) {
        const hop = Number(path.slice('/redirect-loop/'.length))
        redirect(`/redirect-loop/${hop + 1}`)
        return
      }

      res.writeHead(404)
      res.end('not found')
    })

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = (server.address() as AddressInfo).port
        resolve()
      })
    })
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

  beforeEach(() => {
    requestedPaths = []
    fetchedHosts = []
  })

  const allowlist = [hostWithSubdomains('jobs.ch')]

  /**
   * DNS answers for the fictitious hosts used here, so the suite never queries
   * a real resolver. Anything not listed is treated as NXDOMAIN.
   */
  const resolveHost: HostResolver = async (hostname) => {
    const answers: Record<string, string[]> = {
      'jobs.ch': ['93.184.216.34'],
      'www.jobs.ch': ['93.184.216.34'],
      'internal.jobs.ch': ['127.0.0.1'],
      'metadata.jobs.ch': ['169.254.169.254'],
      'mixed.jobs.ch': ['93.184.216.34', '10.0.0.5'],
    }
    const addresses = answers[hostname]
    if (!addresses) throw new Error(`no DNS record for ${hostname}`)
    return addresses
  }

  /**
   * Sends requests for `*.jobs.ch` to the local server instead. Any other host
   * is a bug: the guard should have refused it, so failing loudly here turns a
   * silent escape into a test failure rather than an outbound request.
   */
  const fetchImpl: FetchImpl = async (url, init) => {
    const target = new URL(url)
    fetchedHosts.push(target.hostname)

    if (target.hostname !== 'jobs.ch' && !target.hostname.endsWith('.jobs.ch')) {
      throw new Error(`unexpected outbound fetch to ${target.hostname}`)
    }

    target.protocol = 'http:'
    target.hostname = '127.0.0.1'
    target.port = String(port)
    return fetch(target.toString(), init)
  }

  const run = (path: string, maxRedirects = 5) =>
    safeFetch(`http://jobs.ch${path}`, {
      allowlist,
      timeoutMs: 10_000,
      maxRedirects,
      resolveHost,
      fetchImpl,
    })

  it('fetches a legitimate job page', async () => {
    const response = await run('/job')

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toContain(JOB_BODY)
    expect(requestedPaths).toEqual(['/job'])
  })

  it('follows an allowlisted relative redirect', async () => {
    const response = await run('/redirect-relative')

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toContain(JOB_BODY)
    expect(requestedPaths).toEqual(['/redirect-relative', '/job'])
  })

  it.each([
    ['a loopback IP literal', '/redirect-to-loopback-literal', 'host-not-allowed'],
    ['the cloud metadata IP literal', '/redirect-to-metadata-literal', 'host-not-allowed'],
    ['an off-allowlist public host', '/redirect-off-allowlist', 'host-not-allowed'],
    ['an allowlisted host resolving to loopback', '/redirect-to-private-dns', 'private-address'],
    ['an allowlisted host resolving to metadata', '/redirect-to-metadata-dns', 'private-address'],
    ['an allowlisted host with one private address', '/redirect-to-mixed-dns', 'private-address'],
  ])('refuses a redirect to %s before reading any body', async (_label, path, reason) => {
    await expect(run(path)).rejects.toMatchObject({
      name: 'BlockedRequestError',
      reason,
    })

    // Only the first hop was ever requested; the refused target was not.
    expect(requestedPaths).toEqual([path])
    expect(requestedPaths).not.toContain('/secret')
    expect(fetchedHosts).toEqual(['jobs.ch'])
  })

  it('stops at the hop cap instead of following a redirect loop', async () => {
    await expect(run('/redirect-loop/0', 3)).rejects.toMatchObject({
      name: 'BlockedRequestError',
      reason: 'too-many-redirects',
    })

    expect(requestedPaths).toEqual([
      '/redirect-loop/0',
      '/redirect-loop/1',
      '/redirect-loop/2',
      '/redirect-loop/3',
    ])
  })

  it('returns a non-redirect error response to the caller unchanged', async () => {
    const response = await run('/nope')

    expect(response.status).toBe(404)
    expect(response.ok).toBe(false)
  })

  it('rejects an invalid initial URL', async () => {
    await expect(
      safeFetch('not a url', {
        allowlist,
        timeoutMs: 10_000,
        maxRedirects: 5,
        resolveHost,
        fetchImpl,
      })
    ).rejects.toBeInstanceOf(BlockedRequestError)
  })
})
