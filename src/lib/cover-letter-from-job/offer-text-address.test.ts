import { describe, expect, it } from 'vitest'
import { AI_TEST_STUB_OFFER_TEXT_ADDRESS } from '@/lib/ai/test-stub-contract'
import { companyAddressFromOfferText } from './offer-text-address'

/**
 * The address the AI reads from the offer's text is stored only when the text
 * itself writes it as one address block (cover-letter-recipient-address-from-offer,
 * US-002): the street as a whole segment of the text, then the postcode and
 * the locality as the next one. It is stored in the shape the page's address
 * has (US-001).
 */

const OFFER = `Wir suchen eine Data Engineer für unser Team.
Bewerbungen an: Beispiel AG, Rue du Lac 5, 1201 Genève.`

const GENEVA = { streetAddress: 'Rue du Lac 5', postalCode: '1201', addressLocality: 'Genève' }
const GENEVA_ADDRESS = 'Rue du Lac 5\n1201 Genève'

/** The company name the route stores with the letter. */
const COMPANY = 'Beispiel AG'

const COOP = { streetAddress: 'Thiersteinerallee 12', postalCode: '4053', addressLocality: 'Basel' }
const COOP_NAME = 'Coop Genossenschaft'

function addressFrom(candidate: unknown, offerText: string, companyName = COMPANY): string | null {
  return companyAddressFromOfferText(candidate, offerText, companyName)
}

/** The e2e offer texts, exactly as `e2e/cover-letter-recipient-address-from-offer.spec.ts` writes them. */
const E2E_FRENCH_OFFER = `Nous recherchons un ingénieur de données pour notre équipe à Lausanne. Vous serez responsable de la
conception des pipelines de données et vous travaillerez avec les équipes produit. Votre profil : au moins trois
ans d'expérience dans un poste similaire et une très bonne maîtrise de Python. Nous vous offrons un environnement
dynamique et une équipe motivée sur notre site.`

