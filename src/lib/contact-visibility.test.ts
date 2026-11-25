import { describe, expect, it } from 'vitest'
import { CONTACT_FIELD_IDS, visibleContactDetails, withContactFieldVisible } from './contact-visibility'

const RESUME = {
  title: 'Kilnwright CFC',
  contact: {
    name: 'Robin Halvorsen',
    email: 'robin@halvorsen.test',
    phone: '+41 00 000 00 07',
    location: 'Oxbridge',
    linkedin: 'in/robin-halvorsen',
    github: 'gh/robin',
    website: 'halvorsen.test',
  },
}

describe('visibleContactDetails (swiss-cv-templates FR-14)', () => {
  it('returns the stored values unchanged when nothing is hidden', () => {
    for (const hidden of [undefined, []]) {
      const details = visibleContactDetails(RESUME, hidden)
      expect(details.contact).toEqual(RESUME.contact)
      expect(details).toMatchObject({ title: 'Kilnwright CFC', titleVisible: true, photoVisible: true })
    }
  })

  it('drops each hidden contact detail and keeps the name and the others', () => {
    const details = visibleContactDetails(RESUME, ['email', 'github'])
    expect(details.contact).toEqual({
      name: 'Robin Halvorsen',
      phone: '+41 00 000 00 07',
      location: 'Oxbridge',
      linkedin: 'in/robin-halvorsen',
      website: 'halvorsen.test',
    })
    expect(details.titleVisible).toBe(true)
  })

  it('hides every detail at once, and never the name', () => {
    const details = visibleContactDetails(RESUME, [...CONTACT_FIELD_IDS])
    expect(details.contact).toEqual({ name: 'Robin Halvorsen' })
    expect(details).toMatchObject({ title: '', titleVisible: false, photoVisible: false })
  })

  it('tells a hidden title from an empty one', () => {
    expect(visibleContactDetails({ ...RESUME, title: '' })).toMatchObject({ title: '', titleVisible: true })
    expect(visibleContactDetails(RESUME, ['title'])).toMatchObject({ title: '', titleVisible: false })
  })

  it('hides the photo through its own flag', () => {
    expect(visibleContactDetails(RESUME, ['photo']).photoVisible).toBe(false)
    expect(visibleContactDetails(RESUME, ['photo']).contact).toEqual(RESUME.contact)
  })

  it('never touches the stored resume', () => {
    const stored = structuredClone(RESUME)
    const details = visibleContactDetails(stored, ['email', 'title'])
    expect(stored).toEqual(RESUME)
    expect(details.contact).not.toBe(stored.contact)
  })

  it('reads a row with no contact or title at all', () => {
    expect(visibleContactDetails({ contact: null, title: null })).toEqual({
      contact: {},
      title: '',
      titleVisible: true,
      photoVisible: true,
    })
  })
})

describe('withContactFieldVisible', () => {
  it('adds an unticked field and removes a ticked one', () => {
    expect(withContactFieldVisible([], 'email', false)).toEqual(['email'])
    expect(withContactFieldVisible(['email', 'photo'], 'email', true)).toEqual(['photo'])
  })

  it('stores the canonical order without repeats, whatever order the ticks came in', () => {
    const hidden = withContactFieldVisible(withContactFieldVisible(['photo'], 'title', false), 'photo', false)
    expect(hidden).toEqual(['title', 'photo'])
  })

  it('is a no-op for a field already in the state asked for', () => {
    expect(withContactFieldVisible(['phone'], 'phone', false)).toEqual(['phone'])
    expect(withContactFieldVisible([], 'phone', true)).toEqual([])
  })
})
