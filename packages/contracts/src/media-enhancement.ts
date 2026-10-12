import { z } from 'zod';

import { aiProvenanceSchema, confidenceSchema, INTELLIGENCE_CONTRACT_VERSION } from './intelligence';

export const MEDIA_ENHANCEMENT_CONTRACT_VERSION = INTELLIGENCE_CONTRACT_VERSION;

export const ENHANCEMENT_CONSENT_STATES = [
  'disabled',
  'local_approved',
  'external_approved',
  'revoked',
  'pending_deletion',
] as const;
export type EnhancementConsentState = (typeof ENHANCEMENT_CONSENT_STATES)[number];

export const ENHANCEMENT_JOB_STATUSES = [
  'QUEUED',
  'PREPARING',
  'READY',
  'FAILED_RETRYABLE',
  'FAILED_FINAL',
  'CANCELLED',
] as const;
export type EnhancementJobStatus = (typeof ENHANCEMENT_JOB_STATUSES)[number];

export const ENHANCEMENT_VARIANT_STATUSES = [
  'queued',
  'processing',
  'ready',
  'partial',
  'failed',
  'rejected',
  'deleted',
] as const;
export type EnhancementVariantStatus = (typeof ENHANCEMENT_VARIANT_STATUSES)[number];

export const ENHANCEMENT_REVIEW_DECISIONS = [
  'approve',
  'reject',
  'keep_for_comparison',
  'approve_for_film',
  'revoke_film_approval',
] as const;
export type EnhancementReviewDecision = (typeof ENHANCEMENT_REVIEW_DECISIONS)[number];

export const ENHANCEMENT_OPERATION_KINDS = [
  'orientation.correct',
  'exposure.adjust',
  'white_balance.correct',
  'contrast.adjust',
  'highlights.adjust',
  'shadows.adjust',
  'saturation.adjust',
  'noise.reduce',
  'sharpen',
  'resize',
  'upscale',
  'border.remove',
  'crop',
  'pad',
  'scratch.restore',
  'faded_photo.restore',
  'face_detail.enhance',
] as const;
export type EnhancementOperationKind = (typeof ENHANCEMENT_OPERATION_KINDS)[number];

export const ENHANCEMENT_PRESETS = [
  'gentle_correction',
  'restore_faded',
  'improve_low_light',
  'reduce_noise',
  'sharpen_careful',
  'prepare_ceremony_screen',
] as const;
export type EnhancementPreset = (typeof ENHANCEMENT_PRESETS)[number];

/** Local deterministic engine — not AI. Do not mislabel as model-based. */
export const ENHANCEMENT_LOCAL_ENGINE = {
  name: 'memorialvideo-pixel-ops',
  version: 'v1-local',
  kind: 'deterministic' as const,
  processing: 'local' as const,
};

/** Model-based path stays blocked until a safe licensed engine is wired. */
export const ENHANCEMENT_MODEL_PROVIDER = {
  name: 'none',
  version: 'blocked',
  kind: 'generative' as const,
  processing: 'local' as const,
  available: false as const,
  reason: 'no_safe_model_configured',
};

export const enhancementConsentSchema = z.object({
  schemaVersion: z.literal(MEDIA_ENHANCEMENT_CONTRACT_VERSION),
  tributePublicId: z.string().min(1).max(80),
  state: z.enum(ENHANCEMENT_CONSENT_STATES),
  localApproved: z.boolean().default(false),
  externalApproved: z.boolean().default(false),
  externalProvider: z.string().max(80).optional(),
  policyVersion: z.string().max(40).default('media-enhancement-v1'),
  approvedByUserId: z.string().max(80).optional(),
  approvedAt: z.string().datetime().optional(),
  revokedAt: z.string().datetime().optional(),
  version: z.number().int().nonnegative().default(0),
});
export type EnhancementConsent = z.infer<typeof enhancementConsentSchema>;

export const enhancementOperationSchema = z.object({
  kind: z.enum(ENHANCEMENT_OPERATION_KINDS),
  strength: z.number().min(0).max(1).default(0.5),
  parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  implementationMethod: z.enum(['deterministic', 'model_based']),
  maySynthesiseDetail: z.boolean().default(false),
  provider: z.string().min(1).max(80),
  model: z.string().min(1).max(80).optional(),
  version: z.string().min(1).max(40),
  reversibleViaVariantSelection: z.literal(true).default(true),
  warnings: z.array(z.string().min(1).max(120)).max(8).default([]),
});
export type EnhancementOperation = z.infer<typeof enhancementOperationSchema>;

