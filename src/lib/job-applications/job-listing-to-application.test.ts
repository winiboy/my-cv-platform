import { describe, expect, it } from 'vitest'
import { jobListingToApplicationInput } from './job-listing-to-application'

/**
 * The Job Search offer mapping shared by "Save" and "Créer un CV"
 * (job-cv-linking FR-2). The expected bodies are the ones the detail panel's
 * Save sent before the mapping was extracted, field for field.
 */

const JOB = {
  title: 'Data Engineer',
  company: 'Beispiel AG',
  location_city: 'Zürich',
  salary_range: "90'000 - 110'000 CHF",
  application_url: 'https://jobs.example.test/offers/data-engineer',
  description: 'Listing description.',
}

describe('jobListingToApplicationInput', () => {
  it('maps every field as Save did', () => {
    expect(jobListingToApplicationInput(JOB, '{city}, Suisse')).toEqual({
      job_title: 'Data Engineer',
      company_name: 'Beispiel AG',
      location: 'Zürich, Suisse',
      salary_min: 90000,
      salary_max: 110000,
      job_url: 'https://jobs.example.test/offers/data-engineer',
      job_description: 'Listing description.',
      source: 'Adzuna',
    })
  })

  it('serializes to the same JSON, key order included', () => {
    expect(JSON.stringify(jobListingToApplicationInput(JOB, '{city}, Suisse'))).toBe(
      JSON.stringify({
        job_title: 'Data Engineer',
        company_name: 'Beispiel AG',
        location: 'Zürich, Suisse',
        salary_min: 90000,
        salary_max: 110000,
        job_url: 'https://jobs.example.test/offers/data-engineer',
        job_description: 'Listing description.',
        source: 'Adzuna',
      })
    )
  })

  it('prefers the full location to the template', () => {
    expect(
      jobListingToApplicationInput({ ...JOB, location_full: 'Zürich, Zürich, Switzerland' }, '{city}, Suisse').location
    ).toBe('Zürich, Zürich, Switzerland')
  })

  it.each([
    ['no salary', undefined, null, null],
    ['an empty salary', '', null, null],
    ['one figure', 'From 85 000 CHF', 85000, null],
    ['two figures with spaces', '85 000 - 95 000 CHF', 85000, 95000],
    ['no figure', 'Competitive', null, null],
    ['a zero', '0 - 100', null, 100],
  ])('reads the salary bounds from %s', (_label, salaryRange, min, max) => {
    const input = jobListingToApplicationInput({ ...JOB, salary_range: salaryRange }, '{city}')
    expect([input.salary_min, input.salary_max]).toEqual([min, max])
  })

  it('sends null for a missing URL or description', () => {
    const input = jobListingToApplicationInput({ ...JOB, application_url: undefined, description: '' }, '{city}')
    expect(input.job_url).toBeNull()
    expect(input.job_description).toBeNull()
  })
})
