import {
  ENHANCEMENT_LOCAL_ENGINE,
  enhancementConsentSchema,
  enhancementOperationSchema,
  enhancementRequestSchema,
  enhancementVariantSchemaV2,
  type EnhancementConsent,
  type EnhancementJobStatus,
  type EnhancementOperation,
  type EnhancementPreset,
  type EnhancementRequest,
  type EnhancementReviewDecision,
  type EnhancementVariantV2,
} from '@memorialvideo/contracts';

export function buildPresetOperations(preset: EnhancementPreset): EnhancementOperation[] {
  const base = {
    implementationMethod: 'deterministic' as const,
    maySynthesiseDetail: false,
    provider: ENHANCEMENT_LOCAL_ENGINE.name,
    version: ENHANCEMENT_LOCAL_ENGINE.version,
    reversibleViaVariantSelection: true as const,
  };
  switch (preset) {
    case 'gentle_correction':
      return [
        enhancementOperationSchema.parse({ ...base, kind: 'white_balance.correct', strength: 0.45 }),
        enhancementOperationSchema.parse({ ...base, kind: 'exposure.adjust', strength: 0.55 }),
        enhancementOperationSchema.parse({ ...base, kind: 'contrast.adjust', strength: 0.55 }),
      ];
    case 'restore_faded':
      return [
        enhancementOperationSchema.parse({
          ...base,
          kind: 'faded_photo.restore',
          strength: 0.65,
          warnings: ['technical_correction_not_ai_restoration'],
        }),
      ];
    case 'improve_low_light':
      return [
        enhancementOperationSchema.parse({ ...base, kind: 'exposure.adjust', strength: 0.72 }),
        enhancementOperationSchema.parse({ ...base, kind: 'shadows.adjust', strength: 0.7 }),
        enhancementOperationSchema.parse({ ...base, kind: 'noise.reduce', strength: 0.4 }),
      ];
    case 'reduce_noise':
      return [enhancementOperationSchema.parse({ ...base, kind: 'noise.reduce', strength: 0.55 })];
    case 'sharpen_careful':
      return [enhancementOperationSchema.parse({ ...base, kind: 'sharpen', strength: 0.35 })];
    case 'prepare_ceremony_screen':
      return [
        enhancementOperationSchema.parse({ ...base, kind: 'white_balance.correct', strength: 0.5 }),
        enhancementOperationSchema.parse({ ...base, kind: 'contrast.adjust', strength: 0.58 }),
        enhancementOperationSchema.parse({
          ...base,
          kind: 'resize',
          strength: 1,
          parameters: { maxWidth: 1920, maxHeight: 1080 },
          warnings: ['resampling_not_ai_super_resolution'],
        }),
        enhancementOperationSchema.parse({ ...base, kind: 'sharpen', strength: 0.3 }),
      ];
    default: {
      const _exhaustive: never = preset;
      return _exhaustive;
    }
  }
}

export const MAX_ENHANCEMENT_ATTEMPTS = 3;
export const MAX_ENHANCEMENT_VARIANTS_PER_ASSET = 12;

export type EnhancementJobRow = {
  id: string;
  projectId: string;
  assetId: string;
  requestId: string;
  status: EnhancementJobStatus;
  idempotencyKey: string;
  attemptCount: number;
  queuedAt: string;
};

/** Family-facing enhancement job status — never surface raw QUEUED/PREPARING jargon. */
export const ENHANCEMENT_UI_STATUSES = [
  'queued',
  'preparing',
  'ready',
  'failed',
  'cancelled',
] as const;
export type EnhancementUiStatus = (typeof ENHANCEMENT_UI_STATUSES)[number];

export function mapEnhancementJobStatusToUi(
  status: EnhancementJobStatus | string | null | undefined,
): EnhancementUiStatus {
  switch (status) {
    case 'QUEUED':
      return 'queued';
    case 'PREPARING':
      return 'preparing';
    case 'READY':
      return 'ready';
    case 'CANCELLED':
      return 'cancelled';
    case 'FAILED_RETRYABLE':
    case 'FAILED_FINAL':
      return 'failed';
    default:
      return 'failed';
  }
}

export function isEnhancementJobInProgress(
  status: EnhancementJobStatus | string | null | undefined,
): boolean {
  const ui = mapEnhancementJobStatusToUi(status);
  return ui === 'queued' || ui === 'preparing';
}

/** Variant is presentable as an enhancement only after processing succeeded. */
export function isEnhancementVariantReady(status: string | null | undefined): boolean {
  return status === 'ready';
}

export function enhancementProcessingAllowed(consent: EnhancementConsent | null | undefined): boolean {
  if (!consent) {
    return false;
  }
  if (consent.state === 'revoked' || consent.state === 'disabled' || consent.state === 'pending_deletion') {
    return false;
  }
  return consent.localApproved === true || consent.externalApproved === true;
}

