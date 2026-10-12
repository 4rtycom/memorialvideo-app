import { z } from 'zod';

import { DATE_PRECISIONS } from './memory-context';
import { INTELLIGENCE_CONTRACT_VERSION } from './intelligence';

export const STORY_FACT_CATEGORIES = [
  'life_date',
  'place',
  'milestone',
  'education',
  'work',
  'relationship',
  'family',
  'interest',
  'achievement',
  'tradition',
  'quote',
  'characteristic',
  'other',
] as const;
export type StoryFactCategory = (typeof STORY_FACT_CATEGORIES)[number];

/**
 * Product-facing life-fact types (Prompt 08). Map onto persisted categories —
 * never invent facts; families confirm before StoryPlan uses them.
 */
export const LIFE_FACT_TYPES = [
  'birth',
  'childhood',
  'education',
  'relationship',
  'marriage',
  'children',
  'family',
  'career',
  'home',
  'travel',
  'hobbies',
  'friendship',
  'milestone',
  'celebration',
  'legacy',
  'other',
] as const;
export type LifeFactType = (typeof LIFE_FACT_TYPES)[number];

export const LIFE_FACT_TYPE_TO_CATEGORY: Record<LifeFactType, StoryFactCategory> = {
  birth: 'life_date',
  childhood: 'milestone',
  education: 'education',
  relationship: 'relationship',
  marriage: 'relationship',
  children: 'family',
  family: 'family',
  career: 'work',
  home: 'place',
  travel: 'interest',
  hobbies: 'interest',
  friendship: 'relationship',
  milestone: 'milestone',
  celebration: 'tradition',
  legacy: 'achievement',
  other: 'other',
};

export function categoryForLifeFactType(type: LifeFactType): StoryFactCategory {
  return LIFE_FACT_TYPE_TO_CATEGORY[type];
}

export const NARRATIVE_MODES = [
  'chronological',
  'thematic',
  'cinematic',
  'celebration_of_life',
] as const;
export type NarrativeMode = (typeof NARRATIVE_MODES)[number];

export const STORY_FACT_ORIGINS = [
  'family_supplied',
  'family_confirmed',
  'file_metadata_candidate',
  'machine_suggestion',
] as const;
export type StoryFactOrigin = (typeof STORY_FACT_ORIGINS)[number];

export const STORY_FACT_REVIEW_STATES = [
  'proposed',
  'confirmed',
  'disputed',
  'rejected',
  'superseded',
] as const;
export type StoryFactReviewState = (typeof STORY_FACT_REVIEW_STATES)[number];

export const STORY_CONFLICT_KINDS = [
  'incompatible_dates',
  'different_places',
  'name_variants',
  'relationship',
  'milestone',
  'metadata_discrepancy',
] as const;
export type StoryConflictKind = (typeof STORY_CONFLICT_KINDS)[number];

export const STORY_CONFLICT_STATES = [
  'open',
  'needs_input',
  'resolved',
  'preserved',
  'dismissed',
] as const;
export type StoryConflictState = (typeof STORY_CONFLICT_STATES)[number];

export const STORY_CONFLICT_RESOLUTIONS = [
  'confirm_one',
  'supply_corrected',
  'keep_both',
  'mark_uncertain',
  'dismiss',
  'leave_unresolved',
] as const;
export type StoryConflictResolution = (typeof STORY_CONFLICT_RESOLUTIONS)[number];

export const STORY_QUESTION_KINDS = [
  'when',
  'where',
  'what',
  'why',
  'chapter',
  'who_confirmed',
  'wording',
  'conflict',
] as const;
export type StoryQuestionKind = (typeof STORY_QUESTION_KINDS)[number];

export const STORY_QUESTION_STATES = [
  'open',
  'answered',
  'skipped',
  'dismissed',
  'not_applicable',
] as const;
export type StoryQuestionState = (typeof STORY_QUESTION_STATES)[number];

