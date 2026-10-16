import { describe, expect, it } from 'vitest'
import en_common from '@/locales/en/common.json'
import fr_common from '@/locales/fr/common.json'
import de_common from '@/locales/de/common.json'
import it_common from '@/locales/it/common.json'
import en_jobs from '@/locales/en/jobs.json'
import fr_jobs from '@/locales/fr/jobs.json'
import de_jobs from '@/locales/de/jobs.json'
import it_jobs from '@/locales/it/jobs.json'
import en_marketing from '@/locales/en/marketing.json'
import fr_marketing from '@/locales/fr/marketing.json'
import de_marketing from '@/locales/de/marketing.json'
import it_marketing from '@/locales/it/marketing.json'
import en_tools from '@/locales/en/tools.json'
import fr_tools from '@/locales/fr/tools.json'
import de_tools from '@/locales/de/tools.json'
import it_tools from '@/locales/it/tools.json'

/**
 * Every namespace of every locale carries exactly en's keys, none of them empty.
 *
 * `getTranslations` does not merge en into the other locales, so a key missing
 * from fr does not show English text - it shows whatever hard-coded fallback
 * the component happens to have, or nothing. The subset tests next to the
 * components cover hand-picked keys; this one covers the whole file, so a key
 * added to en alone fails here instead of on a page.
 */

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

const NAMESPACES = {
  common: { en: en_common, fr: fr_common, de: de_common, it: it_common },
  jobs: { en: en_jobs, fr: fr_jobs, de: de_jobs, it: it_jobs },
  marketing: { en: en_marketing, fr: fr_marketing, de: de_marketing, it: it_marketing },
  tools: { en: en_tools, fr: fr_tools, de: de_tools, it: it_tools },
} as const

const TRANSLATED_LOCALES = ['fr', 'de', 'it'] as const

/** Leaf values keyed by dotted path; array items are addressed by index. */
function flatten(value: Json, path = '', out = new Map<string, Json>()): Map<string, Json> {
  if (Array.isArray(value)) {
    value.forEach((item, index) => flatten(item, `${path}[${index}]`, out))
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, path ? `${path}.${key}` : key, out)
    }
  } else {
    out.set(path, value)
  }
  return out
}

function isEmpty(value: Json): boolean {
  return value === null || (typeof value === 'string' && value.trim() === '')
}

interface ParityDiff {
  missing: string[]
  extra: string[]
  empty: string[]
}

/** Keys `candidate` lacks, keys only it has, and its keys whose value is empty. */
function diffAgainstReference(reference: Json, candidate: Json): ParityDiff {
  const referenceKeys = flatten(reference)
  const candidateKeys = flatten(candidate)

  return {
    missing: [...referenceKeys.keys()].filter((key) => !candidateKeys.has(key)),
    extra: [...candidateKeys.keys()].filter((key) => !referenceKeys.has(key)),
    empty: [...candidateKeys].filter(([, value]) => isEmpty(value)).map(([key]) => key),
  }
}

const NO_DIFF: ParityDiff = { missing: [], extra: [], empty: [] }

describe('locale namespace parity', () => {
  for (const [namespace, locales] of Object.entries(NAMESPACES)) {
    it(`en/${namespace}.json has no empty value`, () => {
      expect(diffAgainstReference(locales.en, locales.en)).toEqual(NO_DIFF)
    })

    for (const locale of TRANSLATED_LOCALES) {
      it(`${locale}/${namespace}.json has exactly en's keys, none empty`, () => {
        expect(diffAgainstReference(locales.en, locales[locale])).toEqual(NO_DIFF)
      })
    }
  }
})

/**
 * Control cases: the diff must catch each kind of drift. Without them, a diff
 * that compared nothing (for instance, a flatten that returned no keys) would
 * pass every parity test above.
 */
describe('diffAgainstReference', () => {
  const reference: Json = {
    title: 'Title',
    nested: { label: 'Label', hint: 'Hint' },
    items: ['One', 'Two'],
  }

  it('reports nothing for a complete copy', () => {
    expect(diffAgainstReference(reference, structuredClone(reference))).toEqual(NO_DIFF)
  })

  it('reports a key removed from the candidate', () => {
    const candidate = structuredClone(reference) as { nested: Record<string, Json> }
    delete candidate.nested.hint

    expect(diffAgainstReference(reference, candidate)).toEqual({
      ...NO_DIFF,
      missing: ['nested.hint'],
    })
  })

  it('reports a key only the candidate has', () => {
    const candidate = structuredClone(reference) as { nested: Record<string, Json> }
    candidate.nested.extra = 'Extra'

    expect(diffAgainstReference(reference, candidate)).toEqual({
      ...NO_DIFF,
      extra: ['nested.extra'],
    })
  })

  it('reports an empty or blank value', () => {
    const candidate = structuredClone(reference) as {
      title: Json
      nested: Record<string, Json>
    }
    candidate.title = ''
    candidate.nested.label = '   '

    expect(diffAgainstReference(reference, candidate)).toEqual({
      ...NO_DIFF,
      empty: ['title', 'nested.label'],
    })
  })

  it('reports a missing array item', () => {
    const candidate = structuredClone(reference) as { items: Json[] }
    candidate.items.pop()

    expect(diffAgainstReference(reference, candidate)).toEqual({
      ...NO_DIFF,
      missing: ['items[1]'],
    })
  })

  it('reports a whole object missing from a real locale', () => {
    const candidate = structuredClone(fr_common) as unknown as {
      coverLetters: { editor: Record<string, Json> }
    }
    delete candidate.coverLetters.editor.signature

    const diff = diffAgainstReference(en_common, candidate as unknown as Json)
    expect(diff.missing).toContain('coverLetters.editor.signature.signOffLabel')
    expect(diff.missing).toContain('coverLetters.editor.signature.signOffOptions.sincerely')
    expect(diff.extra).toEqual([])
    expect(diff.empty).toEqual([])
  })
})
