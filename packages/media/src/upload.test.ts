import { describe, expect, it } from 'vitest';

import {
  assertNoPiiInStorageKey,
  classifyUpload,
  MAX_ASSETS_PER_PROJECT,
  opaqueOriginalKey,
} from './upload';

describe('upload declaration', () => {
  it('accepts a modest JPEG', () => {
    expect(
      classifyUpload(
        {
          projectPublicId: 'mv_aaaaaaaaaaaaaaaa',
          assetType: 'image',
          declaredMime: 'image/jpeg',
          sizeBytes: 1_200_000,
        },
        3,
      ),
    ).toBeNull();
  });

  it('rejects HEIC, oversize, long clips and quota', () => {
    expect(
      classifyUpload(
        {
          projectPublicId: 'mv_aaaaaaaaaaaaaaaa',
          assetType: 'image',
          declaredMime: 'image/heic',
          sizeBytes: 1000,
        },
        0,
      ),
    ).toBe('unsupported_type');
    expect(
      classifyUpload(
        {
          projectPublicId: 'mv_aaaaaaaaaaaaaaaa',
          assetType: 'video',
          declaredMime: 'video/mp4',
          sizeBytes: 1000,
          durationMs: 90_000,
        },
        0,
      ),
    ).toBe('too_long');
    expect(
      classifyUpload(
        {
          projectPublicId: 'mv_aaaaaaaaaaaaaaaa',
          assetType: 'image',
          declaredMime: 'image/jpeg',
          sizeBytes: 1000,
        },
        MAX_ASSETS_PER_PROJECT,
      ),
    ).toBe('quota');
  });

  it('keeps storage keys opaque', () => {
    const key = opaqueOriginalKey('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');
    expect(assertNoPiiInStorageKey(key)).toBe(true);
    expect(key).not.toContain('helena');
  });
});
