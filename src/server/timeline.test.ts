import { describe, expect, it } from 'vitest';
import { parseTimelineContract, totalDurationFrames } from '@memorialvideo/contracts';
import { buildTimelineFromTribute, chapterLabels, videoMemoryDurationFrames } from './timeline';

describe('creator timeline builder', () => {
  it('places short video memories as TimelineContract video scenes', () => {
    const timeline = buildTimelineFromTribute({
      publicId: 'mv_abcdef0123456789',
      displayName: 'Ada Lovelace',
      bornLabel: '1815',
      rememberedLabel: '1852',
      themeKey: 'timeless',
      entitlement: null,
      memories: [
        {
          id: 'mem_aaaaaaaaaaaaaaaa',
          title: 'Garden walk',
          imagePath: '/api/media/mv_abcdef0123456789/mem_aaaaaaaaaaaaaaaa',
          ingestStatus: 'READY',
          contentType: 'video/mp4',
          durationMs: 2500,
          originalFilenameHint: 'walk.mp4',
        },
        {
          id: 'mem_bbbbbbbbbbbbbbbb',
          title: 'Portrait',
          imagePath: '/fixtures/memory-b.png',
          ingestStatus: 'READY',
          contentType: 'image/jpeg',
        },
      ],
    });
    expect(timeline).toBeTruthy();
    const parsed = parseTimelineContract(timeline);
    const videos = parsed.scenes.filter((s) => s.type === 'video');
    const images = parsed.scenes.filter((s) => s.type === 'image');
    expect(videos).toHaveLength(1);
    expect(images).toHaveLength(1);
    expect(videos[0]?.durationFrames).toBe(videoMemoryDurationFrames(2500));
  });

  it('builds a validated TimelineContract from ready memories', () => {
    const timeline = buildTimelineFromTribute({
      publicId: 'mv_abcdef0123456789',
      displayName: 'Ada Lovelace',
      bornLabel: '1815',
      rememberedLabel: '1852',
      themeKey: 'timeless',
      entitlement: null,
      memories: [
        {
          id: 'mem_aaaaaaaaaaaaaaaa',
          title: 'Notes',
          imagePath: '/fixtures/memory-a.png',
          ingestStatus: 'READY',
        },
        {
          id: 'mem_bbbbbbbbbbbbbbbb',
          title: 'Engine',
          imagePath: '/fixtures/memory-b.png',
          ingestStatus: 'READY',
        },
        {
          id: 'mem_cccccccccccccccc',
          title: 'Uploading skip',
          imagePath: '/fixtures/memory-c.png',
          ingestStatus: 'UPLOADING',
        },
      ],
    });
    expect(timeline).toBeTruthy();
    const parsed = parseTimelineContract(timeline);
    expect(parsed.watermark).toBe(true);
    expect(parsed.scenes.filter((s) => s.type === 'image')).toHaveLength(2);
    expect(totalDurationFrames(parsed)).toBeGreaterThan(0);
    expect(chapterLabels(parsed)[0]).toContain('Cherished');
  });

  it('returns null when no ready memories', () => {
    expect(
      buildTimelineFromTribute({
        publicId: 'mv_abcdef0123456789',
        displayName: 'Empty',
        bornLabel: '',
        rememberedLabel: '',
        themeKey: 'warm_light',
        entitlement: { packageKey: 'ceremony' },
        memories: [],
      }),
    ).toBeNull();
  });

  it('uses opening title and soundtrack when rights are confirmed', () => {
    const timeline = buildTimelineFromTribute({
      publicId: 'mv_abcdef0123456789',
      displayName: 'Ada Lovelace',
      bornLabel: '1815',
      rememberedLabel: '1852',
      themeKey: 'peaceful',
      openingTitle: 'In loving memory',
      soundtrackTrackId: 'still-water',
      musicRightsConfirmed: true,
      locale: 'nl',
      entitlement: { packageKey: 'ceremony' },
      memories: [
        {
          id: 'mem_aaaaaaaaaaaaaaaa',
          title: 'Notes',
          imagePath: '/fixtures/memory-a.png',
          ingestStatus: 'READY',
        },
      ],
    });
    expect(timeline).toBeTruthy();
    const parsed = parseTimelineContract(timeline);
    expect(parsed.locale).toBe('nl');
    expect(parsed.themeKey).toBe('family_album');
    expect(parsed.watermark).toBe(false);
    expect(parsed.music?.trackId).toBe('still-water');
    const intro = parsed.scenes.find((s) => s.type === 'intro');
    expect(intro && intro.type === 'intro' ? intro.displayName : null).toBe('In loving memory');
  });

  it('applies FilmStyleManifest pacing and preferred transitions per style', () => {
    const dark = buildTimelineFromTribute({
      publicId: 'mv_abcdef0123456789',
      displayName: 'Ada',
      bornLabel: '',
      rememberedLabel: '',
      themeKey: 'cinematic_dark',
      entitlement: null,
      memories: [
        {
          id: 'mem_aaaaaaaaaaaaaaaa',
          title: 'One',
          imagePath: '/fixtures/memory-a.png',
          ingestStatus: 'READY',
        },
      ],
    });
    const contemporary = buildTimelineFromTribute({
      publicId: 'mv_abcdef0123456789',
      displayName: 'Ada',
      bornLabel: '',
      rememberedLabel: '',
      themeKey: 'simple_contemporary',
      entitlement: null,
      memories: [
        {
          id: 'mem_aaaaaaaaaaaaaaaa',
          title: 'One',
          imagePath: '/fixtures/memory-a.png',
          ingestStatus: 'READY',
        },
      ],
    });
    expect(dark).toBeTruthy();
    expect(contemporary).toBeTruthy();
    const darkImage = dark!.scenes.find((s) => s.type === 'image');
    const contempImage = contemporary!.scenes.find((s) => s.type === 'image');
    expect(darkImage?.transitionIn).toBe('dissolve');
    expect(contempImage?.transitionIn).toBe('fade');
    expect((darkImage?.durationFrames ?? 0) > (contempImage?.durationFrames ?? 0)).toBe(true);
  });
});
