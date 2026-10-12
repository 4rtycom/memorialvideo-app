import { z } from 'zod';

export const PROJECT_LIFECYCLE = [
  'DRAFT',
  'ACTIVE',
  'ARCHIVED',
  'DELETION_PENDING',
  'DELETED',
] as const;

export const COLLECTION_STATUS = ['NOT_STARTED', 'OPEN', 'LOCKED'] as const;

export const PRODUCTION_STATUS = [
  'NOT_READY',
  'PREVIEW_READY',
  'FINAL_REQUESTED',
  'FINAL_READY',
] as const;

export const ASSET_STATUS = [
  'PENDING_UPLOAD',
  'UPLOADING',
  'UPLOADED',
  'VALIDATING',
  'PROCESSING',
  'READY',
  'REJECTED',
  'FAILED_RETRYABLE',
  'FAILED_FINAL',
  'DELETION_PENDING',
  'DELETED',
] as const;

export const projectLifecycleSchema = z.enum(PROJECT_LIFECYCLE);
export const collectionStatusSchema = z.enum(COLLECTION_STATUS);
export const productionStatusSchema = z.enum(PRODUCTION_STATUS);
export const assetStatusSchema = z.enum(ASSET_STATUS);

export const PACKAGE_KEYS = ['preview', 'tribute', 'ceremony', 'legacy'] as const;
export const packageKeySchema = z.enum(PACKAGE_KEYS);
export type PackageKey = z.infer<typeof packageKeySchema>;