export const STORY_CHAPTER_REVIEW_STATES = ['proposed', 'accepted', 'dismissed', 'developing'] as const;
export type StoryChapterReviewState = (typeof STORY_CHAPTER_REVIEW_STATES)[number];

export const STORY_CHAPTER_KINDS = [
  'childhood',
  'family',
  'friendships',
  'work',
  'passions',
  'milestones',
  'legacy',
  'custom',
] as const;
export type StoryChapterKind = (typeof STORY_CHAPTER_KINDS)[number];

export const CHRONOLOGY_REASONS = [
  'family_confirmed_date',
  'family_supplied_date',
  'accepted_candidate',
  'unreviewed_candidate',
  'unknown',
  'family_order',
] as const;
export type ChronologyReason = (typeof CHRONOLOGY_REASONS)[number];

export const lifeStoryFactSchema = z.object({
  schemaVersion: z.literal(INTELLIGENCE_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  category: z.enum(STORY_FACT_CATEGORIES),
  subject: z.string().max(120).optional().default(''),
  displayWording: z.string().min(1).max(400),
  value: z.string().max(200).optional().default(''),
  dateValue: z.string().max(40).optional().default(''),
  dateEnd: z.string().max(40).optional().default(''),
  datePrecision: z.enum(DATE_PRECISIONS).default('unknown'),
  placeLabel: z.string().max(120).optional().default(''),
  quoteSource: z.string().max(120).optional().default(''),
  assetIds: z.array(z.string().min(1).max(80)).max(24).default([]),
  /** Opaque contributor public ids — provenance only; never invent facts from these alone. */
  contributorIds: z.array(z.string().min(1).max(80)).max(24).default([]),
  origin: z.enum(STORY_FACT_ORIGINS),
  reviewState: z.enum(STORY_FACT_REVIEW_STATES).default('proposed'),
  confidence: z.number().min(0).max(1).optional(),
  sourceRefs: z.array(z.string().min(1).max(80)).max(8).default([]),
  version: z.number().int().nonnegative().default(0),
});
export type LifeStoryFact = z.infer<typeof lifeStoryFactSchema>;

export const lifeStoryFactPatchSchema = lifeStoryFactSchema
  .omit({ schemaVersion: true, id: true })
  .partial()
  .extend({
    id: z.string().max(80).optional(),
    expectedVersion: z.number().int().nonnegative().optional().default(0),
    displayWording: z.string().min(1).max(400).optional(),
    category: z.enum(STORY_FACT_CATEGORIES).optional(),
    origin: z.enum(STORY_FACT_ORIGINS).optional(),
  });
export type LifeStoryFactPatch = z.infer<typeof lifeStoryFactPatchSchema>;

export const lifeStoryConflictSchema = z.object({
  schemaVersion: z.literal(INTELLIGENCE_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  kind: z.enum(STORY_CONFLICT_KINDS),
  factIds: z.array(z.string().min(1).max(80)).min(1).max(8),
  assetIds: z.array(z.string().min(1).max(80)).max(8).default([]),
  state: z.enum(STORY_CONFLICT_STATES).default('open'),
  resolution: z.enum(STORY_CONFLICT_RESOLUTIONS).optional(),
  winnerFactId: z.string().max(80).optional(),
  familyDisagreement: z.boolean().default(false),
  version: z.number().int().nonnegative().default(0),
});
export type LifeStoryConflict = z.infer<typeof lifeStoryConflictSchema>;

export const lifeStoryConflictPatchSchema = z.object({
  id: z.string().min(1).max(80),
  expectedVersion: z.number().int().nonnegative(),
  state: z.enum(STORY_CONFLICT_STATES).optional(),
  resolution: z.enum(STORY_CONFLICT_RESOLUTIONS).optional(),
  winnerFactId: z.string().max(80).optional(),
});
export type LifeStoryConflictPatch = z.infer<typeof lifeStoryConflictPatchSchema>;

export const lifeStoryQuestionSchema = z.object({
  schemaVersion: z.literal(INTELLIGENCE_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  kind: z.enum(STORY_QUESTION_KINDS),
  assetId: z.string().max(80).optional(),
  factId: z.string().max(80).optional(),
  conflictId: z.string().max(80).optional(),
  state: z.enum(STORY_QUESTION_STATES).default('open'),
  answerPreview: z.string().max(400).optional().default(''),
  version: z.number().int().nonnegative().default(0),
});
export type LifeStoryQuestion = z.infer<typeof lifeStoryQuestionSchema>;

export const lifeStoryQuestionPatchSchema = z.object({
  id: z.string().min(1).max(80),
  expectedVersion: z.number().int().nonnegative(),
  state: z.enum(STORY_QUESTION_STATES),
  answerPreview: z.string().max(400).optional(),
});
export type LifeStoryQuestionPatch = z.infer<typeof lifeStoryQuestionPatchSchema>;

export const lifeStoryChapterSchema = z.object({
  schemaVersion: z.literal(INTELLIGENCE_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  description: z.string().max(400).optional().default(''),
  kind: z.enum(STORY_CHAPTER_KINDS).default('custom'),
  sortOrder: z.number().int().nonnegative().default(0),
  assetIds: z.array(z.string().min(1).max(80)).max(48).default([]),
  factIds: z.array(z.string().min(1).max(80)).max(24).default([]),
  suggested: z.boolean().default(false),
  suggestionReason: z.string().max(80).optional().default(''),
  developing: z.boolean().default(true),
  reviewState: z.enum(STORY_CHAPTER_REVIEW_STATES).default('developing'),
  origin: z.enum(['family_created', 'system_suggested']).default('family_created'),
  version: z.number().int().nonnegative().default(0),
});
export type LifeStoryChapter = z.infer<typeof lifeStoryChapterSchema>;

export const lifeStoryChapterPatchSchema = lifeStoryChapterSchema
  .omit({ schemaVersion: true, id: true })
  .partial()
  .extend({
    id: z.string().max(80).optional(),
    expectedVersion: z.number().int().nonnegative().optional().default(0),
    title: z.string().min(1).max(120).optional(),
  });
export type LifeStoryChapterPatch = z.infer<typeof lifeStoryChapterPatchSchema>;

export const chronologyItemSchema = z.object({
  assetId: z.string().min(1).max(80),
  sortKey: z.string().max(40),
  precision: z.enum(DATE_PRECISIONS),
  displayDate: z.string().max(40),
  reason: z.enum(CHRONOLOGY_REASONS),
  unknown: z.boolean(),
  linkedDuplicate: z.boolean().default(false),
  familyOrder: z.number().int().optional(),
});
export type ChronologyItem = z.infer<typeof chronologyItemSchema>;

export const storyPlanSchema = z.object({
  schemaVersion: z.literal(INTELLIGENCE_CONTRACT_VERSION),
  title: z.string().max(200).optional().default(''),
  narrativeMode: z.enum(NARRATIVE_MODES).default('chronological'),
  chapters: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      purpose: z.string().max(400).optional().default(''),
      assetIds: z.array(z.string()),
      factIds: z.array(z.string()),
    }),
  ),
  recommendations: z
    .array(
      z.object({
        code: z.string().min(1).max(80),
        message: z.string().min(1).max(240),
      }),
    )
    .max(24)
    .default([]),
  confirmedFactIds: z.array(z.string()),
  approvedExcerptIds: z.array(z.string()).default([]),
  approvedPersonIds: z.array(z.string()).default([]),
  unresolvedConflictIds: z.array(z.string()),
  openQuestionIds: z.array(z.string()),
  warnings: z.array(z.enum(['disputed_fact', 'empty_chapter', 'unconfirmed_text', 'blocking_conflict'])),
  ready: z.boolean(),
  changeTimeline: z.literal(false),
});
export type StoryPlan = z.infer<typeof storyPlanSchema>;
