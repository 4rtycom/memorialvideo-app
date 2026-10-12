import { z } from 'zod';

import { aiProvenanceSchema, confidenceSchema, INTELLIGENCE_CONTRACT_VERSION } from './intelligence';
import { launchLanguageSchema } from './locale';
import { STORY_FACT_CATEGORIES } from './story';

export const CONTENT_EXTRACTION_CONTRACT_VERSION = INTELLIGENCE_CONTRACT_VERSION;

export const EXTRACTION_TYPES = ['ocr', 'transcription'] as const;
export type ExtractionType = (typeof EXTRACTION_TYPES)[number];

export const EXTRACTION_PIPELINE_STATUSES = [
  'queued',
  'processing',
  'ready',
  'partial',
  'failed',
  'cancelled',
] as const;
export type ExtractionPipelineStatus = (typeof EXTRACTION_PIPELINE_STATUSES)[number];

export const EXTRACTION_MEDIA_KINDS = ['image', 'document', 'audio', 'video', 'unsupported'] as const;
export type ExtractionMediaKind = (typeof EXTRACTION_MEDIA_KINDS)[number];

export const EXTRACTION_JOB_STATUSES = [
  'QUEUED',
  'PREPARING',
  'READY',
  'FAILED_RETRYABLE',
  'FAILED_FINAL',
  'CANCELLED',
] as const;
export type ExtractionJobStatus = (typeof EXTRACTION_JOB_STATUSES)[number];

export const EVIDENCE_REVIEW_STATES = [
  'unreviewed',
  'confirmed',
  'corrected',
  'rejected',
  'keep_private',
  'not_applicable',
] as const;
export type EvidenceReviewState = (typeof EVIDENCE_REVIEW_STATES)[number];

export const EVIDENCE_SUGGESTION_TYPES = [
  'date',
  'place',
  'occasion',
  'quote',
  'chapter',
  'story_fact',
  'spoken_excerpt',
  'missing_context',
] as const;
export type EvidenceSuggestionType = (typeof EVIDENCE_SUGGESTION_TYPES)[number];

export const TEXT_SCRIPT_KINDS = ['printed', 'handwritten', 'unknown'] as const;

export const languageProvenanceSchema = z.object({
  supplied: launchLanguageSchema.optional(),
  detected: z.string().max(16).optional(),
  status: z.enum(['supplied', 'detected_candidate', 'unknown']).default('unknown'),
});
export type LanguageProvenance = z.infer<typeof languageProvenanceSchema>;

export const contentExtractionSchema = z.object({
  schemaVersion: z.literal(CONTENT_EXTRACTION_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  tributePublicId: z.string().min(1).max(80),
  assetId: z.string().min(1).max(80),
  extractionType: z.enum(EXTRACTION_TYPES),
  pipelineStatus: z.enum(EXTRACTION_PIPELINE_STATUSES),
  sourceChecksum: z.string().min(8).max(128),
  sourceMediaKind: z.enum(EXTRACTION_MEDIA_KINDS),
  language: languageProvenanceSchema.default({ status: 'unknown' }),
  engineName: z.string().min(1).max(80),
  engineVersion: z.string().min(1).max(40),
  provenance: aiProvenanceSchema,
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  warnings: z.array(z.string().min(1).max(80)).max(24).default([]),
  errorCode: z.string().max(80).optional(),
  attemptCount: z.number().int().nonnegative().default(0),
  supersededExtractionId: z.string().max(80).optional(),
  consentPolicyVersion: z.string().max(40).optional(),
  externalProcessing: z.boolean().default(false),
});
export type ContentExtraction = z.infer<typeof contentExtractionSchema>;

export const ocrBlockSchema = z.object({
  id: z.string().min(1).max(80),
  pageNumber: z.number().int().positive().max(40).default(1),
  readingOrder: z.number().int().nonnegative().max(2000),
  engineText: z.string().max(8000),
  familyText: z.string().max(8000).optional(),
  confidence: confidenceSchema.optional(),
  bbox: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().min(0).max(1),
      height: z.number().min(0).max(1),
    })
    .optional(),
  scriptKind: z.enum(TEXT_SCRIPT_KINDS).default('unknown'),
  reviewState: z.enum(EVIDENCE_REVIEW_STATES).default('unreviewed'),
  language: z.string().max(16).optional(),
});
export type OcrBlock = z.infer<typeof ocrBlockSchema>;

