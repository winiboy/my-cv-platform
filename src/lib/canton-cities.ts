/**
 * Canton to Major Cities Mapping
 * Maps Swiss cantons to their major cities for Adzuna location filtering
 */

export const CANTON_MAJOR_CITIES: Record<string, string[]> = {
  // Use French canton names (matching swiss_localities table)
  'Zurich': ['Zurich', 'Winterthur', 'Uster'],
  'Genève': ['Geneva', 'Genève', 'Vernier', 'Carouge'],
  'Berne': ['Bern', 'Berne', 'Biel', 'Thun'],
  'Vaud': ['Lausanne', 'Montreux', 'Vevey', 'Yverdon'],
  'Argovie': ['Aarau', 'Baden', 'Wettingen'],
  'Saint-Gall': ['St. Gallen', 'Sankt Gallen', 'Gossau', 'Wil'],
  'Tessin': ['Lugano', 'Bellinzona', 'Locarno'],
  'Lucerne': ['Luzern', 'Lucerne', 'Emmen', 'Kriens'],
  'Valais': ['Sion', 'Sitten', 'Martigny', 'Monthey'],
  'Fribourg': ['Fribourg', 'Freiburg', 'Bulle'],
  'Bâle-Ville': ['Basel', 'Bâle'],
  'Bâle-Campagne': ['Liestal', 'Allschwil', 'Reinach'],
  'Soleure': ['Solothurn', 'Olten'],
  'Schaffhouse': ['Schaffhausen'],
  'Neuchâtel': ['Neuchâtel', 'La Chaux-de-Fonds'],
  'Grisons': ['Chur', 'Davos', 'St. Moritz'],
  'Thurgovie': ['Frauenfeld', 'Kreuzlingen'],
  'Zoug': ['Zug'],
  'Schwytz': ['Schwyz', 'Einsiedeln'],
  'Jura': ['Delémont'],
  'Appenzell Rhodes-Extérieures': ['Herisau'],
  'Appenzell Rhodes-Intérieures': ['Appenzell'],
  'Glaris': ['Glarus'],
  'Nidwald': ['Stans'],
  'Obwald': ['Sarnen'],
  'Uri': ['Altdorf'],
}

/**
 * Get major cities for a canton (normalized canton name)
 */
export function getMajorCitiesForCanton(cantonNormalized: string): string[] {
  // Try to find canton by normalized name
  for (const [canton, cities] of Object.entries(CANTON_MAJOR_CITIES)) {
    const normalized = canton.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (normalized === cantonNormalized) {
      return cities
    }
  }
  return []
}
