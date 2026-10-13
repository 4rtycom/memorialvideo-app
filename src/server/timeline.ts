import {
  DEFAULT_FPS,
  IMAGE_DEFAULT_FRAMES,
  TITLE_DEFAULT_FRAMES,
  CHAPTER_DEFAULT_FRAMES,
  OUTRO_DEFAULT_FRAMES,
  VIDEO_MAX_FRAMES,
  parseTimelineContract,
  secondsToFrames,
  totalDurationFrames,
  formatTimelineClock,
  type TimelineContract,
  type ThemeKey,
} from '@memorialvideo/contracts';
import { isVideoMemory } from './ingest';
import { lifeSpanLabel } from './tribute-helpers';

/** Beta short-video cap (matches packages/media MAX_VIDEO_DURATION_MS). */
const CREATOR_MAX_VIDEO_DURATION_MS = 30_000;

export type TimelineTributeInput = {
  publicId: string;
  displayName: string;
  bornLabel: string;
  rememberedLabel: string;
  themeKey: 'timeless' | 'joyful' | 'peaceful';
  openingTitle?: string;
  soundtrackTrackId?: string | null;
  musicRightsConfirmed?: boolean;
  locale?: 'en' | 'nl' | 'de' | 'fr' | 'es' | 'pt' | 'it' | 'pl';
  entitlement: { packageKey: string } | null;
  memories: Array<{
    id: string;
    title: string;
    imagePath: string;
    ingestStatus: string;
    contentType?: string;
    durationMs?: number;
    originalFilenameHint?: string;
  }>;
};

/** Frame length for a short video memory — probed duration when known, else photo default. */
export function videoMemoryDurationFrames(durationMs?: number): number {
  if (typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs > 0) {
    const cappedMs = Math.min(durationMs, CREATOR_MAX_VIDEO_DURATION_MS);
    const frames = secondsToFrames(cappedMs / 1000, DEFAULT_FPS);
    return Math.min(VIDEO_MAX_FRAMES, Math.max(15, frames));
  }
  return IMAGE_DEFAULT_FRAMES;
}

const CREATOR_THEME_TO_CONTRACT: Record<TimelineTributeInput['themeKey'], ThemeKey> = {
  timeless: 'timeless',
  joyful: 'warm_light',
  peaceful: 'family_album',
};

/**
 * Build a validated TimelineContract from ready memories.
 * Seed is derived from tribute id (stable; no Math.random during play/render).
 */
