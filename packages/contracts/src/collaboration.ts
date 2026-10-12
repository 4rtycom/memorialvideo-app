import { z } from 'zod';

import { aiProvenanceSchema } from './intelligence';

/** Keep local to avoid circular init with intelligence barrel re-exports. */
export const COLLABORATION_CONTRACT_VERSION = 1 as const;

/** Labelled deterministic helper — not a live generative feedback model. */
export const COLLABORATION_SUMMARY_ENGINE = {
  provider: 'memorialvideo-collaboration-summary',
  model: 'deterministic-counts-v1',
  version: 'v1-local',
  kind: 'deterministic' as const,
};

export const COLLABORATION_DECISION_KINDS = [
  'fact',
  'placement',
  'approval',
  'exclusion',
  'comment',
] as const;
export type CollaborationDecisionKind = (typeof COLLABORATION_DECISION_KINDS)[number];

export const COLLABORATION_DECISION_OUTCOMES = [
  'approve',
  'request_changes',
  'defer',
  'confirm',
  'dismiss',
  'keep_both',
  'leave_unresolved',
] as const;
export type CollaborationDecisionOutcome = (typeof COLLABORATION_DECISION_OUTCOMES)[number];

export const COLLABORATION_SUBJECT_TYPES = [
  'review_comment',
  'story_conflict',
  'duplicate_pair',
  'placement_suggestion',
  'final_film',
  'review_task',
] as const;
export type CollaborationSubjectType = (typeof COLLABORATION_SUBJECT_TYPES)[number];

export const COLLABORATION_DECISION_STATUSES = ['active', 'superseded'] as const;
export type CollaborationDecisionStatus = (typeof COLLABORATION_DECISION_STATUSES)[number];

/**
 * Durable family decision. `decidedByFamily: true` is required —
 * AI may flag disagreement but never silently pick a winner.
 */
