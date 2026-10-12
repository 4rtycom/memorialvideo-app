import { z } from 'zod';

import {
  audioClipSchema,
  audioMixContractSchema,
  duckingProfileSchema,
  mixAudioTrackSchema,
  subtitleTrackSchema,
} from './audio';
import { INTELLIGENCE_CONTRACT_VERSION, aiProvenanceSchema } from './intelligence';
import { OUTPUT_ASPECTS, assetRefSchema, cropSchema, sceneSchema } from './timeline';
import { launchLanguageSchema } from './locale';

export const DIRECTOR_V2_CONTRACT_VERSION = INTELLIGENCE_CONTRACT_VERSION;

export const STORY_APPROVAL_STATUSES = ['active', 'revoked', 'superseded', 'invalidated'] as const;
export type StoryApprovalStatus = (typeof STORY_APPROVAL_STATUSES)[number];

export const storyApprovalSchema = z.object({
  schemaVersion: z.literal(DIRECTOR_V2_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  tributePublicId: z.string().min(1).max(80),
  storyPlanVersion: z.number().int().positive(),
  storyPlanHash: z.string().min(8).max(64),
  approvedChapterIds: z.array(z.string().min(1).max(80)).max(24),
  approvedFactIds: z.array(z.string().min(1).max(80)).max(48),
  approvedMemoryIds: z.array(z.string().min(1).max(80)).max(200),
  excludedChapterIds: z.array(z.string().min(1).max(80)).max(24).default([]),
  excludedFactIds: z.array(z.string().min(1).max(80)).max(48).default([]),
  excludedMemoryIds: z.array(z.string().min(1).max(80)).max(200).default([]),
  includePrivateNotes: z.boolean().default(false),
  approvedByUserId: z.string().min(1).max(80),
  approvedAt: z.string().datetime(),
  version: z.number().int().nonnegative().default(0),
  status: z.enum(STORY_APPROVAL_STATUSES).default('active'),
});
export type StoryApproval = z.infer<typeof storyApprovalSchema>;

export const DIRECTOR_TONES = [
  'warm',
  'dignified',
  'restrained',
  'celebratory',
  'formal',
  'spiritual',
  'secular',
] as const;
export type DirectorTone = (typeof DIRECTOR_TONES)[number];

export const DIRECTOR_PACINGS = ['measured', 'gentle', 'brisk'] as const;
export type DirectorPacing = (typeof DIRECTOR_PACINGS)[number];

export const DIRECTOR_STRUCTURES = ['chronological', 'thematic', 'cinematic', 'celebration'] as const;
export type DirectorStructure = (typeof DIRECTOR_STRUCTURES)[number];

export const DIRECTOR_TEXT_DENSITIES = ['sparse', 'balanced', 'rich'] as const;
export type DirectorTextDensity = (typeof DIRECTOR_TEXT_DENSITIES)[number];

export const DIRECTOR_NARRATION = ['none', 'text_only', 'professional_neutral'] as const;
export type DirectorNarration = (typeof DIRECTOR_NARRATION)[number];

export const DIRECTOR_OPENINGS = ['name_card', 'first_memory', 'chapter_title'] as const;
export type DirectorOpening = (typeof DIRECTOR_OPENINGS)[number];

export const DIRECTOR_CLOSINGS = ['quiet_line', 'name_card', 'last_memory'] as const;
export type DirectorClosing = (typeof DIRECTOR_CLOSINGS)[number];

export const DIRECTOR_MUSIC_MOODS = ['none', 'placeholder', 'warm', 'restrained'] as const;
export type DirectorMusicMood = (typeof DIRECTOR_MUSIC_MOODS)[number];

export const DIRECTOR_LOCK_KINDS = [
  'always_include',
  'never_include',
  'keep_position',
  'keep_duration',
  'keep_crop',
  'keep_text',
  'keep_transition',
  'keep_chapter',
] as const;
export type DirectorLockKind = (typeof DIRECTOR_LOCK_KINDS)[number];

export const directorLockSchema = z.object({
  kind: z.enum(DIRECTOR_LOCK_KINDS),
  targetId: z.string().min(1).max(80),
});
export type DirectorLock = z.infer<typeof directorLockSchema>;

export const directorClarifyingQuestionSchema = z.object({
  id: z.string().min(1).max(80),
  code: z.enum(['duration', 'tone', 'must_include', 'opening', 'closing']),
});
export type DirectorClarifyingQuestion = z.infer<typeof directorClarifyingQuestionSchema>;

export const directorV2BriefSchema = z.object({
  schemaVersion: z.literal(DIRECTOR_V2_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  naturalLanguage: z.string().max(2000).default(''),
  targetDurationSeconds: z.number().int().min(30).max(30 * 60).optional(),
  tone: z.enum(DIRECTOR_TONES).optional(),
  pacing: z.enum(DIRECTOR_PACINGS).optional(),
  structure: z.enum(DIRECTOR_STRUCTURES).optional(),
  themeKeys: z.array(z.string().min(1).max(40)).max(8).default([]),
  emphasiseChapterIds: z.array(z.string().min(1).max(80)).max(12).default([]),
  shortenChapterIds: z.array(z.string().min(1).max(80)).max(12).default([]),
  excludeChapterIds: z.array(z.string().min(1).max(80)).max(12).default([]),
  mustIncludeMemoryIds: z.array(z.string().min(1).max(80)).max(48).default([]),
  mustExcludeMemoryIds: z.array(z.string().min(1).max(80)).max(48).default([]),
  opening: z.enum(DIRECTOR_OPENINGS).optional(),
  closing: z.enum(DIRECTOR_CLOSINGS).optional(),
  textDensity: z.enum(DIRECTOR_TEXT_DENSITIES).optional(),
  narration: z.enum(DIRECTOR_NARRATION).default('none'),
  musicMood: z.enum(DIRECTOR_MUSIC_MOODS).default('placeholder'),
  musicRightsAccepted: z.boolean().default(false),
  language: launchLanguageSchema.optional(),
  aspect: z.enum(OUTPUT_ASPECTS).optional(),
  ceremonyContext: z.string().max(200).optional().default(''),
  protectedLocks: z.array(directorLockSchema).max(80).default([]),
  reducedMotion: z.boolean().default(false),
  captionsPreferred: z.boolean().default(false),
  clarifyingQuestions: z.array(directorClarifyingQuestionSchema).max(4).default([]),
  version: z.number().int().nonnegative().default(0),
});
export type DirectorV2Brief = z.infer<typeof directorV2BriefSchema>;

export const DIRECTOR_V2_PLAN_STATUSES = [
  'draft',
  'ready',
  'rejected',
  'applied',
  'superseded',
] as const;
export type DirectorV2PlanStatus = (typeof DIRECTOR_V2_PLAN_STATUSES)[number];

export const DIRECTOR_PROVIDER_KINDS = ['deterministic', 'generative'] as const;
export type DirectorProviderKind = (typeof DIRECTOR_PROVIDER_KINDS)[number];

export const directorV2ProvenanceSchema = aiProvenanceSchema.extend({
  kind: z.enum(DIRECTOR_PROVIDER_KINDS),
});
export type DirectorV2Provenance = z.infer<typeof directorV2ProvenanceSchema>;

export const directorPlanChapterSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  purpose: z.string().max(400).default(''),
  sceneIds: z.array(z.string().min(1).max(80)).max(48),
  durationFrames: z.number().int().nonnegative(),
  emphasised: z.boolean().default(false),
});

