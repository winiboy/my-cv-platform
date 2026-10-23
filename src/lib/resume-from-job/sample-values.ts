import type { Locale } from '@/lib/i18n'
import type { ResumeLanguage } from '@/types/database'

/**
 * Sample values for a resume created from a job offer.
 *
 * PRODUCT CONTENT, NOT TEST DATA. The owner asked on 2026-10-22 that a CV
 * created from a job offer opens with every field filled (PRD
 * `tasks/prds/cv-from-job-complete.md`). Whatever the offer and the AI do not
 * provide is filled from here, and the user replaces it. These values are what
 * users see in their new CV; they are not fixtures, and tests must not reuse
 * them as such.
 *
 * DESCRIBE THE FIELD. Each value says what belongs in its field ("Prénom Nom",
 * "Nom de votre école"), so a value left in place is obvious at a glance and
 * reads as an instruction, not as a fact about the user. This is deliberately
 * unlike `TEMPLATE_SAMPLE_RESUME`, which draws a realistic invented person for
 * the template thumbnails. No value names a real person, company or
 * institution. Every email and web address uses the reserved `example.com`
 * (RFC 2606) in all four languages, apart from the LinkedIn and GitHub host
 * names, which name the platform the field is for. The PRD's
 * "prenom.nom@exemple.com" was illustrative: `exemple.com` is a live parked
 * domain, so the owner chose `example.com` for French too on 2026-10-22.
 *
 * ONE LANGUAGE PER RESUME. Each set is complete on its own, and a resume takes
 * every sample value from exactly one set.
 *
 * Description fields are plain text here; the builder turns them into the
 * stored rich-text HTML.
 */

/** The languages a resume created from a job offer can be written in. */
export const RESUME_CONTENT_LANGUAGES = ['fr', 'en', 'de', 'it'] as const satisfies readonly Locale[]

export type ResumeContentLanguage = (typeof RESUME_CONTENT_LANGUAGES)[number]

export function isResumeContentLanguage(value: unknown): value is ResumeContentLanguage {
  return typeof value === 'string' && (RESUME_CONTENT_LANGUAGES as readonly string[]).includes(value)
}

/** Placeholders in the summary sentences, replaced with the offer's own text. */
export const SUMMARY_JOB_TITLE_PLACEHOLDER = '{jobTitle}'
export const SUMMARY_COMPANY_PLACEHOLDER = '{company}'

export interface ResumeSampleValues {
  /** The headline when the offer has no usable job title. */
  readonly headline: string
  readonly contact: {
    readonly name: string
    readonly email: string
    readonly phone: string
    readonly location: string
    readonly linkedin: string
    readonly github: string
    readonly website: string
  }
  readonly summary: {
    /** Contains both placeholders. */
    readonly withCompany: string
    /** Contains the job-title placeholder only. */
    readonly withoutCompany: string
  }
  readonly experience: {
    readonly company: string
    readonly position: string
    readonly location: string
    readonly description: string
    readonly achievements: readonly string[]
  }
  readonly education: {
    readonly school: string
    readonly degree: string
    readonly field: string
    readonly gpa: string
    readonly description: string
    readonly achievements: readonly string[]
  }
  readonly skills: {
    readonly category: string
    readonly items: readonly string[]
  }
  readonly languages: readonly {
    readonly language: string
    readonly level: ResumeLanguage['level']
  }[]
  readonly certification: {
    readonly name: string
    readonly issuer: string
    readonly credentialId: string
    readonly url: string
  }
  readonly project: {
    readonly name: string
    readonly description: string
    readonly url: string
    readonly technologies: readonly string[]
  }
}

/**
 * Dates are the same in every language: `YYYY-MM`, fixed rather than derived
 * from the clock so a resume is the same whenever it is built, and each range
 * ends after it starts.
 */
export const SAMPLE_DATES = {
  experience: { startDate: '2021-01', endDate: '2024-06' },
  education: { startDate: '2016-09', endDate: '2019-06' },
  certification: { date: '2023-03', expiryDate: '2028-03' },
  project: { startDate: '2023-01', endDate: '2023-09' },
} as const

