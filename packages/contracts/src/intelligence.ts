import { z } from 'zod';

/**
 * Durable AI and story contracts. A passing parse is not product completion.
 * Every inference carries provenance. Uncertain results must stay labelled.
 */

export const INTELLIGENCE_CONTRACT_VERSION = 1 as const;

export const inferenceStatusSchema = z.enum(['inferred', 'uncertain', 'confirmed']);
export type InferenceStatus = z.infer<typeof inferenceStatusSchema>;

export const correctionStateSchema = z.enum(['unreviewed', 'confirmed', 'corrected', 'rejected']);
export type CorrectionState = z.infer<typeof correctionStateSchema>;

export const aiProvenanceSchema = z.object({
  provider: z.string().min(1).max(80),
  model: z.string().min(1).max(120),
  version: z.string().min(1).max(80),
});
export type AiProvenance = z.infer<typeof aiProvenanceSchema>;

export const confidenceSchema = z.number().min(0).max(1);

export function isConfirmedInference(status: InferenceStatus): boolean {
  return status === 'confirmed';
}

export const ANALYSIS_PIPELINE_STATUSES = [
  'queued',
  'processing',
  'ready',
  'partial',
  'failed',
] as const;
export type AnalysisPipelineStatus = (typeof ANALYSIS_PIPELINE_STATUSES)[number];
export const analysisPipelineStatusSchema = z.enum(ANALYSIS_PIPELINE_STATUSES);

export const ANALYSIS_JOB_STATUSES = [
  'QUEUED',
  'PREPARING',
  'READY',
  'FAILED_RETRYABLE',
  'FAILED_FINAL',
] as const;
export type AnalysisJobStatus = (typeof ANALYSIS_JOB_STATUSES)[number];

export const QUALITY_SEVERITIES = [
  'information',
  'suggestion',
  'warning',
  'blocking_technical_error',
] as const;
export type QualitySeverity = (typeof QUALITY_SEVERITIES)[number];

export const ANALYSER_NAME = 'local-media-inspect' as const;
export const ANALYSER_VERSION = 'v1' as const;

export const qualityObservationSchema = z.object({
  code: z.string().min(1).max(80),
  severity: z.enum(QUALITY_SEVERITIES),
  method: z.string().min(1).max(80),
  confidence: confidenceSchema,
  reviewState: correctionStateSchema.default('unreviewed'),
});
export type QualityObservation = z.infer<typeof qualityObservationSchema>;

export const metadataCandidateSchema = z.object({
  kind: z.enum(['captured_at', 'timezone', 'location']),
  value: z.string().max(120).optional(),
  present: z.boolean().default(true),
  source: z.enum(['exif', 'container', 'unknown']),
  status: inferenceStatusSchema.default('uncertain'),
  method: z.string().min(1).max(80),
  confidence: confidenceSchema,
  reviewState: correctionStateSchema.default('unreviewed'),
});
export type MetadataCandidate = z.infer<typeof metadataCandidateSchema>;

export const duplicateRefSchema = z.object({
  otherAssetId: z.string().min(1).max(80),
  kind: z.enum(['exact', 'likely']),
  method: z.string().min(1).max(80),
  score: z.number().min(0).max(1).optional(),
  threshold: z.number().min(0).max(1).optional(),
  reviewState: correctionStateSchema.default('unreviewed'),
});
export type DuplicateRef = z.infer<typeof duplicateRefSchema>;

export const photoMediaSchema = z.object({
  mediaKind: z.literal('photo'),
  mime: z.string().max(80).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  orientation: z.number().int().min(1).max(8).optional(),
  colorSpace: z.string().max(40).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});

export const videoMediaSchema = z.object({
  mediaKind: z.literal('video'),
  mime: z.string().max(80).optional(),
  container: z.string().max(40).optional(),
  codec: z.string().max(40).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  orientation: z.number().int().min(0).max(360).optional(),
  durationMs: z.number().int().nonnegative().optional(),
  frameRate: z.number().positive().optional(),
  hasAudio: z.boolean().optional(),
  audioChannels: z.number().int().positive().optional(),
  audioSampleRate: z.number().int().positive().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});

export const audioMediaSchema = z.object({
  mediaKind: z.literal('audio'),
  mime: z.string().max(80).optional(),
  codec: z.string().max(40).optional(),
  durationMs: z.number().int().nonnegative().optional(),
  channels: z.number().int().positive().optional(),
  sampleRate: z.number().int().positive().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});

