import { describe, expect, it } from 'vitest';

import { inspectImageSize, proposeDuplicates, proposeNearDuplicates, qualityFlags, sha256Hex } from './inspect';

const png1x1 = Uint8Array.from(
  Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
    'hex',
  ),
);

describe('media inspect', () => {
  it('reads PNG size and flags a tiny image as low resolution', () => {
    expect(inspectImageSize(png1x1)).toEqual({ width: 1, height: 1 });
    expect(qualityFlags({ width: 1, height: 1 }).lowResolution).toBe(true);
    expect(qualityFlags({ width: 4000, height: 400 }).extremeAspect).toBe(true);
  });

  it('hashes bytes and proposes exact duplicates only', () => {
    const hash = sha256Hex(png1x1);
    expect(hash).toHaveLength(64);
    expect(
      proposeDuplicates({
        sha256: hash,
        existing: [
          { id: 'a', sha256: hash },
          { id: 'b', sha256: '0'.repeat(64) },
        ],
      }),
    ).toEqual(['a']);
    expect(
      proposeNearDuplicates({
        perceptualHash: 'ffffffffffffffff',
        existing: [
          { id: 'near', perceptualHash: 'fffffffffffffffe' },
          { id: 'far', perceptualHash: '0000000000000000' },
        ],
      }),
    ).toEqual(['near']);
  });
});
