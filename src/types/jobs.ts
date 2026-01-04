/**
 * Job Search Types
 * Types for job listings and search functionality
 */

export type EmploymentType = 'full-time' | 'part-time' | 'contract' | 'internship' | 'temporary'

export interface JobListing {
  id: string
  title: string
  company: string
  location_city: string
  location_country: 'CH' // Switzerland only
  location_full?: string // Full location string (e.g., "Zürich, Zürich, Switzerland")
  location_city_normalized?: string // Normalized city for matching
  location_canton?: string // Resolved canton from swiss_localities
  location_canton_normalized?: string // Normalized canton for filtering
  location_unresolved?: boolean // True if canton could not be resolved
  employment_type: EmploymentType
  description: string
  requirements?: string
  salary_range?: string
  posted_date: string
  application_url?: string
  is_saved?: boolean
}

export interface JobSearchFilters {
  query: string
  location_canton?: string // Swiss canton for filtering
  employment_type?: EmploymentType
}

// Swiss Cantons (26 total)
export const SWISS_CANTONS = [
  'Aargau',
  'Appenzell Ausserrhoden',
  'Appenzell Innerrhoden',
  'Basel-Landschaft',
  'Basel-Stadt',
  'Bern',
  'Fribourg',
  'Genève',
  'Glarus',
  'Graubünden',
  'Jura',
  'Luzern',
  'Neuchâtel',
  'Nidwalden',
  'Obwalden',
  'Schaffhausen',
  'Schwyz',
  'Solothurn',
  'St. Gallen',
  'Thurgau',
  'Ticino',
  'Uri',
  'Vaud',
  'Valais',
  'Zug',
  'Zürich',
] as const
