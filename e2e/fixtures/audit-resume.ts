import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
  LOCAL_SUPABASE_URL,
  LOCAL_SERVICE_KEY,
  assertLocalSupabase,
} from '../../src/test/local-stack'
import type { ResumeTemplate } from '../../src/types/database'
import type { SeededResume } from './resume'

/**
 * The audit fixture of swiss-templates-only-page-fidelity: one two-page
 * resume (6 experiences, 3 educations, 3 skill categories, 4 languages,
 * 3 certifications, 2 projects, and a photo) that the 2026-11-25 audit
 * rendered in every template, in fr and de, to compare the Preview, the PDF
 * and the Word file page by page.
 *
 * Mixed French and German on purpose: long German compounds exercise line
 * breaking, and the entries are sized so that page 1 ends inside the
 * experience or education list in every template, where a sheet edge has an
 * entry to cut.
 *
 * Invented content (`.claude/rules/resumes.md`): the person, the addresses and
 * the URLs are fictional, and the companies only name employers as a CV would.
 * Deterministic: no date relative to now, no generated value.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E audit resume fixture')

const experience = (
  company: string,
  position: string,
  startDate: string,
  endDate: string | null,
  location: string,
  achievements: string[],
  description = '',
) => ({
  company,
  position,
  startDate,
  endDate: endDate ?? undefined,
  current: endDate === null,
  location,
  description,
  achievements,
  visible: true,
})

export const AUDIT_RESUME_CONTENT = {
  contact: {
    name: 'Sophie Marchand-Keller',
    email: 'sophie.marchand-keller@exemple.ch',
    phone: '+41 79 123 45 67',
    location: 'Lausanne',
    linkedin: 'linkedin.com/in/sophie-marchand',
    github: 'github.com/smarchand',
    website: 'sophie-marchand.ch',
    visible: true,
  },
  summary:
    "<p>Responsable de projets avec douze ans d'expérience en logistique, achats et amélioration continue dans l'industrie et la distribution. Habituée à piloter des équipes pluridisciplinaires, à conduire le changement et à livrer des projets dans les délais et le budget.</p>",
  experience: [
    experience('Logistikzentrum Ostschweiz AG', 'Leiterin Projektmanagement Lagerbewirtschaftung', '2021-04', null, 'Frauenfeld', [
      'Pilotage de la migration du WMS vers SAP EWM pour trois sites',
      'Réduction de 18 % des coûts de préparation en deux ans',
      'Encadrement d’une équipe de 12 personnen im Schichtbetrieb',
      'Mise en place des indicateurs de performance mensuels',
    ]),
    experience(
      'Nestlé Suisse SA',
      'Cheffe de projet supply chain',
      '2017-09',
      '2021-03',
      'Vevey',
      [
        'Conception d’un nouveau réseau de distribution pour la Suisse romande',
        'Négociation des contrats de transport avec quatre prestataires',
        'Formation de 40 collaborateurs aux nouveaux processus',
      ],
      '<p>Responsable du programme de transformation logistique.</p>',
    ),
    experience('Migros Genossenschafts-Bund', 'Projektleiterin Beschaffung', '2014-02', '2017-08', 'Zürich', [
      'Kommunikationsfähigkeiten im interdisziplinären Team',
      'Einführung eines Lieferantenbewertungssystems',
      'Ausschreibungen für Verpackungsmaterial',
    ]),
    experience('Bobst Group SA', 'Analyste achats', '2011-06', '2014-01', 'Mex', [
      'Analyse des dépenses et consolidation du panel fournisseurs',
      'Suivi des délais de livraison et des litiges',
    ]),
    experience('Kuehne + Nagel', 'Stagiaire logistique', '2010-07', '2011-05', 'Schindellegi', [
      'Optimisation des tournées de livraison',
      'Saisie et contrôle des documents douaniers',
    ]),
    experience(
      'Hôpital du Valais',
      'Assistante administrative (temps partiel)',
      '2008-09',
      '2010-06',
      'Sion',
      [],
      '<p>Gestion des commandes de matériel médical et suivi des stocks.</p><ul><li>Inventaires trimestriels</li><li>Relations avec les fournisseurs</li></ul>',
    ),
  ],
  education: [
    { school: 'HEIG-VD, Yverdon-les-Bains', degree: 'Master of Advanced Studies', field: 'Supply Chain Management', startDate: '2015-09', endDate: '2017-06', visible: true },
    { school: 'Haute école de gestion de Genève', degree: 'Bachelor of Science HES-SO', field: 'Économie d’entreprise', startDate: '2007-09', endDate: '2010-06', visible: true },
    { school: 'Ecole professionnelle commerciale de Lausanne', degree: 'CFC d’employée de commerce', field: '', startDate: '2004-08', endDate: '2007-06', visible: true },
  ],
  skills: [
    { category: 'Logistique', items: ['SAP EWM', 'Lean Management', 'Planification S&OP', 'Gestion des stocks'], visible: true },
    { category: 'Kommunikationsfähigkeiten', items: ['Verhandlungsführung', 'Teamführung', 'Präsentation'], visible: true },
    { category: 'Informatique', items: ['Excel avancé', 'Power BI', 'MS Project'], visible: true },
  ],
  languages: [
    { language: 'Français', level: 'Native', visible: true },
    { language: 'Allemand', level: 'Fluent', visible: true },
    { language: 'Anglais', level: 'Advanced', visible: true },
    { language: 'Italien', level: 'Basic', visible: true },
  ],
  certifications: [
    { name: 'Certified Supply Chain Professional (CSCP)', issuer: 'ASCM', date: '2019-05', visible: true },
    { name: 'Lean Six Sigma Green Belt', issuer: 'SAQ', date: '2016-11', visible: true },
    { name: 'Brevet fédéral de spécialiste en logistique', issuer: 'ASFL', date: '2013-06', visible: true },
  ],
  projects: [
    {
      name: 'Centralisation des entrepôts romands',
      description: 'Regroupement de trois entrepôts en un site unique de 12 000 m², livré en 14 mois.',
      url: '',
      technologies: ['SAP EWM', 'AutoStore'],
      visible: true,
    },
    {
      name: 'Digitalisation des bons de livraison',
      description: 'Suppression du papier sur 90 % des flux sortants.',
      url: 'exemple.ch/projet',
      technologies: ['Power Apps'],
      visible: true,
    },
  ],
  custom_sections: {},
}

const SUMMARY_TOPICS = [
  'la planification des approvisionnements',
  'la gestion des entrepôts',
  'les achats de matières premières',
  'la logistique de distribution',
  'l’amélioration continue des processus',
  'la conduite du changement',
  'la négociation avec les transporteurs',
  'le pilotage des indicateurs de performance',
]

const SUMMARY_SITES = ['Lausanne', 'Genève', 'Sion', 'Fribourg', 'Neuchâtel', 'Yverdon', 'Vevey', 'Morges', 'Nyon']

/**
 * A summary of one paragraph, about 9,000 characters: taller than a page's
 * text area (1,027 px between 48 px margins) in swissCommerce and swissTrades.
 * At 13 px, a line height of 1.4 (18.2 px) and fewer than 120 characters a
 * line in swissCommerce's 690 px column, it takes more than 75 lines, over
 * 1,360 px; swissTrades' main column is narrower still. Its section is
 * `break-inside: avoid`, which print cannot honour for a block that tall, so
 * print moves the section to the next page and breaks the paragraph there
 * between its lines (swiss-templates-only-page-fidelity US-003 review): the
 * case the Preview must break the same way. The spec asserts the paragraph
 * is split, so a summary too short to be would fail it, not pass it.
 *
 * Forty-eight sentences, each naming its own years, so that no two lines
 * read the same and a line's characters find it on one PDF page only.
 */
