import { describe, expect, it } from 'vitest';

import {
  AUDIO_MIX_CONTRACT_VERSION,
  AUDIO_TTS_PROVIDER,
  emptyAudioMix,
  parseAudioMixContract,
} from './audio';

describe('AudioMixContract', () => {
  it('parses an empty mix with blocked TTS and no beat-aware editing', () => {
    const mix = emptyAudioMix();
    expect(mix.schemaVersion).toBe(AUDIO_MIX_CONTRACT_VERSION);
    expect(mix.ttsProvider.available).toBe(false);
    expect(mix.ttsProvider.status).toBe('blocked_xb009');
    expect(mix.beatAwareEditing.available).toBe(false);
    expect(AUDIO_TTS_PROVIDER.available).toBe(false);
  });

  it('accepts speech + rights-declared music + narration + subtitles + ducking', () => {
    const mix = parseAudioMixContract({
      schemaVersion: AUDIO_MIX_CONTRACT_VERSION,
      revision: 1,
      masterProfile: 'dialogue_priority',
      tracks: [
        {
          id: 'trk_speech',
          kind: 'speech',
          licensed: true,
          clips: [
            {
              id: 'clip_speech',
              src: 'storage://assets/video-a',
              startFrame: 0,
              durationFrames: 90,
              sourceSceneId: 'scene_video',
            },
          ],
        },
        {
          id: 'trk_music',
          kind: 'music',
          licensed: false,
          rights: {
            source: 'synthetic_rights_declared',
            syntheticOrRightsCleared: true,
            commercialUploadAllowed: false,
            declaredAt: '2026-08-31T08:00:00.000Z',
          },
          clips: [
            {
              id: 'clip_music',
              src: 'storage://music/synthetic',
              startFrame: 0,
              durationFrames: 180,
              gainDb: -6,
            },
          ],
        },
        {
          id: 'trk_narration',
          kind: 'narration',
          licensed: true,
          clips: [
            {
              id: 'clip_nar',
              src: 'storage://narration/take-1',
              startFrame: 30,
              durationFrames: 60,
            },
          ],
        },
      ],
      ducking: {
        enabled: true,
        musicGainDuringSpeechDb: -14,
        attackFrames: 6,
        releaseFrames: 18,
        regions: [
          { id: 'duck_1', startFrame: 0, endFrame: 90, musicGainDb: -14, reason: 'speech' },
          { id: 'duck_2', startFrame: 30, endFrame: 90, musicGainDb: -14, reason: 'narration' },
        ],
      },
      subtitles: [
        {
          id: 'sub_en',
          locale: 'en',
          attached: true,
          burnIn: true,
          cues: [
            {
              id: 'cue_1',
              startFrame: 0,
              endFrame: 45,
              text: 'Hello family',
              source: 'transcript',
            },
          ],
        },
      ],
      narrationTakes: [
        {
          id: 'take_1',
          src: 'storage://narration/take-1',
          durationFrames: 60,
          approved: true,
          selected: true,
          ttsStatus: 'unavailable',
        },
      ],
      selectedNarrationTakeId: 'take_1',
    });
    expect(mix.tracks).toHaveLength(3);
    expect(mix.ducking.regions).toHaveLength(2);
    expect(mix.subtitles[0]?.attached).toBe(true);
  });

  it('rejects music without license or synthetic rights declaration', () => {
    expect(() =>
      parseAudioMixContract({
        schemaVersion: AUDIO_MIX_CONTRACT_VERSION,
        tracks: [
          {
            id: 'trk_music',
            kind: 'music',
            licensed: false,
            clips: [{ id: 'c1', src: 'x', startFrame: 0, durationFrames: 30 }],
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects invalid ducking and subtitle ranges', () => {
    expect(() =>
      parseAudioMixContract({
        schemaVersion: AUDIO_MIX_CONTRACT_VERSION,
        ducking: {
          enabled: true,
          regions: [{ id: 'bad', startFrame: 10, endFrame: 10, musicGainDb: -12, reason: 'speech' }],
        },
      }),
    ).toThrow();
  });
});
