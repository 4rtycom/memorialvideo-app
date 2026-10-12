import { describe, expect, it } from 'vitest';

import {
  defaultCeremonyMusicPlan,
  proposeCeremonyMusicMix,
  resolveMomentFrameRanges,
  withCeremonyMusicOnTimeline,
} from './ceremony-music';
import { buildInitialTimeline } from './sequence';
import { BETA_MUSIC_CATALOG, suggestedTributeTrack } from './music-catalog';

describe('ceremony music', () => {
  const timeline = buildInitialTimeline({
    displayName: 'River',
    locale: 'en',
    themeKey: 'timeless',
    chapters: ['Early years', 'Later years'],
    assets: [
      {
        id: 'a1',
        type: 'image',
        src: 'blob:1',
        capturedAt: null,
      },
      {
        id: 'a2',
        type: 'image',
        src: 'blob:2',
        capturedAt: null,
      },
    ],
  });

  it('maps intro, body, and outro moments', () => {
    const ranges = resolveMomentFrameRanges(timeline);
    expect(ranges.opening?.startFrame).toBe(0);
    expect(ranges.tribute?.startFrame).toBeGreaterThan(0);
    expect(ranges.closing?.startFrame).toBeGreaterThan(ranges.tribute!.startFrame);
  });

  it('proposes a single tribute clip by default', () => {
    const plan = defaultCeremonyMusicPlan(suggestedTributeTrack().trackId);
    const mix = proposeCeremonyMusicMix({
      timeline,
      plan,
      tracks: BETA_MUSIC_CATALOG,
      previewSrcForTrack: (trackKey) => `/api/music/preview?trackKey=${trackKey}`,
    });
    const musicTrack = mix.tracks.find((track) => track.kind === 'music');
    expect(musicTrack?.clips).toHaveLength(1);
    expect(musicTrack?.rights?.source).toBe('catalog_licensed');
  });

  it('places multiple clips when moments mode is expanded', () => {
    const plan = {
      mode: 'moments' as const,
      slots: {
        opening: { trackKey: 'quiet-hope', venueHandled: false },
        tribute: { trackKey: 'still-water' },
        reflection: { trackKey: 'still-water' },
        closing: { trackKey: 'gentle-rise' },
      },
    };
    const mix = proposeCeremonyMusicMix({
      timeline,
      plan,
      tracks: BETA_MUSIC_CATALOG,
      previewSrcForTrack: (trackKey) => `/api/music/preview?trackKey=${trackKey}`,
    });
    const clips = mix.tracks.find((track) => track.kind === 'music')?.clips ?? [];
    expect(clips.length).toBeGreaterThanOrEqual(3);
    const merged = withCeremonyMusicOnTimeline({
      timeline,
      plan,
      mix,
      tracks: BETA_MUSIC_CATALOG,
      previewSrcForTrack: (trackKey) => `/api/music/preview?trackKey=${trackKey}`,
    });
    expect(merged.music?.trackId).toBe('still-water');
    expect(merged.audio?.tracks.some((track) => track.kind === 'music')).toBe(true);
  });
});