export const AUDIT_LONG_SUMMARY = `<p>${Array.from(
  { length: 48 },
  (_, index) =>
    `De ${1970 + index} à ${1971 + index}, pilotage de ${SUMMARY_TOPICS[index % SUMMARY_TOPICS.length]} pour le site de ${
      SUMMARY_SITES[index % SUMMARY_SITES.length]
    } : ${12 + index} personnes formées, ${3 + (index % 5)} processus révisés et un suivi mensuel des résultats partagé avec la direction.`,
).join(' ')}</p>`

/** The audit's photo: a portrait JPEG, as a data URL the Preview and the PDF route both take. */
export const AUDIT_PHOTO = `data:image/jpeg;base64,${readFileSync(path.join(__dirname, 'photo-portrait.jpg')).toString('base64')}`

/**
 * Insert the audit resume for `userId` under `template`, with `overrides`
 * replacing whole fields of `AUDIT_RESUME_CONTENT` (a variant of the audit).
 */
export async function seedAuditResume(
  userId: string,
  template: ResumeTemplate,
  overrides: Partial<typeof AUDIT_RESUME_CONTENT> = {},
): Promise<SeededResume> {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await admin
    .from('resumes')
    .insert({
      user_id: userId,
      title: 'Responsable de projets logistiques',
      template,
      ...AUDIT_RESUME_CONTENT,
      ...overrides,
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`Could not seed the ${template} audit resume: ${error?.message ?? 'no row returned'}`)
  }
  return { id: data.id, userId, template }
}