export const collaborationDecisionSchema = z.object({
  schemaVersion: z.literal(COLLABORATION_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  kind: z.enum(COLLABORATION_DECISION_KINDS),
  outcome: z.enum(COLLABORATION_DECISION_OUTCOMES),
  subjectType: z.enum(COLLABORATION_SUBJECT_TYPES),
  subjectId: z.string().min(1).max(120),
  status: z.enum(COLLABORATION_DECISION_STATUSES).default('active'),
  decidedByFamily: z.literal(true),
  /** Safe opaque summary — never raw comment/caption/name text. */
  summary: z.string().min(1).max(400),
  summaryKey: z.string().min(1).max(120).optional(),
  relatedCommentId: z.string().min(1).max(80).optional(),
  relatedConflictId: z.string().min(1).max(80).optional(),
  relatedTaskId: z.string().min(1).max(80).optional(),
  version: z.number().int().nonnegative().default(0),
  provenance: aiProvenanceSchema.optional(),
});
export type CollaborationDecision = z.infer<typeof collaborationDecisionSchema>;

export const COLLABORATION_TASK_KINDS = [
  'resolve_comment',
  'review_conflict',
  'review_duplicate',
  'confirm_placement',
  'final_approval',
] as const;
export type CollaborationTaskKind = (typeof COLLABORATION_TASK_KINDS)[number];

export const COLLABORATION_TASK_STATUSES = ['open', 'done', 'cancelled'] as const;
export type CollaborationTaskStatus = (typeof COLLABORATION_TASK_STATUSES)[number];

export const collaborationReviewTaskSchema = z.object({
  schemaVersion: z.literal(COLLABORATION_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  kind: z.enum(COLLABORATION_TASK_KINDS),
  status: z.enum(COLLABORATION_TASK_STATUSES),
  subjectType: z.enum(COLLABORATION_SUBJECT_TYPES),
  subjectId: z.string().min(1).max(120),
  /** i18n key for owner-facing task label — no PII. */
  labelKey: z.string().min(1).max(120),
  version: z.number().int().nonnegative().default(0),
});
export type CollaborationReviewTask = z.infer<typeof collaborationReviewTaskSchema>;

export const COLLABORATION_INBOX_KINDS = [
  'open_comment',
  'open_conflict',
  'unreviewed_duplicate',
  'placement_suggestion',
  'open_task',
  'final_approval',
] as const;
export type CollaborationInboxKind = (typeof COLLABORATION_INBOX_KINDS)[number];

export const collaborationInboxItemSchema = z.object({
  kind: z.enum(COLLABORATION_INBOX_KINDS),
  id: z.string().min(1).max(120),
  subjectType: z.enum(COLLABORATION_SUBJECT_TYPES),
  subjectId: z.string().min(1).max(120),
  labelKey: z.string().min(1).max(120),
  /** Counts or opaque ids only — never comment bodies or names. */
  detail: z.string().min(1).max(200).optional(),
  familyMustDecide: z.boolean(),
  aiMayNotDecide: z.literal(true),
});
export type CollaborationInboxItem = z.infer<typeof collaborationInboxItemSchema>;

export const collaborationFeedbackSummarySchema = z.object({
  schemaVersion: z.literal(COLLABORATION_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  engine: z.literal('deterministic'),
  generativeUnavailable: z.literal(true),
  openCommentCount: z.number().int().nonnegative(),
  resolvedCommentCount: z.number().int().nonnegative(),
  openConflictCount: z.number().int().nonnegative(),
  familyDisagreementCount: z.number().int().nonnegative(),
  unreviewedDuplicateCount: z.number().int().nonnegative(),
  openTaskCount: z.number().int().nonnegative(),
  activeApprovalOutcome: z.enum(COLLABORATION_DECISION_OUTCOMES).nullable(),
  /** Labelled count summary — never includes comment or caption text. */
  labelledSummaryKey: z.string().min(1).max(120),
  provenance: aiProvenanceSchema,
});
export type CollaborationFeedbackSummary = z.infer<typeof collaborationFeedbackSummarySchema>;

export const collaborationPlacementSuggestionSchema = z.object({
  schemaVersion: z.literal(COLLABORATION_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  assetId: z.string().min(1).max(80),
  suggestedChapterId: z.string().min(1).max(80).optional(),
  suggestedSortHint: z.number().int().nonnegative().optional(),
  status: z.enum(['proposed', 'confirmed', 'dismissed']).default('proposed'),
  familyMustConfirm: z.literal(true),
  /** Durable suggestion never mutates TimelineContract; apply uses a separate TimelinePatch. */
  changeTimeline: z.literal(false),
  provenance: aiProvenanceSchema,
});
export type CollaborationPlacementSuggestion = z.infer<typeof collaborationPlacementSuggestionSchema>;

/**
 * Owner-facing preview of a placement TimelinePatch.
 * `changeTimeline: false` — preview/propose never mutates the live contract.
 */
export const collaborationPlacementPatchPreviewSchema = z.object({
  schemaVersion: z.literal(COLLABORATION_CONTRACT_VERSION),
  suggestionId: z.string().min(1).max(80),
  patchId: z.string().min(1).max(80),
  beforeDurationFrames: z.number().int().nonnegative(),
  afterDurationFrames: z.number().int().positive(),
  touchedSceneIds: z.array(z.string().min(1).max(80)).max(8),
  touchedAssetIds: z.array(z.string().min(1).max(80)).max(4),
  familyMustConfirm: z.literal(true),
  decidedByFamily: z.literal(true).optional(),
  changeTimeline: z.literal(false),
});
export type CollaborationPlacementPatchPreview = z.infer<
  typeof collaborationPlacementPatchPreviewSchema
>;

export function parseCollaborationDecision(input: unknown): CollaborationDecision {
  return collaborationDecisionSchema.parse(input);
}

export function parseCollaborationReviewTask(input: unknown): CollaborationReviewTask {
  return collaborationReviewTaskSchema.parse(input);
}

export function parseCollaborationFeedbackSummary(input: unknown): CollaborationFeedbackSummary {
  return collaborationFeedbackSummarySchema.parse(input);
}

export function parseCollaborationPlacementSuggestion(
  input: unknown,
): CollaborationPlacementSuggestion {
  return collaborationPlacementSuggestionSchema.parse(input);
}

export function parseCollaborationPlacementPatchPreview(
  input: unknown,
): CollaborationPlacementPatchPreview {
  return collaborationPlacementPatchPreviewSchema.parse(input);
}
