import { describe, expect, it } from 'vitest'
import fr from '@/locales/fr/common.json'
import en from '@/locales/en/common.json'
import de from '@/locales/de/common.json'
import it_ from '@/locales/it/common.json'
import { TEMPLATE_OPTIONS } from '@/components/dashboard/template-picker'

/**
 * `common.json -> resumes.templates` is the only source of template names and
 * descriptions. The template picker throws on a missing entry rather than
 * falling back to English, so every locale must carry every offered template.
 */

const LOCALES = { fr, en, de, it: it_ } as const

describe('resumes.templates locale parity', () => {
  for (const [locale, dict] of Object.entries(LOCALES)) {
    for (const { id } of TEMPLATE_OPTIONS) {
      it(`${locale} names and describes ${id}`, () => {
        const templates = dict.resumes.templates as Record<string, unknown>

        expect(typeof templates[id]).toBe('string')
        expect((templates[id] as string).trim()).not.toBe('')
        expect(typeof templates[`${id}Desc`]).toBe('string')
        expect((templates[`${id}Desc`] as string).trim()).not.toBe('')
      })
    }
  }

  it('does not show the English name for Professional in another locale', () => {
    expect(fr.resumes.templates.professional).not.toBe(en.resumes.templates.professional)
    expect(de.resumes.templates.professional).not.toBe(en.resumes.templates.professional)
    expect(it_.resumes.templates.professional).not.toBe(en.resumes.templates.professional)
  })

  it('names the vocational template after the Swiss qualification of each language', () => {
    expect(fr.resumes.templates.swissVocational).toBe('Formation professionnelle (CFC)')
    expect(en.resumes.templates.swissVocational).toBe('Vocational training (VET)')
    expect(de.resumes.templates.swissVocational).toBe('Berufslehre (EFZ)')
    expect(it_.resumes.templates.swissVocational).toBe('Formazione professionale (AFC)')
  })

  it('names the commerce template as the swiss-cv-templates PRD does', () => {
    expect(fr.resumes.templates.swissCommerce).toBe('Commerce & administration')
    expect(en.resumes.templates.swissCommerce).toBe('Business & administration')
    expect(de.resumes.templates.swissCommerce).toBe('Kaufmännisch & Verwaltung')
    expect(it_.resumes.templates.swissCommerce).toBe('Commercio e amministrazione')
  })

  it('names the trades template as the swiss-cv-templates PRD does', () => {
    expect(fr.resumes.templates.swissTrades).toBe('Métiers techniques & manuels')
    expect(en.resumes.templates.swissTrades).toBe('Technical & skilled trades')
    expect(de.resumes.templates.swissTrades).toBe('Technische & handwerkliche Berufe')
    expect(it_.resumes.templates.swissTrades).toBe('Mestieri tecnici e manuali')
  })

  it('names the health template as the swiss-cv-templates PRD does', () => {
    expect(fr.resumes.templates.swissHealth).toBe('Santé & social')
    expect(en.resumes.templates.swissHealth).toBe('Health & social care')
    expect(de.resumes.templates.swissHealth).toBe('Gesundheit & Soziales')
    expect(it_.resumes.templates.swissHealth).toBe('Sanità e sociale')
  })

  it('names the finance template as the swiss-cv-templates PRD does', () => {
    expect(fr.resumes.templates.swissFinance).toBe('Banque, finance & assurance')
    expect(en.resumes.templates.swissFinance).toBe('Banking, finance & insurance')
    expect(de.resumes.templates.swissFinance).toBe('Bank, Finanzen & Versicherung')
    expect(it_.resumes.templates.swissFinance).toBe('Banca, finanza e assicurazioni')
  })

  it('names the engineering template as the swiss-cv-templates PRD does', () => {
    expect(fr.resumes.templates.swissEngineering).toBe('Ingénierie & technique')
    expect(en.resumes.templates.swissEngineering).toBe('Engineering')
    expect(de.resumes.templates.swissEngineering).toBe('Ingenieurwesen & Technik')
    expect(it_.resumes.templates.swissEngineering).toBe('Ingegneria e tecnica')
  })

  it('names the IT template as the swiss-cv-templates PRD does', () => {
    expect(fr.resumes.templates.swissIt).toBe('Informatique & IT')
    expect(en.resumes.templates.swissIt).toBe('IT & software')
    expect(de.resumes.templates.swissIt).toBe('Informatik & IT')
    expect(it_.resumes.templates.swissIt).toBe('Informatica e IT')
  })

  it('names the executive template as the swiss-cv-templates PRD does', () => {
    expect(fr.resumes.templates.swissExecutive).toBe('Cadre & direction')
    expect(en.resumes.templates.swissExecutive).toBe('Executive & management')
    expect(de.resumes.templates.swissExecutive).toBe('Kader & Geschäftsleitung')
    expect(it_.resumes.templates.swissExecutive).toBe('Quadri e direzione')
  })

  it('names the academic template as the swiss-cv-templates PRD does', () => {
    expect(fr.resumes.templates.swissAcademic).toBe('Académique & recherche')
    expect(en.resumes.templates.swissAcademic).toBe('Academic & research')
    expect(de.resumes.templates.swissAcademic).toBe('Akademisch & Forschung')
    expect(it_.resumes.templates.swissAcademic).toBe('Accademico e ricerca')
  })

  it('adds the publications and distinctions headings of swiss-cv-templates FR-6 in every locale', () => {
    expect(fr.resumes.template.publications).toBe('Publications et projets')
    expect(en.resumes.template.publications).toBe('Publications and projects')
    expect(de.resumes.template.publications).toBe('Publikationen und Projekte')
    expect(it_.resumes.template.publications).toBe('Pubblicazioni e progetti')
    expect(fr.resumes.template.distinctions).toBe('Distinctions')
    expect(en.resumes.template.distinctions).toBe('Distinctions')
    expect(de.resumes.template.distinctions).toBe('Auszeichnungen')
    expect(it_.resumes.template.distinctions).toBe('Riconoscimenti')
  })

  it('adds the projects heading of swiss-cv-templates FR-6 in every locale', () => {
    expect(fr.resumes.template.projects).toBe('Projets')
    expect(en.resumes.template.projects).toBe('Projects')
    expect(de.resumes.template.projects).toBe('Projekte')
    expect(it_.resumes.template.projects).toBe('Progetti')
  })
})
