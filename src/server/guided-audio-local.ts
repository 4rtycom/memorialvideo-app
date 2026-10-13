import {
  AUDIO_TTS_PROVIDER,
  parseAudioMixContract,
  parseTimelineContract,
  totalDurationFrames,
  type AudioClip,
  type AudioMixContract,
  type TimelineContract,
} from '@memorialvideo/contracts';
import {
  catalogTrackById,
  planMixMeasurementWindows,
  proposeGuidedAudioMix,
  suggestedTributeTrack,
  withAudioMix,
} from '@memorialvideo/domain';
import { previewSrcForTrack } from './ceremony-music-local';
import {
  getTribute,
  persistGuidedAudioApply,
  persistGuidedAudioPending,
  undoTimeline,
  type Tribute,
} from './store';

export type GuidedAudioOverview = {
  hasTimeline: boolean;
  hasAudioMix: boolean;
  soundtrackTrackId: string | null;
  musicRightsConfirmed: boolean;
  pending: boolean;
  duckingRegions: number;
  trackKinds: string[];
  personalSongs: Array<{ id: string; title: string }>;
  musicClips: Array<{
    id: string;
    assetId?: string;
    startFrame: number;
    durationFrames: number;
    fadeInFrames: number;
    fadeOutFrames: number;
    gainDb: number;
  }>;
  tts: {
    available: false;
    status: typeof AUDIO_TTS_PROVIDER.status;
    reason: string;
  };
  note: string;
};

export function loadGuidedAudioOverview(tribute: Tribute): GuidedAudioOverview {
  const mix = tribute.timeline?.audio
    ? parseAudioMixContract(tribute.timeline.audio)
    : tribute.guidedAudioPending
      ? parseAudioMixContract(tribute.guidedAudioPending)
      : null;
  return {
    hasTimeline: Boolean(tribute.timeline),
    hasAudioMix: Boolean(tribute.timeline?.audio?.tracks.some((t) => t.kind === 'music')),
    soundtrackTrackId: tribute.soundtrackTrackId,
    musicRightsConfirmed: tribute.musicRightsConfirmed,
    pending: Boolean(tribute.guidedAudioPending),
    duckingRegions: mix?.ducking.regions.length ?? 0,
    trackKinds: mix?.tracks.map((t) => t.kind) ?? [],
    personalSongs: tribute.memories
      .filter(
        (memory) =>
          memory.ingestStatus === 'READY' &&
          memory.rightsConfirmed === true &&
          (memory.contentType ?? '').startsWith('audio/') &&
          memory.imagePath.startsWith('/api/media/'),
      )
      .map((memory) => ({ id: memory.id, title: memory.title })),
    musicClips:
      tribute.timeline?.audio?.tracks
        .filter((track) => track.kind === 'music')
        .flatMap((track) => track.clips)
        .map((clip) => ({
          id: clip.id,
          assetId: clip.assetId,
          startFrame: clip.startFrame,
          durationFrames: clip.durationFrames,
          fadeInFrames: clip.fadeInFrames,
          fadeOutFrames: clip.fadeOutFrames,
          gainDb: clip.gainDb,
        })) ?? [],
    tts: {
      available: false,
      status: AUDIO_TTS_PROVIDER.status,
      reason: AUDIO_TTS_PROVIDER.reason,
    },
    note: 'Guided Audio builds a deterministic AudioMixContract (music + optional speech ducking). TTS / voice recreation stays blocked (XB-009).',
  };
}

export type GuidedAudioActionResult =
  | {
      ok: true;
      mix?: AudioMixContract;
      previewTimeline?: TimelineContract;
      timeline?: TimelineContract;
      timelineVersion?: number;
      duckingRegions: number;
      measurementWindows?: ReturnType<typeof planMixMeasurementWindows>;
      tts: GuidedAudioOverview['tts'];
    }
  | { ok: false; error: string; status: number };

function resolveMusicSrc(tribute: Tribute): { trackId: string; src: string } | null {
  const trackId = tribute.soundtrackTrackId ?? suggestedTributeTrack().trackId;
  const track = catalogTrackById(trackId);
  if (!track || !track.licensedForPreview) {
    return null;
  }
  return { trackId, src: previewSrcForTrack(trackId) };
}

