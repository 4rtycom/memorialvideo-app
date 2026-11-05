import { describe, expect, it } from 'vitest';

import {
  ceremonyPlanToMusicDirector,
  defaultMusicDirectorPlan,
  detectMusicLinkPlatform,
  inferSourceState,
  musicDirectorHasPlayableAudio,
  musicDirectorToCeremonyPlan,
  withInferredSourceStates,
} from './music-director';

describe('music director (MV-AUD-003)', () => {
  it('defaults to Opening, Memories, Farewell', () => {
    const plan = defaultMusicDirectorPlan();
    expect(plan.slots.map((slot) => slot.id)).toEqual(['opening', 'memories', 'farewell']);
    expect(plan.slots.every((slot) => slot.sourceState === 'empty')).toBe(true);
  });

  it('detects Spotify / Apple / YouTube links as references only', () => {
    expect(detectMusicLinkPlatform('https://open.spotify.com/track/abc')).toBe('spotify');
    expect(detectMusicLinkPlatform('https://music.apple.com/us/album/x/1?i=2')).toBe('apple_music');
    expect(detectMusicLinkPlatform('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube');
    expect(detectMusicLinkPlatform('not-a-url')).toBeNull();
  });

  it('infers song_identified for title/link without catalog audio', () => {
    expect(
      inferSourceState({
        title: 'Amazing Grace',
        artist: 'Traditional',
        linkUrl: 'https://open.spotify.com/track/xyz',
        linkPlatform: 'spotify',
        catalogTrackKey: null,
        notes: '',
      }),
    ).toBe('song_identified');
  });

  it('infers audio_available for development catalog tracks', () => {
    expect(
      inferSourceState({
        title: 'Still Water',
        artist: 'MemorialVideo fixtures',
        linkUrl: null,
        linkPlatform: null,
        catalogTrackKey: 'still-water',
        notes: '',
      }),
    ).toBe('audio_available');
  });

  it('maps three-slot director plan onto CeremonyMusicPlan moments', () => {
    const plan = withInferredSourceStates(
      defaultMusicDirectorPlan({ soundtrackTrackId: 'still-water' }),
    );
    const opening = plan.slots.find((slot) => slot.id === 'opening')!;
    opening.song = {
      title: 'Quiet Hope',
      artist: 'MemorialVideo fixtures',
      linkUrl: null,
      linkPlatform: null,
      catalogTrackKey: 'quiet-hope',
      notes: '',
    };
    opening.sourceState = 'audio_available';
    const farewell = plan.slots.find((slot) => slot.id === 'farewell')!;
    farewell.song = {
      title: 'Gentle Rise',
      artist: 'MemorialVideo fixtures',
      linkUrl: null,
      linkPlatform: null,
      catalogTrackKey: 'gentle-rise',
      notes: '',
    };
    farewell.sourceState = 'audio_available';

    const ceremony = musicDirectorToCeremonyPlan(plan);
    expect(ceremony.mode).toBe('moments');
    expect(ceremony.slots.opening.trackKey).toBe('quiet-hope');
    expect(ceremony.slots.tribute.trackKey).toBe('still-water');
    expect(ceremony.slots.closing.trackKey).toBe('gentle-rise');
    expect(musicDirectorHasPlayableAudio(plan)).toBe(true);
  });

  it('keeps venue / identified songs out of playable AudioMix slots', () => {
    const plan = defaultMusicDirectorPlan();
    const memories = plan.slots.find((slot) => slot.id === 'memories')!;
    memories.song = {
      title: 'Bridge Over Troubled Water',
      artist: 'Simon & Garfunkel',
      linkUrl: 'https://music.apple.com/us/song/bridge',
      linkPlatform: 'apple_music',
      catalogTrackKey: null,
      notes: '',
    };
    memories.sourceState = 'song_identified';
    const opening = plan.slots.find((slot) => slot.id === 'opening')!;
    opening.sourceState = 'venue_playback';
    opening.song = {
      title: 'Processional',
      artist: '',
      linkUrl: null,
      linkPlatform: null,
      catalogTrackKey: null,
      notes: 'Organist',
    };

    const ceremony = musicDirectorToCeremonyPlan(plan);
    expect(ceremony.slots.opening.trackKey).toBeNull();
    expect(ceremony.slots.opening.venueHandled).toBe(true);
    expect(ceremony.slots.tribute.trackKey).toBeNull();
    expect(musicDirectorHasPlayableAudio(plan)).toBe(false);
  });

  it('round-trips legacy ceremony plan into Music Director', () => {
    const director = ceremonyPlanToMusicDirector({
      plan: {
        mode: 'moments',
        slots: {
          opening: { trackKey: null, venueHandled: true },
          tribute: { trackKey: 'still-water' },
          reflection: { trackKey: null },
          closing: { trackKey: 'gentle-rise' },
        },
      },
      rightsConfirmed: true,
    });
    expect(director.slots.find((s) => s.id === 'memories')?.song.catalogTrackKey).toBe('still-water');
    expect(director.slots.find((s) => s.id === 'farewell')?.song.catalogTrackKey).toBe('gentle-rise');
    expect(director.slots.find((s) => s.id === 'opening')?.sourceState).toBe('venue_playback');
  });
});
