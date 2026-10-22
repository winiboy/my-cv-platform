import { describe, expect, it } from 'vitest'
import type { Active, Over } from '@dnd-kit/core'
import en from '@/locales/en/common.json'
import fr from '@/locales/fr/common.json'
import de from '@/locales/de/common.json'
import it_ from '@/locales/it/common.json'
import enJobs from '@/locales/en/jobs.json'
import frJobs from '@/locales/fr/jobs.json'
import deJobs from '@/locales/de/jobs.json'
import itJobs from '@/locales/it/jobs.json'
import { createKanbanDndAccessibility, KANBAN_DND_FALLBACK } from './kanban-dnd-accessibility'

/**
 * dnd-kit calls the announcement callbacks with ids only. The builder must name
 * the card by title and company and the column by its localized status label,
 * and never fall back to the application UUID or the raw status key.
 */

const LOCALES = {
  en: { dnd: en.kanban.dnd, statuses: enJobs.statuses },
  fr: { dnd: fr.kanban.dnd, statuses: frJobs.statuses },
  de: { dnd: de.kanban.dnd, statuses: deJobs.statuses },
  it: { dnd: it_.kanban.dnd, statuses: itJobs.statuses },
} as const

const UUID = '6f1c2a9e-3b4d-4e5f-8a7b-9c0d1e2f3a4b'

function active(data: unknown = { jobApplication: { job_title: 'Designer', company_name: 'Acme' }, status: 'saved' }): Active {
  return { id: UUID, data: { current: data }, rect: { current: { initial: null, translated: null } } } as unknown as Active
}

function over(id: string): Over {
  return { id, rect: {}, disabled: false, data: { current: undefined } } as unknown as Over
}

describe('createKanbanDndAccessibility', () => {
  for (const [locale, { dnd, statuses }] of Object.entries(LOCALES)) {
    describe(locale, () => {
      const { announcements, screenReaderInstructions } = createKanbanDndAccessibility(dnd, statuses)
      const card = active()

      it('uses the locale instructions', () => {
        expect(screenReaderInstructions.draggable).toBe(dnd.instructions)
      })

      it('names card and column in every event', () => {
        const texts = {
          pickedUp: announcements.onDragStart({ active: card }),
          movedOver: announcements.onDragOver({ active: card, over: over('applied') }),
          notOver: announcements.onDragOver({ active: card, over: null }),
          dropped: announcements.onDragEnd({ active: card, over: over('applied') }),
          droppedOutside: announcements.onDragEnd({ active: card, over: null }),
          cancelled: announcements.onDragCancel({ active: card, over: over('applied') }),
        }
        const columnFor: Record<keyof typeof texts, string | null> = {
          pickedUp: statuses.saved,
          movedOver: statuses.applied,
          notOver: null,
          dropped: statuses.applied,
          droppedOutside: null,
          cancelled: statuses.saved,
        }
        for (const [key, text] of Object.entries(texts) as [keyof typeof texts, string | undefined][]) {
          const column = columnFor[key] ?? ''
          expect(text, key).toBe(
            dnd[key].replace('{title}', 'Designer').replace('{company}', 'Acme').replace('{column}', column)
          )
          expect(text, key).not.toContain(UUID)
          expect(text, key).not.toMatch(/\{(title|company|column)\}/)
        }
      })
    })
  }

  it('en wording names the card and the column', () => {
    const { announcements } = createKanbanDndAccessibility(en.kanban.dnd, enJobs.statuses)
    expect(announcements.onDragStart({ active: active() })).toBe('Picked up Designer at Acme from the Saved column.')
    expect(announcements.onDragEnd({ active: active(), over: over('interviewing') })).toBe(
      'Designer at Acme was dropped in the Interviewing column.'
    )
  })

  it('keeps the pick-up announcement: the first "over" its own column is silent', () => {
    const { announcements } = createKanbanDndAccessibility(en.kanban.dnd, enJobs.statuses)
    const card = active()
    expect(announcements.onDragStart({ active: card })).toBe('Picked up Designer at Acme from the Saved column.')
    expect(announcements.onDragOver({ active: card, over: over('saved') })).toBeUndefined()
    expect(announcements.onDragOver({ active: card, over: over('applied') })).toBe(
      'Designer at Acme is over the Applied column.'
    )
    // Back over its own column later in the same drag: announced.
    expect(announcements.onDragOver({ active: card, over: over('saved') })).toBe(
      'Designer at Acme is over the Saved column.'
    )
    expect(announcements.onDragOver({ active: card, over: null })).toBe('Designer at Acme is not over a column.')
    expect(announcements.onDragEnd({ active: card, over: over('saved') })).toBe(
      'Designer at Acme was dropped in the Saved column.'
    )
    // The next drag starts fresh.
    const other = active({ jobApplication: { job_title: 'Writer', company_name: 'Beta' }, status: 'offer' })
    expect(announcements.onDragStart({ active: other })).toBe('Picked up Writer at Beta from the Offer column.')
    expect(announcements.onDragOver({ active: other, over: over('offer') })).toBeUndefined()
    expect(announcements.onDragCancel({ active: other, over: over('offer') })).toBe(
      'Move cancelled. Writer at Beta stays in the Offer column.'
    )
  })

  it('inserts user text literally', () => {
    const { announcements } = createKanbanDndAccessibility(en.kanban.dnd, enJobs.statuses)
    const tricky = active({ jobApplication: { job_title: '{column} $& lead', company_name: '$1 {title}' }, status: 'saved' })
    expect(announcements.onDragOver({ active: tricky, over: over('offer') })).toBe(
      '{column} $& lead at $1 {title} is over the Offer column.'
    )
  })

  it('stays silent rather than announce an id it cannot name', () => {
    const { announcements } = createKanbanDndAccessibility(en.kanban.dnd, enJobs.statuses)
    expect(announcements.onDragStart({ active: active(null) })).toBeUndefined()
    expect(announcements.onDragOver({ active: active(), over: over(UUID) })).toBeUndefined()
    expect(announcements.onDragEnd({ active: active({ jobApplication: {}, status: 'saved' }), over: over('saved') })).toBeUndefined()
  })

  it('falls back to the English text and status label for a missing key', () => {
    const { announcements, screenReaderInstructions } = createKanbanDndAccessibility({}, {})
    expect(screenReaderInstructions.draggable).toBe(KANBAN_DND_FALLBACK.instructions)
    expect(announcements.onDragOver({ active: active(), over: over('declined') })).toBe(
      'Designer at Acme is over the Declined column.'
    )
  })

  it('the en dictionary equals the fallback', () => {
    expect(en.kanban.dnd).toEqual(KANBAN_DND_FALLBACK)
  })
})
