import { describe, it, expect } from 'vitest';
import { pitchLanguageForCountry } from './pitch-language';

describe('pitchLanguageForCountry', () => {
  it('returns it for IT', () => {
    expect(pitchLanguageForCountry('IT')).toBe('it');
    expect(pitchLanguageForCountry('it')).toBe('it');
    expect(pitchLanguageForCountry(' it ')).toBe('it');
  });

  it('returns it for unknown/null country', () => {
    expect(pitchLanguageForCountry(null)).toBe('it');
    expect(pitchLanguageForCountry(undefined)).toBe('it');
    expect(pitchLanguageForCountry('')).toBe('it');
  });

  it('returns en for other countries', () => {
    expect(pitchLanguageForCountry('US')).toBe('en');
    expect(pitchLanguageForCountry('GB')).toBe('en');
    expect(pitchLanguageForCountry('DE')).toBe('en');
  });
});
