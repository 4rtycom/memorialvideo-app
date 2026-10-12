import { z } from 'zod';

import { DIRECTOR_V2_CONTRACT_VERSION, directorLockSchema, directorV2ProvenanceSchema } from './director-v2';
import { launchLanguageSchema } from './locale';

export const DIRECTOR_EDIT_CONTRACT_VERSION = DIRECTOR_V2_CONTRACT_VERSION;

export const EDIT_INTENT_TYPES = [
  'scene.adjust_duration',
  'chapter.adjust_duration',
  'scene.move',
  'chapter.move',
  'memory.include',
  'memory.exclude',
  'memory.replace',
  'transition.change',
  'scene.regenerate',
  'chapter.regenerate',
  'version.restore',
  'edit.revert',
  'film.target_duration',
  'audio.enable_ducking',
  'audio.attach_subtitles',
  'audio.select_narration',
  'audio.master_profile',
] as const;
export type EditIntentType = (typeof EDIT_INTENT_TYPES)[number];

export const EDIT_CAPABILITY_STATUSES = [
  'supported',
  'needs_clarification',
  'needs_information',
  'planned',
  'unsafe',
  'impossible',
] as const;
export type EditCapabilityStatus = (typeof EDIT_CAPABILITY_STATUSES)[number];

export const EDIT_REQUEST_STATUSES = [
  'received',
  'clarifying',
  'planned',
  'previewed',
  'applied',
  'reverted',
  'cancelled',
  'rejected',
  'failed',
] as const;
export type EditRequestStatus = (typeof EDIT_REQUEST_STATUSES)[number];

export const EDIT_PROVIDER_MODES = ['deterministic', 'generative'] as const;
export type EditProviderMode = (typeof EDIT_PROVIDER_MODES)[number];

export const EDIT_SCOPES = ['scene', 'chapter', 'memory', 'film', 'version', 'last_edit', 'audio'] as const;
export type EditScope = (typeof EDIT_SCOPES)[number];

export const editClarifyingQuestionSchema = z.object({
  id: z.string().min(1).max(80),
  code: z.enum([
    'which_chapter',
    'which_scene',
    'duration_amount',
    'which_memory',
    'replace_target',
    'move_anchor',
    'emotion_axis',
    'person_selection',
    'language_target',
  ]),
  choices: z.array(z.object({ id: z.string().min(1).max(80), labelKey: z.string().min(1).max(120) })).max(12).default([]),
});
export type EditClarifyingQuestion = z.infer<typeof editClarifyingQuestionSchema>;

