import { z } from 'zod';

import { aiProvenanceSchema } from './intelligence';

/** Keep local to avoid circular init with intelligence barrel re-exports. */
export const CEREMONY_READINESS_CONTRACT_VERSION = 1 as const;

/** Labelled deterministic evaluator — not a live generative readiness model. */
export const CEREMONY_READINESS_ENGINE = {
  provider: 'memorialvideo-ceremony-readiness',
  model: 'deterministic-checks-v1',
  version: 'v1-local',
  kind: 'deterministic' as const,
};

/**
 * Allowlisted finding codes only. Free-form LLM text must never become structure.
 * Deferred checks use evidenceState: 'deferred' — never fake a pass.
 */
export const CEREMONY_READINESS_FINDING_CODES = [
  'output_qc_failed',
  'playback_not_ready',
  'ceremony_pack_prerequisites',
  'story_conflict_open',
  'factual_inconsistency',
  'questionable_dates',
  'names_consistency',
  'duplicate_scenes',
  'unreviewed_duplicate_assets',
  'cropped_faces',
  'cropped_faces_deferred',
  'face_near_edge',
  'unconfirmed_people_in_film',
  'film_approved_person_missing',
  'caption_readability',
  'audio_missing',
  'audio_rights_unknown',
  'audio_ducking_gap',
  'black_frames',
  'low_resolution_media',
  'subtitle_incomplete',
  'empty_chapter',
  'unbalanced_chapters',
  'sensitive_imagery',
  'sensitive_imagery_deferred',
  'copyright_music_risk',
  'music_catalog_pending_approval',
  'private_info_exposure',
  'private_info_deferred',
  'open_collaboration_tasks',
] as const;
export type CeremonyReadinessFindingCode = (typeof CEREMONY_READINESS_FINDING_CODES)[number];

export const CEREMONY_READINESS_SEVERITIES = [
  'blocking',
  'warning',
  'suggestion',
  'needs_confirmation',
] as const;
export type CeremonyReadinessSeverity = (typeof CEREMONY_READINESS_SEVERITIES)[number];

export const CEREMONY_READINESS_FINDING_STATUSES = [
  'open',
  'confirmed',
  'acknowledged',
  'resolved',
] as const;
export type CeremonyReadinessFindingStatus = (typeof CEREMONY_READINESS_FINDING_STATUSES)[number];

export const CEREMONY_READINESS_EVIDENCE_STATES = [
  'observed',
  'composed',
  'deferred',
  'unavailable',
] as const;
export type CeremonyReadinessEvidenceState = (typeof CEREMONY_READINESS_EVIDENCE_STATES)[number];

export const ceremonyReadinessFindingSchema = z.object({
  id: z.string().min(1).max(120),
  code: z.enum(CEREMONY_READINESS_FINDING_CODES),
  severity: z.enum(CEREMONY_READINESS_SEVERITIES),
  status: z.enum(CEREMONY_READINESS_FINDING_STATUSES).default('open'),
  /** i18n key — never raw captions, names, or media content. */
  labelKey: z.string().min(1).max(120),
  /** Opaque count/code detail only. */
  detail: z.string().min(1).max(200).optional(),
  evidenceState: z.enum(CEREMONY_READINESS_EVIDENCE_STATES),
  /** Family may confirm/acknowledge; does not auto-clear true blockers. */
  requiresHumanConfirmation: z.boolean().default(false),
  /** True blockers stay blocking until underlying evidence changes. */
  confirmationClearsActive: z.boolean().default(false),
  relatedSubjectType: z
    .enum([
      'output_qc',
      'render',
      'story_conflict',
      'timeline_scene',
      'duplicate_pair',
      'audio_mix',
      'collaboration_task',
      'asset_quality',
      'people',
      'ceremony_pack',
    ])
    .optional(),
  relatedSubjectId: z.string().min(1).max(120).optional(),
});
export type CeremonyReadinessFinding = z.infer<typeof ceremonyReadinessFindingSchema>;

export const ceremonyReadinessConfirmationSchema = z.object({
  schemaVersion: z.literal(CEREMONY_READINESS_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  findingId: z.string().min(1).max(120),
  findingCode: z.enum(CEREMONY_READINESS_FINDING_CODES),
  outcome: z.enum(['confirm', 'acknowledge']),
  decidedByFamily: z.literal(true),
  /** Safe opaque summary key — never memorial content. */
  summaryKey: z.string().min(1).max(120),
  version: z.number().int().nonnegative().default(0),
});
export type CeremonyReadinessConfirmation = z.infer<typeof ceremonyReadinessConfirmationSchema>;

/**
 * Durable Ceremony Readiness report.
 * A single unexplained score is insufficient (`singleScoreInsufficient: true`).
 * Output QC is composed into findings — it is not this report.
 */
export const ceremonyReadinessReportSchema = z.object({
  schemaVersion: z.literal(CEREMONY_READINESS_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  version: z.number().int().nonnegative().default(0),
  /** Deterministic hash of evaluation inputs (no PII). */
  inputHash: z.string().min(8).max(128),
  findings: z.array(ceremonyReadinessFindingSchema).max(200).default([]),
  blockingCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  suggestionCount: z.number().int().nonnegative(),
  confirmationCount: z.number().int().nonnegative(),
  /** Active open blockers after applying family confirmations. */
  activeBlockingCount: z.number().int().nonnegative(),
  singleScoreInsufficient: z.literal(true),
  /** Delivery policy snapshot for UI/API consumers. */
  packPolicy: z.literal('block_on_active_blocking'),
  downloadPolicy: z.literal('warn_on_active_blocking'),
  checklistPolicy: z.literal('always_allowed_for_owner'),
  provenance: aiProvenanceSchema,
});
export type CeremonyReadinessReport = z.infer<typeof ceremonyReadinessReportSchema>;

/** Legacy issue shape kept for callers that still expect the intelligence stub. */
export const ceremonyReadinessIssueSchema = z.object({
  code: z.string().min(1).max(80),
  severity: z.enum(['blocking', 'warning', 'suggestion', 'needs_confirmation']),
  humanLabelKey: z.string().min(1).max(120),
});
export type CeremonyReadinessIssue = z.infer<typeof ceremonyReadinessIssueSchema>;

export function parseCeremonyReadinessReport(input: unknown): CeremonyReadinessReport {
  return ceremonyReadinessReportSchema.parse(input);
}

export function parseCeremonyReadinessConfirmation(input: unknown): CeremonyReadinessConfirmation {
  return ceremonyReadinessConfirmationSchema.parse(input);
}

export function parseCeremonyReadinessFinding(input: unknown): CeremonyReadinessFinding {
  return ceremonyReadinessFindingSchema.parse(input);
}