export function buildTimelineFromTribute(tribute: TimelineTributeInput): TimelineContract | null {
  const ready = tribute.memories.filter((m) => m.ingestStatus === 'READY');
  if (ready.length === 0) {
    return null;
  }

  const seed = Number.parseInt(tribute.publicId.replace(/[^0-9a-f]/gi, '').slice(0, 8), 16) || 1;
  const span = lifeSpanLabel(tribute);
  const introTitle = tribute.openingTitle?.trim() || tribute.displayName;

  const scenes: TimelineContract['scenes'] = [
    {
      id: 'intro',
      type: 'intro',
      durationFrames: TITLE_DEFAULT_FRAMES,
      displayName: introTitle,
      lifeSpanLabel: span || undefined,
      transitionIn: 'fade',
      transitionOut: 'fade',
    },
    {
      id: 'chapter-1',
      type: 'chapter',
      durationFrames: CHAPTER_DEFAULT_FRAMES,
      title: 'Cherished moments',
      transitionIn: 'fade',
      transitionOut: 'dissolve',
    },
  ];

  for (const [index, memory] of ready.entries()) {
    if ((memory.contentType ?? '').startsWith('audio/')) {
      continue;
    }
    const caption = memory.title.slice(0, 180);
    const transitionIn = index === 0 ? 'dissolve' : 'fade';
    if (
      isVideoMemory({
        contentType: memory.contentType,
        originalFilenameHint: memory.originalFilenameHint,
      })
    ) {
      scenes.push({
        id: `video-${memory.id}`,
        type: 'video',
        durationFrames: videoMemoryDurationFrames(memory.durationMs),
        asset: {
          assetId: memory.id,
          src: memory.imagePath,
        },
        caption,
        transitionIn,
        transitionOut: 'fade',
      });
      continue;
    }
    scenes.push({
      id: `image-${memory.id}`,
      type: 'image',
      durationFrames: IMAGE_DEFAULT_FRAMES,
      asset: {
        assetId: memory.id,
        src: memory.imagePath,
      },
      caption,
      transitionIn,
      transitionOut: 'fade',
      crop: { focalX: 0.5, focalY: 0.5, zoom: 1 },
    });
  }

  scenes.push({
    id: 'outro',
    type: 'outro',
    durationFrames: OUTRO_DEFAULT_FRAMES,
    closingLine: 'Always remembered.',
    transitionIn: 'fade',
    transitionOut: 'none',
  });

  const music =
    tribute.soundtrackTrackId && tribute.musicRightsConfirmed
      ? {
          trackId: tribute.soundtrackTrackId,
          // Local development bed — Remotion encode rewrites/publishes real bytes when rendering.
          src: 'creator-assets/bed.wav',
          fadeInFrames: 30,
          fadeOutFrames: 45,
        }
      : undefined;

  return parseTimelineContract({
    schemaVersion: 1,
    fps: 30,
    width: 1920,
    height: 1080,
    seed,
    locale: tribute.locale ?? 'en',
    themeKey: CREATOR_THEME_TO_CONTRACT[tribute.themeKey],
    styleManifestVersion: 1,
    watermark: !tribute.entitlement,
    displayName: tribute.displayName,
    scenes,
    music,
  });
}

/**
 * Apply persisted film choices onto an existing TimelineContract without rearranging scenes.
 */
export function applyFilmChoicesToTimeline(
  timeline: TimelineContract,
  tribute: Pick<
    TimelineTributeInput,
    'themeKey' | 'openingTitle' | 'displayName' | 'soundtrackTrackId' | 'musicRightsConfirmed' | 'locale' | 'entitlement'
  >,
): TimelineContract {
  const introTitle = tribute.openingTitle?.trim() || tribute.displayName;
  const scenes = timeline.scenes.map((scene) => {
    if (scene.type === 'intro') {
      return { ...scene, displayName: introTitle };
    }
    return scene;
  });
  const music =
    tribute.soundtrackTrackId && tribute.musicRightsConfirmed
      ? {
          trackId: tribute.soundtrackTrackId,
          src: timeline.music?.src ?? 'creator-assets/bed.wav',
          fadeInFrames: timeline.music?.fadeInFrames ?? 30,
          fadeOutFrames: timeline.music?.fadeOutFrames ?? 45,
        }
      : undefined;
  return parseTimelineContract({
    ...timeline,
    themeKey: CREATOR_THEME_TO_CONTRACT[tribute.themeKey],
    locale: tribute.locale ?? timeline.locale,
    watermark: !tribute.entitlement,
    displayName: tribute.displayName,
    scenes,
    music,
    // Preserve AudioMixContract when film choices change (ceremony music apply).
    audio: timeline.audio ?? undefined,
  });
}

export function timelineClock(timeline: TimelineContract): { totalLabel: string; totalFrames: number } {
  const totalFrames = totalDurationFrames(timeline);
  return { totalFrames, totalLabel: formatTimelineClock(totalFrames, timeline.fps) };
}

export function chapterLabels(timeline: TimelineContract): string[] {
  const chapters = timeline.scenes.filter((s) => s.type === 'chapter');
  if (chapters.length === 0) {
    return ['01  Cherished moments'];
  }
  return chapters.map((c, i) => {
    if (c.type !== 'chapter') {
      return `${String(i + 1).padStart(2, '0')}  Moment`;
    }
    return `${String(i + 1).padStart(2, '0')}  ${c.title}`;
  });
}
