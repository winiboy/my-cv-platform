import { describe, expect, it } from 'vitest'
import { countLanguageVotes, detectOfferLanguage, MAX_SCANNED_CHARACTERS } from './detect-offer-language'

/**
 * Full-length offers written for this test, in the register of real postings:
 * the company, the role, the tasks, the profile and what the employer offers,
 * with the English loanwords ("Team", "Skills", "Cloud", "AI", "Scrum") such
 * offers carry. No company or person named is real.
 */
const IN_SCOPE_OFFERS = {
  fr: `Pour renforcer notre équipe Data à Paris, nous recherchons un ou une Ingénieur Data confirmé(e).
    Rattaché(e) au responsable de la plateforme, vous serez en charge de la conception et de la
    maintenance des pipelines de données qui alimentent nos produits. Vos missions : concevoir des flux
    d'ingestion fiables et documentés ; travailler avec les équipes produit et les data scientists pour
    comprendre leurs besoins ; garantir la qualité, la sécurité et la disponibilité des données ;
    participer aux rituels Scrum de l'équipe et à l'amélioration continue de nos pratiques. Votre profil :
    vous êtes diplômé(e) d'une école d'ingénieur ou d'un master en informatique et vous avez au moins trois
    ans d'expérience sur un poste similaire. Vous maîtrisez Python, SQL et un environnement Cloud, et vous
    avez déjà travaillé avec des outils d'orchestration. Curieux(se) et rigoureux(se), vous aimez partager
    vos connaissances. Nous offrons un CDI, un environnement de travail flexible avec deux jours de
    télétravail par semaine, des projets AI ambitieux et une équipe soudée qui attache de l'importance à la
    qualité de son travail.`,
  en: `To strengthen our Data team in London, we are looking for an experienced Data Engineer. Reporting
    to the head of the platform, you will be responsible for the design and maintenance of the data
    pipelines that feed our products. Your responsibilities: design reliable and documented ingestion
    flows; work with the product teams and the data scientists to understand their needs; guarantee the
    quality, security and availability of our data; take part in the team's Scrum rituals and in the
    continuous improvement of our practices. Your profile: you hold a degree in computer science or a
    related field and have at least three years of experience in a similar role. You are fluent in Python,
    SQL and a Cloud environment, and you have already worked with orchestration tools. Curious and
    rigorous, you enjoy sharing what you know with others. We offer a permanent contract, a flexible
    working environment with two days of remote work per week, ambitious AI projects and a close-knit team
    that cares about the quality of its work.`,
  de: `Zur Verstärkung unseres Data-Teams in Zürich suchen wir eine erfahrene Data Engineer (m/w/d). Sie
    berichten an die Leitung der Plattform und sind für die Konzeption und Wartung der Datenpipelines
    verantwortlich, die unsere Produkte versorgen. Ihre Aufgaben: Sie entwickeln zuverlässige und
    dokumentierte Datenflüsse; Sie arbeiten eng mit den Produktteams und den Data Scientists zusammen, um
    deren Anforderungen zu verstehen; Sie stellen die Qualität, die Sicherheit und die Verfügbarkeit der
    Daten sicher; Sie nehmen an den Scrum-Ritualen des Teams teil und verbessern unsere Arbeitsweise
    laufend. Ihr Profil: Sie haben ein abgeschlossenes Studium in Informatik oder einem verwandten Fach und
    mindestens drei Jahre Erfahrung in einer ähnlichen Position. Sie beherrschen Python, SQL und eine
    Cloud-Umgebung und haben bereits mit Orchestrierungswerkzeugen gearbeitet. Wir bieten Ihnen eine
    unbefristete Anstellung, flexible Arbeitszeiten mit zwei Tagen Homeoffice pro Woche, spannende
    AI-Projekte und ein motiviertes Team, dem die Qualität seiner Arbeit wichtig ist.`,
  it: `Per rafforzare il nostro team Data di Milano cerchiamo un Data Engineer con esperienza. Riportando al
    responsabile della piattaforma, sarai responsabile della progettazione e della manutenzione delle
    pipeline di dati che alimentano i nostri prodotti. Le tue attività: progettare flussi di acquisizione
    affidabili e documentati; lavorare con i team di prodotto e con i data scientist per comprendere le
    loro esigenze; garantire la qualità, la sicurezza e la disponibilità dei dati; partecipare ai rituali
    Scrum del team e al miglioramento continuo delle nostre pratiche. Il tuo profilo: sei laureato in
    informatica o in una disciplina affine e hai almeno tre anni di esperienza in un ruolo simile. Conosci
    bene Python, SQL e un ambiente Cloud, e hai già lavorato con strumenti di orchestrazione. Curioso e
    rigoroso, ami condividere le tue competenze. Offriamo un contratto a tempo indeterminato, un ambiente
    di lavoro flessibile con due giorni di smart working alla settimana, progetti AI ambiziosi e un team
    affiatato che ha a cuore la qualità del proprio lavoro.`,
} as const

