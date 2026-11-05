import { describe, expect, it } from 'vitest';

import { defaultMusicDirectorPlan, withInferredSourceStates } from './music-director';
import {
  DEFAULT_CHERISHED_SONG_DURATION_MS,
  musicIntentDurationSeconds,
  projectFilmDurationSeconds,
  resolveCherishedSongDurationMs,
} from './projected-film-length';
import { requiredConsumerPackForDurationSeconds } from './pack-duration';

describe('projected film length (MV-AUD-011)', () => {
  it('estimates unknown cherished songs at 3½ minutes', () => {
    const resolved = resolveCherishedSongDurationMs({
      song: {
        durationMs: null,
        catalogTrackKey: null,
      },
    });
    expect(resolved.durationMs).toBe(DEFAULT_CHERISHED_SONG_DURATION_MS);
    expect(resolved.estimated).toBe(true);
  });

  it('uses catalog duration when a preview track is chosen', () => {
    const resolved = resolveCherishedSongDurationMs({
      catalogTrackKey: 'still-water',
    });
    expect(resolved.durationMs).toBe(45_000);
    expect(resolved.estimated).toBe(false);
  });

  it('projects three identified songs over the 10-minute Tribute pack', () => {
    const plan = withInferredSourceStates(defaultMusicDirectorPlan());
    for (const slot of plan.slots) {
      slot.song = {
        title: `${slot.label} favourite`,
        artist: 'Family choice',
        linkUrl: null,
        linkPlatform: null,
        catalogTrackKey: null,
        durationMs: null,
        notes: '',
      };
      slot.sourceState = 'song_identified';
    }

    const music = musicIntentDurationSeconds(plan);
    expect(music.songCount).toBe(3);
    expect(music.usedEstimate).toBe(true);
    expect(music.seconds).toBeCloseTo((3 * DEFAULT_CHERISHED_SONG_DURATION_MS) / 1000);

    const projected = projectFilmDurationSeconds({
      visualDurationSeconds: 4 * 60,
      musicDirectorPlan: plan,
    });
    expect(projected.drivingSource).toBe('music');
    expect(projected.projectedDurationSeconds).toBeGreaterThan(10 * 60);
    expect(requiredConsumerPackForDurationSeconds(projected.projectedDurationSeconds)).toBe(
      'life-story',
    );
  });

  it('keeps visual length when it exceeds the song sum', () => {
    const plan = withInferredSourceStates(defaultMusicDirectorPlan());
    const memories = plan.slots.find((slot) => slot.id === 'memories')!;
    memories.song = {
      title: 'Still Water',
      artist: 'Fixtures',
      linkUrl: null,
      linkPlatform: null,
      catalogTrackKey: 'still-water',
      durationMs: 45_000,
      notes: '',
    };
    memories.sourceState = 'audio_available';

    const projected = projectFilmDurationSeconds({
      visualDurationSeconds: 12 * 60,
      musicDirectorPlan: plan,
    });
    expect(projected.drivingSource).toBe('visual');
    expect(projected.projectedDurationSeconds).toBe(12 * 60);
  });
});
