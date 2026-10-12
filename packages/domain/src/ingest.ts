import { ASSET_STATUS } from '@memorialvideo/contracts';

import { IllegalTransitionError } from './state-machine';

export type AssetStatus = (typeof ASSET_STATUS)[number];

const ASSET_TRANSITIONS: Record<AssetStatus, readonly AssetStatus[]> = {
  PENDING_UPLOAD: ['UPLOADING', 'DELETED'],
  UPLOADING: ['UPLOADED', 'FAILED_RETRYABLE', 'DELETED'],
  UPLOADED: ['VALIDATING', 'FAILED_RETRYABLE'],
  VALIDATING: ['PROCESSING', 'REJECTED', 'FAILED_RETRYABLE'],
  PROCESSING: ['READY', 'FAILED_RETRYABLE', 'FAILED_FINAL'],
  READY: ['DELETION_PENDING'],
  REJECTED: ['DELETION_PENDING'],
  FAILED_RETRYABLE: ['UPLOADING', 'VALIDATING', 'FAILED_FINAL', 'DELETED'],
  FAILED_FINAL: ['DELETION_PENDING'],
  DELETION_PENDING: ['DELETED'],
  DELETED: [],
};

export function canTransitionAsset(from: AssetStatus, to: AssetStatus): boolean {
  return ASSET_TRANSITIONS[from].includes(to);
}

export function transitionAsset(from: AssetStatus, to: AssetStatus): AssetStatus {
  if (!canTransitionAsset(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
  return to;
}

export function isReadyAsset(status: AssetStatus): boolean {
  return status === 'READY';
}

export const ASSET_STATUS_LIST = ASSET_STATUS;
