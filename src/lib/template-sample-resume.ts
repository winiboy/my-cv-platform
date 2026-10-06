import type {
  Resume,
  ResumeContact,
  ResumeEducation,
  ResumeExperience,
  ResumeLanguage,
  ResumeSkillCategory,
} from '@/types/database'

/**
 * The invented resume every template thumbnail in the template picker draws.
 *
 * DETERMINISTIC: fixed ids and dates, nothing derived from the clock or a
 * random source, so a thumbnail is the same on every render and every machine.
 *
 * PLAIN TEXT: no string contains `<`. The templates route markup through
 * `sanitizeHtml`, which needs `document`; plain text keeps every template on
 * the path that renders without one.
 *
 * LANGUAGE-NEUTRAL: names, job titles, companies and skills read the same in
 * every locale. Section headings come from the page's own dictionary, so the
 * thumbnail is localized without per-locale content here. Language levels are
 * stored values: templates that translate them show the dictionary label, and
 * Professional draws the stored value (`Native`, `Fluent`, ...) as it does for
 * any resume.
 *
 * `title` is a job title, not the person's name: every template draws it as
 * the headline, and some also draw `contact.name`.
 *
 * The person is invented; no field describes a real individual.
 */

const contact = {
  name: 'Camille Laurent',
  email: 'camille.laurent@example.test',
  phone: '+41 21 555 0100',
  location: 'Lausanne',
  linkedin: 'example.com/in/camille-laurent',
  visible: true,
} satisfies ResumeContact

const experience = [
  {
    company: 'Northwind Systems',
    position: 'Product Manager',
    startDate: '2021-03',
    current: true,
    location: 'Lausanne',
    description: 'Product roadmap, discovery and delivery for a B2B platform.',
    achievements: ['Product launch in 4 markets.', 'Team of 8 across design and engineering.'],
    visible: true,
  },
  {
    company: 'Meridian Labs',
    position: 'Business Analyst',
    startDate: '2017-09',
    endDate: '2021-02',
    current: false,
    location: 'Geneva',
    description: 'Data analysis, KPI dashboards and process design.',
    achievements: ['Reporting time cut by 40%.'],
    visible: true,
  },
] satisfies ResumeExperience[]

const education = [
  {
    school: 'EPFL',
    degree: 'MSc',
    field: 'Management of Technology',
    startDate: '2015-09',
    endDate: '2017-06',
    visible: true,
  },
] satisfies ResumeEducation[]

const skills = [
  {
    category: 'Product',
    items: ['Roadmapping', 'User research', 'Agile', 'Analytics'],
    visible: true,
  },
  {
    category: 'Tools',
    items: ['Jira', 'Figma', 'SQL', 'Excel'],
    visible: true,
  },
] satisfies ResumeSkillCategory[]

const languages = [
  { language: 'Français', level: 'Native', visible: true },
  { language: 'English', level: 'Fluent', visible: true },
  { language: 'Deutsch', level: 'Intermediate', visible: true },
] satisfies ResumeLanguage[]

/**
 * The sample, with `template` left for the caller to set: a thumbnail draws it
 * as `{ ...TEMPLATE_SAMPLE_RESUME, template: id }`.
 */
export const TEMPLATE_SAMPLE_RESUME: Readonly<Resume> = {
  id: 'template-sample-resume',
  user_id: 'template-sample-user',
  title: 'Product Manager',
  template: 'modern',
  contact,
  summary:
    'Product manager with eight years in B2B software. Turns customer research into clear roadmaps and ships with cross-functional teams.',
  experience,
  education,
  skills,
  languages,
  certifications: [],
  projects: [],
  custom_sections: {},
  layout_settings: null,
  is_default: false,
  is_public: false,
  public_slug: null,
  job_application_id: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
}