const FR: ResumeSampleValues = {
  headline: 'Intitulé du poste visé',
  contact: {
    name: 'Prénom Nom',
    email: 'prenom.nom@example.com',
    phone: '+41 00 000 00 00',
    location: 'Ville, Pays',
    linkedin: 'linkedin.com/in/votre-profil',
    github: 'github.com/votre-compte',
    website: 'https://votre-site.example.com',
  },
  summary: {
    withCompany:
      'Présentez en quelques phrases votre parcours, vos compétences clés et ce qui fait de vous la bonne personne pour le poste de {jobTitle} chez {company}.',
    withoutCompany:
      'Présentez en quelques phrases votre parcours, vos compétences clés et ce qui fait de vous la bonne personne pour le poste de {jobTitle}.',
  },
  experience: {
    company: "Nom de l'entreprise",
    position: 'Intitulé de votre poste',
    location: 'Lieu du poste',
    description:
      'Décrivez vos principales responsabilités dans ce poste et le contexte dans lequel vous les avez exercées.',
    achievements: [
      'Réalisation concrète obtenue dans ce poste, idéalement chiffrée',
      'Autre résultat dont vous êtes fier ou fière',
    ],
  },
  education: {
    school: 'Nom de votre école',
    degree: 'Intitulé de votre diplôme',
    field: "Domaine d'études",
    gpa: 'Mention ou moyenne obtenue',
    description: "Décrivez en une phrase le contenu de votre formation ou votre travail de fin d'études.",
    achievements: ['Distinction, prix ou projet marquant de votre formation'],
  },
  skills: {
    category: 'Compétences clés',
    items: ["Compétence demandée dans l'offre", 'Outil ou logiciel maîtrisé', 'Qualité personnelle'],
  },
  languages: [
    { language: 'Votre langue maternelle', level: 'Native' },
    { language: 'Autre langue parlée', level: 'Professional' },
  ],
  certification: {
    name: 'Nom de votre certification',
    issuer: 'Organisme de certification',
    credentialId: 'Numéro du certificat',
    url: 'https://example.com/votre-certificat',
  },
  project: {
    name: "Titre d'une réalisation clé",
    description: 'Décrivez le défi, votre action et le résultat obtenu.',
    url: 'https://example.com/votre-projet',
    technologies: ['Outil utilisé', 'Méthode appliquée'],
  },
}

const EN: ResumeSampleValues = {
  headline: 'Target job title',
  contact: {
    name: 'First Last',
    email: 'first.last@example.com',
    phone: '+44 00 0000 0000',
    location: 'City, Country',
    linkedin: 'linkedin.com/in/your-profile',
    github: 'github.com/your-account',
    website: 'https://your-website.example.com',
  },
  summary: {
    withCompany:
      'Describe in a few sentences your background, your key skills and what makes you the right person for the {jobTitle} role at {company}.',
    withoutCompany:
      'Describe in a few sentences your background, your key skills and what makes you the right person for the {jobTitle} role.',
  },
  experience: {
    company: 'Company name',
    position: 'Your job title',
    location: 'Job location',
    description:
      'Describe your main responsibilities in this role and the context in which you carried them out.',
    achievements: [
      'A concrete achievement in this role, ideally with a number',
      'Another result you are proud of',
    ],
  },
  education: {
    school: 'Name of your school',
    degree: 'Name of your degree',
    field: 'Field of study',
    gpa: 'Grade or honours obtained',
    description: 'Describe in one sentence what your studies covered or your final project.',
    achievements: ['Award, distinction or notable project from your studies'],
  },
  skills: {
    category: 'Key skills',
    items: ['Skill asked for in the job offer', 'Tool or software you master', 'Personal strength'],
  },
  languages: [
    { language: 'Your native language', level: 'Native' },
    { language: 'Other language you speak', level: 'Professional' },
  ],
  certification: {
    name: 'Name of your certification',
    issuer: 'Certifying organisation',
    credentialId: 'Certificate number',
    url: 'https://example.com/your-certificate',
  },
  project: {
    name: 'Title of a key achievement',
    description: 'Describe the challenge, what you did and the result.',
    url: 'https://example.com/your-project',
    technologies: ['Tool used', 'Method applied'],
  },
}

