import {
  AUDIO_MIX_CONTRACT_VERSION,
  DEFAULT_FPS,
  emptyAudioMix,
  parseAudioMixContract,
  sceneStartFrames,
  totalDurationFrames,
  type AudioMixContract,
  type AudioRightsDeclaration,
  type DuckingRegion,
  type MixAudioTrack,
  type NarrationTake,
  type SubtitleCue,
  type SubtitleTrack,
  type TimelineContract,
} from '@memorialvideo/contracts';

import { canAttachCatalogTrack } from './music';

export type AudioMusicAttachInput = {
  licensedForDownload: boolean;
  licensedForPrivateStream: boolean;
  userUploaded: boolean;
  featureUserUploads: boolean;
  rights?: AudioRightsDeclaration | null;
};

/** Catalog license OR explicit synthetic/rights-cleared declaration. Commercial uploads stay gated. */
export function canAttachMusicTrack(input: AudioMusicAttachInput): boolean {
  if (input.rights?.source === 'synthetic_rights_declared' && input.rights.syntheticOrRightsCleared) {
    return input.rights.commercialUploadAllowed !== true || input.featureUserUploads === true;
  }
  if (input.rights?.source === 'user_uploaded_commercial') {
    return input.featureUserUploads === true && input.rights.commercialUploadAllowed === true;
  }
  return canAttachCatalogTrack({
    licensedForDownload: input.licensedForDownload,
    licensedForPrivateStream: input.licensedForPrivateStream,
    userUploaded: input.userUploaded,
    featureUserUploads: input.featureUserUploads,
  });
}

export function ensureAudioMix(timeline: TimelineContract): AudioMixContract {
  if (timeline.audio) {
    return parseAudioMixContract(timeline.audio);
  }
  return emptyAudioMix(0);
}

export function withAudioMix(timeline: TimelineContract, audio: AudioMixContract | null): TimelineContract {
  if (!audio) {
    const { audio: _removed, ...rest } = timeline;
    void _removed;
    return rest;
  }
  return { ...timeline, audio: parseAudioMixContract(audio) };
}

function mergeSpeechRegions(regions: DuckingRegion[]): DuckingRegion[] {
  if (regions.length === 0) {
    return [];
  }
  const sorted = [...regions].sort((a, b) => a.startFrame - b.startFrame);
  const merged: DuckingRegion[] = [];
  for (const region of sorted) {
    const last = merged[merged.length - 1];
    if (!last || region.startFrame > last.endFrame) {
      merged.push({ ...region });
      continue;
    }
    last.endFrame = Math.max(last.endFrame, region.endFrame);
  }
  return merged;
}

/** Build ducking regions from active speech and narration clips — not a static volume knob. */
export function computeDuckingRegions(
  mix: AudioMixContract,
  options?: { musicGainDuringSpeechDb?: number },
): DuckingRegion[] {
  const musicGainDb = options?.musicGainDuringSpeechDb ?? mix.ducking.musicGainDuringSpeechDb;
  const regions: DuckingRegion[] = [];
  let index = 0;
  for (const track of mix.tracks) {
    if (track.muted) {
      continue;
    }
    if (track.kind !== 'speech' && track.kind !== 'narration') {
      continue;
    }
    for (const clip of track.clips) {
      regions.push({
        id: `duck_${track.kind}_${index}`,
        startFrame: clip.startFrame,
        endFrame: clip.startFrame + clip.durationFrames,
        musicGainDb,
        reason: track.kind === 'speech' ? 'speech' : 'narration',
      });
      index += 1;
    }
  }
  return mergeSpeechRegions(regions);
}

export function applyAutomaticDucking(mix: AudioMixContract): AudioMixContract {
  const regions = computeDuckingRegions(mix);
  return parseAudioMixContract({
    ...mix,
    ducking: {
      ...mix.ducking,
      enabled: true,
      regions,
    },
  });
}

