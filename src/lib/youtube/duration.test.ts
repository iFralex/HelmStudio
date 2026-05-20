import { describe, expect, it } from 'vitest';
import { parseIso8601Duration } from './duration';

describe('parseIso8601Duration', () => {
  it('parses seconds only', () => {
    expect(parseIso8601Duration('PT34S')).toBe(34);
  });

  it('parses minutes only', () => {
    expect(parseIso8601Duration('PT12M')).toBe(720);
  });

  it('parses hours+minutes+seconds', () => {
    expect(parseIso8601Duration('PT1H12M34S')).toBe(4354);
  });

  it('parses hours only', () => {
    expect(parseIso8601Duration('PT2H')).toBe(7200);
  });

  it('handles edge case PT0S', () => {
    expect(parseIso8601Duration('PT0S')).toBe(0);
  });

  it('parses day component', () => {
    expect(parseIso8601Duration('P1DT2H')).toBe(86400 + 7200);
  });

  it('parses week component', () => {
    expect(parseIso8601Duration('P1W')).toBe(604800);
  });

  it('parses week with day and time', () => {
    expect(parseIso8601Duration('P1W2DT3H')).toBe(604800 + 172800 + 10800);
  });

  it('throws on unparseable input', () => {
    expect(() => parseIso8601Duration('invalid')).toThrow('Unparseable ISO 8601 duration: invalid');
  });
});