export function externalEnhancementAllowed(consent: EnhancementConsent | null | undefined): boolean {
  if (!enhancementProcessingAllowed(consent)) {
    return false;
  }
  return consent?.externalApproved === true && Boolean(consent.externalProvider);
}

export function selectNextEnhancementJob(rows: readonly EnhancementJobRow[]): EnhancementJobRow | null {
  const eligible = rows
    .filter((row) => row.status === 'QUEUED' || row.status === 'FAILED_RETRYABLE')
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  return eligible[0] ?? null;
}

export function planEnhancementClaim(row: EnhancementJobRow):
  | { ok: true; nextStatus: 'PREPARING'; attemptCount: number }
  | { ok: false; reason: 'not_claimable' | 'retry_exhausted' } {
  if (row.status !== 'QUEUED' && row.status !== 'FAILED_RETRYABLE') {
    return { ok: false, reason: 'not_claimable' };
  }
  if (row.attemptCount >= MAX_ENHANCEMENT_ATTEMPTS) {
    return { ok: false, reason: 'retry_exhausted' };
  }
  return { ok: true, nextStatus: 'PREPARING', attemptCount: row.attemptCount + 1 };
}

export function enhancementIdempotencyKey(input: {
  assetId: string;
  checksum: string;
  operationsFingerprint: string;
  qualityMode: 'preview' | 'full';
}): string {
  return `enhancement:${input.assetId}:${input.checksum.slice(0, 16)}:${input.operationsFingerprint}:${input.qualityMode}:v1`;
}

export function fingerprintOperations(operations: readonly EnhancementOperation[]): string {
  return operations
    .map((op) => `${op.kind}:${op.strength.toFixed(2)}:${op.implementationMethod}`)
    .join('|')
    .slice(0, 120);
}

export function planEnhancementRequest(input: {
  tributePublicId: string;
  assetId: string;
  requestId: string;
  checksum: string;
  preset?: EnhancementPreset;
  operations?: EnhancementOperation[];
  qualityMode?: 'preview' | 'full';
  providerMode?: 'local' | 'external';
  consent: EnhancementConsent;
  existingVariantCount: number;
  requestedAt: string;
  requestedByUserId?: string;
}):
  | { ok: true; request: EnhancementRequest; idempotencyKey: string }
  | {
      ok: false;
      reason:
        | 'consent_required'
        | 'external_blocked'
        | 'variant_quota'
        | 'empty_operations'
        | 'model_ops_blocked';
    } {
  if (!enhancementProcessingAllowed(input.consent)) {
    return { ok: false, reason: 'consent_required' };
  }
  if (input.providerMode === 'external' && !externalEnhancementAllowed(input.consent)) {
    return { ok: false, reason: 'external_blocked' };
  }
  if (input.existingVariantCount >= MAX_ENHANCEMENT_VARIANTS_PER_ASSET) {
    return { ok: false, reason: 'variant_quota' };
  }
  const operations =
    input.operations && input.operations.length > 0
      ? input.operations
      : input.preset
        ? buildPresetOperations(input.preset)
        : [];
  if (operations.length === 0) {
    return { ok: false, reason: 'empty_operations' };
  }
  if (operations.some((op) => op.implementationMethod === 'model_based')) {
    return { ok: false, reason: 'model_ops_blocked' };
  }
  const qualityMode = input.qualityMode ?? 'preview';
  const fingerprint = fingerprintOperations(operations);
  const idempotencyKey = enhancementIdempotencyKey({
    assetId: input.assetId,
    checksum: input.checksum,
    operationsFingerprint: fingerprint,
    qualityMode,
  });
  const request = enhancementRequestSchema.parse({
    schemaVersion: 1,
    id: input.requestId,
    tributePublicId: input.tributePublicId,
    assetId: input.assetId,
    operations,
    preset: input.preset,
    providerMode: input.providerMode ?? 'local',
    consentPolicyVersion: input.consent.policyVersion,
    qualityMode,
    idempotencyKey,
    status: 'queued',
    requestedByUserId: input.requestedByUserId,
    requestedAt: input.requestedAt,
  });
  return { ok: true, request, idempotencyKey };
}