/** Remotion volume multiplier (0–1) for music at a given frame, with attack/release. */
export function musicVolumeAtFrame(
  mix: AudioMixContract,
  frame: number,
  baseGainDb = 0,
): number {
  const baseLinear = dbToLinear(baseGainDb);
  if (!mix.ducking.enabled || mix.ducking.regions.length === 0) {
    return baseLinear;
  }
  const attack = mix.ducking.attackFrames;
  const release = mix.ducking.releaseFrames;
  let targetDb = 0;
  for (const region of mix.ducking.regions) {
    const duckStart = region.startFrame;
    const duckEnd = region.endFrame;
    if (frame < duckStart - attack || frame > duckEnd + release) {
      continue;
    }
    if (frame >= duckStart && frame <= duckEnd) {
      targetDb = Math.min(targetDb, region.musicGainDb);
      continue;
    }
    if (frame < duckStart && attack > 0) {
      const t = (duckStart - frame) / attack;
      const blended = region.musicGainDb * (1 - t);
      targetDb = Math.min(targetDb, blended);
      continue;
    }
    if (frame > duckEnd && release > 0) {
      const t = (frame - duckEnd) / release;
      const blended = region.musicGainDb * (1 - t);
      targetDb = Math.min(targetDb, blended);
    }
  }
  return baseLinear * dbToLinear(targetDb);
}

export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

export function linearToDb(linear: number): number {
  if (linear <= 0) {
    return -60;
  }
  return 20 * Math.log10(linear);
}

export type GuidedAudioProposalInput = {
  timeline: TimelineContract;
  speechSceneId?: string;
  speechSrc?: string;
  speechAssetId?: string;
  musicSrc: string;
  musicAssetId?: string;
  musicRights: AudioRightsDeclaration;
  narrationTake?: NarrationTake;
  subtitleCues?: SubtitleCue[];
  subtitleLocale?: SubtitleTrack['locale'];
  masterProfile?: AudioMixContract['masterProfile'];
  declaredByUserId?: string;
};

/**
 * Propose a complete Guided Audio mix: original speech + rights-declared music +
 * narration take + automatic ducking + timestamped subtitles.
 */
export function proposeGuidedAudioMix(input: GuidedAudioProposalInput): AudioMixContract {
  const durationFrames = totalDurationFrames(input.timeline);
  const starts = sceneStartFrames(input.timeline);
  const tracks: MixAudioTrack[] = [];

  const videoScene = input.speechSceneId
    ? input.timeline.scenes.find((scene) => scene.id === input.speechSceneId)
    : input.timeline.scenes.find((scene) => scene.type === 'video');

  if (videoScene && videoScene.type === 'video') {
    const sceneIndex = input.timeline.scenes.findIndex((scene) => scene.id === videoScene.id);
    const startFrame = starts[sceneIndex] ?? 0;
    tracks.push({
      id: 'trk_speech',
      kind: 'speech',
      muted: false,
      gainDb: 0,
      licensed: true,
      clips: [
        {
          id: 'clip_speech',
          src: input.speechSrc ?? videoScene.asset.src,
          assetId: input.speechAssetId ?? videoScene.asset.assetId,
          startFrame,
          durationFrames: videoScene.durationFrames,
          gainDb: 0,
          fadeInFrames: 0,
          fadeOutFrames: 0,
          sourceSceneId: videoScene.id,
        },
      ],
    });
  }

  if (!canAttachMusicTrack({
    licensedForDownload: false,
    licensedForPrivateStream: false,
    userUploaded: true,
    featureUserUploads: false,
    rights: input.musicRights,
  })) {
    throw new Error('music_rights');
  }

  tracks.push({
    id: 'trk_music',
    kind: 'music',
    muted: false,
    gainDb: -6,
    licensed: input.musicRights.source === 'catalog_licensed',
    rights: {
      ...input.musicRights,
      declaredByUserId: input.declaredByUserId ?? input.musicRights.declaredByUserId,
    },
    clips: [
      {
        id: 'clip_music',
        src: input.musicSrc,
        assetId: input.musicAssetId,
        startFrame: 0,
        durationFrames,
        gainDb: -6,
        fadeInFrames: 15,
        fadeOutFrames: 30,
      },
    ],
  });

  const narrationTakes: NarrationTake[] = [];
  let selectedNarrationTakeId: string | undefined;
  if (input.narrationTake) {
    const take = {
      ...input.narrationTake,
      approved: true,
      selected: true,
      ttsStatus: input.narrationTake.ttsStatus ?? ('unavailable' as const),
    };
    narrationTakes.push(take);
    selectedNarrationTakeId = take.id;
    const narrStart = Math.min(30, Math.max(0, durationFrames - take.durationFrames));
    tracks.push({
      id: 'trk_narration',
      kind: 'narration',
      muted: false,
      gainDb: 0,
      licensed: true,
      clips: [
        {
          id: 'clip_narration',
          src: take.src,
          assetId: take.assetId,
          startFrame: narrStart,
          durationFrames: take.durationFrames,
          gainDb: 0,
          fadeInFrames: 3,
          fadeOutFrames: 6,
        },
      ],
    });
  }

  const cues = input.subtitleCues ?? [];
  const subtitles: SubtitleTrack[] =
    cues.length > 0
      ? [
          {
            id: 'sub_primary',
            locale: input.subtitleLocale ?? input.timeline.locale,
            attached: true,
            burnIn: true,
            cues,
          },
        ]
      : [];

  const base = parseAudioMixContract({
    schemaVersion: AUDIO_MIX_CONTRACT_VERSION,
    revision: (input.timeline.audio?.revision ?? 0) + 1,
    masterProfile: input.masterProfile ?? 'dialogue_priority',
    tracks,
    ducking: {
      enabled: true,
      musicGainDuringSpeechDb: -14,
      attackFrames: 6,
      releaseFrames: 18,
      regions: [],
    },
    subtitles,
    narrationTakes,
    selectedNarrationTakeId,
    ttsProvider: {
      available: false,
      status: 'blocked_xb009',
      reason: 'voice_recreation_requires_legal_review',
    },
    beatAwareEditing: { available: false, reason: 'no_reliable_beat_analyser' },
  });

  return applyAutomaticDucking(base);
}

