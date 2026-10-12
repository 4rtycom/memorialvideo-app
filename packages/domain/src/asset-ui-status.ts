import type { AssetStatus } from './ingest';

/** Family-facing upload/memory status used by Guided Memories and Memory Library. */
export const ASSET_UI_STATUSES = [
  'queued',
  'uploading',
  'processing',
  'ready',
  'needs_attention',
  'error',
] as const;

export type AssetUiStatus = (typeof ASSET_UI_STATUSES)[number];

export type AssetUiFailureCode = 'heic' | 'rejected' | 'failed' | 'generic';

/**
 * Map durable asset ingest status to calm UI status.
 * Never invent READY — only READY from the server becomes ready.
 */
export function mapAssetStatusToUi(status: AssetStatus | string | null | undefined): AssetUiStatus {
  switch (status) {
    case 'PENDING_UPLOAD':
    case 'UPLOADING':
      return 'uploading';
    case 'UPLOADED':
    case 'VALIDATING':
    case 'PROCESSING':
      return 'processing';
    case 'READY':
      return 'ready';
    case 'REJECTED':
      return 'needs_attention';
    case 'FAILED_RETRYABLE':
    case 'FAILED_FINAL':
      return 'error';
    case 'DELETION_PENDING':
    case 'DELETED':
      return 'error';
    default:
      return 'error';
  }
}

export function isTerminalAssetUiStatus(status: AssetUiStatus): boolean {
  return status === 'ready' || status === 'needs_attention' || status === 'error';
}

export function failureCodeForAssetStatus(
  status: AssetStatus | string | null | undefined,
): AssetUiFailureCode | undefined {
  if (status === 'REJECTED') {
    return 'rejected';
  }
  if (status === 'FAILED_RETRYABLE' || status === 'FAILED_FINAL') {
    return 'failed';
  }
  return undefined;
}

export function isIngestProcessing(status: AssetStatus | string | null | undefined): boolean {
  return mapAssetStatusToUi(status) === 'processing' || mapAssetStatusToUi(status) === 'uploading';
}
