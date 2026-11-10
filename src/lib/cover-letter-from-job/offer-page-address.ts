import { COVER_LETTER_FIELD_LIMITS } from '@/lib/cover-letter-limits'
import { sanitizeUntrustedPlainText } from '@/lib/resume-from-job/untrusted-text'

/**
 * The company's postal address from an offer page's schema.org `JobPosting`
 * data (PRD `tasks/prds/cover-letter-recipient-address-from-offer.md`, US-001).
 *
 * Job boards publish the offer as JSON-LD in `<script type="application/ld+json">`
 * blocks. The address is taken from `hiringOrganization.address` of any
 * `JobPosting` on the page first, and only when none is complete from
 * `jobLocation.address` (FR-2): the hiring organization is where letters go,
 * the job location may be a branch.
 *
 * Everything read here is untrusted: each part is cleaned to a single line of
 * plain text (FR-4). Nothing is ever guessed: an address without a street, a
 * postcode and a locality is not used, and the company name is never added.
 */

/**
 * The longest a single part may be: four parts (street, postcode, locality,
 * country) and at most three separators always fit the `company_address` limit.
 */
const ADDRESS_PART_MAX_LENGTH = Math.floor((COVER_LETTER_FIELD_LIMITS.company_address - 3) / 4)

/**
 * The spellings of Switzerland a page may give as `addressCountry`: ISO codes
 * and the name in English and the four national languages. A Swiss address
 * prints no country line, as a Swiss letter writes it.
 */
export const SWITZERLAND: ReadonlySet<string> = new Set(['ch', 'che', 'switzerland', 'suisse', 'schweiz', 'svizzera', 'svizra'])

/** How deep `@graph` and nested arrays are followed; real pages use one level. */
const MAX_NODE_DEPTH = 4

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** One value or a list of them, as JSON-LD allows for any property. */
function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value]
}

/**
 * The text of every `<script type="application/ld+json">` block.
 *
 * Scanned with `indexOf`, not one regular expression over the page: every step
 * moves forward and stops at the first missing `>` or `</script`, so a page of
 * unclosed tags costs time proportional to its length.
 *
 * Only ASCII letters are lower-cased: the indices found in `lower` slice
 * `html`, and `toLowerCase` can lengthen a string ("İ" becomes two code units),
 * which would shift every later block.
 */
function jsonLdBlocks(html: string): string[] {
  const lower = html.replace(/[A-Z]+/g, (letters) => letters.toLowerCase())
  const blocks: string[] = []
  let cursor = 0

  for (;;) {
    const start = lower.indexOf('<script', cursor)
    if (start === -1) break
    const tagEnd = lower.indexOf('>', start)
    if (tagEnd === -1) break
    const close = lower.indexOf('</script', tagEnd)
    if (close === -1) break

    const tag = lower.slice(start, tagEnd)
    if (/\btype\s*=\s*["']?\s*application\/ld\+json/.test(tag)) {
      blocks.push(html.slice(tagEnd + 1, close))
    }
    cursor = close + '</script'.length
  }
  return blocks
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    // A malformed block is skipped; another block may still hold the offer.
    return undefined
  }
}

/**
 * Whether a node's `@type` names `JobPosting`, written short or as a full name
 * (`https://schema.org/JobPosting`, `schema:JobPosting`): the last segment
 * after `/`, `#` or `:` is compared.
 */
