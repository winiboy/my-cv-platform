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
  location_city?: string
  employment_type?: EmploymentType
}
