import { describe, it, expect } from 'vitest';
import { computeCostUsd } from './pricing';

describe('computeCostUsd', () => {
  it('returns null for unknown model', () => {
    expect(computeCostUsd('unknown-model-xyz', 1000, 500)).toBeNull();
  });

  it('computes standard cost without service tier', () => {
    const cost = computeCostUsd('gemini-2.5-flash', 1_000_000, 1_000_000);
    expect(cost).not.toBeNull();
    const flexCost = computeCostUsd('gemini-2.5-flash', 1_000_000, 1_000_000, 'flex');
    expect(flexCost).not.toBeNull();
    expect(flexCost!).toBeCloseTo(cost! * 0.5, 10);
  });

  it('flex cost is exactly half of standard for all known Gemini models', () => {
    const models = [
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-3-flash',
    ];
    for (const model of models) {
      const standard = computeCostUsd(model, 100_000, 50_000);
      const flex = computeCostUsd(model, 100_000, 50_000, 'flex');
      expect(standard).not.toBeNull();
      expect(flex).not.toBeNull();
      expect(flex!).toBeCloseTo(standard! / 2, 10);
    }
  });

  it('non-flex service tiers use standard pricing', () => {
    const standard = computeCostUsd('gemini-2.5-flash', 100_000, 50_000);
    expect(computeCostUsd('gemini-2.5-flash', 100_000, 50_000, 'default')).toBeCloseTo(standard!, 10);
    expect(computeCostUsd('gemini-2.5-flash', 100_000, 50_000, null)).toBeCloseTo(standard!, 10);
    expect(computeCostUsd('gemini-2.5-flash', 100_000, 50_000, undefined)).toBeCloseTo(standard!, 10);
  });
});