export const extractedTextDocumentSchema = z.object({
  schemaVersion: z.literal(CONTENT_EXTRACTION_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  extractionId: z.string().min(1).max(80),
  assetId: z.string().min(1).max(80),
  pageCount: z.number().int().positive().max(40),
  blocks: z.array(ocrBlockSchema).max(500),
  engineText: z.string().max(50_000),
  familyText: z.string().max(50_000).optional(),
  reviewState: z.enum(EVIDENCE_REVIEW_STATES).default('unreviewed'),
  language: languageProvenanceSchema.default({ status: 'unknown' }),
  handwritingClaimed: z.boolean().default(false),
  provenance: aiProvenanceSchema,
});
export type ExtractedTextDocument = z.infer<typeof extractedTextDocumentSchema>;

export const transcriptSegmentSchema = z.object({
  id: z.string().min(1).max(80),
  startMs: z.number().int().nonnegative().max(3_600_000),
  endMs: z.number().int().nonnegative().max(3_600_000),
  engineText: z.string().max(4000),
  familyText: z.string().max(4000).optional(),
  confidence: confidenceSchema.optional(),
  silence: z.boolean().default(false),
  unintelligible: z.boolean().default(false),
  speakerLabel: z.string().max(40).optional(),
  reviewState: z.enum(EVIDENCE_REVIEW_STATES).default('unreviewed'),
});
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;

export const transcriptSchema = z.object({
  schemaVersion: z.literal(CONTENT_EXTRACTION_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  extractionId: z.string().min(1).max(80),
  assetId: z.string().min(1).max(80),
  language: languageProvenanceSchema.default({ status: 'unknown' }),
  durationMs: z.number().int().nonnegative().max(3_600_000),
  segments: z.array(transcriptSegmentSchema).max(2000),
  engineText: z.string().max(100_000),
  familyText: z.string().max(100_000).optional(),
  reviewState: z.enum(EVIDENCE_REVIEW_STATES).default('unreviewed'),
  provenance: aiProvenanceSchema,
});
export type Transcript = z.infer<typeof transcriptSchema>;

export const evidenceSuggestionSchema = z.object({
  schemaVersion: z.literal(CONTENT_EXTRACTION_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  extractionId: z.string().min(1).max(80),
  sourceBlockId: z.string().max(80).optional(),
  sourceSegmentId: z.string().max(80).optional(),
  sourcePage: z.number().int().positive().max(40).optional(),
  sourceStartMs: z.number().int().nonnegative().optional(),
  sourceEndMs: z.number().int().nonnegative().optional(),
  suggestionType: z.enum(EVIDENCE_SUGGESTION_TYPES),
  proposedValue: z.string().min(1).max(500),
  proposedFactCategory: z.enum(STORY_FACT_CATEGORIES).optional(),
  confidence: confidenceSchema.optional(),
  method: z.enum(['deterministic_pattern', 'engine_native', 'family']).default('deterministic_pattern'),
  reviewState: z.enum(EVIDENCE_REVIEW_STATES).default('unreviewed'),
  familyCorrection: z.string().max(500).optional(),
  createdFactId: z.string().max(80).optional(),
  createdExcerptId: z.string().max(80).optional(),
  provenance: aiProvenanceSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
  version: z.number().int().nonnegative().default(0),
});
export type EvidenceSuggestion = z.infer<typeof evidenceSuggestionSchema>;

export const storyExcerptSchema = z.object({
  schemaVersion: z.literal(CONTENT_EXTRACTION_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  tributePublicId: z.string().min(1).max(80),
  assetId: z.string().min(1).max(80),
  extractionId: z.string().min(1).max(80),
  blockIds: z.array(z.string().min(1).max(80)).max(24).default([]),
  segmentIds: z.array(z.string().min(1).max(80)).max(24).default([]),
  approvedText: z.string().min(1).max(2000),
  startMs: z.number().int().nonnegative().optional(),
  endMs: z.number().int().nonnegative().optional(),
  pageNumber: z.number().int().positive().max(40).optional(),
  attribution: z.string().max(200).optional(),
  privacyState: z.enum(['private', 'story_eligible', 'film_eligible']).default('private'),
  approvedForStory: z.boolean().default(false),
  approvedForFilm: z.boolean().default(false),
  version: z.number().int().nonnegative().default(0),
  provenance: aiProvenanceSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
});
export type StoryExcerpt = z.infer<typeof storyExcerptSchema>;

export const OCR_ENGINE = {
  name: 'tesseract.js',
  version: 'v5-local',
  kind: 'local' as const,
};

export const TRANSCRIPTION_ENGINE = {
  name: 'xenova-whisper-tiny-en',
  version: 'v1-local',
  kind: 'local' as const,
};

export const extractionIdempotencyKey = (
  assetId: string,
  checksum: string,
  extractionType: ExtractionType,
  engineVersion: string,
): string => `content_extraction:${extractionType}:${assetId}:${checksum}:${engineVersion}`;