export const unsupportedMediaSchema = z.object({
  mediaKind: z.literal('unsupported'),
  mime: z.string().max(80).optional(),
  reason: z.string().max(80),
  sizeBytes: z.number().int().nonnegative().optional(),
});

export const analysisMediaSchema = z.discriminatedUnion('mediaKind', [
  photoMediaSchema,
  videoMediaSchema,
  audioMediaSchema,
  unsupportedMediaSchema,
]);
export type AnalysisMedia = z.infer<typeof analysisMediaSchema>;

export const assetAnalysisSchema = z.object({
  schemaVersion: z.literal(INTELLIGENCE_CONTRACT_VERSION),
  analysisId: z.string().min(1).max(80),
  assetId: z.string().min(1).max(80),
  pipelineStatus: analysisPipelineStatusSchema,
  analysedAt: z.string().datetime().optional(),
  sourceChecksum: z.string().min(8).max(128),
  media: analysisMediaSchema,
  candidates: z.array(metadataCandidateSchema).default([]),
  quality: z.array(qualityObservationSchema).default([]),
  duplicates: z.array(duplicateRefSchema).default([]),
  warnings: z.array(z.string().max(80)).default([]),
  errorCode: z.string().max(80).optional(),
  confidence: confidenceSchema,
  correctionState: correctionStateSchema.default('unreviewed'),
  supersededAnalysisId: z.string().max(80).optional(),
  provenance: aiProvenanceSchema,
});
export type AssetAnalysis = z.infer<typeof assetAnalysisSchema>;

export const ownerSafeAnalysisSchema = z.object({
  analysisId: z.string().min(1).max(80),
  assetId: z.string().min(1).max(80),
  pipelineStatus: analysisPipelineStatusSchema,
  mediaKind: z.enum(['photo', 'video', 'audio', 'unsupported']),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  hasAudio: z.boolean().optional(),
  qualityCodes: z.array(z.string().min(1).max(80)).default([]),
  exactDuplicate: z.boolean(),
  likelyDuplicate: z.boolean(),
  capturedAtUnconfirmed: z.boolean(),
  capturedAtCandidate: z.string().max(40).optional(),
  locationUnconfirmed: z.boolean(),
  correctionState: correctionStateSchema,
});
export type OwnerSafeAnalysis = z.infer<typeof ownerSafeAnalysisSchema>;

