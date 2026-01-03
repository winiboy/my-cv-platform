/**
 * Adzuna API Type Definitions
 * Documentation: https://developer.adzuna.com/docs/search
 */

export interface AdzunaJobResult {
  id: string
  title: string
  company: {
    display_name: string
  }
  location: {
    area: string[]
    display_name: string
  }
  description: string
  created: string
  salary_min?: number
  salary_max?: number
  salary_is_predicted?: string
  contract_type?: string
  contract_time?: 'full_time' | 'part_time'
  category: {
    label: string
    tag: string
  }
  redirect_url: string
}

export interface AdzunaSearchResponse {
  count: number
  mean: number
  results: AdzunaJobResult[]
  __CLASS__?: string
}

export interface AdzunaSearchParams {
  app_id: string
  app_key: string
  results_per_page?: number
  what?: string // Keywords
  where?: string // Location
  distance?: number
  salary_min?: number
  salary_max?: number
  sort_by?: 'default' | 'date' | 'salary'
  full_time?: 0 | 1
  part_time?: 0 | 1
  contract?: 0 | 1
  permanent?: 0 | 1
  page?: number
}
