import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@/locales/en/jobs.json'
import fr from '@/locales/fr/jobs.json'
import de from '@/locales/de/jobs.json'
import it_ from '@/locales/it/jobs.json'
import {
  fillTemplate,
  formatJobSearchCount,
  formatJobSearchDate,
  formatResumeUpdatedDate,
  jobLocationLabel,
  jobSearchIntlLocale,
} from '@/lib/job-search-format'

// Midday UTC, so the calendar day is the 15th in every time zone the suite runs in.
const POSTED = '2026-01-15T12:00:00Z'

describe('formatJobSearchDate', () => {
  it('keeps the en-GB format the English page always showed', () => {
    expect(jobSearchIntlLocale('en')).toBe('en-GB')
    expect(formatJobSearchDate(POSTED, 'en')).toBe('15/01/2026')
  })

  it('formats with the page locale in fr, de and it', () => {
    expect(formatJobSearchDate(POSTED, 'fr')).toBe('15/01/2026')
    expect(formatJobSearchDate(POSTED, 'de')).toBe('15.1.2026')
    // Day and month padding for `it` differs between ICU versions.
    expect(formatJobSearchDate(POSTED, 'it')).toMatch(/^15\/0?1\/2026$/)
  })
})

describe('formatJobSearchCount', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps the runtime default locale in en, as the English line always did', () => {
    const spy = vi.spyOn(Number.prototype, 'toLocaleString')
    expect(formatJobSearchCount(12345, 'en')).toBe((12345).toLocaleString())
    expect(spy.mock.calls[0]).toEqual([undefined])
  })

  it('groups digits per the page locale in fr, de and it', () => {
    const spy = vi.spyOn(Number.prototype, 'toLocaleString')
    expect(formatJobSearchCount(12345, 'de')).toBe('12.345')
    expect(formatJobSearchCount(12345, 'it')).toBe('12.345')
    expect(formatJobSearchCount(12345, 'fr').replace(/\s/g, ' ')).toBe('12 345')
    expect(spy.mock.calls).toEqual([['de'], ['it'], ['fr']])
  })
})

describe('formatResumeUpdatedDate', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps the runtime default locale in en, as the selector always did', () => {
    const spy = vi.spyOn(Date.prototype, 'toLocaleDateString')
    expect(formatResumeUpdatedDate(POSTED, 'en')).toBe(new Date(POSTED).toLocaleDateString())
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy.mock.calls[0]).toEqual([undefined])
  })

  it('formats with the page locale in fr, de and it', () => {
    const spy = vi.spyOn(Date.prototype, 'toLocaleDateString')
    expect(formatResumeUpdatedDate(POSTED, 'fr')).toBe('15/01/2026')
    expect(formatResumeUpdatedDate(POSTED, 'de')).toBe('15.1.2026')
    expect(formatResumeUpdatedDate(POSTED, 'it')).toMatch(/^15\/0?1\/2026$/)
    expect(spy.mock.calls).toEqual([['fr'], ['de'], ['it']])
  })
})

describe('fillTemplate', () => {
  it('replaces every named placeholder', () => {
    expect(fillTemplate('All {count} jobs loaded', { count: '50' })).toBe('All 50 jobs loaded')
    expect(fillTemplate('{a} and {a}', { a: 'x' })).toBe('x and x')
  })

  it('leaves a placeholder without a value as written', () => {
    expect(fillTemplate('Updated {date}', {})).toBe('Updated {date}')
  })

  it('does not read inherited properties as values', () => {
    expect(fillTemplate('{toString}', {})).toBe('{toString}')
  })
})

describe('jobLocationLabel', () => {
  const cityOnly = { location_city: 'Lausanne' }

  it('keeps the English text in en', () => {
    expect(jobLocationLabel(cityOnly, en.locationInSwitzerland)).toBe('Lausanne, Switzerland')
  })

  it('names the country in the page language elsewhere', () => {
    expect(jobLocationLabel(cityOnly, fr.locationInSwitzerland)).toBe('Lausanne, Suisse')
    expect(jobLocationLabel(cityOnly, de.locationInSwitzerland)).toBe('Lausanne, Schweiz')
    expect(jobLocationLabel(cityOnly, it_.locationInSwitzerland)).toBe('Lausanne, Svizzera')
  })

  it("prefers the listing's own full location, which is job data", () => {
    expect(jobLocationLabel({ location_city: 'Zürich', location_full: 'Zürich, ZH' }, fr.locationInSwitzerland)).toBe(
      'Zürich, ZH',
    )
  })
})

describe('Job Search placeholders', () => {
  it('every locale keeps the placeholders the components fill', () => {
    for (const dict of [en, fr, de, it_]) {
      expect(dict.allJobsLoaded).toContain('{count}')
      expect(dict.locationInSwitzerland).toContain('{city}')
      expect(dict.resumeSelector.templateLabel).toContain('{template}')
      expect(dict.resumeSelector.updatedOn).toContain('{date}')
    }
  })
})
