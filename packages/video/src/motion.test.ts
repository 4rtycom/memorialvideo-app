import { describe, expect, it } from 'vitest';

import { kenBurnsScale, kenBurnsShift, sceneSeed } from './motion';

describe('deterministic memorial motion', () => {
  it('repeats the same camera move for the same seed and scene', () => {
    const seed = sceneSeed(7, 'image-garden');
    expect(sceneSeed(7, 'image-garden')).toBe(seed);
    expect(kenBurnsScale(1.2, 0, 120, seed)).toBeCloseTo(1.2);
    expect(kenBurnsScale(1.2, 119, 120, seed)).not.toBe(kenBurnsScale(1.2, 0, 120, seed));
    expect(kenBurnsScale(1.2, 60, 120, seed)).toBe(kenBurnsScale(1.2, 60, 120, seed));
    expect(kenBurnsShift(0, 120, seed)).toEqual({ x: 0, y: 0 });
    expect(kenBurnsShift(119, 120, seed)).not.toEqual(kenBurnsShift(0, 120, seed));
  });
});