export function planEnhancementCompletion(input: {
  tributePublicId: string;
  assetId: string;
  requestId: string;
  variantId: string;
  applied: EnhancementOperation[];
  skipped: string[];
  storageBucket: string;
  storageKey: string;
  width: number;
  height: number;
  mime: string;
  sizeBytes: number;
  sourceChecksumRef?: string;
  technicalReport: EnhancementVariantV2['technicalReport'];
  createdAt: string;
}): { failAsset: false; variant: EnhancementVariantV2; status: 'READY' | 'PARTIAL' | 'FAILED_FINAL' } {
  const maySynthesise = input.applied.some((op) => op.maySynthesiseDetail);
  const decodeOk = input.technicalReport?.decodeOk === true;
  const blank = input.technicalReport?.blankOrBlack === true;
  let status: 'READY' | 'PARTIAL' | 'FAILED_FINAL' = 'READY';
  let variantStatus: EnhancementVariantV2['status'] = 'ready';
  if (!decodeOk || blank) {
    status = 'FAILED_FINAL';
    variantStatus = 'failed';
  } else if (input.skipped.length > 0 || (input.technicalReport?.warnings.length ?? 0) > 0) {
    status = 'PARTIAL';
    variantStatus = 'partial';
  }
  const variant = enhancementVariantSchemaV2.parse({
    schemaVersion: 1,
    id: input.variantId,
    tributePublicId: input.tributePublicId,
    assetId: input.assetId,
    requestId: input.requestId,
    sourceChecksumRef: input.sourceChecksumRef,
    status: variantStatus,
    storageBucket: input.storageBucket,
    storageKey: input.storageKey,
    width: input.width,
    height: input.height,
    mime: input.mime,
    sizeBytes: input.sizeBytes,
    appliedOperations: input.applied,
    provenance: {
      provider: ENHANCEMENT_LOCAL_ENGINE.name,
      model: 'pixel-ops',
      version: ENHANCEMENT_LOCAL_ENGINE.version,
    },
    technicalReport: input.technicalReport,
    generativeAlteration: maySynthesise,
    maySynthesiseDetail: maySynthesise,
    implementationLabel: 'deterministic_correction',
    familyReviewState: 'unreviewed',
    approvedForLibrary: false,
    approvedForFilm: false,
    originalImmutable: true,
    reversible: true,
    visibleAlteration: true,
    createdAt: input.createdAt,
  });
  return { failAsset: false, variant, status };
}

export function planEnhancementReview(input: {
  variant: EnhancementVariantV2;
  decision: EnhancementReviewDecision;
  expectedVersion: number;
  currentVersion: number;
  familyNote?: string;
  now: string;
}):
  | {
      ok: true;
      next: Pick<
        EnhancementVariantV2,
        'familyReviewState' | 'approvedForLibrary' | 'approvedForFilm' | 'reviewedAt' | 'status'
      >;
    }
  | { ok: false; reason: 'conflict' | 'not_ready' | 'deleted' } {
  if (input.expectedVersion !== input.currentVersion) {
    return { ok: false, reason: 'conflict' };
  }
  if (input.variant.status === 'deleted') {
    return { ok: false, reason: 'deleted' };
  }
  if (input.variant.status !== 'ready' && input.variant.status !== 'partial') {
    return { ok: false, reason: 'not_ready' };
  }
  switch (input.decision) {
    case 'approve':
      return {
        ok: true,
        next: {
          familyReviewState: 'approved',
          approvedForLibrary: true,
          approvedForFilm: input.variant.approvedForFilm,
          reviewedAt: input.now,
          status: input.variant.status,
        },
      };
    case 'reject':
      return {
        ok: true,
        next: {
          familyReviewState: 'rejected',
          approvedForLibrary: false,
          approvedForFilm: false,
          reviewedAt: input.now,
          status: 'rejected',
        },
      };
    case 'keep_for_comparison':
      return {
        ok: true,
        next: {
          familyReviewState: 'keep_for_comparison',
          approvedForLibrary: false,
          approvedForFilm: false,
          reviewedAt: input.now,
          status: input.variant.status,
        },
      };
    case 'approve_for_film':
      return {
        ok: true,
        next: {
          familyReviewState: 'approved',
          approvedForLibrary: true,
          approvedForFilm: true,
          reviewedAt: input.now,
          status: input.variant.status,
        },
      };
    case 'revoke_film_approval':
      return {
        ok: true,
        next: {
          familyReviewState: input.variant.familyReviewState === 'unreviewed' ? 'unreviewed' : 'approved',
          approvedForLibrary: input.variant.approvedForLibrary,
          approvedForFilm: false,
          reviewedAt: input.now,
          status: input.variant.status,
        },
      };
    default: {
      const _exhaustive: never = input.decision;
      return _exhaustive;
    }
  }
}

export function canUseVariantInFilm(variant: EnhancementVariantV2): boolean {
  return (
    (variant.status === 'ready' || variant.status === 'partial') &&
    variant.approvedForFilm === true &&
    Boolean(variant.storageBucket && variant.storageKey)
  );
}

export function detectCyclicLineage(
  variantId: string,
  parentVariantId: string | undefined,
  lineage: ReadonlyMap<string, string | undefined>,
): boolean {
  if (!parentVariantId) {
    return false;
  }
  if (parentVariantId === variantId) {
    return true;
  }
  const seen = new Set<string>([variantId]);
  let current: string | undefined = parentVariantId;
  while (current) {
    if (seen.has(current)) {
      return true;
    }
    seen.add(current);
    current = lineage.get(current);
  }
  return false;
}

export function defaultEnhancementConsent(tributePublicId: string): EnhancementConsent {
  return enhancementConsentSchema.parse({
    schemaVersion: 1,
    tributePublicId,
    state: 'disabled',
    localApproved: false,
    externalApproved: false,
    policyVersion: 'media-enhancement-v1',
    version: 0,
  });
}