export const naturalLanguageEditRequestSchema = z.object({
  schemaVersion: z.literal(DIRECTOR_EDIT_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  tributePublicId: z.string().min(1).max(80),
  locale: launchLanguageSchema,
  instruction: z.string().min(1).max(2000),
  scope: z.enum(EDIT_SCOPES).optional(),
  selectedSceneId: z.string().max(80).optional(),
  selectedChapterId: z.string().max(80).optional(),
  selectedAssetId: z.string().max(80).optional(),
  replacementAssetId: z.string().max(80).optional(),
  baseTimelineVersion: z.number().int().nonnegative(),
  baseTimelineHash: z.string().min(8).max(64),
  storyPlanHash: z.string().min(8).max(64),
  providerMode: z.enum(EDIT_PROVIDER_MODES).default('deterministic'),
  status: z.enum(EDIT_REQUEST_STATUSES).default('received'),
  clarifyingQuestions: z.array(editClarifyingQuestionSchema).max(4).default([]),
  clarificationAnswers: z.record(z.string(), z.string().max(200)).default({}),
  createdByUserId: z.string().min(1).max(80),
  createdAt: z.string().datetime(),
  retentionState: z.enum(['active', 'scheduled_delete']).default('active'),
  idempotencyKey: z.string().min(1).max(160),
});
export type NaturalLanguageEditRequest = z.infer<typeof naturalLanguageEditRequestSchema>;

export const editIntentSchema = z.object({
  schemaVersion: z.literal(DIRECTOR_EDIT_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  requestId: z.string().min(1).max(80),
  type: z.enum(EDIT_INTENT_TYPES),
  scope: z.enum(EDIT_SCOPES),
  targetSceneId: z.string().max(80).optional(),
  targetChapterId: z.string().max(80).optional(),
  targetAssetId: z.string().max(80).optional(),
  replacementAssetId: z.string().max(80).optional(),
  anchorChapterId: z.string().max(80).optional(),
  anchorSceneId: z.string().max(80).optional(),
  position: z.enum(['before', 'after', 'within']).optional(),
  durationFrames: z.number().int().positive().max(30 * 60).optional(),
  durationDeltaFrames: z.number().int().min(-30 * 60).max(30 * 60).optional(),
  durationFactor: z.number().min(0.25).max(4).optional(),
  transitionIn: z.enum(['none', 'fade', 'dissolve']).optional(),
  preserveTiming: z.boolean().default(false),
  preserveCrop: z.boolean().default(true),
  preserveTransition: z.boolean().default(true),
  preserveText: z.boolean().default(true),
  versionId: z.string().max(80).optional(),
  patchId: z.string().max(80).optional(),
  requiredLocks: z.array(directorLockSchema).max(80).default([]),
  clarifyingQuestions: z.array(editClarifyingQuestionSchema).max(4).default([]),
  capabilityStatus: z.enum(EDIT_CAPABILITY_STATUSES),
  capabilityCode: z
    .enum([
      'ok',
      'needs_selection',
      'needs_duration',
      'needs_person_context',
      'needs_emotion_axis',
      'person_detection_unavailable',
      'translation_partial',
      'variant_planned',
      'unsupported_grammar',
      'unsafe_request',
    ])
    .default('ok'),
  confidence: z.number().min(0).max(1).optional(),
  provenance: directorV2ProvenanceSchema,
  validationStatus: z.enum(['valid', 'invalid', 'pending_clarification']).default('valid'),
  explanation: z.array(z.string().min(1).max(240)).max(6).default([]),
});
export type EditIntent = z.infer<typeof editIntentSchema>;

export const editPlanChangeSchema = z.object({
  kind: z.enum([
    'duration',
    'move',
    'replace',
    'include',
    'exclude',
    'transition',
    'regenerate',
    'restore',
    'revert',
    'audio_ducking',
    'audio_subtitles',
    'audio_narration',
    'audio_master',
  ]),
  sceneId: z.string().max(80).optional(),
  chapterId: z.string().max(80).optional(),
  beforeLabel: z.string().max(120).default(''),
  afterLabel: z.string().max(120).default(''),
  beforeDurationFrames: z.number().int().nonnegative().optional(),
  afterDurationFrames: z.number().int().nonnegative().optional(),
  assetIdBefore: z.string().max(80).optional(),
  assetIdAfter: z.string().max(80).optional(),
  protected: z.boolean().default(false),
});
export type EditPlanChange = z.infer<typeof editPlanChangeSchema>;

export const editPlanSchema = z.object({
  schemaVersion: z.literal(DIRECTOR_EDIT_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  requestId: z.string().min(1).max(80),
  intentId: z.string().min(1).max(80),
  interpretation: z.array(z.string().min(1).max(240)).max(6),
  proposedOperationKinds: z.array(z.string().min(1).max(40)).max(24),
  preservedSceneIds: z.array(z.string().min(1).max(80)).max(240),
  affectedSceneIds: z.array(z.string().min(1).max(80)).max(240),
  affectedChapterIds: z.array(z.string().min(1).max(80)).max(24),
  changes: z.array(editPlanChangeSchema).max(48),
  beforeDurationFrames: z.number().int().nonnegative(),
  afterDurationFrames: z.number().int().nonnegative(),
  warnings: z.array(z.string().min(1).max(120)).max(12).default([]),
  explanation: z.array(z.string().min(1).max(240)).max(8).default([]),
  clarificationRequired: z.boolean().default(false),
  capabilityStatus: z.enum(EDIT_CAPABILITY_STATUSES),
  patchId: z.string().max(80).optional(),
  unchangedHash: z.string().min(8).max(64).optional(),
  createdAt: z.string().datetime(),
});
export type EditPlan = z.infer<typeof editPlanSchema>;

export const directorHistoryKindSchema = z.enum([
  'director_v1',
  'director_v2_plan',
  'scene_patch',
  'chapter_patch',
  'nl_edit',
  'version_restore',
  'manual_traceable',
]);
export type DirectorHistoryKind = z.infer<typeof directorHistoryKindSchema>;

export const directorHistoryEntrySchema = z.object({
  schemaVersion: z.literal(DIRECTOR_EDIT_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  kind: directorHistoryKindSchema,
  status: z.enum(['applied', 'reverted', 'stale', 'conflict', 'previewed', 'none']),
  safeActionKey: z.string().min(1).max(80),
  timelineVersion: z.number().int().nonnegative().optional(),
  timelineHash: z.string().min(8).max(64).optional(),
  patchId: z.string().max(80).optional(),
  planId: z.string().max(80).optional(),
  requestId: z.string().max(80).optional(),
  createdAt: z.string().datetime(),
});
export type DirectorHistoryEntry = z.infer<typeof directorHistoryEntrySchema>;

export const directorProviderConsentSchema = z.object({
  schemaVersion: z.literal(DIRECTOR_EDIT_CONTRACT_VERSION),
  projectPublicId: z.string().min(1).max(80),
  granted: z.boolean(),
  consentVersion: z.string().min(1).max(40),
  updatedByUserId: z.string().min(1).max(80).optional(),
  updatedAt: z.string().datetime(),
  version: z.number().int().nonnegative().default(0),
});
export type DirectorProviderConsent = z.infer<typeof directorProviderConsentSchema>;
