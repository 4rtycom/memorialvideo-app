import { describe, expect, it } from 'vitest';

import {
  failureCodeForAssetStatus,
  isIngestProcessing,
  isTerminalAssetUiStatus,
  mapAssetStatusToUi,
} from './asset-ui-status.js';

describe('asset UI status mapping', () => {
  it('maps ingest states without inventing READY', () => {
    expect(mapAssetStatusToUi('UPLOADING')).toBe('uploading');
    expect(mapAssetStatusToUi('UPLOADED')).toBe('processing');
    expect(mapAssetStatusToUi('VALIDATING')).toBe('processing');
    expect(mapAssetStatusToUi('PROCESSING')).toBe('processing');
    expect(mapAssetStatusToUi('READY')).toBe('ready');
    expect(mapAssetStatusToUi('REJECTED')).toBe('needs_attention');
    expect(mapAssetStatusToUi('FAILED_RETRYABLE')).toBe('error');
    expect(mapAssetStatusToUi('FAILED_FINAL')).toBe('error');
    expect(mapAssetStatusToUi('unknown')).toBe('error');
  });

  it('marks terminal and processing correctly', () => {
    expect(isTerminalAssetUiStatus('ready')).toBe(true);
    expect(isTerminalAssetUiStatus('processing')).toBe(false);
    expect(isIngestProcessing('PROCESSING')).toBe(true);
    expect(isIngestProcessing('READY')).toBe(false);
    expect(failureCodeForAssetStatus('REJECTED')).toBe('rejected');
    expect(failureCodeForAssetStatus('FAILED_FINAL')).toBe('failed');
  });
});
