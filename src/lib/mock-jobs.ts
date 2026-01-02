/**
 * Mock Job Data - Switzerland Only
 * Sample job listings for development and testing
 */

import type { JobListing } from '@/types/jobs'

export const mockSwissJobs: JobListing[] = [
  {
    id: '1',
    title: 'Senior Frontend Engineer',
    company: 'SwissTech Solutions',
    location_city: 'Zürich',
    location_country: 'CH',
    employment_type: 'full-time',
    description: `We're looking for an experienced Frontend Engineer to join our growing team in Zürich.

**Responsibilities:**
- Develop and maintain modern web applications using React and TypeScript
- Collaborate with designers and backend engineers
- Write clean, maintainable, and well-tested code
- Participate in code reviews and technical discussions

**Requirements:**
- 5+ years of experience with React and TypeScript
- Strong understanding of web performance optimization
- Experience with modern build tools and CI/CD
- Excellent communication skills in English and German`,
    salary_range: 'CHF 100,000 - 130,000',
    posted_date: '2026-01-01',
    application_url: '#',
  },
  {
    id: '2',
    title: 'Product Manager',
    company: 'FinanceHub AG',
    location_city: 'Genève',
    location_country: 'CH',
    employment_type: 'full-time',
    description: `Join our product team to drive innovation in financial technology.

**About the role:**
- Define product vision and strategy
- Work closely with engineering and design teams
- Conduct user research and market analysis
- Manage product roadmap and prioritization

**What we're looking for:**
- 3+ years of product management experience
- Strong analytical and problem-solving skills
- Fluent in French and English
- Experience in fintech or banking is a plus`,
    salary_range: 'CHF 110,000 - 140,000',
    posted_date: '2026-01-02',
    application_url: '#',
  },
  {
    id: '3',
    title: 'UX/UI Designer',
    company: 'Design Studio Lausanne',
    location_city: 'Lausanne',
    location_country: 'CH',
    employment_type: 'full-time',
    description: `We're seeking a talented UX/UI Designer to create beautiful and functional digital experiences.

**Your mission:**
- Design user interfaces for web and mobile applications
- Conduct user testing and iterate based on feedback
- Create design systems and component libraries
- Collaborate with developers to ensure design quality

**Requirements:**
- Strong portfolio demonstrating UX/UI work
- Proficiency in Figma, Sketch, or similar tools
- Understanding of accessibility and responsive design
- French or German language skills preferred`,
    salary_range: 'CHF 85,000 - 110,000',
    posted_date: '2025-12-28',
    application_url: '#',
  },
  {
    id: '4',
    title: 'Backend Developer',
    company: 'CloudBase Systems',
    location_city: 'Bern',
    location_country: 'CH',
    employment_type: 'full-time',
    description: `Looking for a skilled Backend Developer to build scalable cloud infrastructure.

**Key responsibilities:**
- Design and implement RESTful APIs
- Optimize database performance
- Deploy and maintain cloud infrastructure
- Ensure security and data protection compliance

**Qualifications:**
- Experience with Node.js, Python, or Go
- Knowledge of PostgreSQL, Redis, or similar databases
- Familiarity with AWS, Azure, or Google Cloud
- German language skills are a plus`,
    salary_range: 'CHF 95,000 - 125,000',
    posted_date: '2025-12-30',
    application_url: '#',
  },
  {
    id: '5',
    title: 'DevOps Engineer',
    company: 'SwissCloud AG',
    location_city: 'Basel',
    location_country: 'CH',
    employment_type: 'full-time',
    description: `Join our infrastructure team to maintain and improve our cloud platform.

**What you'll do:**
- Manage CI/CD pipelines
- Monitor system performance and reliability
- Automate deployment processes
- Implement security best practices

**Requirements:**
- Experience with Docker, Kubernetes
- Knowledge of infrastructure as code (Terraform, Ansible)
- Strong Linux/Unix skills
- Problem-solving mindset`,
    salary_range: 'CHF 105,000 - 135,000',
    posted_date: '2025-12-29',
    application_url: '#',
  },
  {
    id: '6',
    title: 'Data Analyst',
    company: 'Analytics Pro',
    location_city: 'Zürich',
    location_country: 'CH',
    employment_type: 'part-time',
    description: `We need a Data Analyst to help turn data into actionable insights.

**Responsibilities:**
- Analyze large datasets to identify trends
- Create dashboards and visualizations
- Support decision-making with data-driven recommendations
- Collaborate with cross-functional teams

**Skills needed:**
- Proficiency in SQL and Python
- Experience with Tableau, Power BI, or similar
- Strong statistical analysis skills
- Excellent communication abilities`,
    salary_range: 'CHF 60,000 - 80,000 (pro-rated)',
    posted_date: '2025-12-27',
    application_url: '#',
  },
  {
    id: '7',
    title: 'Full Stack Developer',
    company: 'StartupHub Zürich',
    location_city: 'Zürich',
    location_country: 'CH',
    employment_type: 'full-time',
    description: `Early-stage startup looking for a versatile Full Stack Developer.

**What we offer:**
- Work on greenfield projects
- Equity participation
- Flexible work environment
- Direct impact on product direction

**We're looking for:**
- Experience with React, Next.js, and Node.js
- Database design skills (PostgreSQL, MongoDB)
- Startup mentality and adaptability
- Passion for building great products`,
    salary_range: 'CHF 90,000 - 120,000 + equity',
    posted_date: '2026-01-01',
    application_url: '#',
  },
  {
    id: '8',
    title: 'Marketing Manager',
    company: 'SwissBrand GmbH',
    location_city: 'Luzern',
    location_country: 'CH',
    employment_type: 'full-time',
    description: `Lead our marketing efforts and grow our brand presence in Switzerland.

**Your role:**
- Develop and execute marketing strategies
- Manage digital marketing campaigns
- Analyze campaign performance
- Lead a small marketing team

**Qualifications:**
- 5+ years in B2B or B2C marketing
- Experience with digital marketing tools
- Strong project management skills
- Trilingual (German, French, English) is a strong plus`,
    salary_range: 'CHF 95,000 - 120,000',
    posted_date: '2025-12-26',
    application_url: '#',
  },
  {
    id: '9',
    title: 'iOS Developer',
    company: 'MobileFirst AG',
    location_city: 'St. Gallen',
    location_country: 'CH',
    employment_type: 'contract',
    description: `6-month contract to build a new mobile banking application.

**Project scope:**
- Develop native iOS app from scratch
- Implement biometric authentication
- Integrate with backend APIs
- Ensure Swiss banking compliance

**Requirements:**
- Strong Swift and SwiftUI experience
- Published apps in the App Store
- Understanding of mobile security
- Available to start immediately`,
    salary_range: 'CHF 110 - 140 per hour',
    posted_date: '2025-12-31',
    application_url: '#',
  },
  {
    id: '10',
    title: 'Junior Software Engineer',
    company: 'TechAcademy Zürich',
    location_city: 'Zürich',
    location_country: 'CH',
    employment_type: 'full-time',
    description: `Perfect opportunity for recent graduates or career changers.

**What you'll learn:**
- Modern web development practices
- Agile methodologies
- Code review and collaboration
- Professional software engineering

**We're looking for:**
- Bachelor's degree in CS or related field, or bootcamp graduate
- Basic knowledge of JavaScript/TypeScript
- Eagerness to learn and grow
- Team player with good communication skills`,
    salary_range: 'CHF 70,000 - 85,000',
    posted_date: '2025-12-25',
    application_url: '#',
  },
]
