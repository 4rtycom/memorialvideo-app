import {
  canTransitionAsset,
  failureCodeForAssetStatus,
  mapAssetStatusToUi,
  transitionAsset,
  type AssetStatus,
  type AssetUiFailureCode,
  type AssetUiStatus,
} from '@memorialvideo/domain';

/** Detect HEIC/HEIF by filename (case-insensitive). */
export function isHeicFilename(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return lower.endsWith('.heic') || lower.endsWith('.heif');
}

/**
 * Family-facing note when HEIC preparation fails after upload.
 * Guests are not asked to convert on device — we convert automatically when possible.
 */
export const HEIC_CONVERT_GUIDANCE =
  'We could not prepare this iPhone photo automatically. Please try again, or choose a JPG or PNG.';

/** True when the memory is a short video upload (mp4), not a still photograph. */
export function isVideoMemory(memory: {
  contentType?: string | null;
  originalFilenameHint?: string | null;
  filename?: string | null;
}): boolean {
  const type = (memory.contentType ?? '').toLowerCase();
  const name = (memory.originalFilenameHint ?? memory.filename ?? '').toLowerCase();
  return type === 'video/mp4' || type.startsWith('video/mp4') || name.endsWith('.mp4');
}

export function uiStatusLabel(ui: AssetUiStatus, failureCode?: AssetUiFailureCode): string {
  switch (ui) {
    case 'uploading':
      return 'Uploading';
    case 'processing':
    case 'queued':
      return 'Still preparing';
    case 'needs_attention':
      return failureCode === 'heic' ? 'Could not prepare iPhone photo' : 'Needs attention';
    case 'error':
      return 'Could not prepare — retry';
    default:
      return 'Ready for film';
  }
}

export function memoryView(input: {
  ingestStatus: AssetStatus;
  failureCode?: AssetUiFailureCode | null;
}): { uiStatus: AssetUiStatus; label: string; failureCode?: AssetUiFailureCode } {
  const uiStatus = mapAssetStatusToUi(input.ingestStatus);
  const failureCode =
    input.failureCode ?? failureCodeForAssetStatus(input.ingestStatus) ?? undefined;
  return {
    uiStatus,
    label: uiStatusLabel(uiStatus, failureCode),
    failureCode,
  };
}

/**
 * Advance one ingest step for a durable job. No timers — caller polls / worker:once.
 */
export function nextIngestStatus(current: AssetStatus): AssetStatus | null {
  const path: Partial<Record<AssetStatus, AssetStatus>> = {
    // PENDING_UPLOAD waits for TUS bytes — do not auto-advance without attachMemoryBytes.
    UPLOADING: 'UPLOADED',
    UPLOADED: 'VALIDATING',
    VALIDATING: 'PROCESSING',
    PROCESSING: 'READY',
  };
  const next = path[current];
  if (!next || !canTransitionAsset(current, next)) {
    return null;
  }
  return transitionAsset(current, next);
}

export function isIngestTerminal(status: AssetStatus): boolean {
  return (
    status === 'READY' ||
    status === 'REJECTED' ||
    status === 'FAILED_FINAL' ||
    status === 'FAILED_RETRYABLE' ||
    status === 'DELETED' ||
    status === 'DELETION_PENDING'
  );
}
