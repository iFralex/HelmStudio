import { describe, it, expect } from 'vitest';
import { formatCompact, formatNumber, scoreColor, formatRelative, statusColor } from './format';

describe('formatCompact', () => {
  it('formats thousands as K', () => {
    const result = formatCompact(12400);
    expect(result).toMatch(/12[,.]4\s*[Kk]/i);
  });

  it('formats millions as M', () => {
    const result = formatCompact(1_200_000);
    expect(result).toMatch(/1[,.]2\s*[Mm][lnN]?/i);
  });

  it('formats small numbers without suffix', () => {
    const result = formatCompact(500);
    expect(result).toBe('500');
  });
});

describe('formatNumber', () => {
  it('formats integer as string with separators', () => {
    const result = formatNumber(1234567);
    // Remove all separators and check the digits are correct
    expect(result.replace(/[^0-9]/g, '')).toBe('1234567');
  });
});

describe('scoreColor', () => {
  it('returns green for score >= 70', () => {
    expect(scoreColor(70)).toBe('green');
    expect(scoreColor(100)).toBe('green');
    expect(scoreColor(85)).toBe('green');
  });

  it('returns yellow for score 40-69', () => {
    expect(scoreColor(40)).toBe('yellow');
    expect(scoreColor(55)).toBe('yellow');
    expect(scoreColor(69)).toBe('yellow');
  });

  it('returns gray for score < 40', () => {
    expect(scoreColor(0)).toBe('gray');
    expect(scoreColor(39)).toBe('gray');
  });

  it('returns gray for null', () => {
    expect(scoreColor(null)).toBe('gray');
  });
});

describe('statusColor', () => {
  it('returns green for completed', () => expect(statusColor('completed')).toBe('green'));
  it('returns blue for running', () => expect(statusColor('running')).toBe('blue'));
  it('returns red for failed', () => expect(statusColor('failed')).toBe('red'));
  it('returns gray for cancelled', () => expect(statusColor('cancelled')).toBe('gray'));
});

describe('formatRelative', () => {
  it('uses hour unit for 3-hour-old dates', () => {
    const pastDate = new Date(Date.now() - 3 * 3_600_000); // 3 hours ago
    const result = formatRelative(pastDate);
    expect(result).toMatch(/hour|or/i); // "3 hours ago" or "3 ore fa"
    expect(result).toContain('3');
  });

  it('uses second unit for 30-second-old dates', () => {
    const pastDate = new Date(Date.now() - 30_000); // 30 seconds ago
    const result = formatRelative(pastDate);
    expect(result).toMatch(/second/i); // "30 seconds ago" or "30 secondi fa"
  });

  it('uses day unit for 1-day-old timestamp', () => {
    const ts = Date.now() - 86_400_000; // 1 day ago
    const result = formatRelative(ts);
    expect(result).toMatch(/day|yesterday|ieri|giorn/i); // locale-agnostic
  });
});
