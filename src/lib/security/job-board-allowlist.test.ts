import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { JOB_BOARD_ALLOWED_HOSTS } from './job-board-allowlist'

/**
 * The job-board allowlist moved out of `/api/jobs/fetch-external` so the
 * cover-letter availability check (cover-letter-from-job, US-002) uses the same
 * hosts. FR-6 forbids changing it: these are exactly the entries that route
 * held at 8db14e0, every one with subdomains.
 */
const ENTRIES_AT_8DB14E0 = [
  'adzuna.ch',
  'adzuna.com',
  'adzuna.de',
  'adzuna.fr',
  'adzuna.co.uk',
  'jobs.ch',
  'jobcloud.ch',
  'jobup.ch',
  'jobscout24.ch',
  'indeed.com',
  'indeed.ch',
  'indeed.de',
  'indeed.fr',
  'linkedin.com',
  'glassdoor.com',
  'glassdoor.ch',
  'monster.ch',
  'monster.com',
  'stepstone.ch',
  'stepstone.de',
  'xing.com',
  'karriere.at',
  'join.com',
  'greenhouse.io',
  'lever.co',
  'workday.com',
  'smartrecruiters.com',
  'breezy.hr',
  'recruitee.com',
  'teamtailor.com',
  'personio.de',
  'personio.ch',
]

describe('JOB_BOARD_ALLOWED_HOSTS', () => {
  it('holds exactly the entries fetch-external had, each with subdomains', () => {
    expect(JOB_BOARD_ALLOWED_HOSTS).toEqual(ENTRIES_AT_8DB14E0.map((host) => ({ host, includeSubdomains: true })))
  })

  it('is the list fetch-external uses, with no second list of its own', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/jobs/fetch-external/route.ts'), 'utf-8')
    expect(route).toContain("import { JOB_BOARD_ALLOWED_HOSTS } from '@/lib/security/job-board-allowlist'")
    expect(route).toContain('const ALLOWED_HOSTS = JOB_BOARD_ALLOWED_HOSTS')
    expect(route).not.toContain('hostWithSubdomains(')
    expect(route).not.toContain('exactHost(')
  })
})
