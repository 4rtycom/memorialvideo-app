import { z } from 'zod';

import { audioMixContractSchema } from './audio';
import { launchLanguageSchema } from './locale';

export const TIMELINE_SCHEMA_VERSION = 1 as const;
export const DEFAULT_FPS = 30 as const;
export const DEFAULT_WIDTH = 1920 as const;
export const DEFAULT_HEIGHT = 1080 as const;

export const THEME_KEYS = [
  'timeless',
  'warm_light',
  'cinematic_dark',
  'family_album',
  'simple_contemporary',
] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];

export const OUTPUT_ASPECTS = ['16:9', '9:16', '1:1'] as const;
export type OutputAspect = (typeof OUTPUT_ASPECTS)[number];

export function dimensionsForAspect(aspect: OutputAspect): {
  width: 1920 | 1080;
  height: 1080 | 1920;
} {
  if (aspect === '9:16') {
    return { width: 1080, height: 1920 };
  }
  if (aspect === '1:1') {
    return { width: 1080, height: 1080 };
  }
  return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
}

export const SCENE_TYPES = ['intro', 'chapter', 'image', 'video', 'quote', 'outro'] as const;
export type SceneType = (typeof SCENE_TYPES)[number];

export const TRANSITIONS = ['none', 'fade', 'dissolve'] as const;
export type Transition = (typeof TRANSITIONS)[number];

export const IMAGE_MIN_FRAMES = 60;
export const IMAGE_MAX_FRAMES = 240;
export const IMAGE_DEFAULT_FRAMES = 120;
export const TITLE_DEFAULT_FRAMES = 90;
export const CHAPTER_DEFAULT_FRAMES = 75;
export const QUOTE_DEFAULT_FRAMES = 90;
export const OUTRO_DEFAULT_FRAMES = 90;
export const VIDEO_MAX_FRAMES = 30 * 60;
export const TIMELINE_MAX_FRAMES = 30 * 60 * 30;

export const cropSchema = z.object({
  focalX: z.number().min(0).max(1),
  focalY: z.number().min(0).max(1),
  zoom: z.number().min(1).max(3).default(1),
});

export type Crop = z.infer<typeof cropSchema>;

export const assetRefSchema = z.object({
  assetId: z.string().min(1).max(80),
  src: z.string().min(1).max(400),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationFrames: z.number().int().positive().optional(),
  checksum: z.string().min(8).max(128).optional(),
  enhancementVariantId: z.string().min(1).max(80).optional(),
  /** Bound Memorial Finish job (film-approved); media bytes stay original until derived variant exists. */
  finishJobId: z.string().min(1).max(80).optional(),
});

export type AssetRef = z.infer<typeof assetRefSchema>;

const sceneBaseSchema = z.object({
  id: z.string().min(1).max(80),
  durationFrames: z.number().int().positive().max(VIDEO_MAX_FRAMES),
  transitionIn: z.enum(TRANSITIONS).default('fade'),
  transitionOut: z.enum(TRANSITIONS).default('fade'),
});

export const introSceneSchema = sceneBaseSchema.extend({
  type: z.literal('intro'),
  displayName: z.string().min(1).max(200),
  lifeSpanLabel: z.string().max(80).optional(),
});

export const chapterSceneSchema = sceneBaseSchema.extend({
  type: z.literal('chapter'),
  title: z.string().min(1).max(80),
});

export const imageSceneSchema = sceneBaseSchema.extend({
  type: z.literal('image'),
  asset: assetRefSchema,
  caption: z.string().max(180).optional(),
  crop: cropSchema.optional(),
});

export const videoSceneSchema = sceneBaseSchema.extend({
  type: z.literal('video'),
  asset: assetRefSchema,
  caption: z.string().max(180).optional(),
});

export const quoteSceneSchema = sceneBaseSchema.extend({
  type: z.literal('quote'),
  text: z.string().min(1).max(280),
  attribution: z.string().max(80).optional(),
});

export const outroSceneSchema = sceneBaseSchema.extend({
  type: z.literal('outro'),
  closingLine: z.string().min(1).max(160),
});

export const sceneSchema = z.discriminatedUnion('type', [
  introSceneSchema,
  chapterSceneSchema,
  imageSceneSchema,
  videoSceneSchema,
  quoteSceneSchema,
  outroSceneSchema,
]);

export type TimelineScene = z.infer<typeof sceneSchema>;

