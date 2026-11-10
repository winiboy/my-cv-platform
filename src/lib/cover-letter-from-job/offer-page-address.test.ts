import { describe, expect, it } from 'vitest'
import { COVER_LETTER_FIELD_LIMITS } from '@/lib/cover-letter-limits'
import { companyAddressFromOfferPage } from './offer-page-address'

/**
 * Reading the company's address from an offer page's JSON-LD
 * (cover-letter-recipient-address-from-offer, US-001).
 */

/**
 * JSON as a page embeds it in a script: `<` escaped as `<`, so a value
 * holding `</script>` cannot end the block early, as real boards publish it.
 */
function embeddedJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

function page(...blocks: unknown[]): string {
  const scripts = blocks
    .map((block) => `<script type="application/ld+json">${typeof block === 'string' ? block : embeddedJson(block)}</script>`)
    .join('\n')
  return `<!doctype html><html><head><title>Offer</title>${scripts}</head><body><h1>Data Engineer</h1></body></html>`
}

const LAUSANNE = {
  '@type': 'PostalAddress',
  streetAddress: 'Avenue de la Gare 10',
  postalCode: '1003',
  addressLocality: 'Lausanne',
  addressCountry: 'CH',
}

const ZURICH = {
  '@type': 'PostalAddress',
  streetAddress: 'Bahnhofstrasse 1',
  postalCode: '8001',
  addressLocality: 'Zürich',
  addressCountry: 'CH',
}

function posting(fields: Record<string, unknown>): Record<string, unknown> {
  return { '@context': 'https://schema.org', '@type': 'JobPosting', title: 'Data Engineer', ...fields }
}

