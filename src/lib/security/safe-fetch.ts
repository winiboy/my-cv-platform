import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * Server-side fetch guard for URLs that originate from user input.
 *
 * Two independent controls, both re-applied on every hop of a redirect chain:
 *
 *   1. A host allowlist, so only known job boards can be contacted at all.
 *   2. A destination-address check, so an allowlisted (or open-redirecting)
 *      host cannot point us at loopback, RFC1918, link-local — notably the
 *      `169.254.169.254` cloud metadata service — or other non-public space.
 *
 * Redirects are followed manually (`redirect: 'manual'`) precisely so that the
 * hop target passes both checks *before* a request is sent to it. A refused hop
 * therefore never reaches the wire and its body is never read.
 */

/**
 * One entry in a host allowlist.
 *
 * `includeSubdomains` exists because the two kinds of allowlisted host carry
 * very different risk: a single-tenant board (`jobs.ch`) is safe to widen to
 * its subdomains, whereas a multi-tenant ATS (`workday.com`, `greenhouse.io`,
 * `lever.co`, …) hands a subdomain to anyone who signs up, so a wildcard there
 * lets a tenant serve arbitrary content — or an arbitrary redirect — from
 * inside the allowlist.
 *
 * Narrowing those entries to exact hostnames is a product decision (it would
 * reject legitimate `<tenant>.workday.com` URLs users paste), so this type only
 * makes the narrower option expressible; it does not impose it.
 */
export interface AllowedHost {
  /** Registrable hostname, lowercase, no scheme, port or trailing dot. */
  readonly host: string
  /** When true, `*.host` is allowed as well as `host` itself. */
  readonly includeSubdomains: boolean
}

/** Allowlist entry matching `host` and every subdomain of it. */
export function hostWithSubdomains(host: string): AllowedHost {
  return { host: host.toLowerCase(), includeSubdomains: true }
}

/** Allowlist entry matching only `host` itself. */
export function exactHost(host: string): AllowedHost {
  return { host: host.toLowerCase(), includeSubdomains: false }
}

/** Why a fetch was refused. Kept coarse: these values may reach clients. */
export type BlockedReason =
  | 'invalid-url'
  | 'scheme-not-allowed'
  | 'host-not-allowed'
  | 'private-address'
  | 'unresolvable-host'
  | 'too-many-redirects'

/**
 * Thrown instead of performing a request the guard refuses.
 *
 * `message` is deliberately free of the resolved address: these errors are
 * surfaced to anonymous callers in one route, and echoing back which internal
 * IP a hostname resolved to would turn the refusal itself into a scanning
 * oracle.
 */
export class BlockedRequestError extends Error {
  readonly reason: BlockedReason

  constructor(reason: BlockedReason, message: string) {
    super(message)
    this.name = 'BlockedRequestError'
    this.reason = reason
  }
}

/** Resolves a hostname to IP addresses. Injectable so tests need no DNS. */
export type HostResolver = (hostname: string) => Promise<string[]>

/** Performs the actual request. Injectable so tests need no internet. */
export type FetchImpl = (
  url: string,
  init: RequestInit
) => Promise<Response>

export interface SafeFetchOptions {
  /** Hosts this call may contact, on the first request and on every redirect. */
  readonly allowlist: readonly AllowedHost[]
  /** Total budget for the whole chain, not per hop. */
  readonly timeoutMs: number
  /** Maximum number of `Location` hops followed. */
  readonly maxRedirects: number
  readonly headers?: Record<string, string>
  /** Test seam. Defaults to DNS. */
  readonly resolveHost?: HostResolver
  /** Test seam. Defaults to global `fetch`. */
  readonly fetchImpl?: FetchImpl
}

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308])

/**
 * IPv4 space we refuse to connect to.
 *
 * Covers the ranges an SSRF payload actually reaches for — loopback, the three
 * RFC1918 blocks, link-local including the `169.254.169.254` metadata endpoint,
 * CGNAT, multicast and reserved — plus the documentation/benchmark ranges,
 * which have no legitimate job board on them and are cheap to exclude.
 *
 * An address that does not parse as four octets is treated as private: this
 * function gates a connection, so the safe answer to "I cannot tell" is no.
 */
