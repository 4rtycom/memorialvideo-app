import { describe, expect, it } from 'vitest';

import { parseFinishPatchRequest, parseFinishPlanRequest } from './memorial-finish';

describe('memorial finish contracts', () => {
  it('parses a selective finish plan request', () => {
    const parsed = parseFinishPlanRequest({
      schemaVersion: 1,
      projectPublicId: 'mv_abcdefghijklmn',
      mode: 'restore',
      consentGranted: true,
      selections: [
        { kind: 'still_asset', assetId: 'asset_1' },
        { kind: 'video_range', assetId: 'asset_2', startMs: 0, endMs: 1500 },
      ],
    });
    expect(parsed.selections).toHaveLength(2);
    expect(parsed.mode).toBe('restore');
  });

  it('rejects whole-film style empty selections', () => {
    expect(() =>
      parseFinishPlanRequest({
        schemaVersion: 1,
        projectPublicId: 'mv_abcdefghijklmn',
        mode: 'refine',
        consentGranted: true,
        selections: [],
      }),
    ).toThrow();
  });

  it('parses finish film patch preview/apply/revert requests', () => {
    expect(
      parseFinishPatchRequest({
        schemaVersion: 1,
        projectPublicId: 'mv_abcdefghijklmn',
        jobPublicId: 'fn_abcdefghijklmn',
        action: 'preview',
      }).action,
    ).toBe('preview');
    expect(
      parseFinishPatchRequest({
        schemaVersion: 1,
        projectPublicId: 'mv_abcdefghijklmn',
        jobPublicId: 'fn_abcdefghijklmn',
        action: 'apply',
      }).action,
    ).toBe('apply');
    expect(
      parseFinishPatchRequest({
        schemaVersion: 1,
        projectPublicId: 'mv_abcdefghijklmn',
        jobPublicId: 'fn_abcdefghijklmn',
        action: 'revert',
      }).action,
    ).toBe('revert');
    expect(() =>
      parseFinishPatchRequest({
        schemaVersion: 1,
        projectPublicId: 'mv_abcdefghijklmn',
        jobPublicId: 'fn_abcdefghijklmn',
        action: 'delete',
      }),
    ).toThrow();
  });
});
