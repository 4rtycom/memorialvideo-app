import { describe, expect, it } from 'vitest';
import { planServedByteRange, sliceBytes } from './byte-range';

describe('planServedByteRange', () => {
  it('serves full body when Range is absent', () => {
    expect(planServedByteRange({ sizeBytes: 1000 })).toEqual({
      action: 'full',
      sizeBytes: 1000,
    });
  });

  it('plans a partial range for bytes=start-end', () => {
    expect(
      planServedByteRange({ sizeBytes: 1000, rangeHeader: 'bytes=0-99' }),
    ).toEqual({
      action: 'partial',
      start: 0,
      end: 99,
      sizeBytes: 1000,
    });
  });

  it('returns unsatisfiable for out-of-range requests', () => {
    expect(
      planServedByteRange({ sizeBytes: 1000, rangeHeader: 'bytes=2000-2001' }),
    ).toEqual({ action: 'unsatisfiable', sizeBytes: 1000 });
  });

  it('slices inclusive end for 206 bodies', () => {
    const bytes = new Uint8Array([10, 20, 30, 40, 50]);
    expect(Array.from(sliceBytes(bytes, 1, 3))).toEqual([20, 30, 40]);
  });
});
