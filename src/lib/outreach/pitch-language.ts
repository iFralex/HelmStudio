/**
 * Determine the outreach pitch language from a channel's country.
 * The discovery pipeline targets Italian creators, so an unknown country
 * defaults to Italian; any non-IT country pitches in English.
 */
export function pitchLanguageForCountry(country: string | null | undefined): 'it' | 'en' {
  if (!country) return 'it';
  return country.trim().toUpperCase() === 'IT' ? 'it' : 'en';
}
