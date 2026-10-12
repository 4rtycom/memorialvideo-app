import {
  AUDIO_TTS_PROVIDER,
  parseAudioMixContract,
  parseTimelineContract,
  totalDurationFrames,
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
