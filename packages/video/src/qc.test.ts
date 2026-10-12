import { describe, expect, it } from 'vitest';

import { assertDuration } from './qc';

describe('output QC helpers', () => {
  it('accepts duration within tolerance', () => {
    expect(assertDuration(15.1, 15)).toEqual([]);
  });

  it('rejects missing or drifted duration', () => {
    expect(assertDuration(undefined, 15)).toEqual(['duration is missing']);
    expect(assertDuration(18, 15)[0]).toMatch(/outside/);
  });
});
