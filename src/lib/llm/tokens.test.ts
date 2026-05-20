import { describe, it, expect } from 'vitest';
import { estimateTokens, truncateMiddle } from './tokens';

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('returns 1 for exactly 4 chars', () => {
    expect(estimateTokens('abcd')).toBe(1);
  });

  it('rounds up for partial token', () => {
    expect(estimateTokens('abc')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });

  it('scales linearly with length', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });
});

describe('truncateMiddle', () => {
  it('returns short input unchanged', () => {
    const text = 'a'.repeat(40); // 10 tokens
    expect(truncateMiddle(text, 100)).toBe(text);
  });

  it('returns input unchanged when exactly at budget', () => {
    const text = 'a'.repeat(400); // exactly 100 tokens
    expect(truncateMiddle(text, 100)).toBe(text);
  });

  it('truncates long input to within budget', () => {
    const text = 'a'.repeat(4000); // 1000 tokens
    const result = truncateMiddle(text, 100);
    expect(estimateTokens(result)).toBeLessThanOrEqual(100);
  });

  it('includes an omission marker', () => {
    const text = 'a'.repeat(4000); // 1000 tokens
    const result = truncateMiddle(text, 100);
    expect(result).toMatch(/\[... \d+ tokens omitted \.\.\.\]/);
  });

  it('keeps head ~60% and tail ~40% of the remaining char budget', () => {
    // maxTokens=100 => maxChars=360 => headChars=216, tailChars=144
    const headContent = 'A'.repeat(2400);
    const tailContent = 'B'.repeat(1600);
    const text = headContent + tailContent;
    const result = truncateMiddle(text, 100);
    expect(result.startsWith('A'.repeat(216))).toBe(true);
    expect(result.endsWith('B'.repeat(144))).toBe(true);
  });

  it('omitted token count in marker is accurate', () => {
    const text = 'a'.repeat(4000); // 1000 tokens
    // maxTokens=100 => maxChars=360 => headChars=216, tailChars=144 => omitted=3640 chars => 910 tokens
    const result = truncateMiddle(text, 100);
    const match = result.match(/\[... (\d+) tokens omitted \.\.\.\]/);
    expect(match).not.toBeNull();
    const reported = parseInt(match![1]!, 10);
    expect(reported).toBe(estimateTokens('a'.repeat(4000 - 216 - 144)));
  });

  it('falls back to plain slice without marker when maxTokens is very small (maxChars <= 0)', () => {
    // maxTokens=10 => maxChars = 10*4 - 40 = 0 => fallback to text.slice(0, 40)
    const text = 'a'.repeat(200);
    const result = truncateMiddle(text, 10);
    expect(result).toBe(text.slice(0, 40));
    expect(result).not.toMatch(/tokens omitted/);
  });
});
