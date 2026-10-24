import { hostWithSubdomains, type AllowedHost } from './safe-fetch'

/**
 * The job boards the server may fetch a stored or pasted offer URL from, with
 * `safeFetch`. Shared by `/api/jobs/fetch-external` (reading an offer's full
 * description) and `/api/cover-letters/from-job-application` (checking whether
 * an offer is still online), so both contact exactly the same hosts.
 *
 * Every entry allows subdomains, which is the behaviour fetch-external has
 * always had. For the multi-tenant ATS platforms that is knowingly wide: a
 * tenant subdomain is available to anyone who signs up, so `*.workday.com` and
 * friends let a third party serve arbitrary content — or an arbitrary redirect —
 * from inside the allowlist. The redirect and private-address checks in
 * `safeFetch` contain the consequences; narrowing these entries to `exactHost`
 * would reject legitimate tenant URLs users paste and is a product decision,
 * not a code cleanup.
 */
export const JOB_BOARD_ALLOWED_HOSTS: readonly AllowedHost[] = [
  // Adzuna domains
  hostWithSubdomains('adzuna.ch'),
  hostWithSubdomains('adzuna.com'),
  hostWithSubdomains('adzuna.de'),
  hostWithSubdomains('adzuna.fr'),
  hostWithSubdomains('adzuna.co.uk'),
  // Swiss job boards
  hostWithSubdomains('jobs.ch'),
  hostWithSubdomains('jobcloud.ch'),
  hostWithSubdomains('jobup.ch'),
  hostWithSubdomains('jobscout24.ch'),
  // International job boards
  hostWithSubdomains('indeed.com'),
  hostWithSubdomains('indeed.ch'),
  hostWithSubdomains('indeed.de'),
  hostWithSubdomains('indeed.fr'),
  hostWithSubdomains('linkedin.com'),
  hostWithSubdomains('glassdoor.com'),
  hostWithSubdomains('glassdoor.ch'),
  hostWithSubdomains('monster.ch'),
  hostWithSubdomains('monster.com'),
  hostWithSubdomains('stepstone.ch'),
  hostWithSubdomains('stepstone.de'),
  hostWithSubdomains('xing.com'),
  hostWithSubdomains('karriere.at'),
  // Multi-tenant ATS / recruiting platforms — see the note above.
  hostWithSubdomains('join.com'),
  hostWithSubdomains('greenhouse.io'),
  hostWithSubdomains('lever.co'),
  hostWithSubdomains('workday.com'),
  hostWithSubdomains('smartrecruiters.com'),
  hostWithSubdomains('breezy.hr'),
  hostWithSubdomains('recruitee.com'),
  hostWithSubdomains('teamtailor.com'),
  hostWithSubdomains('personio.de'),
  hostWithSubdomains('personio.ch'),
]