/** Swiss French: Swiss numbers and terms (septante, CFC, HES, CHF, canton). */
const SWISS_FRENCH_OFFER = `Notre fiduciaire, établie depuis plus de septante ans dans le canton de Vaud,
  recherche pour son bureau de Lausanne un ou une Comptable à 80-100 %. Vous serez responsable de la tenue
  de la comptabilité d'un portefeuille de PME et de particuliers, de l'établissement des bouclements
  annuels et des déclarations d'impôts, ainsi que du suivi de la TVA. Vous êtes au bénéfice d'un CFC
  d'employé(e) de commerce complété par un brevet fédéral de spécialiste en finance et comptabilité, ou
  d'un diplôme HES en économie d'entreprise. Vous avez au moins cinq ans d'expérience dans une fiduciaire
  et vous maîtrisez les outils informatiques usuels. Nous vous offrons un poste stable au sein d'une équipe
  de onze personnes, un salaire attractif dès CHF 7'000.- par mois versé treize fois, la possibilité de
  travailler une journée par semaine à domicile et des conditions de formation continue avantageuses.
  Entrée en fonction : de suite ou à convenir. Votre dossier complet est à adresser à notre service des
  ressources humaines par le biais de notre site.`

const OUT_OF_SCOPE_OFFERS = {
  es: `Para reforzar nuestro equipo de Datos en Madrid, buscamos un Ingeniero de Datos con experiencia.
    Bajo la dirección del responsable de la plataforma, serás responsable del diseño y del mantenimiento
    de los procesos de datos que alimentan nuestros productos. Tus funciones: diseñar flujos de ingesta
    fiables y documentados; trabajar con los equipos de producto y con los científicos de datos para
    entender sus necesidades; garantizar la calidad, la seguridad y la disponibilidad de los datos;
    participar en los rituales Scrum del equipo y en la mejora continua de nuestras prácticas. Tu perfil:
    tienes una titulación en informática o en un campo afín y al menos tres años de experiencia en un
    puesto similar. Dominas Python, SQL y un entorno Cloud, y ya has trabajado con herramientas de
    orquestación. Curioso y riguroso, te gusta compartir tus conocimientos con el resto del equipo.
    Ofrecemos un contrato indefinido, un entorno de trabajo flexible con dos días de teletrabajo por
    semana, proyectos AI ambiciosos y un equipo muy unido que se preocupa por la calidad de su trabajo.`,
  pt: `Para reforçar a nossa equipe de Dados em Lisboa, procuramos um Engenheiro de Dados com
    experiência. Reportando ao responsável da plataforma, você será responsável pela concepção e pela
    manutenção dos pipelines de dados que alimentam os nossos produtos. As suas funções: conceber fluxos de
    ingestão fiáveis e documentados; trabalhar com as equipes de produto e com os cientistas de dados para
    compreender as suas necessidades; garantir a qualidade, a segurança e a disponibilidade dos dados;
    participar nos rituais Scrum da equipe e na melhoria contínua das nossas práticas. O seu perfil: você
    tem formação em informática ou numa área afim e pelo menos três anos de experiência numa função
    semelhante. Domina Python, SQL e um ambiente Cloud, e já trabalhou com ferramentas de orquestração.
    Curioso e rigoroso, gosta de partilhar os seus conhecimentos. Oferecemos um contrato sem termo, um
    ambiente de trabalho flexível com dois dias de teletrabalho por semana, projetos AI ambiciosos e uma
    equipe unida que se preocupa com a qualidade do seu trabalho. Não perca esta vaga.`,
  nl: `Ter versterking van ons Data-team in Amsterdam zijn wij op zoek naar een ervaren Data Engineer. Je
    rapporteert aan de verantwoordelijke van het platform en bent verantwoordelijk voor het ontwerp en het
    onderhoud van de datapijplijnen die onze producten voeden. Jouw taken: je ontwerpt betrouwbare en
    gedocumenteerde datastromen; je werkt samen met de productteams en de data scientists om hun behoeften
    te begrijpen; je bewaakt de kwaliteit, de veiligheid en de beschikbaarheid van de data; je neemt deel
    aan de Scrum-rituelen van het team en aan de voortdurende verbetering van onze werkwijze. Jouw profiel:
    je hebt een diploma in de informatica of een verwant vakgebied en minstens drie jaar ervaring in een
    vergelijkbare functie. Je beheerst Python, SQL en een Cloud-omgeving en je hebt al gewerkt met
    orkestratietools. Wij bieden een vast contract, een flexibele werkomgeving met twee dagen thuiswerk per
    week, uitdagende AI-projecten en een hecht team dat veel waarde hecht aan de kwaliteit van het werk.`,
} as const