describe('companyAddressFromOfferPage', () => {
  it('reads the hiring organization address: street, then postcode and locality', () => {
    const html = page(posting({ hiringOrganization: { '@type': 'Organization', name: 'Beispiel AG', address: LAUSANNE } }))

    expect(companyAddressFromOfferPage(html)).toBe('Avenue de la Gare 10\n1003 Lausanne')
  })

  it.each(['1003 Lausanne', '1003  Lausanne', ' 1003\tLausanne '])(
    'does not repeat a postcode the locality already starts with: %j',
    (locality) => {
      const html = page(posting({ hiringOrganization: { address: { ...LAUSANNE, addressLocality: locality } } }))

      expect(companyAddressFromOfferPage(html)).toBe('Avenue de la Gare 10\n1003 Lausanne')
    }
  )

  it('keeps a locality that only starts with the same digits as the postcode', () => {
    const html = page(posting({ hiringOrganization: { address: { ...LAUSANNE, postalCode: '100', addressLocality: '1003 Lausanne' } } }))

    expect(companyAddressFromOfferPage(html)).toBe('Avenue de la Gare 10\n100 1003 Lausanne')
  })

  it('never repeats the company name', () => {
    const html = page(posting({ hiringOrganization: { name: 'Beispiel AG', address: LAUSANNE } }))

    expect(companyAddressFromOfferPage(html)).not.toContain('Beispiel')
  })

  it('reads the job location address when the hiring organization has none', () => {
    const html = page(
      posting({
        hiringOrganization: { name: 'Beispiel AG' },
        jobLocation: { '@type': 'Place', address: ZURICH },
      })
    )

    expect(companyAddressFromOfferPage(html)).toBe('Bahnhofstrasse 1\n8001 Zürich')
  })

  it('prefers the hiring organization when both have an address', () => {
    const html = page(
      posting({
        jobLocation: { '@type': 'Place', address: ZURICH },
        hiringOrganization: { name: 'Beispiel AG', address: LAUSANNE },
      })
    )

    expect(companyAddressFromOfferPage(html)).toBe('Avenue de la Gare 10\n1003 Lausanne')
  })

  it('prefers a hiring organization address in a later block over a job location in an earlier one', () => {
    const html = page(
      posting({ jobLocation: { address: ZURICH } }),
      posting({ hiringOrganization: { name: 'Beispiel AG', address: LAUSANNE } })
    )

    expect(companyAddressFromOfferPage(html)).toBe('Avenue de la Gare 10\n1003 Lausanne')
  })

  it('falls back to the job location when the hiring organization address is incomplete', () => {
    const html = page(
      posting({
        hiringOrganization: { name: 'Beispiel AG', address: { addressLocality: 'Lausanne' } },
        jobLocation: { address: ZURICH },
      })
    )

    expect(companyAddressFromOfferPage(html)).toBe('Bahnhofstrasse 1\n8001 Zürich')
  })

  it('takes the first complete job location among several, and the first complete address among several', () => {
    const html = page(
      posting({
        jobLocation: [
          { address: { addressLocality: 'Genève', addressCountry: 'CH' } },
          { address: [{ postalCode: '3000', addressLocality: 'Bern' }, ZURICH, LAUSANNE] },
        ],
      })
    )

    expect(companyAddressFromOfferPage(html)).toBe('Bahnhofstrasse 1\n8001 Zürich')
  })

  describe('an incomplete address is not used', () => {
    it.each([
      ['a locality alone', { addressLocality: 'Lausanne', addressCountry: 'CH' }],
      ['a postcode and locality without a street', { postalCode: '1003', addressLocality: 'Lausanne' }],
      ['a street and locality without a postcode', { streetAddress: 'Avenue de la Gare 10', addressLocality: 'Lausanne' }],
      ['a street and postcode without a locality', { streetAddress: 'Avenue de la Gare 10', postalCode: '1003' }],
      ['a street that is only markup', { ...LAUSANNE, streetAddress: '<b> </b>' }],
      ['a street of whitespace', { ...LAUSANNE, streetAddress: '   ' }],
      ['a locality that is only the postcode', { ...LAUSANNE, addressLocality: '1003' }],
      ['a locality that is only the postcode and whitespace', { ...LAUSANNE, addressLocality: ' 1003  ' }],
    ])('%s', (_label, address) => {
      const html = page(posting({ hiringOrganization: { address }, jobLocation: { address } }))

      expect(companyAddressFromOfferPage(html)).toBeNull()
    })

    it.each([
      ['street', 'streetAddress', 'Avenue de la Gare 10�'],
      ['postcode', 'postalCode', '10�3'],
      ['locality', 'addressLocality', 'Z�rich'],
      ['country', 'addressCountry', 'Fran�e'],
    ])('a %s with a replacement character, the trace of a wrong charset', (_label, field, value) => {
      const html = page(posting({ hiringOrganization: { address: { ...LAUSANNE, [field]: value } } }))

      expect(companyAddressFromOfferPage(html)).toBeNull()
    })

    it('a plain-string address', () => {
      const html = page(posting({ hiringOrganization: { address: 'Avenue de la Gare 10, 1003 Lausanne' } }))

      expect(companyAddressFromOfferPage(html)).toBeNull()
    })
  })

  describe('the country', () => {
    it('is a third line when it is not Switzerland', () => {
      const html = page(
        posting({
          hiringOrganization: {
            address: { streetAddress: '12 Rue de Rivoli', postalCode: '75001', addressLocality: 'Paris', addressCountry: 'France' },
          },
        })
      )

      expect(companyAddressFromOfferPage(html)).toBe('12 Rue de Rivoli\n75001 Paris\nFrance')
    })

    it('is read from a Country node', () => {
      const html = page(
        posting({
          hiringOrganization: {
            address: { ...ZURICH, addressCountry: { '@type': 'Country', name: 'DE' } },
          },
        })
      )

      expect(companyAddressFromOfferPage(html)).toBe('Bahnhofstrasse 1\n8001 Zürich\nDE')
    })

    it.each(['CH', 'ch', 'CHE', 'Switzerland', 'Suisse', 'SCHWEIZ', 'Svizzera', 'Svizra', ' Schweiz '])(
      'is left out for Switzerland written %j',
      (country) => {
        const html = page(posting({ hiringOrganization: { address: { ...LAUSANNE, addressCountry: country } } }))

        expect(companyAddressFromOfferPage(html)).toBe('Avenue de la Gare 10\n1003 Lausanne')
      }
    )

    it('is left out for a Switzerland Country node', () => {
      const html = page(
        posting({ hiringOrganization: { address: { ...LAUSANNE, addressCountry: { '@type': 'Country', name: 'CH' } } } })
      )

      expect(companyAddressFromOfferPage(html)).toBe('Avenue de la Gare 10\n1003 Lausanne')
    })

    it('is left out when it is missing', () => {
      const html = page(posting({ hiringOrganization: { address: { ...LAUSANNE, addressCountry: undefined } } }))

      expect(companyAddressFromOfferPage(html)).toBe('Avenue de la Gare 10\n1003 Lausanne')
    })
  })

  describe('the JSON-LD shapes job boards publish', () => {
    it('reads a JobPosting inside an @graph', () => {
      const html = page({
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'WebPage', name: 'Offer' },
          { '@type': 'JobPosting', hiringOrganization: { address: LAUSANNE } },
        ],
      })

      expect(companyAddressFromOfferPage(html)).toBe('Avenue de la Gare 10\n1003 Lausanne')
    })

    it('reads a JobPosting in a top-level array', () => {
      const html = page([{ '@type': 'BreadcrumbList' }, posting({ hiringOrganization: { address: LAUSANNE } })])

      expect(companyAddressFromOfferPage(html)).toBe('Avenue de la Gare 10\n1003 Lausanne')
    })

    it('reads a node whose @type is a list containing JobPosting', () => {
      const html = page({ '@type': ['Thing', 'JobPosting'], hiringOrganization: { address: LAUSANNE } })

      expect(companyAddressFromOfferPage(html)).toBe('Avenue de la Gare 10\n1003 Lausanne')
    })

    it('ignores an address on a node that is not a JobPosting', () => {
      const html = page({ '@type': 'Organization', name: 'Beispiel AG', address: LAUSANNE, hiringOrganization: { address: LAUSANNE } })

      expect(companyAddressFromOfferPage(html)).toBeNull()
    })

    it.each(['http://schema.org/JobPosting', 'https://schema.org/JobPosting', 'schema:JobPosting', 'https://schema.org/jobposting', 'http://schema.org#JobPosting'])(
      'reads a node whose @type is the full name %j',
      (type) => {
        const html = page({ '@type': type, hiringOrganization: { address: LAUSANNE } })

        expect(companyAddressFromOfferPage(html)).toBe('Avenue de la Gare 10\n1003 Lausanne')
      }
    )

    it.each(['https://schema.org/JobPostingDraft', 'https://example.com/NotAJobPosting'])(
      'ignores a full name that does not end in JobPosting: %j',
      (type) => {
        const html = page({ '@type': type, hiringOrganization: { address: LAUSANNE } })

        expect(companyAddressFromOfferPage(html)).toBeNull()
      }
    )

    it('finds the block after text with characters whose lower case is longer', () => {
      // "İ" lower-cases to two code units; the block must still be cut where it is.
      const html = `<html><head><title>İstanbul İŞ A.Ş.</title><meta name="description" content="İİİİ">${page(
        posting({ hiringOrganization: { name: 'İŞBANK', address: LAUSANNE } })
      )}`

      expect(companyAddressFromOfferPage(html)).toBe('Avenue de la Gare 10\n1003 Lausanne')
    })

    it('reads a postcode given as a number', () => {
      const html = page(posting({ hiringOrganization: { address: { ...LAUSANNE, postalCode: 1003 } } }))

      expect(companyAddressFromOfferPage(html)).toBe('Avenue de la Gare 10\n1003 Lausanne')
    })

    it.each([
      ["single quotes", "<script type='application/ld+json'>"],
      ['no quotes', '<script type=application/ld+json>'],
      ['upper case and other attributes', '<SCRIPT id="ld" TYPE="Application/LD+JSON" nonce="x">'],
    ])('finds the block with %s', (_label, openTag) => {
      const json = JSON.stringify(posting({ hiringOrganization: { address: LAUSANNE } }))
      const html = `<html><head>${openTag}${json}</script></head></html>`

      expect(companyAddressFromOfferPage(html)).toBe('Avenue de la Gare 10\n1003 Lausanne')
    })

    it('ignores JSON in a script of another type', () => {
      const json = JSON.stringify(posting({ hiringOrganization: { address: LAUSANNE } }))
      const html = `<html><script type="application/json">${json}</script><script>var x = 1</script></html>`

      expect(companyAddressFromOfferPage(html)).toBeNull()
    })
  })

  describe('pages without a usable block', () => {
    it('skips a malformed block and still reads the next one', () => {
      const html = page('{"@type": "JobPosting", "hiringOrganization": {', posting({ jobLocation: { address: ZURICH } }))

      expect(companyAddressFromOfferPage(html)).toBe('Bahnhofstrasse 1\n8001 Zürich')
    })

    it.each([
      ['malformed JSON-LD only', page('{not json')],
      ['no JSON-LD', '<html><body><p>Avenue de la Gare 10, 1003 Lausanne</p></body></html>'],
      ['an empty page', ''],
      ['a block that never closes', `<script type="application/ld+json">${JSON.stringify(posting({ hiringOrganization: { address: LAUSANNE } }))}`],
      ['a script tag that never ends', '<script type="application/ld+json"'],
      ['JSON-LD null', page('null')],
      ['a JobPosting without addresses', page(posting({ hiringOrganization: { name: 'Beispiel AG' } }))],
    ])('gives null for %s', (_label, html) => {
      expect(companyAddressFromOfferPage(html)).toBeNull()
    })

    it('stays linear on a page of unclosed script tags', () => {
      // A quadratic scan of 30 000 tags takes minutes; the generous bound only
      // keeps a loaded runner from failing a linear one.
      const html = '<script type="application/ld+json">'.repeat(30_000)
      const started = performance.now()

      expect(companyAddressFromOfferPage(html)).toBeNull()
      expect(performance.now() - started).toBeLessThan(5_000)
    })
  })

  describe('untrusted values', () => {
    it('removes markup, decodes entities and keeps each part on one line', () => {
      const html = page(
        posting({
          hiringOrganization: {
            address: {
              streetAddress: '<b>Avenue</b> de la\nGare&nbsp;10<script>alert(1)</script>',
              postalCode: ' 1003\u0000 ',
              addressLocality: 'Lausanne &amp; environs<img src=x onerror=alert(1)>',
              addressCountry: '<i>CH</i>',
            },
          },
        })
      )

      expect(companyAddressFromOfferPage(html)).toBe('Avenue de la Gare 10\n1003 Lausanne & environs')
    })

    it('ends a block at a literal </script>, as a browser does, and then skips it as malformed', () => {
      const json = JSON.stringify(posting({ hiringOrganization: { address: { ...LAUSANNE, streetAddress: 'a</script>b' } } }))
      const html = `<script type="application/ld+json">${json}</script>`

      expect(companyAddressFromOfferPage(html)).toBeNull()
    })

    it('never exceeds the company_address limit', () => {
      const long = 'x'.repeat(5_000)
      const html = page(
        posting({
          hiringOrganization: {
            // The locality differs from the postcode, which would otherwise be a repeat of it.
            address: { streetAddress: long, postalCode: long, addressLocality: 'y'.repeat(5_000), addressCountry: long },
          },
        })
      )

      const address = companyAddressFromOfferPage(html)
      expect(address).not.toBeNull()
      expect(address?.split('\n')).toHaveLength(3)
      expect(address?.length).toBeLessThanOrEqual(COVER_LETTER_FIELD_LIMITS.company_address)
    })
  })
})