export const musicCueSchema = z.object({
  trackId: z.string().min(1).max(80),
  src: z.string().min(1).max(400),
  fadeInFrames: z.number().int().nonnegative().max(120).default(30),
  fadeOutFrames: z.number().int().nonnegative().max(120).default(45),
});

export type MusicCue = z.infer<typeof musicCueSchema>;

export const timelineContractSchema = z
  .object({
    schemaVersion: z.literal(TIMELINE_SCHEMA_VERSION),
    fps: z.literal(DEFAULT_FPS),
    width: z.union([z.literal(1920), z.literal(1080)]),
    height: z.union([z.literal(1080), z.literal(1920)]),
    seed: z.number().int().nonnegative(),
    locale: launchLanguageSchema,
    themeKey: z.enum(THEME_KEYS),
    /** Exact FilmStyleManifest version used when this film version was arranged (see film-style.ts). */
    styleManifestVersion: z.literal(1).optional(),
    watermark: z.boolean(),
    displayName: z.string().min(1).max(200),
    scenes: z.array(sceneSchema).min(1).max(240),
    music: musicCueSchema.optional(),
    /** Canonical multitrack mix; preview and render share this section. */
    audio: audioMixContractSchema.optional(),
  })
  .superRefine((timeline, ctx) => {
    const allowed =
      (timeline.width === 1920 && timeline.height === 1080) ||
      (timeline.width === 1080 && timeline.height === 1920) ||
      (timeline.width === 1080 && timeline.height === 1080);
    if (!allowed) {
      ctx.addIssue({
        code: 'custom',
        message: 'Output must be 1920×1080, 1080×1920, or 1080×1080',
        path: ['width'],
      });
    }
    const total = timeline.scenes.reduce((sum, scene) => sum + scene.durationFrames, 0);
    if (total > TIMELINE_MAX_FRAMES) {
      ctx.addIssue({
        code: 'custom',
        message: 'Timeline exceeds the 30 minute beta maximum',
        path: ['scenes'],
      });
    }

    const ids = new Set<string>();
    for (const [index, scene] of timeline.scenes.entries()) {
      if (ids.has(scene.id)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Scene ids must be unique',
          path: ['scenes', index, 'id'],
        });
      }
      ids.add(scene.id);

      if (scene.type === 'image') {
        if (scene.durationFrames < IMAGE_MIN_FRAMES || scene.durationFrames > IMAGE_MAX_FRAMES) {
          ctx.addIssue({
            code: 'custom',
            message: `Image scenes must be ${IMAGE_MIN_FRAMES}-${IMAGE_MAX_FRAMES} frames`,
            path: ['scenes', index, 'durationFrames'],
          });
        }
      }
    }
  });

export type TimelineContract = z.infer<typeof timelineContractSchema>;

export function parseTimelineContract(input: unknown): TimelineContract {
  return timelineContractSchema.parse(input);
}

export function totalDurationFrames(timeline: TimelineContract): number {
  return timeline.scenes.reduce((sum, scene) => sum + scene.durationFrames, 0);
}

export function framesToSeconds(frames: number, fps: number = DEFAULT_FPS): number {
  return frames / fps;
}

export function secondsToFrames(seconds: number, fps: number = DEFAULT_FPS): number {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error('seconds must be a finite non-negative number');
  }
  return Math.round(seconds * fps);
}

export function sceneStartFrames(timeline: TimelineContract): ReadonlyArray<number> {
  const starts: number[] = [];
  let cursor = 0;
  for (const scene of timeline.scenes) {
    starts.push(cursor);
    cursor += scene.durationFrames;
  }
  return starts;
}

export function sceneStartFrame(timeline: TimelineContract, sceneId: string): number {
  const index = timeline.scenes.findIndex((scene) => scene.id === sceneId);
  if (index < 0) {
    return 0;
  }
  return sceneStartFrames(timeline)[index] ?? 0;
}

export function sceneIdAtFrame(timeline: TimelineContract, frame: number): string | undefined {
  const starts = sceneStartFrames(timeline);
  const clamped = Math.max(0, Math.floor(frame));
  let found = timeline.scenes[0]?.id;
  for (let index = 0; index < timeline.scenes.length; index += 1) {
    const start = starts[index] ?? 0;
    const scene = timeline.scenes[index];
    if (!scene) {
      continue;
    }
    if (clamped >= start) {
      found = scene.id;
    }
  }
  return found;
}

export function formatTimelineClock(frames: number, fps: number = DEFAULT_FPS): string {
  const totalSeconds = Math.max(0, Math.floor(frames / fps));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes)}:${String(seconds).padStart(2, '0')}`;
}
