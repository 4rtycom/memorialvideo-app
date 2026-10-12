import { describe, expect, it } from 'vitest';

import { canTransitionAsset, isReadyAsset, transitionAsset } from './ingest';

describe('asset ingest', () => {
  it('follows the authorized upload path', () => {
    expect(transitionAsset('PENDING_UPLOAD', 'UPLOADING')).toBe('UPLOADING');
    expect(transitionAsset('UPLOADING', 'UPLOADED')).toBe('UPLOADED');
    expect(transitionAsset('UPLOADED', 'VALIDATING')).toBe('VALIDATING');
    expect(transitionAsset('VALIDATING', 'PROCESSING')).toBe('PROCESSING');
    expect(transitionAsset('PROCESSING', 'READY')).toBe('READY');
    expect(isReadyAsset('READY')).toBe(true);
  });

  it('rejects a jump to ready', () => {
    expect(canTransitionAsset('PENDING_UPLOAD', 'READY')).toBe(false);
  });
});
