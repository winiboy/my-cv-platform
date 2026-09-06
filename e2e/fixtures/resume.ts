import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  LOCAL_SUPABASE_URL,
  LOCAL_SERVICE_KEY,
  assertLocalSupabase,
} from '../../src/test/local-stack'
import type { ResumeTemplate } from '../../src/types/database'

/**
 * The fixture resume every visual baseline is rendered from.
 *
 * Two properties matter more than realism here:
 *
 * DETERMINISM. Nothing in this fixture may vary between runs. No dates
 * relative to now, no generated ids, no locale-dependent formatting inputs.
 * A baseline captured from varying content would either fail constantly or,
 * worse, be given a threshold loose enough to absorb the variance - and a
 * threshold that absorbs a changing date also absorbs a shifted column.
 *
 * COVERAGE. Every section a template can render must be present and non-empty,
 * because a screenshot can only guard what it draws. An empty `certifications`
 * array would leave that branch of all five templates unprotected while still
 * producing a green baseline - the exact "matches for the wrong reason" failure
 * this suite exists to avoid. Where a template supports a variant (a current
 * role vs a finished one, a bulleted achievement list vs a plain description),
 * the fixture includes both.
 *
 * The content is invented. `.claude/rules/resumes.md` forbids real user data in
 * fixtures, and a resume is exactly the kind of document where that matters.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E resume fixture')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export const FIXTURE_CONTACT = {
  name: 'Alex Rivera',
  email: 'alex.rivera@example.test',
  phone: '+41 21 555 0142',
  location: 'Lausanne, Switzerland',
  linkedin: 'linkedin.com/in/example-alex-rivera',
  github: 'github.com/example-alex-rivera',
  website: 'example.test/alex',
  visible: true,
}

export const FIXTURE_SUMMARY =
  'Product engineer with eleven years building document tooling for regulated ' +
  'industries. Led the rewrite of a multi-tenant editing surface used by 40,000 ' +
  'people daily, and reduced its median render time from 900ms to 210ms.'

/**
 * One finished role and one current role. `current: true` renders differently
 * from an explicit `endDate` in every template, so a fixture with only one of
 * the two would leave the other path unguarded.
 */
export const FIXTURE_EXPERIENCE = [
  {
    company: 'Northwind Systems',
    position: 'Principal Engineer',
    startDate: '2021-03',
    current: true,
    location: 'Lausanne',
    description: 'Own the document rendering platform end to end.',
    achievements: [
      'Unified five divergent template renderers behind one layout model.',
      'Cut p95 export latency by 63% without changing output fidelity.',
      'Introduced the visual regression suite that now gates every release.',
    ],
    visible: true,
  },
  {
    company: 'Meridian Labs',
    position: 'Senior Software Engineer',
    startDate: '2017-01',
    endDate: '2021-02',
    current: false,
    location: 'Geneva',
    description:
      'Built the ingestion pipeline behind the company’s analytics product, ' +
      'processing 12 million documents a month.',
    achievements: [
      'Designed the schema migration path that retired three legacy stores.',
      'Mentored four engineers through their first production launches.',
    ],
    visible: true,
  },
]

export const FIXTURE_EDUCATION = [
  {
    school: 'EPFL',
    degree: 'MSc',
    field: 'Computer Science',
    startDate: '2012-09',
    endDate: '2014-06',
    description: 'Specialisation in distributed systems.',
    achievements: ['Thesis awarded departmental distinction.'],
    visible: true,
  },
  {
    school: 'Université de Lausanne',
    degree: 'BSc',
    field: 'Mathematics',
    startDate: '2009-09',
    endDate: '2012-06',
    visible: true,
  },
]

export const FIXTURE_SKILLS = [
  {
    category: 'Engineering',
    items: ['TypeScript', 'React', 'Next.js', 'PostgreSQL', 'Playwright'],
    visible: true,
  },
  {
    category: 'Practices',
    items: ['System design', 'Technical mentoring', 'Incident response'],
    visible: true,
  },
]

export const FIXTURE_LANGUAGES = [
  { language: 'French', level: 'Native' as const, visible: true },
  { language: 'English', level: 'Fluent' as const, visible: true },
  { language: 'German', level: 'Professional' as const, visible: true },
]

export const FIXTURE_CERTIFICATIONS = [
  {
    name: 'Certified Kubernetes Administrator',
    issuer: 'Cloud Native Computing Foundation',
    date: '2023-05',
    credentialId: 'CKA-EXAMPLE-0000',
    visible: true,
  },
  {
    name: 'Professional Scrum Master I',
    issuer: 'Scrum.org',
    date: '2019-11',
    visible: true,
  },
]

export const FIXTURE_PROJECTS = [
  {
    name: 'Openscribe',
    description:
      'Open-source layout engine that renders the same document model to HTML, ' +
      'PDF and DOCX without per-format special cases.',
    url: 'example.test/openscribe',
    startDate: '2022-01',
    technologies: ['TypeScript', 'WebAssembly'],
    visible: true,
  },
]

export interface SeededResume {
  id: string
  userId: string
  template: ResumeTemplate
}

/**
 * Insert the fixture resume for `userId` under `template` and return its id.
 *
 * `custom_sections` is left as an empty object rather than omitted: the preview
 * wrapper reads layout settings out of it, and `null` there would exercise a
 * different branch than a real resume does.
 */
export async function seedFixtureResume(
  userId: string,
  template: ResumeTemplate
): Promise<SeededResume> {
  const { data, error } = await admin()
    .from('resumes')
    .insert({
      user_id: userId,
      title: `Visual baseline - ${template}`,
      template,
      contact: FIXTURE_CONTACT,
      summary: FIXTURE_SUMMARY,
      experience: FIXTURE_EXPERIENCE,
      education: FIXTURE_EDUCATION,
      skills: FIXTURE_SKILLS,
      languages: FIXTURE_LANGUAGES,
      certifications: FIXTURE_CERTIFICATIONS,
      projects: FIXTURE_PROJECTS,
      custom_sections: {},
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(
      `Could not seed the ${template} fixture resume: ${error?.message ?? 'no row returned'}`
    )
  }

  return { id: data.id, userId, template }
}
