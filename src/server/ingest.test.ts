import { describe, expect, it } from 'vitest';
import { isHeicFilename, isVideoMemory, memoryView, nextIngestStatus } from './ingest';

describe('creator ingest helpers', () => {
  it('detects HEIC filenames case-insensitively', () => {
    expect(isHeicFilename('IMG.HEIC')).toBe(true);
    expect(isHeicFilename('photo.heif')).toBe(true);
    expect(isHeicFilename('photo.jpg')).toBe(false);
  });

  it('detects short video memories from contentType or .mp4 hint', () => {
    expect(isVideoMemory({ contentType: 'video/mp4' })).toBe(true);
    expect(isVideoMemory({ originalFilenameHint: 'clip.mp4' })).toBe(true);
    expect(isVideoMemory({ contentType: 'image/jpeg', originalFilenameHint: 'a.jpg' })).toBe(false);
  });

  it('maps ingest path uploading → ready', () => {
    expect(nextIngestStatus('PENDING_UPLOAD')).toBeNull();
    expect(nextIngestStatus('UPLOADING')).toBe('UPLOADED');
    expect(nextIngestStatus('UPLOADED')).toBe('VALIDATING');
    expect(nextIngestStatus('VALIDATING')).toBe('PROCESSING');
    expect(nextIngestStatus('PROCESSING')).toBe('READY');
    expect(nextIngestStatus('READY')).toBeNull();
  });

  it('labels HEIC needs_attention honestly', () => {
    const view = memoryView({ ingestStatus: 'REJECTED', failureCode: 'heic' });
    expect(view.uiStatus).toBe('needs_attention');
    expect(view.label).toContain('HEIC');
  });
});