describe('detectOfferLanguage', () => {
  for (const [language, offer] of Object.entries(IN_SCOPE_OFFERS)) {
    it(`recognises a full-length offer written in ${language}`, () => {
      expect(detectOfferLanguage(offer)).toBe(language)
    })
  }

  it('recognises Swiss French', () => {
    expect(detectOfferLanguage(SWISS_FRENCH_OFFER)).toBe('fr')
  })

  for (const [language, offer] of Object.entries(OUT_OF_SCOPE_OFFERS)) {
    it(`returns null for a full-length offer written in ${language}`, () => {
      expect(detectOfferLanguage(offer)).toBeNull()
      // Not by lack of evidence: the offer's own language leads the count.
      const votes = countLanguageVotes(offer)
      const leader = Object.entries(votes).sort(([, a], [, b]) => b - a)[0][0]
      expect(leader).toBe(language)
    })
  }

  it('returns null for a German offer and an English one of the same size', () => {
    expect(detectOfferLanguage(`${IN_SCOPE_OFFERS.de}\n\n${IN_SCOPE_OFFERS.en}`)).toBeNull()
  })

  it('keeps the main language of an offer with a short block in another one', () => {
    const germanWithEnglishFooter = `${IN_SCOPE_OFFERS.de}\n\nWe look forward to your application.`
    expect(detectOfferLanguage(germanWithEnglishFooter)).toBe('de')
  })

  it('is not swayed by case or punctuation', () => {
    expect(detectOfferLanguage(IN_SCOPE_OFFERS.de.toUpperCase())).toBe('de')
  })

  it('returns null for text too short to call', () => {
    expect(detectOfferLanguage('Data Engineer (m/w/d)')).toBeNull()
    expect(detectOfferLanguage('')).toBeNull()
  })

  it('returns null for anything that is not a string', () => {
    expect(detectOfferLanguage(null)).toBeNull()
    expect(detectOfferLanguage(undefined)).toBeNull()
    expect(detectOfferLanguage(42)).toBeNull()
  })

  it('reads only the beginning of a very long text, quickly', () => {
    const padded = `${IN_SCOPE_OFFERS.it} ${'x '.repeat(MAX_SCANNED_CHARACTERS)} ${IN_SCOPE_OFFERS.en.repeat(50)}`
    const started = performance.now()
    expect(detectOfferLanguage(padded)).toBe('it')
    expect(performance.now() - started).toBeLessThan(200)
  })
})
