import { describe, expect, it } from 'vitest'
import en from '@/locales/en/jobs.json'
import fr from '@/locales/fr/jobs.json'
import de from '@/locales/de/jobs.json'
import it_ from '@/locales/it/jobs.json'
import { JOB_STATUSES } from '@/lib/constants/job-statuses'

/**
 * Each status is a Kanban column, a filter option and a badge, so two statuses
 * sharing a label would make two columns indistinguishable - "rejected" (by the
 * employer) and "declined" (the offer turned down) once both read "Abgelehnt"
 * in de.
 */

const STATUSES = { en: en.statuses, fr: fr.statuses, de: de.statuses, it: it_.statuses }

describe('jobs.statuses', () => {
  for (const [locale, statuses] of Object.entries(STATUSES)) {
    it(`${locale}: the seven status labels are distinct`, () => {
      const labels = JOB_STATUSES.map((status) => (statuses as Record<string, string>)[status])
      expect(labels.every(Boolean)).toBe(true)
      expect(new Set(labels).size).toBe(JOB_STATUSES.length)
    })
  }

  it('de: rejected and declined keep their own meaning', () => {
    expect(de.statuses.rejected).toBe('Abgelehnt')
    expect(de.statuses.declined).toBe('Abgesagt')
  })
})