function isPrivateIPv4(address: string): boolean {
  const octets = address.split('.')
  if (octets.length !== 4) return true

  const parsed = octets.map((part) => Number(part))
  if (
    parsed.some(
      (value, index) =>
        !/^\d{1,3}$/.test(octets[index]) ||
        !Number.isInteger(value) ||
        value < 0 ||
        value > 255
    )
  ) {
    return true
  }

  const [a, b, c] = parsed

  if (a === 0) return true // 0.0.0.0/8 — "this host on this network"
  if (a === 10) return true // RFC1918
  if (a === 127) return true // loopback
  if (a === 169 && b === 254) return true // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true // RFC1918
  if (a === 192 && b === 168) return true // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true // RFC6598 CGNAT
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true // IETF protocol / TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true // benchmarking
  if (a === 198 && b === 51 && c === 100) return true // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true // TEST-NET-3
  if (a >= 224) return true // multicast, reserved, broadcast

  return false
}

/**
 * Expand an IPv6 literal to its eight 16-bit groups, or `null` if it does not
 * parse. Handles `::` compression, a zone id, surrounding brackets and an
 * embedded IPv4 tail (`::ffff:169.254.169.254`).
 */
function ipv6Groups(address: string): number[] | null {
  let text = address.toLowerCase().split('%')[0]
  if (text.startsWith('[') && text.endsWith(']')) {
    text = text.slice(1, -1)
  }

  const embeddedIPv4 = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(text)
  if (embeddedIPv4) {
    const octets = embeddedIPv4[1].split('.').map(Number)
    if (octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
      return null
    }
    const high = ((octets[0] << 8) | octets[1]).toString(16)
    const low = ((octets[2] << 8) | octets[3]).toString(16)
    text = `${text.slice(0, embeddedIPv4.index)}${high}:${low}`
  }

  const halves = text.split('::')
  if (halves.length > 2) return null

  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []

  let groups: string[]
  if (halves.length === 1) {
    groups = head
  } else {
    const fill = 8 - head.length - tail.length
    if (fill < 0) return null
    groups = [...head, ...Array.from({ length: fill }, () => '0'), ...tail]
  }

  if (groups.length !== 8) return null
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null

  return groups.map((group) => parseInt(group, 16))
}

/** IPv6 space we refuse to connect to. Unparseable addresses count as private. */
function isPrivateIPv6(address: string): boolean {
  const groups = ipv6Groups(address)
  if (!groups) return true

  if (groups.every((group) => group === 0)) return true // ::
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) {
    return true // ::1 loopback
  }

  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) addresses are
  // judged by the IPv4 address they carry, or `::ffff:127.0.0.1` would pass.
  if (
    groups.slice(0, 5).every((group) => group === 0) &&
    (groups[5] === 0xffff || groups[5] === 0)
  ) {
    const embedded = `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`
    return isPrivateIPv4(embedded)
  }

  if (groups[0] === 0x64 && groups[1] === 0xff9b) return true // 64:ff9b::/96 NAT64
  if ((groups[0] & 0xfe00) === 0xfc00) return true // fc00::/7 unique local
  if ((groups[0] & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((groups[0] & 0xff00) === 0xff00) return true // ff00::/8 multicast
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true // documentation
  if (groups[0] === 0x2002) return true // 6to4, embeds an arbitrary IPv4

  return false
}

/** True when `address` is an IP literal we refuse to connect to. */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address.replace(/^\[|\]$/g, ''))
  if (version === 4) return isPrivateIPv4(address)
  if (version === 6) return isPrivateIPv6(address)
  return true // not an IP literal at all — caller must resolve first
}

/** True when `hostname` is covered by `allowlist`. */
export function isHostAllowed(
  hostname: string,
  allowlist: readonly AllowedHost[]
): boolean {
  // A trailing dot names the same host to a resolver but not to `endsWith`.
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (!host) return false

  return allowlist.some((entry) =>
    entry.includeSubdomains
      ? host === entry.host || host.endsWith(`.${entry.host}`)
      : host === entry.host
  )
}