export const directorPlanSceneSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.enum(['intro', 'chapter', 'image', 'video', 'quote', 'outro']),
  purpose: z.enum([
    'opening',
    'chapter_marker',
    'memory',
    'approved_text',
    'closing',
  ]),
  assetId: z.string().max(80).optional(),
  chapterId: z.string().max(80).optional(),
  durationFrames: z.number().int().positive(),
  transitionIn: z.enum(['none', 'fade', 'dissolve']),
  textRef: z.enum(['display_name', 'chapter_title', 'existing_caption', 'existing_closing']).optional(),
});

export const directorConstraintSchema = z.object({
  code: z.enum([
    'approved_inputs',
    'must_include',
    'must_exclude',
    'manual_locks',
    'duration',
    'music_rights',
    'narration',
    'stale_base',
    'private_notes',
  ]),
  ok: z.boolean(),
});

export const DIRECTOR_WARNING_CODES = [
  'duration_adjusted',
  'empty_chapter_skipped',
  'placeholder_music',
  'clarifying_needed',
  'unconfirmed_excluded',
  'deterministic_arranger',
] as const;
export type DirectorWarningCode = (typeof DIRECTOR_WARNING_CODES)[number];

export const directorV2PlanSchema = z.object({
  schemaVersion: z.literal(DIRECTOR_V2_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  version: z.number().int().nonnegative().default(0),
  status: z.enum(DIRECTOR_V2_PLAN_STATUSES).default('ready'),
  tributePublicId: z.string().min(1).max(80),
  briefId: z.string().min(1).max(80),
  approvalId: z.string().min(1).max(80),
  storyPlanHash: z.string().min(8).max(64),
  timelineVersion: z.number().int().nonnegative(),
  timelineHash: z.string().min(8).max(64),
  provenance: directorV2ProvenanceSchema,
  chapters: z.array(directorPlanChapterSchema).max(24),
  scenes: z.array(directorPlanSceneSchema).min(1).max(240),
  selectedAssetIds: z.array(z.string().min(1).max(80)).max(200),
  omittedAssetIds: z.array(z.string().min(1).max(80)).max(200).default([]),
  openingIntent: z.enum(DIRECTOR_OPENINGS),
  closingIntent: z.enum(DIRECTOR_CLOSINGS),
  audioIntent: z.object({
    kind: z.enum(['none', 'placeholder']),
    licensed: z.boolean(),
  }),
  durationFrames: z.number().int().positive(),
  constraintReport: z.array(directorConstraintSchema).max(16),
  warnings: z.array(z.enum(DIRECTOR_WARNING_CODES)).max(12).default([]),
  rationale: z.array(z.string().min(1).max(240)).max(8).default([]),
  unresolvedQuestions: z.array(directorClarifyingQuestionSchema).max(4).default([]),
  validation: z.object({
    ok: z.boolean(),
    codes: z.array(z.string().max(80)).max(16).default([]),
  }),
  createdAt: z.string().datetime(),
  appliedAt: z.string().datetime().optional(),
});
export type DirectorV2Plan = z.infer<typeof directorV2PlanSchema>;

export const PATCH_APPLY_STATUSES = ['none', 'applied', 'reverted', 'stale', 'conflict'] as const;
export type PatchApplyStatus = (typeof PATCH_APPLY_STATUSES)[number];

export const insertSceneOpSchema = z.object({
  op: z.literal('insert_scene'),
  index: z.number().int().nonnegative().max(240),
  scene: sceneSchema,
});
export const removeSceneOpSchema = z.object({
  op: z.literal('remove_scene'),
  sceneId: z.string().min(1).max(80),
});
export const moveSceneOpSchema = z.object({
  op: z.literal('move_scene'),
  sceneId: z.string().min(1).max(80),
  toIndex: z.number().int().nonnegative().max(240),
});
export const updateDurationOpSchema = z.object({
  op: z.literal('update_duration'),
  sceneId: z.string().min(1).max(80),
  durationFrames: z.number().int().positive().max(30 * 60),
});
export const updateTransitionOpSchema = z.object({
  op: z.literal('update_transition'),
  sceneId: z.string().min(1).max(80),
  transitionIn: z.enum(['none', 'fade', 'dissolve']).optional(),
  transitionOut: z.enum(['none', 'fade', 'dissolve']).optional(),
});
export const updateCropOpSchema = z.object({
  op: z.literal('update_crop'),
  sceneId: z.string().min(1).max(80),
  crop: cropSchema,
});
export const updateTextOpSchema = z.object({
  op: z.literal('update_text'),
  sceneId: z.string().min(1).max(80),
  field: z.enum(['caption', 'text', 'title', 'displayName', 'closingLine', 'lifeSpanLabel']),
  value: z.string().max(280),
});
export const assignChapterOpSchema = z.object({
  op: z.literal('assign_chapter'),
  sceneId: z.string().min(1).max(80),
  chapterId: z.string().min(1).max(80),
});
export const updateMetadataOpSchema = z.object({
  op: z.literal('update_metadata'),
  field: z.enum(['themeKey', 'watermark']),
  value: z.union([z.string().max(40), z.boolean()]),
});
export const updateAssetOpSchema = z.object({
  op: z.literal('update_asset'),
  sceneId: z.string().min(1).max(80),
  asset: assetRefSchema,
});

/** Change composition aspect; crops inherit via separate update_crop ops when needed. */
export const setAspectOpSchema = z.object({
  op: z.literal('set_aspect'),
  aspect: z.enum(OUTPUT_ASPECTS),
});

export const audioTrackAddOpSchema = z.object({
  op: z.literal('audio.track_add'),
  track: mixAudioTrackSchema,
});
export const audioTrackRemoveOpSchema = z.object({
  op: z.literal('audio.track_remove'),
  trackId: z.string().min(1).max(80),
});
export const audioTrackUpdateOpSchema = z.object({
  op: z.literal('audio.track_update'),
  trackId: z.string().min(1).max(80),
  track: mixAudioTrackSchema,
});
export const audioClipAddOpSchema = z.object({
  op: z.literal('audio.clip_add'),
  trackId: z.string().min(1).max(80),
  clip: audioClipSchema,
});
export const audioClipRemoveOpSchema = z.object({
  op: z.literal('audio.clip_remove'),
  trackId: z.string().min(1).max(80),
  clipId: z.string().min(1).max(80),
});
export const audioClipUpdateOpSchema = z.object({
  op: z.literal('audio.clip_update'),
  trackId: z.string().min(1).max(80),
  clip: audioClipSchema,
});
export const audioDuckingSetOpSchema = z.object({
  op: z.literal('audio.ducking_set'),
  ducking: duckingProfileSchema,
});
export const audioDuckingRegionsSetOpSchema = z.object({
  op: z.literal('audio.ducking_regions_set'),
  regions: duckingProfileSchema.shape.regions,
});
export const audioMasterProfileOpSchema = z.object({
  op: z.literal('audio.master_profile'),
  masterProfile: audioMixContractSchema.shape.masterProfile,
});
export const audioNarrationTakeSelectOpSchema = z.object({
  op: z.literal('audio.narration_take_select'),
  takeId: z.string().min(1).max(80).nullable(),
});
export const audioSubtitleTrackAttachOpSchema = z.object({
  op: z.literal('audio.subtitle_track_attach'),
  track: subtitleTrackSchema,
});
export const audioSubtitleTrackDetachOpSchema = z.object({
  op: z.literal('audio.subtitle_track_detach'),
  trackId: z.string().min(1).max(80),
});
/** Full mix replace for Guided Audio apply/revert. Inverse carries previous mix or null. */
export const audioMixReplaceOpSchema = z.object({
  op: z.literal('audio.mix_replace'),
  audio: audioMixContractSchema.nullable(),
});

export const directorV2OperationSchema = z.discriminatedUnion('op', [
  insertSceneOpSchema,
  removeSceneOpSchema,
  moveSceneOpSchema,
  updateDurationOpSchema,
  updateTransitionOpSchema,
  updateCropOpSchema,
  updateTextOpSchema,
  assignChapterOpSchema,
  updateMetadataOpSchema,
  updateAssetOpSchema,
  setAspectOpSchema,
  audioTrackAddOpSchema,
  audioTrackRemoveOpSchema,
  audioTrackUpdateOpSchema,
  audioClipAddOpSchema,
  audioClipRemoveOpSchema,
  audioClipUpdateOpSchema,
  audioDuckingSetOpSchema,
  audioDuckingRegionsSetOpSchema,
  audioMasterProfileOpSchema,
  audioNarrationTakeSelectOpSchema,
  audioSubtitleTrackAttachOpSchema,
  audioSubtitleTrackDetachOpSchema,
  audioMixReplaceOpSchema,
]);
export type DirectorV2Operation = z.infer<typeof directorV2OperationSchema>;

export const directorPatchPreconditionSchema = z.object({
  kind: z.enum(['timeline_hash', 'timeline_version', 'story_plan_hash', 'approval_id']),
  value: z.string().min(1).max(80),
});

export const directorV2PatchSchema = z.object({
  schemaVersion: z.literal(DIRECTOR_V2_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  version: z.number().int().nonnegative().default(0),
  tributePublicId: z.string().min(1).max(80),
  planId: z.string().min(1).max(80),
  briefId: z.string().min(1).max(80),
  baseTimelineVersion: z.number().int().nonnegative(),
  baseTimelineHash: z.string().min(8).max(64),
  expectedTimelineHash: z.string().min(8).max(64),
  expectedDurationFrames: z.number().int().positive(),
  operations: z.array(directorV2OperationSchema).min(1).max(480),
  inverseOperations: z.array(directorV2OperationSchema).min(1).max(480),
  preconditions: z.array(directorPatchPreconditionSchema).max(8),
  touchedSceneIds: z.array(z.string().min(1).max(80)).max(240),
  touchedAssetIds: z.array(z.string().min(1).max(80)).max(200),
  preservedLocks: z.array(directorLockSchema).max(80).default([]),
  validationStatus: z.enum(['valid', 'invalid']),
  previewStatus: z.enum(['none', 'ready']).default('none'),
  applyStatus: z.enum(PATCH_APPLY_STATUSES).default('none'),
  scope: z.enum(['full', 'chapter']).default('full'),
  chapterId: z.string().max(80).optional(),
  idempotencyKey: z.string().min(1).max(160),
  provenance: directorV2ProvenanceSchema,
  createdAt: z.string().datetime(),
  previewedAt: z.string().datetime().optional(),
  appliedAt: z.string().datetime().optional(),
  revertedAt: z.string().datetime().optional(),
});
export type DirectorV2Patch = z.infer<typeof directorV2PatchSchema>;

export const directorPatchPreviewSchema = z.object({
  patch: directorV2PatchSchema,
  plan: directorV2PlanSchema,
  beforeDurationFrames: z.number().int().nonnegative(),
  afterDurationFrames: z.number().int().positive(),
  selectedAssetIds: z.array(z.string()),
  omittedAssetIds: z.array(z.string()),
  protectedSceneIds: z.array(z.string()),
  changeTimeline: z.literal(false),
});
export type DirectorPatchPreview = z.infer<typeof directorPatchPreviewSchema>;