function isJobPosting(node: JsonObject): boolean {
  return asList(node['@type']).some(
    (type) => typeof type === 'string' && type.trim().split(/[/#:]/).pop()?.toLowerCase() === 'jobposting'
  )
}

/**
 * The locality without a leading copy of the postcode: some pages give
 * `addressLocality` as "1003 Lausanne" next to `postalCode` "1003".
 */
function localityWithoutPostcode(locality: string, postcode: string): string {
  if (locality === postcode) return ''
  if (locality.startsWith(postcode) && /^\s/.test(locality.slice(postcode.length))) {
    return locality.slice(postcode.length).trimStart()
  }
  return locality
}

/** U+FFFD: the page was decoded with a charset other than its own, so the text is damaged. */
const REPLACEMENT_CHARACTER = '�'

/** Every `JobPosting` in a parsed block: a single node, an array, or an `@graph`. */
function collectJobPostings(value: unknown, depth: number, into: JsonObject[]): void {
  if (depth > MAX_NODE_DEPTH) return
  if (Array.isArray(value)) {
    for (const item of value) collectJobPostings(item, depth + 1, into)
    return
  }
  if (!isObject(value)) return
  if (isJobPosting(value)) into.push(value)
  if ('@graph' in value) collectJobPostings(value['@graph'], depth + 1, into)
}

/** A part as one line of plain text, or `''`. Numbers are accepted: some pages give the postcode as one. */
function cleanPart(value: unknown): string {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : value
  return sanitizeUntrustedPlainText(text, ADDRESS_PART_MAX_LENGTH)
}

/** `addressCountry` is a name or code, or a `Country` node with a `name`. */
function countryOf(value: unknown): string {
  return cleanPart(isObject(value) ? value.name : value)
}

/**
 * A complete address's parts, each cleaned to one line of plain text. `country`
 * is `null` when none is given or it is Switzerland: neither prints a line.
 */
export interface PostalAddressParts {
  street: string
  postcode: string
  locality: string
  country: string | null
}

/**
 * The cleaned parts of a `PostalAddress`-shaped value (`streetAddress`,
 * `postalCode`, `addressLocality`, `addressCountry`), or `null` when it is not
 * one with a street, a postcode and a locality. A plain-string address is not
 * structured and is never used, and neither is one with damaged text.
 *
 * Shared by the offer page (US-001) and the address the AI reads from the
 * offer's text (US-002), so both are cleaned and judged complete alike.
 */
export function postalAddressParts(node: unknown): PostalAddressParts | null {
  if (!isObject(node)) return null
  const street = cleanPart(node.streetAddress)
  const postcode = cleanPart(node.postalCode)
  const locality = localityWithoutPostcode(cleanPart(node.addressLocality), postcode)
  if (!street || !postcode || !locality) return null

  const givenCountry = countryOf(node.addressCountry)
  const country = givenCountry && !SWITZERLAND.has(givenCountry.toLowerCase()) ? givenCountry : null
  const kept = [street, postcode, locality, country ?? '']
  if (kept.some((part) => part.includes(REPLACEMENT_CHARACTER))) return null
  return { street, postcode, locality, country }
}

/**
 * The address as `company_address` stores it: the street; then the postcode, a
 * space and the locality; then the country, only when there is one.
 */
export function formatPostalAddressParts(parts: PostalAddressParts): string {
  const lines = [parts.street, `${parts.postcode} ${parts.locality}`]
  if (parts.country) lines.push(parts.country)
  return lines.join('\n')
}

/** The stored form of a `PostalAddress` node, or `null` when it is not a complete one. */
function formatPostalAddress(node: unknown): string | null {
  const parts = postalAddressParts(node)
  return parts ? formatPostalAddressParts(parts) : null
}

/** The first complete address among a property's values (`address` may be a list). */
function firstCompleteAddress(holders: unknown): string | null {
  for (const holder of asList(holders)) {
    if (!isObject(holder)) continue
    for (const address of asList(holder.address)) {
      const formatted = formatPostalAddress(address)
      if (formatted) return formatted
    }
  }
  return null
}

/**
 * The company's address from an offer page's HTML, as `company_address`
 * stores it: the street; then the postcode, a space and the locality; then the
 * country, only when it is given and is not Switzerland. `null` when the page
 * has no `JobPosting` with a complete address. Never throws.
 */
export function companyAddressFromOfferPage(html: string): string | null {
  const postings: JsonObject[] = []
  for (const block of jsonLdBlocks(html)) {
    collectJobPostings(parseJson(block), 0, postings)
  }

  for (const posting of postings) {
    const address = firstCompleteAddress(posting.hiringOrganization)
    if (address) return address
  }
  for (const posting of postings) {
    const address = firstCompleteAddress(posting.jobLocation)
    if (address) return address
  }
  return null
}
