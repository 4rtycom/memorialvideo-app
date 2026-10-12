import {
  launchLanguageSchema,
  OUTPUT_ASPECTS,
  parseTimelineContract,
  THEME_KEYS,
  type LaunchLanguage,
  type TimelineContract,
} from '@memorialvideo/contracts';
import { STORAGE_VARIANT_PREFIX } from './render-worker';
import { z } from 'zod';

export const UNPAID_RETENTION_DAYS = 30;

export const COMMON_TIMEZONES = [
  'Europe/Amsterdam',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/London',
  'Europe/Warsaw',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Lisbon',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'UTC',
] as const;

export const storyItemSchema = z.object({
  assetId: z.string().min(8).max(80),
  kind: z.enum(['image', 'video']),
  caption: z.string().max(180).optional().default(''),
  durationSeconds: z.number().min(2).max(8).optional().default(4),
  focalX: z.number().min(0).max(1).optional().default(0.5),
  focalY: z.number().min(0).max(1).optional().default(0.5),
  zoom: z.number().min(1).max(3).optional().default(1),
  transitionIn: z.enum(['none', 'fade', 'dissolve']).optional().default('dissolve'),
});

export type StoryItem = z.infer<typeof storyItemSchema>;

export const projectDraftSchema = z.object({
  displayName: z.string().trim().min(1).max(160),
  lifeSpanLabel: z.string().max(80).optional().default(''),
  openingLine: z.string().max(280).optional().default(''),
  chapterTitle: z.string().max(120).optional().default(''),
  chapters: z.array(z.string().max(80)).max(8).optional().default([]),
  relationship: z.string().max(80).optional().default(''),
  ceremonyDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal(''))
    .default(''),
  ceremonyTimezone: z.string().max(64).optional().default('Europe/Amsterdam'),
  themeKey: z.enum(THEME_KEYS).default('timeless'),
  aspect: z.enum(OUTPUT_ASPECTS).default('16:9'),
  music: z.enum(['none', 'placeholder', 'uploaded']).default('none'),
  musicRightsAccepted: z.boolean().optional().default(false),
  desk: z.enum(['guided', 'studio']).optional().default('guided'),
  locale: launchLanguageSchema.default('en'),
  consentVersion: z.string().max(32).optional(),
  step: z
    .enum(['details', 'memories', 'story', 'style', 'music', 'preview', 'delivery', 'library', 'life', 'director'])
    .optional(),
  storyItems: z.array(storyItemSchema).max(200).optional().default([]),
  directorBefore: z
    .object({
      chapterTitle: z.string().max(120),
      chapters: z.array(z.string().max(80)).max(8),
      music: z.enum(['none', 'placeholder', 'uploaded']),
      files: z
        .array(
          z.object({
            localId: z.string().max(80),
            assetId: z.string().max(80).optional(),
            durationSeconds: z.number().min(2).max(8).optional(),
            transitionIn: z.enum(['none', 'fade', 'dissolve']).optional(),
          }),
        )
        .max(200),
    })
    .optional(),
  directorRun: z
    .object({
      id: z.string().max(80),
      action: z.literal('first_cut'),
      reasons: z.array(z.string().max(40)).max(16),
      appliedAt: z.string().max(40),
    })
    .optional(),
  firstFilmStage: z
    .enum([
      'idle',
      'preparing_memories',
      'building_story',
      'arranging_film',
      'finishing',
      'ready_to_review',
      'blocked',
    ])
    .optional()
    .default('idle'),
  timeline: z
    .custom<TimelineContract>((value) => {
      try {
        parseTimelineContract(value);
        return true;
      } catch {
        return false;
      }
    })
    .optional(),
});

export type ProjectDraftInput = z.infer<typeof projectDraftSchema>;

export function createProjectPublicId(random: () => string = () => crypto.randomUUID()): string {
  return `mv_${random().replace(/-/g, '').slice(0, 16)}`;
}