const DE: ResumeSampleValues = {
  headline: 'Angestrebte Position',
  contact: {
    name: 'Vorname Nachname',
    email: 'vorname.nachname@example.com',
    phone: '+49 000 00000000',
    location: 'Stadt, Land',
    linkedin: 'linkedin.com/in/ihr-profil',
    github: 'github.com/ihr-konto',
    website: 'https://ihre-website.example.com',
  },
  summary: {
    withCompany:
      'Beschreiben Sie in wenigen Sätzen Ihren Werdegang, Ihre wichtigsten Kompetenzen und warum Sie die richtige Person für die Stelle als {jobTitle} bei {company} sind.',
    withoutCompany:
      'Beschreiben Sie in wenigen Sätzen Ihren Werdegang, Ihre wichtigsten Kompetenzen und warum Sie die richtige Person für die Stelle als {jobTitle} sind.',
  },
  experience: {
    company: 'Name des Unternehmens',
    position: 'Ihre Berufsbezeichnung',
    location: 'Arbeitsort',
    description:
      'Beschreiben Sie Ihre wichtigsten Aufgaben in dieser Position und das Umfeld, in dem Sie sie wahrgenommen haben.',
    achievements: [
      'Konkreter Erfolg in dieser Position, am besten mit Zahlen belegt',
      'Weiteres Ergebnis, auf das Sie stolz sind',
    ],
  },
  education: {
    school: 'Name Ihrer Schule oder Hochschule',
    degree: 'Bezeichnung Ihres Abschlusses',
    field: 'Studienrichtung',
    gpa: 'Abschlussnote oder Prädikat',
    description: 'Beschreiben Sie in einem Satz die Inhalte Ihres Studiums oder Ihre Abschlussarbeit.',
    achievements: ['Auszeichnung, Preis oder besonderes Projekt aus Ihrem Studium'],
  },
  skills: {
    category: 'Kernkompetenzen',
    items: ['In der Stellenanzeige geforderte Kompetenz', 'Beherrschtes Tool oder Programm', 'Persönliche Stärke'],
  },
  languages: [
    { language: 'Ihre Muttersprache', level: 'Native' },
    { language: 'Weitere gesprochene Sprache', level: 'Professional' },
  ],
  certification: {
    name: 'Name Ihrer Zertifizierung',
    issuer: 'Zertifizierungsstelle',
    credentialId: 'Zertifikatsnummer',
    url: 'https://example.com/ihr-zertifikat',
  },
  project: {
    name: 'Titel eines wichtigen Erfolgs',
    description: 'Beschreiben Sie die Herausforderung, Ihr Vorgehen und das Ergebnis.',
    url: 'https://example.com/ihr-projekt',
    technologies: ['Eingesetztes Tool', 'Angewandte Methode'],
  },
}

const IT: ResumeSampleValues = {
  headline: 'Posizione desiderata',
  contact: {
    name: 'Nome Cognome',
    email: 'nome.cognome@example.com',
    phone: '+39 000 000 0000',
    location: 'Città, Paese',
    linkedin: 'linkedin.com/in/il-tuo-profilo',
    github: 'github.com/il-tuo-account',
    website: 'https://il-tuo-sito.example.com',
  },
  summary: {
    withCompany:
      'Descrivi in poche frasi il tuo percorso, le tue competenze chiave e perché sei la persona giusta per il ruolo di {jobTitle} presso {company}.',
    withoutCompany:
      'Descrivi in poche frasi il tuo percorso, le tue competenze chiave e perché sei la persona giusta per il ruolo di {jobTitle}.',
  },
  experience: {
    company: "Nome dell'azienda",
    position: 'Il tuo ruolo',
    location: 'Luogo di lavoro',
    description:
      'Descrivi le tue principali responsabilità in questo ruolo e il contesto in cui le hai svolte.',
    achievements: [
      'Un risultato concreto ottenuto in questo ruolo, idealmente con un numero',
      'Un altro risultato di cui sei orgoglioso o orgogliosa',
    ],
  },
  education: {
    school: 'Nome della tua scuola',
    degree: 'Titolo del tuo diploma',
    field: 'Ambito di studio',
    gpa: 'Voto finale o lode',
    description: 'Descrivi in una frase il contenuto dei tuoi studi o della tua tesi.',
    achievements: ['Premio, riconoscimento o progetto importante dei tuoi studi'],
  },
  skills: {
    category: 'Competenze chiave',
    items: ["Competenza richiesta dall'annuncio", 'Strumento o software che padroneggi', 'Qualità personale'],
  },
  languages: [
    { language: 'La tua lingua madre', level: 'Native' },
    { language: 'Altra lingua parlata', level: 'Professional' },
  ],
  certification: {
    name: 'Nome della tua certificazione',
    issuer: 'Ente certificatore',
    credentialId: 'Numero del certificato',
    url: 'https://example.com/il-tuo-certificato',
  },
  project: {
    name: 'Titolo di un risultato chiave',
    description: 'Descrivi la sfida, la tua azione e il risultato ottenuto.',
    url: 'https://example.com/il-tuo-progetto',
    technologies: ['Strumento utilizzato', 'Metodo applicato'],
  },
}

export const RESUME_SAMPLE_VALUES: Readonly<Record<ResumeContentLanguage, ResumeSampleValues>> = {
  fr: FR,
  en: EN,
  de: DE,
  it: IT,
}
