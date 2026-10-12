import { z } from 'zod';

import { INTELLIGENCE_CONTRACT_VERSION, correctionStateSchema } from './intelligence';

export const DATE_PRECISIONS = [
  'exact',
  'month',
  'year',
  'approximate_year',
  'decade',
  'unknown',
] as const;
export type DatePrecision = (typeof DATE_PRECISIONS)[number];

export const MEMORY_IMPORTANCE = ['unset', 'supporting', 'meaningful', 'essential'] as const;
export type MemoryImportance = (typeof MEMORY_IMPORTANCE)[number];

export const CONTEXT_PROVENANCE = ['unset', 'family_supplied', 'family_confirmed'] as const;
export type ContextProvenance = (typeof CONTEXT_PROVENANCE)[number];

export const QUALITY_REVIEW_STATES = ['unreviewed', 'reviewed', 'kept'] as const;
export type QualityReviewState = (typeof QUALITY_REVIEW_STATES)[number];

export const DUPLICATE_DECISIONS = ['same', 'different', 'unsure', 'dismissed'] as const;
export type DuplicateDecisionKind = (typeof DUPLICATE_DECISIONS)[number];

export const LIBRARY_FILTERS = [
  'all',
  'needs_review',
  'photos',
  'videos',
  'audio',
  'analysing',
  'processing',
  'quality',
  'exact',
  'possible',
  'used',
  'unused',
] as const;
export type LibraryFilter = (typeof LIBRARY_FILTERS)[number];

export const LIBRARY_SORTS = ['recent', 'date', 'type', 'review'] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];

export const memoryContextSchema = z.object({
  schemaVersion: z.literal(INTELLIGENCE_CONTRACT_VERSION),
  assetId: z.string().min(1).max(80),
  familyTitle: z.string().max(120).optional().default(''),
  caption: z.string().max(400).optional().default(''),
  dateValue: z.string().max(40).optional().default(''),
  dateEnd: z.string().max(40).optional().default(''),
  datePrecision: z.enum(DATE_PRECISIONS).default('unknown'),
  dateProvenance: z.enum(CONTEXT_PROVENANCE).default('unset'),
  locationLabel: z.string().max(120).optional().default(''),
  occasionLabel: z.string().max(80).optional().default(''),
  privateNote: z.string().max(500).optional().default(''),
  importance: z.enum(MEMORY_IMPORTANCE).default('unset'),
  qualityReview: z.enum(QUALITY_REVIEW_STATES).default('unreviewed'),
  reviewState: correctionStateSchema.default('unreviewed'),
  version: z.number().int().nonnegative().default(0),
});
export type MemoryContext = z.infer<typeof memoryContextSchema>;

export const memoryContextPatchSchema = memoryContextSchema
  .omit({ schemaVersion: true, assetId: true })
  .partial()
  .extend({
    assetId: z.string().min(1).max(80),
    expectedVersion: z.number().int().nonnegative(),
  });
export type MemoryContextPatch = z.infer<typeof memoryContextPatchSchema>;

export const ownerSafeMemoryContextSchema = memoryContextSchema;
export type OwnerSafeMemoryContext = MemoryContext;

export const duplicateDecisionSchema = z.object({
  schemaVersion: z.literal(INTELLIGENCE_CONTRACT_VERSION),
  assetIdLow: z.string().min(1).max(80),
  assetIdHigh: z.string().min(1).max(80),
  kind: z.enum(['exact', 'likely']),
  decision: z.enum(DUPLICATE_DECISIONS),
  preferredAssetId: z.string().max(80).optional(),
  version: z.number().int().nonnegative().default(0),
});
export type DuplicateDecision = z.infer<typeof duplicateDecisionSchema>;

export const duplicateDecisionPatchSchema = z.object({
  otherAssetId: z.string().min(1).max(80),
  kind: z.enum(['exact', 'likely']),
  decision: z.enum(DUPLICATE_DECISIONS),
  preferredAssetId: z.string().max(80).optional(),
  expectedVersion: z.number().int().nonnegative(),
});
export type DuplicateDecisionPatch = z.infer<typeof duplicateDecisionPatchSchema>;

export const ownerSafeDuplicateDecisionSchema = z.object({
  otherAssetId: z.string().min(1).max(80),
  kind: z.enum(['exact', 'likely']),
  decision: z.enum(DUPLICATE_DECISIONS),
  version: z.number().int().nonnegative(),
});
export type OwnerSafeDuplicateDecision = z.infer<typeof ownerSafeDuplicateDecisionSchema>;
