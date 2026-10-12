import {
  CHAPTER_DEFAULT_FRAMES,
  DEFAULT_FPS,
  dimensionsForAspect,
  IMAGE_DEFAULT_FRAMES,
  TITLE_DEFAULT_FRAMES,
  OUTRO_DEFAULT_FRAMES,
  TIMELINE_SCHEMA_VERSION,
  parseTimelineContract,
  secondsToFrames,
  type ThemeKey,
  type TimelineContract,
  type TimelineScene,
} from '@memorialvideo/contracts';
import type { LaunchLanguage } from '@memorialvideo/contracts';

export type SequenceAsset = {
  id: string;
  type: 'image' | 'video';
  src: string;
  capturedAt: string | null;
  durationMs?: number;
  caption?: string;
  focalX?: number;
  focalY?: number;
  zoom?: number;
  transitionIn?: 'none' | 'fade' | 'dissolve';
};

export function sortAssetsForSequence(assets: readonly SequenceAsset[]): SequenceAsset[] {
  const dated = assets
    .filter((asset) => asset.capturedAt)
    .sort((left, right) => String(left.capturedAt).localeCompare(String(right.capturedAt)));
  const unknown = assets.filter((asset) => !asset.capturedAt);
  return [...dated, ...unknown];
}

export function splitAssetsAcrossChapters<T>(items: readonly T[], chapterCount: number): T[][] {
  const count = Math.max(1, Math.floor(chapterCount));
  if (items.length === 0) {
    return Array.from({ length: count }, () => []);
  }
  const size = Math.ceil(items.length / count);
  return Array.from({ length: count }, (_, index) => items.slice(index * size, (index + 1) * size));
}

export function uniqueSceneId(used: Set<string>, preferred: string): string {
  if (!used.has(preferred)) {
    used.add(preferred);
    return preferred;
  }
  let index = 2;
  let next = `${preferred}-${index}`;
  while (used.has(next)) {
    index += 1;
    next = `${preferred}-${index}`;
  }
  used.add(next);
  return next;
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) {
    return [...items];
  }
  const next = [...items];
  const [removed] = next.splice(from, 1);
  if (removed === undefined) {
    return [...items];
  }
  next.splice(to, 0, removed);
  return next;
}

export function buildInitialTimeline(input: {
  displayName: string;
  lifeSpanLabel?: string;
  chapterTitle?: string;
  chapters?: readonly string[];
  openingLine?: string;
  locale: LaunchLanguage;
  themeKey: ThemeKey;
  aspect?: '16:9' | '9:16' | '1:1';
  assets: readonly SequenceAsset[];
  seed?: number;
  watermark?: boolean;
}): TimelineContract {
  const ordered = sortAssetsForSequence(input.assets);
  const usedIds = new Set<string>();
  const scenes: TimelineScene[] = [
    {
      id: uniqueSceneId(usedIds, 'intro'),
      type: 'intro',
      durationFrames: TITLE_DEFAULT_FRAMES,
      transitionIn: 'fade',
      transitionOut: 'fade',
      displayName: input.displayName,
      lifeSpanLabel: input.lifeSpanLabel || undefined,
    },
  ];
  const chapterTitles = (input.chapters?.length ? input.chapters : input.chapterTitle ? [input.chapterTitle] : [])
    .map((title) => title.trim().slice(0, 80))
    .filter(Boolean);
  const groups =
    chapterTitles.length > 1
      ? splitAssetsAcrossChapters(ordered, chapterTitles.length)
      : [ordered];
  if (chapterTitles.length === 1) {
    scenes.push({
      id: uniqueSceneId(usedIds, 'chapter-1'),
      type: 'chapter',
      durationFrames: CHAPTER_DEFAULT_FRAMES,
      transitionIn: 'fade',
      transitionOut: 'fade',
      title: chapterTitles[0]!,
    });
  }
  for (const [groupIndex, group] of groups.entries()) {
    if (group.length === 0) {
      continue;
    }
    if (chapterTitles.length > 1) {
      scenes.push({
        id: uniqueSceneId(usedIds, `chapter-${groupIndex + 1}`),
        type: 'chapter',
        durationFrames: CHAPTER_DEFAULT_FRAMES,
        transitionIn: 'fade',
        transitionOut: 'fade',
        title: chapterTitles[groupIndex] ?? chapterTitles[0]!,
      });
    }
    for (const asset of group) {
      if (asset.type === 'video') {
        const durationFrames = Math.max(30, Math.min(900, secondsToFrames((asset.durationMs ?? 8_000) / 1000)));
        scenes.push({
          id: uniqueSceneId(usedIds, `video-${asset.id}`),
          type: 'video',
          durationFrames,
          transitionIn: asset.transitionIn ?? 'dissolve',
          transitionOut: 'fade',
          asset: { assetId: asset.id, src: asset.src },
          caption: asset.caption,
        });
      } else {
        const imageFrames = asset.durationMs
          ? Math.min(240, Math.max(60, secondsToFrames(asset.durationMs / 1000)))
          : IMAGE_DEFAULT_FRAMES;
        scenes.push({
          id: uniqueSceneId(usedIds, `image-${asset.id}`),
          type: 'image',
          durationFrames: imageFrames,
          transitionIn: asset.transitionIn ?? 'dissolve',
          transitionOut: 'fade',
          asset: { assetId: asset.id, src: asset.src },
          caption: asset.caption,
          crop: {
            focalX: asset.focalX ?? 0.5,
            focalY: asset.focalY ?? 0.5,
            zoom: Math.min(3, Math.max(1, asset.zoom ?? 1)),
          },
        });
      }
    }
  }
  scenes.push({
    id: uniqueSceneId(usedIds, 'outro'),
    type: 'outro',
    durationFrames: OUTRO_DEFAULT_FRAMES,
    transitionIn: 'fade',
    transitionOut: 'fade',
    closingLine: input.openingLine?.trim().slice(0, 160) || input.displayName,
  });
  return parseTimelineContract({
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    fps: DEFAULT_FPS,
    ...dimensionsForAspect(input.aspect ?? '16:9'),
    seed: input.seed ?? 1,
    locale: input.locale,
    themeKey: input.themeKey,
    styleManifestVersion: 1,
    watermark: input.watermark ?? true,
    displayName: input.displayName,
    scenes,
  });
}