export async function proposeGuidedAudio(publicId: string): Promise<GuidedAudioActionResult> {
  const tribute = await getTribute(publicId);
  if (!tribute) {
    return { ok: false, error: 'not_found', status: 404 };
  }
  if (!tribute.timeline) {
    return { ok: false, error: 'needs_timeline', status: 409 };
  }
  if (!tribute.musicRightsConfirmed) {
    return { ok: false, error: 'music_rights', status: 403 };
  }
  const music = resolveMusicSrc(tribute);
  if (!music) {
    return { ok: false, error: 'music_track_unknown', status: 400 };
  }

  let mix: AudioMixContract;
  try {
    mix = proposeGuidedAudioMix({
      timeline: tribute.timeline,
      musicSrc: music.src,
      musicAssetId: music.trackId,
      musicRights: {
        source: 'synthetic_rights_declared',
        syntheticOrRightsCleared: true,
        commercialUploadAllowed: false,
        declaredAt: new Date().toISOString(),
        noteKey: 'music.catalog.development_only',
      },
      subtitleCues: [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'mix_failed';
    return { ok: false, error: message, status: message === 'music_rights' ? 403 : 400 };
  }

  const saved = await persistGuidedAudioPending(publicId, mix);
  if (!saved.ok) {
    return { ok: false, error: 'not_found', status: 404 };
  }

  return {
    ok: true,
    mix,
    duckingRegions: mix.ducking.regions.length,
    measurementWindows: planMixMeasurementWindows(mix, totalDurationFrames(tribute.timeline)),
    tts: {
      available: false,
      status: AUDIO_TTS_PROVIDER.status,
      reason: AUDIO_TTS_PROVIDER.reason,
    },
  };
}

export async function previewGuidedAudio(publicId: string): Promise<GuidedAudioActionResult> {
  const tribute = await getTribute(publicId);
  if (!tribute) {
    return { ok: false, error: 'not_found', status: 404 };
  }
  if (!tribute.timeline) {
    return { ok: false, error: 'needs_timeline', status: 409 };
  }
  if (!tribute.guidedAudioPending) {
    return { ok: false, error: 'needs_propose', status: 409 };
  }
  const mix = parseAudioMixContract(tribute.guidedAudioPending);
  const previewTimeline = parseTimelineContract(withAudioMix(tribute.timeline, mix));
  return {
    ok: true,
    mix,
    previewTimeline,
    duckingRegions: mix.ducking.regions.length,
    measurementWindows: planMixMeasurementWindows(mix, totalDurationFrames(tribute.timeline)),
    tts: {
      available: false,
      status: AUDIO_TTS_PROVIDER.status,
      reason: AUDIO_TTS_PROVIDER.reason,
    },
  };
}

export async function applyGuidedAudio(publicId: string): Promise<GuidedAudioActionResult> {
  const tribute = await getTribute(publicId);
  if (!tribute) {
    return { ok: false, error: 'not_found', status: 404 };
  }
  if (!tribute.timeline) {
    return { ok: false, error: 'needs_timeline', status: 409 };
  }
  if (!tribute.guidedAudioPending) {
    return { ok: false, error: 'needs_propose', status: 409 };
  }
  const mix = parseAudioMixContract(tribute.guidedAudioPending);
  const nextTimeline = parseTimelineContract(withAudioMix(tribute.timeline, mix));
  const persisted = await persistGuidedAudioApply({
    publicId,
    timeline: nextTimeline,
  });
  if (!persisted.ok) {
    return { ok: false, error: 'not_found', status: 404 };
  }
  return {
    ok: true,
    mix,
    timeline: persisted.tribute.timeline ?? nextTimeline,
    timelineVersion: persisted.tribute.timelineVersion,
    duckingRegions: mix.ducking.regions.length,
    tts: {
      available: false,
      status: AUDIO_TTS_PROVIDER.status,
      reason: AUDIO_TTS_PROVIDER.reason,
    },
  };
}

export type PersonalSongPlacement = {
  memoryId: string;
  startFrame: number;
  durationFrames: number;
  fadeInFrames: number;
  fadeOutFrames: number;
  gainDb: number;
};

function sceneRanges(timeline: TimelineContract): Array<{ id: string; type: string; start: number; duration: number; src?: string }> {
  let cursor = 0;
  return timeline.scenes.map((scene) => {
    const start = cursor;
    cursor += scene.durationFrames;
    const src = 'asset' in scene ? scene.asset.src : undefined;
    return { id: scene.id, type: scene.type, start, duration: scene.durationFrames, src };
  });
}

/**
 * Place two rights-confirmed personal songs in different parts of the film.
 * Duration is the trim. Fades and gain are stored on the AudioMix clips the encoder uses.
 */
export async function placePersonalSongs(
  publicId: string,
  songs: PersonalSongPlacement[],
): Promise<GuidedAudioActionResult> {
  const tribute = await getTribute(publicId);
  if (!tribute?.timeline) {
    return { ok: false, error: tribute ? 'needs_timeline' : 'not_found', status: tribute ? 409 : 404 };
  }
  if (songs.length !== 2) {
    return { ok: false, error: 'two_songs_required', status: 400 };
  }
  if (songs[0]!.memoryId === songs[1]!.memoryId) {
    return { ok: false, error: 'distinct_songs', status: 400 };
  }
  const total = totalDurationFrames(tribute.timeline);
  const clips: AudioClip[] = [];
  for (const song of songs) {
    const memory = tribute.memories.find((item) => item.id === song.memoryId);
    if (!memory || memory.ingestStatus !== 'READY' || memory.rightsConfirmed !== true) {
      return { ok: false, error: 'song_not_ready', status: 400 };
    }
    if (!(memory.contentType ?? '').startsWith('audio/') || !memory.imagePath.startsWith('/api/media/')) {
      return { ok: false, error: 'not_personal_song', status: 400 };
    }
    if (
      song.startFrame < 0 ||
      song.durationFrames < 15 ||
      song.startFrame + song.durationFrames > total ||
      song.fadeInFrames < 0 ||
      song.fadeOutFrames < 0 ||
      song.fadeInFrames > 120 ||
      song.fadeOutFrames > 120 ||
      song.gainDb < -60 ||
      song.gainDb > 12
    ) {
      return { ok: false, error: 'placement_out_of_range', status: 400 };
    }
    clips.push({
      id: `song_${memory.id}`,
      src: memory.imagePath,
      assetId: memory.id,
      startFrame: song.startFrame,
      durationFrames: song.durationFrames,
      gainDb: song.gainDb,
      fadeInFrames: song.fadeInFrames,
      fadeOutFrames: song.fadeOutFrames,
    });
  }
  if (clips[0]!.startFrame === clips[1]!.startFrame) {
    return { ok: false, error: 'same_section', status: 400 };
  }

  const video = sceneRanges(tribute.timeline).find((scene) => scene.type === 'video' && scene.src);
  const speechClips: AudioClip[] = video?.src
    ? [
        {
          id: `speech_${video.id}`,
          src: video.src,
          startFrame: video.start,
          durationFrames: Math.max(15, video.duration),
          gainDb: 0,
          fadeInFrames: 0,
          fadeOutFrames: 0,
          sourceSceneId: video.id,
        },
      ]
    : [];
  const duckingRegions = video
    ? [
        {
          id: `duck_${video.id}`,
          startFrame: video.start,
          endFrame: video.start + video.duration,
          musicGainDb: -14,
          reason: 'speech' as const,
        },
      ]
    : [];

  const mix = parseAudioMixContract({
    schemaVersion: 1,
    revision: (tribute.timeline.audio?.revision ?? 0) + 1,
    masterProfile: 'ceremony_safe',
    tracks: [
      {
        id: 'trk_personal_music',
        kind: 'music',
        muted: false,
        gainDb: 0,
        licensed: false,
        rights: {
          source: 'synthetic_rights_declared',
          syntheticOrRightsCleared: true,
          commercialUploadAllowed: false,
          declaredAt: new Date().toISOString(),
          noteKey: 'music.personal.ceremony_private',
        },
        clips,
      },
      ...(speechClips.length
        ? [
            {
              id: 'trk_spoken_video',
              kind: 'speech' as const,
              muted: false,
              gainDb: 0,
              licensed: false,
              clips: speechClips,
            },
          ]
        : []),
    ],
    ducking: {
      enabled: duckingRegions.length > 0,
      musicGainDuringSpeechDb: -14,
      attackFrames: 6,
      releaseFrames: 18,
      regions: duckingRegions,
    },
    ttsProvider: {
      available: false,
      status: 'blocked_xb009',
      reason: 'voice_recreation_requires_legal_review',
    },
  });
  const nextTimeline = parseTimelineContract({ ...tribute.timeline, audio: mix });
  const persisted = await persistGuidedAudioApply({ publicId, timeline: nextTimeline });
  if (!persisted.ok) {
    return { ok: false, error: 'not_found', status: 404 };
  }
  return {
    ok: true,
    mix,
    timeline: persisted.tribute.timeline ?? nextTimeline,
    timelineVersion: persisted.tribute.timelineVersion,
    duckingRegions: mix.ducking.regions.length,
    tts: {
      available: false,
      status: AUDIO_TTS_PROVIDER.status,
      reason: AUDIO_TTS_PROVIDER.reason,
    },
  };
}

/** One-step undo of the last timeline publish (typically guided audio apply). */
export async function revertGuidedAudio(publicId: string): Promise<GuidedAudioActionResult> {
  const tribute = await getTribute(publicId);
  if (!tribute) {
    return { ok: false, error: 'not_found', status: 404 };
  }
  if (!tribute.timelinePrevious) {
    return { ok: false, error: 'nothing_to_revert', status: 409 };
  }
  const reverted = await undoTimeline(publicId, tribute.timelineVersion);
  if (!reverted.ok) {
    return {
      ok: false,
      error: reverted.reason,
      status: reverted.reason === 'conflict' ? 409 : 404,
    };
  }
  return {
    ok: true,
    timeline: reverted.tribute.timeline ?? undefined,
    timelineVersion: reverted.tribute.timelineVersion,
    duckingRegions: reverted.tribute.timeline?.audio?.ducking.regions.length ?? 0,
    tts: {
      available: false,
      status: AUDIO_TTS_PROVIDER.status,
      reason: AUDIO_TTS_PROVIDER.reason,
    },
  };
}