export const enhancementRequestSchema = z.object({
  schemaVersion: z.literal(MEDIA_ENHANCEMENT_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  tributePublicId: z.string().min(1).max(80),
  assetId: z.string().min(1).max(80),
  sourceVariantId: z.string().min(1).max(80).optional(),
  operations: z.array(enhancementOperationSchema).min(1).max(24),
  preset: z.enum(ENHANCEMENT_PRESETS).optional(),
  targetWidth: z.number().int().positive().max(4096).optional(),
  targetHeight: z.number().int().positive().max(4096).optional(),
  targetAspectRatio: z.string().max(20).optional(),
  providerMode: z.enum(['local', 'external']).default('local'),
  consentPolicyVersion: z.string().max(40).default('media-enhancement-v1'),
  qualityMode: z.enum(['preview', 'full']).default('preview'),
  idempotencyKey: z.string().min(8).max(200),
  status: z.enum(['queued', 'processing', 'ready', 'partial', 'failed', 'cancelled']),
  requestedByUserId: z.string().max(80).optional(),
  requestedAt: z.string().datetime(),
});
export type EnhancementRequest = z.infer<typeof enhancementRequestSchema>;

export const enhancementTechnicalReportSchema = z.object({
  decodeOk: z.boolean(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  mime: z.string().max(80).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  blankOrBlack: z.boolean().default(false),
  extremeClipping: z.boolean().default(false),
  invalidCrop: z.boolean().default(false),
  renderCompatible: z.boolean().default(true),
  warnings: z.array(z.string().min(1).max(80)).max(16).default([]),
});
export type EnhancementTechnicalReport = z.infer<typeof enhancementTechnicalReportSchema>;

export const enhancementVariantSchemaV2 = z.object({
  schemaVersion: z.literal(MEDIA_ENHANCEMENT_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  tributePublicId: z.string().min(1).max(80),
  assetId: z.string().min(1).max(80),
  parentVariantId: z.string().min(1).max(80).optional(),
  requestId: z.string().min(1).max(80),
  sourceChecksumRef: z.string().min(8).max(128).optional(),
  status: z.enum(ENHANCEMENT_VARIANT_STATUSES),
  storageBucket: z.string().min(1).max(80).optional(),
  storageKey: z.string().min(1).max(400).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  mime: z.string().max(80).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  colourProfile: z.string().max(80).optional(),
  appliedOperations: z.array(enhancementOperationSchema).default([]),
  provenance: aiProvenanceSchema,
  technicalReport: enhancementTechnicalReportSchema.optional(),
  generativeAlteration: z.boolean().default(false),
  maySynthesiseDetail: z.boolean().default(false),
  implementationLabel: z.enum(['deterministic_correction', 'model_based_enhancement']),
  familyReviewState: z
    .enum(['unreviewed', 'approved', 'rejected', 'keep_for_comparison'])
    .default('unreviewed'),
  approvedForLibrary: z.boolean().default(false),
  approvedForFilm: z.boolean().default(false),
  originalImmutable: z.literal(true).default(true),
  reversible: z.literal(true).default(true),
  visibleAlteration: z.boolean().default(true),
  confidence: confidenceSchema.optional(),
  createdAt: z.string().datetime(),
  reviewedAt: z.string().datetime().optional(),
  supersededVariantId: z.string().max(80).optional(),
});
export type EnhancementVariantV2 = z.infer<typeof enhancementVariantSchemaV2>;

export const enhancementReviewSchema = z.object({
  schemaVersion: z.literal(MEDIA_ENHANCEMENT_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  variantId: z.string().min(1).max(80),
  decision: z.enum(ENHANCEMENT_REVIEW_DECISIONS),
  familyNote: z.string().max(400).optional(),
  version: z.number().int().nonnegative().default(0),
  attributionUserId: z.string().max(80).optional(),
  timestamp: z.string().datetime(),
});
export type EnhancementReview = z.infer<typeof enhancementReviewSchema>;
