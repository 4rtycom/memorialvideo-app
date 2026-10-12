import {
  IMAGE_DEFAULT_FRAMES,
  parseTimelineContract,
  TITLE_DEFAULT_FRAMES,
  type ThemeKey,
  type TimelineContract,
} from '@memorialvideo/contracts';

function imageScene(index: number, extra?: { caption?: string }) {
  const id = String(index + 1).padStart(3, '0');
  return {
    id: `image-${id}`,
    type: 'image' as const,
    durationFrames: IMAGE_DEFAULT_FRAMES,
    asset: {
      assetId: `img-${id}`,
      src: `fixtures/generated/image-${id}.png`,
    },
    caption: extra?.caption,
    crop: { focalX: 0.5, focalY: 0.42, zoom: 1 },
    transitionIn: 'dissolve' as const,
    transitionOut: 'fade' as const,
  };
}

export function createWorkerSmokeTimeline(
  watermark = true,
  themeKey: ThemeKey = 'timeless',
): TimelineContract {
  return parseTimelineContract({
    schemaVersion: 1,
    fps: 30,
    width: 1920,
    height: 1080,
    seed: 7,
    locale: 'en',
    themeKey,
    watermark,
    displayName: 'Alex Rivera',
    scenes: [
      {
        id: 'intro',
        type: 'intro',
        durationFrames: 45,
        displayName: 'Alex Rivera',
        lifeSpanLabel: '1952–2026',
        transitionIn: 'fade',
        transitionOut: 'fade',
      },
      {
        id: 'outro',
        type: 'outro',
        durationFrames: 45,
        closingLine: 'Always remembered.',
        transitionIn: 'fade',
        transitionOut: 'none',
      },
    ],
    music: {
      trackId: 'still-water',
      src: 'fixtures/generated/music-still-water.wav',
      fadeInFrames: 8,
      fadeOutFrames: 10,
    },
  });
}

export function createThemeGoldenTimeline(themeKey: ThemeKey, watermark: boolean): TimelineContract {
  return parseTimelineContract({
    ...createGoldenTimeline(watermark),
    themeKey,
  });
}

export function createGoldenTimeline(watermark: boolean): TimelineContract {
  return parseTimelineContract({
    schemaVersion: 1,
    fps: 30,
    width: 1920,
    height: 1080,
    seed: 42,
    locale: 'en',
    themeKey: 'timeless',
    watermark,
    displayName: 'Helena Żurawska-Müller',
    scenes: [
      {
        id: 'intro',
        type: 'intro',
        durationFrames: TITLE_DEFAULT_FRAMES,
        displayName: 'Helena Żurawska-Müller',
        lifeSpanLabel: '1948–2026',
        transitionIn: 'fade',
        transitionOut: 'fade',
      },
      {
        id: 'chapter',
        type: 'chapter',
        durationFrames: 75,
        title: 'Frühe Lebensjahre',
        transitionIn: 'fade',
        transitionOut: 'dissolve',
      },
      imageScene(0, { caption: 'São Paulo, 1974' }),
      imageScene(1, { caption: 'Avec la famille' }),
      {
        id: 'quote',
        type: 'quote',
        durationFrames: TITLE_DEFAULT_FRAMES,
        text: 'La vita è fatta di ricordi condivisi.',
        attribution: 'La famiglia',
        transitionIn: 'fade',
        transitionOut: 'fade',
      },
      {
        id: 'outro',
        type: 'outro',
        durationFrames: TITLE_DEFAULT_FRAMES,
        closingLine: 'Always remembered.',
        transitionIn: 'fade',
        transitionOut: 'none',
      },
    ],
    music: {
      trackId: 'still-water',
      src: 'fixtures/generated/music-still-water.wav',
      fadeInFrames: 20,
      fadeOutFrames: 30,
    },
  });
}

export function createFullSpikeTimeline(watermark: boolean): TimelineContract {
  const images = Array.from({ length: 100 }, (_, index) => imageScene(index));
  return parseTimelineContract({
    schemaVersion: 1,
    fps: 30,
    width: 1920,
    height: 1080,
    seed: 42,
    locale: 'en',
    themeKey: 'timeless',
    watermark,
    displayName: 'Helena Żurawska-Müller',
    scenes: [
      {
        id: 'intro',
        type: 'intro',
        durationFrames: TITLE_DEFAULT_FRAMES,
        displayName: 'Helena Żurawska-Müller',
        lifeSpanLabel: '1948–2026',
        transitionIn: 'fade',
        transitionOut: 'fade',
      },
      {
        id: 'chapter-early',
        type: 'chapter',
        durationFrames: 75,
        title: 'Early years',
        transitionIn: 'fade',
        transitionOut: 'fade',
      },
      ...images.slice(0, 40),
      {
        id: 'chapter-family',
        type: 'chapter',
        durationFrames: 75,
        title: 'Family and friends',
        transitionIn: 'fade',
        transitionOut: 'fade',
      },
      ...images.slice(40, 80),
      {
        id: 'clip',
        type: 'video',
        durationFrames: 90,
        asset: {
          assetId: 'clip-001',
          src: 'fixtures/generated/clip-phone.mp4',
        },
        transitionIn: 'fade',
        transitionOut: 'fade',
      },
      {
        id: 'chapter-close',
        type: 'chapter',
        durationFrames: 75,
        title: 'Closing tribute',
        transitionIn: 'fade',
        transitionOut: 'fade',
      },
      ...images.slice(80),
      {
        id: 'quote',
        type: 'quote',
        durationFrames: TITLE_DEFAULT_FRAMES,
        text: 'Niech pamięć będzie łagodna i wierna.',
        attribution: 'Rodzina',
        transitionIn: 'fade',
        transitionOut: 'fade',
      },
      {
        id: 'outro',
        type: 'outro',
        durationFrames: TITLE_DEFAULT_FRAMES,
        closingLine: 'A life held together.',
        transitionIn: 'fade',
        transitionOut: 'none',
      },
    ],
    music: {
      trackId: 'still-water',
      src: 'fixtures/generated/music-still-water.wav',
      fadeInFrames: 30,
      fadeOutFrames: 45,
    },
  });
}
