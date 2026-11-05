import { describe, expect, it } from 'vitest';

import {
  ceremonyMusicShorteningRisks,
  defaultCeremonyMusicPlan,
  expandTimelineForCeremonyMusic,
  proposeCeremonyMusicMix,
  resolveMomentFrameRanges,
  songDurationFrames,
  withCeremonyMusicOnTimeline,
} from './ceremony-music';
import { buildInitialTimeline } from './sequence';
import { BETA_MUSIC_CATALOG, suggestedTributeTrack } from './music-catalog';
import { totalDurationFrames } from '@memorialvideo/contracts';

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
    const expanded = expandTimelineForCeremonyMusic({
      timeline,
      plan,
      tracks: BETA_MUSIC_CATALOG,
    });
    const mix = proposeCeremonyMusicMix({
      timeline: expanded,
      plan,
      tracks: BETA_MUSIC_CATALOG,
      previewSrcForTrack: (trackKey) => `/api/music/preview?trackKey=${trackKey}`,
    });
    const musicTrack = mix.tracks.find((track) => track.kind === 'music');
    expect(musicTrack?.clips).toHaveLength(1);
    expect(musicTrack?.clips?.[0]?.durationFrames).toBe(songDurationFrames(45_000, expanded.fps));
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
    const expanded = expandTimelineForCeremonyMusic({
      timeline,
      plan,
      tracks: BETA_MUSIC_CATALOG,
    });
    const mix = proposeCeremonyMusicMix({
      timeline: expanded,
      plan,
      tracks: BETA_MUSIC_CATALOG,
      previewSrcForTrack: (trackKey) => `/api/music/preview?trackKey=${trackKey}`,
    });
    const clips = mix.tracks.find((track) => track.kind === 'music')?.clips ?? [];
    expect(clips.length).toBeGreaterThanOrEqual(3);
    const trackFrames = songDurationFrames(45_000, expanded.fps);
    for (const clip of clips) {
      expect(clip.durationFrames).toBe(trackFrames);
    }
    const merged = withCeremonyMusicOnTimeline({
      timeline: expanded,
      plan,
      mix,
      tracks: BETA_MUSIC_CATALOG,
      previewSrcForTrack: (trackKey) => `/api/music/preview?trackKey=${trackKey}`,
    });
    expect(merged.music?.trackId).toBe('still-water');
    expect(merged.audio?.tracks.some((track) => track.kind === 'music')).toBe(true);
  });

  it('never silently shortens songs — expands the film instead (MV-AUD-011)', () => {
    const plan = {
      mode: 'moments' as const,
      slots: {
        opening: { trackKey: 'quiet-hope', venueHandled: false },
        tribute: { trackKey: 'still-water' },
        reflection: { trackKey: null },
        closing: { trackKey: 'gentle-rise' },
      },
    };
    expect(
      ceremonyMusicShorteningRisks({
        timeline,
        plan,
        tracks: BETA_MUSIC_CATALOG,
      }).length,
    ).toBeGreaterThan(0);

    const expanded = expandTimelineForCeremonyMusic({
      timeline,
      plan,
      tracks: BETA_MUSIC_CATALOG,
    });
    expect(totalDurationFrames(expanded)).toBeGreaterThan(totalDurationFrames(timeline));
    expect(
      ceremonyMusicShorteningRisks({
        timeline: expanded,
        plan,
        tracks: BETA_MUSIC_CATALOG,
      }),
    ).toEqual([]);

    expect(() =>
      proposeCeremonyMusicMix({
        timeline,
        plan,
        tracks: BETA_MUSIC_CATALOG,
        previewSrcForTrack: (trackKey) => `/api/music/preview?trackKey=${trackKey}`,
      }),
    ).toThrow(/music_would_shorten_song/);
  });
});