async function defaultResolveHost(hostname: string): Promise<string[]> {
  const records = await dnsLookup(hostname, { all: true, verbatim: true })
  return records.map((record) => record.address)
}

/**
 * Refuse `url` unless it is an http(s) URL on an allowlisted host whose every
 * resolved address is public.
 *
 * What this closes: a `Location` pointing straight at an IP literal in private
 * space, and a hostname whose DNS records point into private space (the
 * `127.0.0.1.nip.io` family, or an attacker's own zone with a static private
 * record).
 *
 * What it does not close: DNS rebinding. We resolve here, then hand the
 * *hostname* to `fetch`, which resolves again — an authoritative server that
 * answers public once and private on the second query wins that race. Closing
 * it requires pinning the connection to the address validated here (a custom
 * undici dispatcher whose `connect.lookup` returns only vetted addresses),
 * which is a larger change than this fix and is not attempted. Every address in
 * the record set is checked, not just the first, so the cheaper trick of
 * returning a mixed public/private answer and relying on address ordering does
 * not work.
 */
export async function assertFetchAllowed(
  url: URL,
  allowlist: readonly AllowedHost[],
  resolveHost: HostResolver = defaultResolveHost
): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BlockedRequestError(
      'scheme-not-allowed',
      'Only http and https URLs can be fetched.'
    )
  }

  if (!isHostAllowed(url.hostname, allowlist)) {
    throw new BlockedRequestError(
      'host-not-allowed',
      'This host is not in the list of supported job boards.'
    )
  }

  // An IP literal in the URL is never resolved, so check it directly. It can
  // only get here by being allowlisted, which no entry does today.
  const literal = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(literal) !== 0) {
    if (isPrivateAddress(literal)) {
      throw new BlockedRequestError(
        'private-address',
        'This URL points to a non-public network address.'
      )
    }
    return
  }

  let addresses: string[]
  try {
    addresses = await resolveHost(url.hostname)
  } catch {
    throw new BlockedRequestError(
      'unresolvable-host',
      'This host could not be resolved.'
    )
  }

  if (addresses.length === 0) {
    throw new BlockedRequestError(
      'unresolvable-host',
      'This host could not be resolved.'
    )
  }

  if (addresses.some((address) => isPrivateAddress(address))) {
    throw new BlockedRequestError(
      'private-address',
      'This URL points to a non-public network address.'
    )
  }
}

/**
 * Fetch `initialUrl`, following redirects one hop at a time and re-running
 * {@link assertFetchAllowed} on every `Location` before requesting it.
 *
 * The returned `Response` is the first non-redirect response; its body has not
 * been read. Bodies of intermediate redirect responses are cancelled so their
 * sockets are released.
 *
 * Throws {@link BlockedRequestError} for a refused hop, or an `AbortError` when
 * the shared timeout expires.
 */
export async function safeFetch(
  initialUrl: string,
  options: SafeFetchOptions
): Promise<Response> {
  const {
    allowlist,
    timeoutMs,
    maxRedirects,
    headers,
    resolveHost = defaultResolveHost,
    fetchImpl = fetch,
  } = options

  let current: URL
  try {
    current = new URL(initialUrl)
  } catch {
    throw new BlockedRequestError('invalid-url', 'Invalid URL format.')
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      await assertFetchAllowed(current, allowlist, resolveHost)

      const response = await fetchImpl(current.toString(), {
        signal: controller.signal,
        headers,
        redirect: 'manual',
      })

      if (!REDIRECT_STATUS.has(response.status)) {
        return response
      }

      const location = response.headers.get('location')
      if (!location) {
        // A 3xx with no Location is not a redirect we can follow; hand it back
        // and let the caller treat it as the error status it is.
        return response
      }

      let next: URL
      try {
        next = new URL(location, current)
      } catch {
        await response.body?.cancel()
        throw new BlockedRequestError(
          'invalid-url',
          'The server redirected to an invalid URL.'
        )
      }

      await response.body?.cancel()
      current = next
    }

    throw new BlockedRequestError(
      'too-many-redirects',
      'The server redirected too many times.'
    )
  } finally {
    clearTimeout(timeoutId)
  }
}
