import { describe, expect, it } from 'vitest';

import {
  AUDIO_MIX_CONTRACT_VERSION,
  DEFAULT_FPS,
  parseTimelineContract,
  totalDurationFrames,
} from '@memorialvideo/contracts';

import {
  applyAutomaticDucking,
  canAttachMusicTrack,
  computeDuckingRegions,
  musicVolumeAtFrame,
  proposeGuidedAudioMix,
  subtitleCuesFromTranscriptSegments,
} from './audio-mix';

function baseTimeline() {
  return parseTimelineContract({
    schemaVersion: 1,
    fps: DEFAULT_FPS,
    width: 1920,
    height: 1080,
    seed: 7,
    locale: 'en',
    themeKey: 'timeless',
    watermark: true,
    displayName: 'Test',
    scenes: [
      {
        id: 'intro',
        type: 'intro',
        durationFrames: 30,
        transitionIn: 'fade',
        transitionOut: 'fade',
        displayName: 'Test',
      },
      {
        id: 'scene_video',
        type: 'video',
        durationFrames: 90,
        transitionIn: 'fade',
        transitionOut: 'fade',
        asset: { assetId: 'asset_video', src: 'storage://assets/video' },
      },
      {
        id: 'outro',
        type: 'outro',
        durationFrames: 30,
        transitionIn: 'fade',
        transitionOut: 'fade',
        closingLine: 'Remembered',
      },
    ],
  });
}

describe('audio mix domain', () => {
  it('allows synthetic rights-declared music and blocks commercial without flag', () => {
    expect(
      canAttachMusicTrack({
        licensedForDownload: false,
        licensedForPrivateStream: false,
        userUploaded: true,
        featureUserUploads: false,
        rights: {
          source: 'synthetic_rights_declared',
          syntheticOrRightsCleared: true,
          commercialUploadAllowed: false,
        },
      }),
    ).toBe(true);

    expect(
      canAttachMusicTrack({
        licensedForDownload: false,
        licensedForPrivateStream: false,
        userUploaded: true,
        featureUserUploads: false,
        rights: {
          source: 'user_uploaded_commercial',
          syntheticOrRightsCleared: false,
          commercialUploadAllowed: true,
        },
      }),
    ).toBe(false);
  });

  it('proposes guided mix with ducking regions lower during speech and narration', () => {
    const timeline = baseTimeline();
    const mix = proposeGuidedAudioMix({
      timeline,
      musicSrc: 'storage://music/synthetic',
      musicRights: {
        source: 'synthetic_rights_declared',
        syntheticOrRightsCleared: true,
        commercialUploadAllowed: false,
        declaredAt: '2026-08-31T08:00:00.000Z',
      },
      narrationTake: {
        id: 'take_1',
        src: 'storage://narration/take-1',
        durationFrames: 45,
        approved: true,
        selected: true,
        ttsStatus: 'unavailable',
      },
      subtitleCues: subtitleCuesFromTranscriptSegments([
        { id: 'seg_1', startMs: 1000, endMs: 2500, text: 'Hello family' },
      ]),
    });

    expect(mix.schemaVersion).toBe(AUDIO_MIX_CONTRACT_VERSION);
    expect(mix.tracks.map((track) => track.kind).sort()).toEqual(['music', 'narration', 'speech']);
    expect(mix.ducking.enabled).toBe(true);
    expect(mix.ducking.regions.length).toBeGreaterThan(0);
    expect(mix.subtitles[0]?.attached).toBe(true);
    expect(mix.ttsProvider.available).toBe(false);
    expect(mix.beatAwareEditing.available).toBe(false);

    const speechClip = mix.tracks.find((track) => track.kind === 'speech')?.clips[0];
    expect(speechClip?.startFrame).toBe(30);
    expect(speechClip?.durationFrames).toBe(90);

    const midSpeech = musicVolumeAtFrame(mix, 40, -6);
    const afterSpeech = musicVolumeAtFrame(mix, totalDurationFrames(timeline) - 5, -6);
    expect(midSpeech).toBeLessThan(afterSpeech);
  });

  it('computeDuckingRegions merges overlapping speech windows', () => {
    const mix = applyAutomaticDucking(
      proposeGuidedAudioMix({
        timeline: baseTimeline(),
        musicSrc: 'storage://music/synthetic',
        musicRights: {
          source: 'synthetic_rights_declared',
          syntheticOrRightsCleared: true,
          commercialUploadAllowed: false,
        },
      }),
    );
    const regions = computeDuckingRegions(mix);
    expect(regions.every((region) => region.endFrame > region.startFrame)).toBe(true);
    expect(regions.every((region) => region.musicGainDb < 0)).toBe(true);
  });
});