export function subtitleCuesFromTranscriptSegments(
  segments: ReadonlyArray<{ id?: string; startMs: number; endMs: number; text: string }>,
  fps: number = DEFAULT_FPS,
): SubtitleCue[] {
  return segments
    .filter((segment) => segment.text.trim().length > 0)
    .map((segment, index) => ({
      id: segment.id ?? `cue_${index + 1}`,
      startFrame: Math.max(0, Math.round((segment.startMs / 1000) * fps)),
      endFrame: Math.max(
        Math.round((segment.startMs / 1000) * fps) + 1,
        Math.round((segment.endMs / 1000) * fps),
      ),
      text: segment.text.trim().slice(0, 280),
      source: 'transcript' as const,
      segmentId: segment.id,
    }));
}

export type MixLoudnessWindow = {
  label: string;
  startFrame: number;
  endFrame: number;
  expectedMusicRelativeDb: number;
};

/** Windows for post-render AAC measurement: speech-active vs music-only. */
export function planMixMeasurementWindows(mix: AudioMixContract, timelineFrames: number): MixLoudnessWindow[] {
  const windows: MixLoudnessWindow[] = [];
  for (const region of mix.ducking.regions) {
    windows.push({
      label: `ducked_${region.reason}`,
      startFrame: region.startFrame,
      endFrame: region.endFrame,
      expectedMusicRelativeDb: region.musicGainDb,
    });
  }
  const ducked = new Set<number>();
  for (const region of mix.ducking.regions) {
    for (let frame = region.startFrame; frame < region.endFrame; frame += 1) {
      ducked.add(frame);
    }
  }
  let musicOnlyStart: number | null = null;
  for (let frame = 0; frame < timelineFrames; frame += 1) {
    const isDucked = ducked.has(frame);
    if (!isDucked && musicOnlyStart === null) {
      musicOnlyStart = frame;
    }
    if ((isDucked || frame === timelineFrames - 1) && musicOnlyStart !== null) {
      const endFrame = isDucked ? frame : frame + 1;
      if (endFrame - musicOnlyStart >= 15) {
        windows.push({
          label: 'music_only',
          startFrame: musicOnlyStart,
          endFrame,
          expectedMusicRelativeDb: 0,
        });
      }
      musicOnlyStart = null;
    }
  }
  return windows;
}
