import { describe, expect, it } from 'vitest'
import { RESUME_PAGE_MARGINS, resumePageMargins } from './resume-page-margins'
import { DEFAULT_RESUME_TEMPLATE, RESUME_TEMPLATES } from './resume-templates'
import { SWISS_ACADEMIC_GEOMETRY } from './swiss-academic-template'
import { SWISS_COMMERCE_GEOMETRY } from './swiss-commerce-template'
import { SWISS_ENGINEERING_GEOMETRY } from './swiss-engineering-template'
import { SWISS_EXECUTIVE_GEOMETRY } from './swiss-executive-template'
import { SWISS_FINANCE_GEOMETRY } from './swiss-finance-template'
import { SWISS_FIRST_JOB_GEOMETRY } from './swiss-first-job-template'
import { SWISS_HEALTH_GEOMETRY } from './swiss-health-template'
import { SWISS_IT_GEOMETRY } from './swiss-it-template'
import { SWISS_TRADES_GEOMETRY } from './swiss-trades-template'
import { SWISS_VOCATIONAL_GEOMETRY } from './swiss-vocational-template'

/**
 * FR-3: the Preview's sheets break on the margins the template's geometry
 * declares, the ones its print CSS and its Word generator read (each
 * template's own test holds those two equal to the geometry).
 */
const GEOMETRIES = {
  swissVocational: SWISS_VOCATIONAL_GEOMETRY,
  swissCommerce: SWISS_COMMERCE_GEOMETRY,
  swissTrades: SWISS_TRADES_GEOMETRY,
  swissHealth: SWISS_HEALTH_GEOMETRY,
  swissFinance: SWISS_FINANCE_GEOMETRY,
  swissEngineering: SWISS_ENGINEERING_GEOMETRY,
  swissIt: SWISS_IT_GEOMETRY,
  swissExecutive: SWISS_EXECUTIVE_GEOMETRY,
  swissAcademic: SWISS_ACADEMIC_GEOMETRY,
  swissFirstJob: SWISS_FIRST_JOB_GEOMETRY,
} as const

describe('RESUME_PAGE_MARGINS', () => {
  it.each(RESUME_TEMPLATES)('%s: the geometry’s pageTop and pageBottom', (template) => {
    const geometry = GEOMETRIES[template]
    expect(RESUME_PAGE_MARGINS[template]).toEqual({ pageTop: geometry.pageTop, pageBottom: geometry.pageBottom })
  })

  it('covers exactly the ten templates', () => {
    expect(Object.keys(RESUME_PAGE_MARGINS).sort()).toEqual([...RESUME_TEMPLATES].sort())
  })

  it('draws an unknown or missing id with the default template’s margins', () => {
    expect(resumePageMargins('modern')).toBe(RESUME_PAGE_MARGINS[DEFAULT_RESUME_TEMPLATE])
    expect(resumePageMargins(null)).toBe(RESUME_PAGE_MARGINS[DEFAULT_RESUME_TEMPLATE])
    expect(resumePageMargins('swissIt')).toBe(RESUME_PAGE_MARGINS.swissIt)
  })
})