export const memoryEntitySchema = z.object({
  schemaVersion: z.literal(INTELLIGENCE_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  assetId: z.string().min(1).max(80),
  kind: z.enum(['person', 'place', 'event', 'object', 'life_stage']),
  label: z.string().min(1).max(200),
  status: inferenceStatusSchema,
  confidence: confidenceSchema,
  correctionState: correctionStateSchema.default('unreviewed'),
  provenance: aiProvenanceSchema,
});
export type MemoryEntity = z.infer<typeof memoryEntitySchema>;

export const personClusterSchema = z.object({
  schemaVersion: z.literal(INTELLIGENCE_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  displayName: z.string().max(200).optional(),
  assetIds: z.array(z.string().min(1).max(80)).min(1),
  consentGranted: z.boolean(),
  status: inferenceStatusSchema,
  confidence: confidenceSchema,
  correctionState: correctionStateSchema.default('unreviewed'),
  provenance: aiProvenanceSchema,
});
export type PersonCluster = z.infer<typeof personClusterSchema>;

export const storyFactSchema = z.object({
  schemaVersion: z.literal(INTELLIGENCE_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  claim: z.string().min(1).max(500),
  kind: z.enum(['name', 'date', 'relationship', 'quotation', 'biography', 'other']),
  sources: z.array(z.string().min(1).max(80)).default([]),
  status: inferenceStatusSchema,
  confidence: confidenceSchema,
  familyConfirmed: z.boolean().default(false),
  correctionState: correctionStateSchema.default('unreviewed'),
  provenance: aiProvenanceSchema,
});
export type StoryFact = z.infer<typeof storyFactSchema>;

export const storyConflictSchema = z.object({
  schemaVersion: z.literal(INTELLIGENCE_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  factIds: z.array(z.string().min(1).max(80)).min(2),
  summary: z.string().min(1).max(400),
  decidedByFamily: z.boolean().default(false),
  provenance: aiProvenanceSchema,
});
export type StoryConflict = z.infer<typeof storyConflictSchema>;

export const storyChapterSchema = z.object({
  schemaVersion: z.literal(INTELLIGENCE_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(200),
  kind: z.enum([
    'childhood',
    'family',
    'friendships',
    'work',
    'passions',
    'milestones',
    'legacy',
    'custom',
  ]),
  memoryAssetIds: z.array(z.string().min(1).max(80)).default([]),
  suggested: z.boolean().default(true),
  status: inferenceStatusSchema,
  confidence: confidenceSchema,
  correctionState: correctionStateSchema.default('unreviewed'),
  provenance: aiProvenanceSchema,
});
export type StoryChapter = z.infer<typeof storyChapterSchema>;

export const directorBriefSchema = z.object({
  schemaVersion: z.literal(INTELLIGENCE_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  naturalLanguage: z.string().min(1).max(2000),
  targetDurationSeconds: z.number().int().positive().max(30 * 60).optional(),
  toneKeys: z.array(z.string().min(1).max(40)).default([]),
  focusKeys: z.array(z.string().min(1).max(40)).default([]),
  replaceManualEdits: z.boolean().default(false),
  provenance: aiProvenanceSchema.optional(),
});
export type DirectorBrief = z.infer<typeof directorBriefSchema>;

export const directorPlanSchema = z.object({
  schemaVersion: z.literal(INTELLIGENCE_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  briefId: z.string().min(1).max(80),
  chapterIds: z.array(z.string().min(1).max(80)).default([]),
  selectedAssetIds: z.array(z.string().min(1).max(80)).default([]),
  targetDurationFrames: z.number().int().positive(),
  rationale: z.array(z.string().min(1).max(400)).default([]),
  confidence: confidenceSchema,
  status: inferenceStatusSchema,
  provenance: aiProvenanceSchema,
});
export type DirectorPlan = z.infer<typeof directorPlanSchema>;

export const timelinePatchSchema = z.object({
  schemaVersion: z.literal(INTELLIGENCE_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  planId: z.string().min(1).max(80).optional(),
  reversible: z.literal(true),
  previewable: z.literal(true),
  replacesManualEdits: z.boolean().default(false),
  requiresConfirmation: z.boolean().default(false),
  operations: z.array(z.record(z.string(), z.unknown())).min(1),
  provenance: aiProvenanceSchema,
});
export type TimelinePatch = z.infer<typeof timelinePatchSchema>;

export const enhancementVariantSchema = z.object({
  schemaVersion: z.literal(INTELLIGENCE_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  sourceAssetId: z.string().min(1).max(80),
  kind: z.enum([
    'poster_still',
    'upscale',
    'denoise',
    'stabilize',
    'color',
    'restore',
    'reframe',
    'speech_cleanup',
  ]),
  reversible: z.literal(true),
  originalImmutable: z.literal(true),
  visibleAlteration: z.boolean(),
  sourceMethod: z.string().min(1).max(80),
  confidence: confidenceSchema.optional(),
  provenance: aiProvenanceSchema,
});
export type EnhancementVariant = z.infer<typeof enhancementVariantSchema>;

export const audioTrackSchema = z.object({
  schemaVersion: z.literal(INTELLIGENCE_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  kind: z.enum(['music', 'narration', 'speech', 'ambient']),
  licensed: z.boolean(),
  duckingSuggested: z.boolean().default(false),
  provenance: aiProvenanceSchema.optional(),
});
export type AudioTrack = z.infer<typeof audioTrackSchema>;

export const POSTER_SOURCES = ['embedded_jpeg', 'mjpeg_sample', 'h264_extract', 'unavailable'] as const;
export type PosterSource = (typeof POSTER_SOURCES)[number];
export const posterSourceSchema = z.enum(POSTER_SOURCES);

export const DERIVED_JOB_KINDS = ['poster_still'] as const;
export type DerivedJobKind = (typeof DERIVED_JOB_KINDS)[number];

export const DERIVED_JOB_STATUSES = [
  'QUEUED',
  'PREPARING',
  'READY',
  'FAILED_RETRYABLE',
  'FAILED_FINAL',
] as const;
export type DerivedJobStatus = (typeof DERIVED_JOB_STATUSES)[number];

export const derivedAssetJobSchema = z.object({
  schemaVersion: z.literal(INTELLIGENCE_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  projectId: z.string().min(1).max(80),
  assetId: z.string().min(1).max(80),
  kind: z.enum(DERIVED_JOB_KINDS),
  status: z.enum(DERIVED_JOB_STATUSES),
  sourceMethod: posterSourceSchema,
  idempotencyKey: z.string().min(1).max(160),
  provenance: aiProvenanceSchema,
});
export type DerivedAssetJob = z.infer<typeof derivedAssetJobSchema>;