export function unpaidRetentionDeadline(from: Date = new Date()): Date {
  return new Date(from.getTime() + UNPAID_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

export function canReenterProject(lifecycleStatus: string): boolean {
  return lifecycleStatus !== 'DELETED' && lifecycleStatus !== 'DELETION_PENDING';
}

export function parseProjectDraft(input: unknown): ProjectDraftInput {
  return projectDraftSchema.parse(input);
}

export function isStaleWrite(clientUpdatedAt: string | undefined, serverUpdatedAt: string): boolean {
  if (!clientUpdatedAt) {
    return false;
  }
  return new Date(clientUpdatedAt).getTime() !== new Date(serverUpdatedAt).getTime();
}

export function defaultProfile(locale: LaunchLanguage = 'en'): { locale: LaunchLanguage; timezone: string } {
  return { locale, timezone: 'Europe/Amsterdam' };
}

export function ceremonyAtFromDraft(draft: ProjectDraftInput): string | null {
  if (!draft.ceremonyDate) {
    return null;
  }
  return `${draft.ceremonyDate}T12:00:00.000Z`;
}

export const OWNER_TRIBUTE_LIST_LIMIT = 40;

export function isProjectPublicId(value: string): boolean {
  return /^mv_[a-f0-9]{16}$/i.test(value);
}

export type OwnerTributeSummary = {
  publicId: string;
  displayName: string;
  updatedAt: string;
  themeKey: ProjectDraftInput['themeKey'];
  desk: NonNullable<ProjectDraftInput['desk']>;
  scheduledDeleteAt: string | null;
  renderState: 'none' | 'queued' | 'processing' | 'ready' | 'failed';
  hasPoster: boolean;
  latestJobId: string | null;
};

export function summarizeOwnerTribute(input: {
  publicId: string;
  displayName: string;
  updatedAt: string;
  draft: ProjectDraftInput;
  scheduledDeleteAt: string | null;
  renderStatus?: string | null;
  hasPoster?: boolean;
  latestJobId?: string | null;
}): OwnerTributeSummary {
  return {
    publicId: input.publicId,
    displayName: input.displayName.trim().slice(0, 160),
    updatedAt: input.updatedAt,
    themeKey: input.draft.themeKey,
    desk: input.draft.desk ?? 'guided',
    scheduledDeleteAt: input.scheduledDeleteAt,
    renderState: summarizeRenderState(input.renderStatus),
    hasPoster: Boolean(input.hasPoster),
    latestJobId: input.latestJobId ?? null,
  };
}

export function mediaSceneCount(timeline: TimelineContract | undefined): number {
  return timeline?.scenes.filter((scene) => scene.type === 'image' || scene.type === 'video').length ?? 0;
}

export function isEphemeralTimelineSrc(src: string): boolean {
  return src.startsWith('data:') || src.startsWith('blob:');
}

export function rewriteDraftTimelineSrcs(
  timeline: TimelineContract,
  variants: ReadonlyArray<{ assetId: string; variantKey: string }>,
): TimelineContract {
  const byId = new Map(variants.map((row) => [row.assetId, row.variantKey]));
  return parseTimelineContract({
    ...timeline,
    scenes: timeline.scenes.map((scene) => {
      if (scene.type !== 'image' && scene.type !== 'video') {
        return scene;
      }
      const key = byId.get(scene.asset.assetId);
      if (!key) {
        return scene;
      }
      return {
        ...scene,
        asset: { ...scene.asset, src: `${STORAGE_VARIANT_PREFIX}${key}` },
      };
    }),
  });
}

export function mergeStoredProjectDraft(
  existing: ProjectDraftInput,
  incoming: ProjectDraftInput,
): ProjectDraftInput {
  if (!incoming.timeline && existing.timeline) {
    return { ...incoming, timeline: existing.timeline };
  }
  if (incoming.timeline && existing.timeline && mediaSceneCount(incoming.timeline) === 0 && mediaSceneCount(existing.timeline) > 0) {
    return { ...incoming, timeline: existing.timeline };
  }
  if (incoming.timeline && existing.timeline) {
    return { ...incoming, timeline: preserveStableSceneSrcs(existing.timeline, incoming.timeline) };
  }
  return incoming;
}

function preserveStableSceneSrcs(existing: TimelineContract, incoming: TimelineContract): TimelineContract {
  const byAsset = new Map<string, string>();
  for (const scene of existing.scenes) {
    if ((scene.type === 'image' || scene.type === 'video') && !isEphemeralTimelineSrc(scene.asset.src)) {
      byAsset.set(scene.asset.assetId, scene.asset.src);
    }
  }
  return parseTimelineContract({
    ...incoming,
    scenes: incoming.scenes.map((scene) => {
      if (scene.type !== 'image' && scene.type !== 'video') {
        return scene;
      }
      const stable = byAsset.get(scene.asset.assetId);
      if (stable && isEphemeralTimelineSrc(scene.asset.src)) {
        return { ...scene, asset: { ...scene.asset, src: stable } };
      }
      return scene;
    }),
  });
}

export function canOwnerAccessTribute(input: {
  actorUserId: string | null;
  ownerUserId: string;
  lifecycleStatus: string;
}): boolean {
  if (!input.actorUserId || input.actorUserId !== input.ownerUserId) {
    return false;
  }
  return canReenterProject(input.lifecycleStatus);
}

export function planOwnerResourceAccess(input: {
  actorUserId: string | null;
  ownerUserId: string;
  lifecycleStatus: string;
}): 'unauthorized' | 'not_found' | 'ok' {
  if (!input.actorUserId) {
    return 'unauthorized';
  }
  return canOwnerAccessTribute(input) ? 'ok' : 'not_found';
}

export function summarizeRenderState(
  status: string | null | undefined,
): OwnerTributeSummary['renderState'] {
  if (status === 'READY') {
    return 'ready';
  }
  if (status === 'QUEUED') {
    return 'queued';
  }
  if (status === 'PREPARING' || status === 'RENDERING' || status === 'VERIFYING') {
    return 'processing';
  }
  if (status === 'FAILED_RETRYABLE' || status === 'FAILED_FINAL' || status === 'CANCELED') {
    return 'failed';
  }
  return 'none';
}