describe('companyAddressFromOfferText', () => {
  describe('an address the text writes as one address block is stored', () => {
    it.each<[string, unknown, string, string, string]>([
      ['a name on the line before the street', GENEVA, 'Beispiel AG\nRue du Lac 5\n1201 Genève', COMPANY, GENEVA_ADDRESS],
      ['one line, comma-separated', GENEVA, 'Rue du Lac 5, 1201 Genève', COMPANY, GENEVA_ADDRESS],
      ['paragraphs of markup', COOP, '<p>Coop</p><p>Thiersteinerallee 12</p><p>4053 Basel</p>', COOP_NAME, 'Thiersteinerallee 12\n4053 Basel'],
      [
        'a country prefix in the text only',
        { streetAddress: 'Chemin des Roches 14', postalCode: '1208', addressLocality: 'Genève' },
        'Chemin des Roches 14, CH-1208 Genève',
        COMPANY,
        'Chemin des Roches 14\n1208 Genève',
      ],
      [
        'a P.O. box between the street and the postcode',
        { streetAddress: 'Bahnhofstrasse 1', postalCode: '8001', addressLocality: 'Zürich' },
        'Bahnhofstrasse 1, Postfach, 8001 Zürich',
        COMPANY,
        'Bahnhofstrasse 1\n8001 Zürich',
      ],
      [
        'the postcode on the next line',
        { streetAddress: 'Via Nassa 5', postalCode: '6900', addressLocality: 'Lugano' },
        'Via Nassa 5\n6900 Lugano',
        COMPANY,
        'Via Nassa 5\n6900 Lugano',
      ],
      [
        "a street named like the company, without the company's legal form",
        { streetAddress: 'Avenue Nestlé 55', postalCode: '1800', addressLocality: 'Vevey' },
        'Avenue Nestlé 55, 1800 Vevey',
        'Nestlé SA',
        'Avenue Nestlé 55\n1800 Vevey',
      ],
      [
        'a house-number range before the street',
        { streetAddress: '12-14 Rue X', postalCode: '1003', addressLocality: 'Lausanne' },
        '12-14 Rue X, 1003 Lausanne',
        COMPANY,
        '12-14 Rue X\n1003 Lausanne',
      ],
      [
        'a Swiss country line, which prints no line',
        { streetAddress: 'Wankdorfallee 4', postalCode: '3030', addressLocality: 'Bern', addressCountry: 'Schweiz' },
        'Wankdorfallee 4\n3030 Bern\nSchweiz',
        'Die Post',
        'Wankdorfallee 4\n3030 Bern',
      ],
      [
        'a known country on the line after the locality',
        { streetAddress: 'Rue X 1', postalCode: '75001', addressLocality: 'Paris', addressCountry: 'France' },
        'Rue X 1, 75001 Paris, France',
        COMPANY,
        'Rue X 1\n75001 Paris\nFrance',
      ],
    ])('%s', (_label, candidate, offer, companyName, expected) => {
      expect(addressFrom(candidate, offer, companyName)).toBe(expected)
    })

    it('whatever the case and spacing, stored as the AI wrote it', () => {
      const offer = 'Adresse :  RUE  DU LAC 5\n\n1201   GENÈVE'
      expect(addressFrom({ ...GENEVA, streetAddress: ' rue du  Lac 5 ' }, offer)).toBe('rue du Lac 5\n1201 Genève')
    })

    it('across entities and inline markup in a segment', () => {
      const offer = '<p>Beispiel&nbsp;AG<br>Rue&nbsp;du <b>Lac</b> 5<br/>CH-1201 Gen&#232;ve</p>'
      expect(addressFrom(GENEVA, offer)).toBe(GENEVA_ADDRESS)
    })

    it('with composed and decomposed accents alike', () => {
      expect(addressFrom(GENEVA, 'Rue du Lac 5, 1201 Gene\u0300ve')).toBe(GENEVA_ADDRESS)
    })

    it('with a full stop ending the address, or a bullet before the street', () => {
      expect(addressFrom(GENEVA, 'Rue du Lac 5, 1201 Genève.')).toBe(GENEVA_ADDRESS)
      expect(addressFrom(GENEVA, '- Rue du Lac 5\n- 1201 Genève')).toBe(GENEVA_ADDRESS)
    })

    it('with a postcode repeated at the start of the locality', () => {
      expect(addressFrom({ ...GENEVA, addressLocality: '1201 Genève' }, OFFER)).toBe(GENEVA_ADDRESS)
    })

    it('with the parts stored as plain text, without their markup', () => {
      expect(
        addressFrom(
          { ...GENEVA, streetAddress: '<b>Rue du Lac 5</b><script>alert(1)</script>', addressLocality: '<i>Genève</i>' },
          OFFER
        )
      ).toBe(GENEVA_ADDRESS)
    })

    it('treating regular-expression characters in a part as text', () => {
      const offer = 'Av. de la Gare (Est) 10 | 1003 Lausanne'
      expect(
        addressFrom({ streetAddress: 'Av. de la Gare (Est) 10', postalCode: '1003', addressLocality: 'Lausanne' }, offer)
      ).toBe('Av. de la Gare (Est) 10\n1003 Lausanne')
      expect(
        addressFrom({ streetAddress: 'Av. de la Gare 1.*', postalCode: '1003', addressLocality: 'Lausanne' }, offer)
      ).toBeNull()
    })

    it.each([
      ['a numbered list', '1. Beispiel AG\n2. Rue du Lac 5\n3. 1201 Genève'],
      ['a list numbered with parentheses', '1) Beispiel AG\n2) Rue du Lac 5\n3) 1201 Genève'],
      ['Markdown bold lines', '**Beispiel AG**\n**Rue du Lac 5**\n**1201 Genève**'],
      ['a Markdown underlined street', '__Rue du Lac 5__, 1201 Genève'],
    ])('with %s', (_label, offer) => {
      expect(addressFrom(GENEVA, offer)).toBe(GENEVA_ADDRESS)
    })

    it('stored without the list number or Markdown markers the AI copied', () => {
      const offer = '1. Beispiel AG\n2. **Rue du Lac 5**\n3. 1201 Genève'
      expect(addressFrom({ ...GENEVA, streetAddress: '2. Rue du Lac 5' }, offer)).toBe(GENEVA_ADDRESS)
      expect(addressFrom({ ...GENEVA, streetAddress: '2) Rue du Lac 5' }, offer)).toBe(GENEVA_ADDRESS)
      expect(
        addressFrom({ streetAddress: '**Rue du Lac 5**', postalCode: '**1201**', addressLocality: '__Genève__' }, offer)
      ).toBe(GENEVA_ADDRESS)
    })

    it.each<[string, string, string]>([
      ['a German compound', 'Bahnhofstrasse 1', '8001'],
      ['an abbreviated German compound', 'Bahnhofstr. 1', '8001'],
      ['a German compound with sharp s', 'Hauptstraße 3', '8001'],
      ['a German compound joined by a hyphen', 'Bahnhof-Strasse 1', '8001'],
      ['a German type as a separate word', 'Unterer Graben 5', '8001'],
      ['a German square', 'Bundesplatz 3', '3003'],
      ['a German field', 'Seefeld 3', '8008'],
      ['an abbreviated French type', 'Ch. des Roches 14', '1208'],
      ['an Italian type', 'Via Nassa 5', '6900'],
      ['an English type', '1 Main Street', '8001'],
      ['an English abbreviation', '1 Main Rd', '8001'],
      ['a lane ending in "gaesslein"', 'Totengässlein 3', '4051'],
      ['an Italian small square', 'Piazzetta 1', '6900'],
      ['a French roundabout', 'Rond-Point de Plainpalais 2', '1205'],
      ['French steps', 'Escaliers du Marché 3', '1003'],
    ])('with a street type word: %s', (_label, streetAddress, postalCode) => {
      const candidate = { streetAddress, postalCode, addressLocality: 'Zürich' }
      expect(addressFrom(candidate, `${streetAddress}, ${postalCode} Zürich`)).toBe(`${streetAddress}\n${postalCode} Zürich`)
    })

    it.each<[string, string, string, string]>([
      ['St. Gallen', 'Rorschacher Strasse 95', '9007', 'Kantonsspital St. Gallen'],
      ['La Chaux-de-Fonds', 'Rue de la Serre 23', '2300', 'Ville de La Chaux-de-Fonds'],
      ['Le Locle', 'Rue Daniel-JeanRichard 22', '2400', 'Ville du Locle'],
      ['Rapperswil-Jona', 'Oberseestrasse 10', '8640', 'OST Rapperswil'],
    ])('with the locality %s, sharing words with the company %s', (addressLocality, streetAddress, postalCode, companyName) => {
      const offer = `${streetAddress}, ${postalCode} ${addressLocality}`
      expect(addressFrom({ streetAddress, postalCode, addressLocality }, offer, companyName)).toBe(
        `${streetAddress}\n${postalCode} ${addressLocality}`
      )
    })

    it('with a locality that is also a country name, alone', () => {
      const LUXEMBOURG = { streetAddress: 'Rue X 1', postalCode: 'L-1234', addressLocality: 'Luxembourg' }
      expect(addressFrom(LUXEMBOURG, 'Rue X 1, L-1234 Luxembourg')).toBe('Rue X 1\nL-1234 Luxembourg')
    })

    it.each(['Postfach 1234', 'Case postale 12', 'Casella postale 7', 'CP 45', 'PO Box 9'])(
      'with the P.O. box segment %s between the street and the postcode',
      (box) => {
        const ZURICH = { streetAddress: 'Bahnhofstrasse 1', postalCode: '8001', addressLocality: 'Zürich' }
        expect(addressFrom(ZURICH, `Bahnhofstrasse 1, ${box}, 8001 Zürich`)).toBe('Bahnhofstrasse 1\n8001 Zürich')
      }
    )

    it('when the address is repeated, from any place the text writes it whole', () => {
      const offer = `Nos bureaux de la Rue du Lac 5 sont modernes.\nAdresse : Rue du Lac 5, 1201 Genève.`
      expect(addressFrom(GENEVA, offer)).toBe(GENEVA_ADDRESS)
    })
  })

  describe('the e2e cases', () => {
    const stub = AI_TEST_STUB_OFFER_TEXT_ADDRESS

    it('(c) stores the stub address from the text that holds it', () => {
      const offer = `${E2E_FRENCH_OFFER}
Envoyez votre dossier à : ${COMPANY}, ${stub.streetAddress.toUpperCase()},
CH-${stub.postalCode}  ${stub.addressLocality}.`
      expect(addressFrom(stub, offer, COMPANY)).toBe(GENEVA_ADDRESS)
    })

    it('(d) stores nothing when the text puts the street in another town', () => {
      const offer = `${E2E_FRENCH_OFFER}
Envoyez votre dossier à : ${COMPANY}, ${stub.streetAddress}, 1003 Lausanne.`
      expect(addressFrom(stub, offer, COMPANY)).toBeNull()
    })
  })

  describe('a name, department or label joined to the street is refused', () => {
    it.each<[string, string, string, string]>([
      ['Coop', 'Coop\nThiersteinerallee 12\n4053 Basel', 'Coop Thiersteinerallee 12', COOP_NAME],
      ['La Poste', 'La Poste\nWankdorfallee 4\n3030 Bern', 'La Poste Wankdorfallee 4', 'Die Post'],
      ['a department', 'Ressources humaines\nRue du Lac 5\n3030 Bern', 'Ressources humaines Rue du Lac 5', COMPANY],
    ])('%s on the line before the street, answered joined with a space', (_label, offer, streetAddress, companyName) => {
      const [, , postcodeLocality] = offer.split('\n')
      const [postalCode, addressLocality] = postcodeLocality.split(' ')
      expect(addressFrom({ streetAddress, postalCode, addressLocality }, offer, companyName)).toBeNull()
    })

    describe.each<[string, string]>([
      ['paragraphs', '</p><p>'],
      ['divisions', '</div><div>'],
      ['line breaks', '<br>'],
      ['a line feed entity', '&#10;'],
      ['a carriage return entity', '&#13;'],
      ['a line separator', '\u2028'],
      ['a paragraph separator', '\u2029'],
      ['a tab', '\t'],
      ['a slash', ' / '],
      ['a bar', ' | '],
      ['a middle dot', ' \u00B7 '],
      ['a middle dot entity', ' &middot; '],
      ['a bullet', ' \u2022 '],
      ['a minus sign', ' \u2212 '],
      ['an en dash', ' \u2013 '],
      ['a hyphen between spaces', ' - '],
      ['a full-width comma', '\uFF0C'],
      ['a zero-width space', '\u200B'],
      ['a zero-width space entity', '&#x200B;'],
      ...['main', 'nav', 'aside', 'figure', 'figcaption', 'caption', 'center', 'details', 'summary', 'menu', 'fieldset', 'legend', 'option'].map(
        (tag): [string, string] => [`<${tag}> elements`, `</${tag}><${tag}>`]
      ),
    ])('separated by %s', (_label, separator) => {
      const offer = `<p>Coop${separator}Thiersteinerallee 12${separator}4053 Basel</p>`

      it('refuses the street answered with the name', () => {
        expect(addressFrom({ ...COOP, streetAddress: 'Coop Thiersteinerallee 12' }, offer, COOP_NAME)).toBeNull()
      })

      it('accepts the street alone', () => {
        expect(addressFrom(COOP, offer, COOP_NAME)).toBe('Thiersteinerallee 12\n4053 Basel')
      })
    })

    it('refuses a street answered over two lines, whatever the text', () => {
      for (const streetAddress of ['Coop\nThiersteinerallee 12', 'Coop\r\nThiersteinerallee 12', 'Coop<br/>Thiersteinerallee 12']) {
        expect(
          addressFrom({ ...COOP, streetAddress }, 'Adresse : Coop Thiersteinerallee 12, 4053 Basel.', COOP_NAME)
        ).toBeNull()
      }
    })

    it('refuses a label before a colon', () => {
      expect(addressFrom({ ...GENEVA, streetAddress: 'Lieu: Rue du Lac 5' }, 'Lieu: Rue du Lac 5, 1201 Genève.')).toBeNull()
      expect(addressFrom({ ...GENEVA, streetAddress: 'Lieu\uFF1A Rue du Lac 5' }, 'Lieu\uFF1A Rue du Lac 5, 1201 Genève.')).toBeNull()
    })

    it('refuses text after the street in its segment', () => {
      const offer = 'Wankdorfallee 4, La Poste, 3030 Bern'
      const BERN = { streetAddress: 'Wankdorfallee 4, La Poste', postalCode: '3030', addressLocality: 'Bern' }
      expect(addressFrom(BERN, offer, 'Die Post')).toBeNull()
      // Fails safe: "La Poste" is not the postcode and locality, so the street alone is refused too.
      expect(addressFrom({ ...BERN, streetAddress: 'Wankdorfallee 4' }, offer, 'Die Post')).toBeNull()
      expect(addressFrom({ ...GENEVA, streetAddress: 'Rue du Lac 5, 2e étage' }, 'Rue du Lac 5, 2e étage, 1201 Genève')).toBeNull()
    })

    it('refuses a street holding a second address', () => {
      const offer = 'Rue du Lac 5, 1201 Genève, Avenue de la Gare 10, 1003 Lausanne'
      expect(
        addressFrom({ ...GENEVA, streetAddress: 'Rue du Lac 5, 1201 Genève, Avenue de la Gare 10', postalCode: '1003', addressLocality: 'Lausanne' }, offer)
      ).toBeNull()
    })

    describe('a name the text writes in the street segment itself (known limit)', () => {
      const offer = 'Migros Zürich Pfingstweidstrasse 101, 8005 Zürich'
      const MIGROS = { streetAddress: 'Migros Zürich Pfingstweidstrasse 101', postalCode: '8005', addressLocality: 'Zürich' }

      it('is accepted: the segment is the street the text gives', () => {
        expect(addressFrom(MIGROS, offer, 'Genossenschaft Migros Zürich')).toBe('Migros Zürich Pfingstweidstrasse 101\n8005 Zürich')
      })

      it('unless the stored name or a legal form is in it', () => {
        expect(addressFrom(MIGROS, offer, 'Migros Zürich')).toBeNull()
        const withLegalForm = 'Migros AG Pfingstweidstrasse 101'
        expect(addressFrom({ ...MIGROS, streetAddress: withLegalForm }, `${withLegalForm}, 8005 Zürich`, 'Other')).toBeNull()
      })
    })
  })

  describe('a street that is not only a street is refused, even when it is a segment', () => {
    it.each([
      'Muster GmbH Hauptstrasse 1',
      'Muster g.m.b.h. Hauptstrasse 1',
      'Muster Sàrl Hauptstrasse 1',
      'Muster S.à r.l. Hauptstrasse 1',
      'Muster Sagl Hauptstrasse 1',
      'Muster S.p.A. Hauptstrasse 1',
      'Muster Ltd Hauptstrasse 1',
      'Muster & Co Hauptstrasse 1',
      'Muster SE Hauptstrasse 1',
      'UBS Switzerland AG Bahnhofstrasse 45',
    ])('holding a legal form: %s', (streetAddress) => {
      const text = `Adresse : ${streetAddress}, 8001 Zürich.`
      expect(addressFrom({ streetAddress, postalCode: '8001', addressLocality: 'Zürich' }, text, 'Other')).toBeNull()
    })

    it('but not when a legal form is only part of a word', () => {
      for (const streetAddress of ['Sagenstrasse 3', 'Hagweg 4', 'Rue de la Sarine 2']) {
        expect(addressFrom({ ...GENEVA, streetAddress }, `Adresse : ${streetAddress}, 1201 Genève.`, 'Beispiel SA')).toBe(
          `${streetAddress}\n1201 Genève`
        )
      }
    })

    it("holding the company's name, whatever its case and spacing", () => {
      const streetAddress = 'Beispiel Rue du Lac 5'
      expect(addressFrom({ ...GENEVA, streetAddress }, `${streetAddress}, 1201 Genève`, 'BEISPIEL')).toBeNull()
    })

    it('without a house number', () => {
      expect(addressFrom({ ...GENEVA, streetAddress: 'Rue du Lac' }, 'Rue du Lac, 1201 Genève')).toBeNull()
      // Fails safe: a real address without a number gives no address.
      expect(
        addressFrom({ streetAddress: 'Bahnhofplatz', postalCode: '8001', addressLocality: 'Zürich' }, 'Bahnhofplatz, 8001 Zürich')
      ).toBeNull()
    })

    it('without a letter', () => {
      expect(addressFrom({ ...GENEVA, streetAddress: '12-14' }, 'Bureau, 12-14, 1201 Genève')).toBeNull()
    })

    it('holding the postcode', () => {
      expect(addressFrom({ ...GENEVA, streetAddress: 'Rue du Lac 5 1201' }, 'Rue du Lac 5 1201, 1201 Genève')).toBeNull()
    })

    it.each<[string, string, string]>([
      ['2e étage', 'Beispiel SA\nRue du Lac 5\n2e étage\n1201 Genève', 'Beispiel SA'],
      ['3. OG', 'Beispiel AG, Bahnhofstrasse 1, 3. OG, 1201 Genève', COMPANY],
      ['Personalabteilung 2', 'Beispiel AG, Personalabteilung 2, 1201 Genève', COMPANY],
      ['Bureau 3', 'Beispiel SA, Bureau 3, 1201 Genève', 'Beispiel SA'],
      ['Gebäude 2', 'Beispiel AG, Gebäude 2, 1201 Genève', COMPANY],
      ['Ref. 4711', 'Kontakt, Ref. 4711, 1201 Genève', COMPANY],
      ['Postfach 12', 'Beispiel AG, Postfach 12, 1201 Genève', COMPANY],
      ['Case postale 12', 'Adresse : Case postale 12, 1201 Genève.', COMPANY],
      ['CP 45', 'Beispiel SA, CP 45, 1201 Genève', 'Beispiel SA'],
    ])('that is a floor, a department, a reference or a P.O. box: %s', (streetAddress, offer, companyName) => {
      expect(addressFrom({ ...GENEVA, streetAddress }, offer, companyName)).toBeNull()
    })

    it('a P.O. box with no street gives no address, and the street before a floor line gives none either', () => {
      expect(addressFrom({ ...GENEVA, streetAddress: 'Postfach 12' }, 'Postfach 12, 1201 Genève', '')).toBeNull()
      expect(addressFrom(GENEVA, 'Beispiel SA\nRue du Lac 5\n2e étage\n1201 Genève', 'Beispiel SA')).toBeNull()
    })

    it.each<[string, string]>([
      ['20 Minuten', '20 Minuten AG'],
      ['Radio 24', 'Radio 24 AG'],
      ['Tamedia 24', 'Tamedia 24 SA'],
      ['Radio 24', ''],
    ])('that is a company name with a number: %s (stored name "%s")', (streetAddress, companyName) => {
      const candidate = { streetAddress, postalCode: '8021', addressLocality: 'Zürich' }
      expect(addressFrom(candidate, `${streetAddress}, 8021 Zürich`, companyName)).toBeNull()
    })

    it("made only of the company name's words, even with a street type word", () => {
      const candidate = { streetAddress: 'Rue du Commerce 5', postalCode: '1204', addressLocality: 'Genève' }
      expect(addressFrom(candidate, 'Rue du Commerce 5, 1204 Genève', 'Rue du Commerce SA')).toBeNull()
      expect(addressFrom(candidate, 'Rue du Commerce 5, 1204 Genève', 'Commerce SA')).toBe('Rue du Commerce 5\n1204 Genève')
    })

    it.each([
      ['Mühlebach 2', '8008'],
      ['Riedtli 4', '8006'],
    ])('without a street type word, failing safe (known limit): %s', (streetAddress, postalCode) => {
      const candidate = { streetAddress, postalCode, addressLocality: 'Zürich' }
      expect(addressFrom(candidate, `${streetAddress}, ${postalCode} Zürich`)).toBeNull()
    })

    it('accepts a house number with a letter or a range', () => {
      for (const streetAddress of ['Rue du Lac 12a', 'Rue du Lac 12-14']) {
        expect(addressFrom({ ...GENEVA, streetAddress }, `Adresse : ${streetAddress}, 1201 Genève.`)).toBe(
          `${streetAddress}\n1201 Genève`
        )
      }
    })

    it.each([
      'Rue du Lac 5 Case postale 12',
      'Bahnhofstrasse 1 Postfach 12',
      'Rue du Lac 5 2e étage',
      'Bahnhofstrasse 1 Gebäude 2',
      'Bahnhofstrasse 1 2. OG',
      'Bahnhofstrasse 1 Personalabteilung',
      'Rue du Lac 5 CP 45',
      'Rue du Lac 5 Bâtiment B',
      'Seestrasse 3 Haus C',
      'Av. de la Gare 10 (2e)',
    ])('holding a P.O. box, a floor, a building, a department or a second number after a space: %s', (streetAddress) => {
      expect(addressFrom({ ...GENEVA, streetAddress }, `${streetAddress}, 1201 Genève`)).toBeNull()
    })

    it.each([
      'Rathausgasse 1',
      'Rue du Lac 5',
      'Rue de la Gare 1-3',
      '12-14 Rue X',
      'Avenue de la Gare 1bis',
      'Avenue de la Gare 1 bis',
      'Avenue de la Gare 1ter',
      'Rue du Lac 1a',
      'St. Alban-Graben 5',
      'Seestrasse 12a',
      'Rue St-Martin 3',
    ])('accepts one house number, with a range or a suffix, and "haus" only inside a word: %s', (streetAddress) => {
      expect(addressFrom({ ...GENEVA, streetAddress }, `${streetAddress}, 1201 Genève`)).toBe(`${streetAddress}\n1201 Genève`)
    })

    it.each(['Klinik St. Anna 3', 'Hotel St. Gotthard 3', 'Dr. Muster 3'])(
      'reading "St." and "Dr." as Saint and Doktor, not as a street type: %s',
      (streetAddress) => {
        expect(addressFrom({ ...GENEVA, streetAddress }, `${streetAddress}, 1201 Genève`)).toBeNull()
      }
    )
  })

  describe('a locality that is not only a locality is refused', () => {
    it.each<[string, string, string, string]>([
      ['holding a second address', 'Genève, Avenue de la Gare 10', 'Rue du Lac 5\n1201 Genève, Avenue de la Gare 10', COMPANY],
      ['with the company name after it', 'Basel Coop', 'Thiersteinerallee 12\n4053 Basel Coop', COOP_NAME],
      ['with a legal form', 'Genève Beispiel SA', 'Rue du Lac 5\n1201 Genève Beispiel SA', COMPANY],
      ["holding the company's name", 'Genève Beispiel AG', 'Rue du Lac 5\n1201 Genève Beispiel AG', COMPANY],
      ['holding a digit', 'Genève 2', 'Rue du Lac 5\n1201 Genève 2', COMPANY],
      ['ending with a Swiss country', 'Genève Schweiz', 'Rue du Lac 5\n1201 Genève Schweiz', COMPANY],
      ['ending with Schweiz', 'Zürich Schweiz', 'Bahnhofstrasse 1\n8001 Zürich Schweiz', COMPANY],
      ['ending with a Swiss code','Genève CH', 'Rue du Lac 5\n1201 Genève CH', COMPANY],
      ['ending with a known country', 'Genève France', 'Rue du Lac 5\n1201 Genève France', COMPANY],
      ['ending with a two-word country', 'Genève United Kingdom', 'Rue du Lac 5\n1201 Genève United Kingdom', COMPANY],
    ])('%s: %s', (_label, addressLocality, offer, companyName) => {
      const [streetAddress, postcodeLocality] = offer.split('\n')
      const postalCode = postcodeLocality.split(' ')[0]
      expect(addressFrom({ streetAddress, postalCode, addressLocality }, offer, companyName)).toBeNull()
    })

    it.each<[string, string, string]>([
      ['Genève. Merci de votre intérêt', 'Rue du Lac 5', '1201'],
      ['Genève Service RH', 'Rue du Lac 5', '1201'],
      ['Zürich Personalabteilung', 'Bahnhofstrasse 1', '8001'],
      ["Genève à l'attention de Mme Dupont", 'Rue du Lac 5', '1201'],
      ['Genève Mme Dupont', 'Rue du Lac 5', '1201'],
      ["Genève l'attention", 'Rue du Lac 5', '1201'],
      ['Zürich Herr Muster', 'Bahnhofstrasse 1', '8001'],
      ['Zürich Jetzt bewerben', 'Bahnhofstrasse 1', '8001'],
      ['Zürich oder Homeoffice', 'Bahnhofstrasse 1', '8001'],
      ['Zürich Postfach', 'Bahnhofstrasse 1', '8001'],
      ['Zürich (Schweiz)', 'Bahnhofstrasse 1', '8001'],
      ['Genève (Suisse)', 'Rue du Lac 5', '1201'],
      ['Zürich (Kreis 1)', 'Bahnhofstrasse 1', '8001'],
      ['Zürich [Altstadt]', 'Bahnhofstrasse 1', '8001'],
      ['Genève. Bienvenue', 'Rue du Lac 5', '1201'],
      ['Zürich und Basel', 'Bahnhofstrasse 1', '8001'],
      ['Genève Télétravail', 'Rue du Lac 5', '1201'],
      ['Zürich Z.Hd. Muster', 'Bahnhofstrasse 1', '8001'],
      ['Genève centre', 'Rue du Lac 5', '1201'],
      ['Bad Zurzach Ost Nord Süd', 'Bahnhofstrasse 1', '5330'],
    ])('a locality with more than a place name, as the text writes it: %s', (addressLocality, streetAddress, postalCode) => {
      const offer = `${streetAddress}, ${postalCode} ${addressLocality}`
      expect(addressFrom({ streetAddress, postalCode, addressLocality }, offer)).toBeNull()
    })

    it.each<[string, string]>([
      ['Genève', '1201'],
      ['Zürich', '8001'],
      ['St. Gallen', '9000'],
      ['La Chaux-de-Fonds', '2300'],
      ['Le Locle', '2400'],
      ['Rapperswil-Jona', '8640'],
      ['Bad Ragaz', '7310'],
      ['Stein am Rhein', '8260'],
      ['Saint-Prex', '1162'],
      ['Muri bei Bern', '3074'],
      ['Affoltern am Albis', '8910'],
      ['Lugano', '6900'],
      ['Bellinzona', '6500'],
      ['Neuchâtel', '2000'],
      ['Yverdon-les-Bains', '1400'],
      ['Le Mont-sur-Lausanne', '1052'],
      ['Les Diablerets', '1865'],
      ['Paris', '75001'],
      ['München', '80331'],
      ['Zürich Flughafen', '8058'],
    ])('but accepts the place name %s', (addressLocality, postalCode) => {
      const candidate = { streetAddress: 'Rue du Lac 5', postalCode, addressLocality }
      expect(addressFrom(candidate, `Rue du Lac 5, ${postalCode} ${addressLocality}`)).toBe(
        `Rue du Lac 5\n${postalCode} ${addressLocality}`
      )
    })

    it('but accepts a town the company is named after', () => {
      expect(
        addressFrom(
          { streetAddress: 'Pfingstweidstrasse 101', postalCode: '8005', addressLocality: 'Zürich' },
          'Pfingstweidstrasse 101, 8005 Zürich',
          'Genossenschaft Migros Zürich'
        )
      ).toBe('Pfingstweidstrasse 101\n8005 Zürich')
    })
  })

  describe('the postcode', () => {
    it.each([
      ['1201', 'Rue du Lac 5, 1201 Genève'],
      ['1201', 'Rue du Lac 5, CH-1201 Genève'],
      ['CH-1201', 'Rue du Lac 5, CH-1201 Genève'],
      ['D-80331', 'Rue du Lac 5, D-80331 Genève'],
      ['75001', 'Rue du Lac 5, 75001 Genève'],
    ])('accepts %s in "%s"', (postalCode, offer) => {
      expect(addressFrom({ ...GENEVA, postalCode }, offer)).toBe(`Rue du Lac 5\n${postalCode} Genève`)
    })

    it.each([
      ['120', 'Rue du Lac 5, 120 Genève'],
      ['123456', 'Rue du Lac 5, 123456 Genève'],
      ['CHE-1201', 'Rue du Lac 5, CHE-1201 Genève'],
      ['12O1', 'Rue du Lac 5, 12O1 Genève'],
      ['CH-1201', 'Rue du Lac 5, 1201 Genève'],
      ['D-1201', 'Rue du Lac 5, CH-1201 Genève'],
    ])('refuses %s in "%s"', (postalCode, offer) => {
      expect(addressFrom({ ...GENEVA, postalCode }, offer)).toBeNull()
    })
  })

  describe('the street and the postcode and locality must be consecutive segments of one address', () => {
    const TWO_ADDRESSES = `Siège : Rue du Lac 5, 1201 Genève.
Le poste est basé dans notre succursale, au cœur de la ville, à deux pas de la gare.
Succursale : Avenue de la Gare 10, 1003 Lausanne.`
    const LAUSANNE = { streetAddress: 'Avenue de la Gare 10', postalCode: '1003', addressLocality: 'Lausanne' }

    it('accepts each address the text gives', () => {
      expect(addressFrom(GENEVA, TWO_ADDRESSES)).toBe(GENEVA_ADDRESS)
      expect(addressFrom(LAUSANNE, TWO_ADDRESSES)).toBe('Avenue de la Gare 10\n1003 Lausanne')
    })

    it('refuses the street of one address with the postcode and locality of another', () => {
      expect(addressFrom({ ...GENEVA, postalCode: '1003', addressLocality: 'Lausanne' }, TWO_ADDRESSES)).toBeNull()
      expect(addressFrom({ ...LAUSANNE, postalCode: '1201', addressLocality: 'Genève' }, TWO_ADDRESSES)).toBeNull()
      const oneLine = 'Rue du Lac 5, 1201 Genève, Avenue de la Gare 10, 1003 Lausanne'
      expect(addressFrom({ ...GENEVA, postalCode: '1003', addressLocality: 'Lausanne' }, oneLine)).toBeNull()
    })

    it('refuses a postcode and locality before the street, or not right after it', () => {
      expect(addressFrom(GENEVA, '1201 Genève\nRue du Lac 5')).toBeNull()
      expect(addressFrom(GENEVA, 'Rue du Lac 5\nBureau 3\n1201 Genève')).toBeNull()
    })

    it('refuses a part found only inside a longer word, number or segment', () => {
      expect(addressFrom(GENEVA, 'Rue du Lac 50, 1201 Genève')).toBeNull()
      expect(addressFrom(GENEVA, 'Rue du Lac 5, 11201 Genève')).toBeNull()
      expect(addressFrom(GENEVA, 'Grue du Lac 5, 1201 Genèveville')).toBeNull()
      expect(addressFrom(GENEVA, 'Rue du Lac 5. Genève, case postale 1201.')).toBeNull()
    })

    it('refuses what the text does not write (known limits, failing safe)', () => {
      expect(addressFrom(GENEVA, 'Rue du Lac 5, 1201Genève')).toBeNull()
      expect(addressFrom(GENEVA, 'Rue du Lac 5\n1201\nGenève')).toBeNull()
      expect(addressFrom(GENEVA, 'Rue du Lac 5, 1201 Genève. Merci de votre intérêt')).toBeNull()
    })

    it('accepts an address at the very end of a 15,000-character text, the most the AI is given', () => {
      const tail = 'Rue du Lac 5, 1201 Genève'
      const offer = `${'x'.repeat(15_000 - tail.length - 1)}\n${tail}`
      expect(offer).toHaveLength(15_000)
      expect(addressFrom(GENEVA, offer)).toBe(GENEVA_ADDRESS)
    })

    it('refuses an address that ends just past the part the AI is given', () => {
      const tail = 'Rue du Lac 5, 1201 Genève'
      const offer = `${'x'.repeat(15_000 - tail.length)}\n${tail}`
      expect(offer).toHaveLength(15_001)
      expect(addressFrom(GENEVA, offer)).toBeNull()
    })

    it('reads a 15,000-character run of full stops and spaces in linear time', () => {
      const offer = `${'. '.repeat(7_499)}x`
      const started = performance.now()
      expect(addressFrom(GENEVA, offer)).toBeNull()
      expect(addressFrom(GENEVA, `${offer}\nRue du Lac 5, 1201 Genève`)).toBeNull()
      expect(performance.now() - started).toBeLessThan(1_000)
    })

    it('refuses an empty text or one that is only markup', () => {
      expect(addressFrom(GENEVA, '')).toBeNull()
      expect(addressFrom(GENEVA, '<p> </p>')).toBeNull()
    })
  })

  describe('an incomplete or unusable answer gives no address', () => {
    it.each([
      ['no answer', undefined],
      ['a plain string', 'Rue du Lac 5, 1201 Genève'],
      ['no street', { postalCode: '1201', addressLocality: 'Genève' }],
      ['no postcode', { streetAddress: 'Rue du Lac 5', addressLocality: 'Genève' }],
      ['no locality', { streetAddress: 'Rue du Lac 5', postalCode: '1201' }],
      ['a locality that is only the postcode', { ...GENEVA, addressLocality: '1201' }],
      ['empty parts, as the prompt asks when there is none', { streetAddress: '', postalCode: '', addressLocality: '', addressCountry: '' }],
      ['parts that are only markup', { ...GENEVA, streetAddress: '<b></b>' }],
      ['a locality over two lines', { ...GENEVA, addressLocality: 'Genève\nSuisse' }],
    ])('%s', (_label, candidate) => {
      expect(addressFrom(candidate, OFFER)).toBeNull()
    })

    it('damaged text (U+FFFD), even when the text has it too', () => {
      const damaged = { ...GENEVA, addressLocality: 'Gen\uFFFDve' }
      expect(addressFrom(damaged, 'Rue du Lac 5, 1201 Gen\uFFFDve')).toBeNull()
    })
  })

  describe('the country', () => {
    it('prints no line for Switzerland, in any spelling', () => {
      for (const addressCountry of ['CH', 'Suisse', 'schweiz', 'Switzerland']) {
        expect(addressFrom({ ...GENEVA, addressCountry }, `Rue du Lac 5, 1201 Genève, ${addressCountry}`)).toBe(GENEVA_ADDRESS)
      }
    })

    it.each(['France', 'FRANCE', 'FR', 'Deutschland', 'Österreich', 'Italia', 'Liechtenstein', 'United Kingdom', 'USA'])(
      'keeps %s on the segment after the locality',
      (addressCountry) => {
        const PARIS = { streetAddress: '12 rue de Rivoli', postalCode: '75001', addressLocality: 'Paris', addressCountry }
        expect(addressFrom(PARIS, `Envoyez votre dossier à : 12 rue de Rivoli, 75001 Paris, ${addressCountry}.`)).toBe(
          `12 rue de Rivoli\n75001 Paris\n${addressCountry}`
        )
      }
    )

    it('drops a country the text does not name right after the locality, and keeps the rest', () => {
      const PARIS = { streetAddress: '12 rue de Rivoli', postalCode: '75001', addressLocality: 'Paris', addressCountry: 'FR' }
      expect(addressFrom({ ...GENEVA, addressCountry: 'France' }, OFFER)).toBe(GENEVA_ADDRESS)
      expect(addressFrom(PARIS, 'Envoyez votre dossier à : 12 rue de Rivoli, 75001 Paris.\nLangues : FR/EN')).toBe(
        '12 rue de Rivoli\n75001 Paris'
      )
      expect(addressFrom(PARIS, 'Langues : FR/EN. Adresse : 12 rue de Rivoli, 75001 Paris.')).toBe('12 rue de Rivoli\n75001 Paris')
    })

    it('drops a word after the locality that is not a known country, and keeps the rest', () => {
      expect(
        addressFrom({ ...GENEVA, addressCountry: 'Beispiel SA' }, 'Rue du Lac 5\n1201 Genève\nBeispiel SA', 'Beispiel SA')
      ).toBe(GENEVA_ADDRESS)
      expect(addressFrom({ ...GENEVA, addressCountry: 'Narnia' }, 'Rue du Lac 5, 1201 Genève, Narnia')).toBe(GENEVA_ADDRESS)
    })

    it('refuses an answer whose country is written over two lines', () => {
      expect(addressFrom({ ...GENEVA, addressCountry: 'France\nBeispiel' }, 'Rue du Lac 5, 1201 Genève, France')).toBeNull()
    })
  })
})
