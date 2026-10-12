import { z } from 'zod';

import { aiProvenanceSchema, INTELLIGENCE_CONTRACT_VERSION } from './intelligence';
import { launchLanguageSchema } from './locale';

export const AUDIO_MIX_CONTRACT_VERSION = INTELLIGENCE_CONTRACT_VERSION;

export const AUDIO_TRACK_KINDS = ['speech', 'music', 'narration', 'ambient'] as const;
export type AudioTrackKind = (typeof AUDIO_TRACK_KINDS)[number];

export const AUDIO_MASTER_PROFILES = ['ceremony_safe', 'dialogue_priority', 'music_forward'] as const;
export type AudioMasterProfile = (typeof AUDIO_MASTER_PROFILES)[number];

export const AUDIO_RIGHTS_SOURCES = [
  'catalog_licensed',
  'synthetic_rights_declared',
  'user_uploaded_commercial',
] as const;
export type AudioRightsSource = (typeof AUDIO_RIGHTS_SOURCES)[number];

export const AUDIO_TTS_STATUSES = ['unavailable', 'blocked_xb009', 'provider_boundary_only'] as const;
export type AudioTtsStatus = (typeof AUDIO_TTS_STATUSES)[number];

/** Production TTS stays unavailable; uploaded narration is the supported path. */
export const AUDIO_TTS_PROVIDER = {
  name: 'none',
  version: 'blocked',
  available: false as const,
  status: 'blocked_xb009' as const,
  reason: 'voice_recreation_requires_legal_review',
};

export const AUDIO_LOCAL_MIX_ENGINE = {
  name: 'memorialvideo-audio-mix',
  version: 'v1-local',
  kind: 'deterministic' as const,
  processing: 'local' as const,
};

export const audioRightsDeclarationSchema = z.object({
  source: z.enum(AUDIO_RIGHTS_SOURCES),
  declaredByUserId: z.string().min(1).max(80).optional(),
  declaredAt: z.string().datetime().optional(),
  syntheticOrRightsCleared: z.boolean(),
  commercialUploadAllowed: z.boolean().default(false),
  noteKey: z.string().max(120).optional(),
});
export type AudioRightsDeclaration = z.infer<typeof audioRightsDeclarationSchema>;

export const audioClipSchema = z.object({
  id: z.string().min(1).max(80),
  src: z.string().min(1).max(400),
  assetId: z.string().min(1).max(80).optional(),
  startFrame: z.number().int().nonnegative(),
  durationFrames: z.number().int().positive().max(30 * 60 * 30),
  gainDb: z.number().min(-60).max(12).default(0),
  fadeInFrames: z.number().int().nonnegative().max(120).default(0),
  fadeOutFrames: z.number().int().nonnegative().max(120).default(0),
  /** When set, clip audio is taken from a video scene (original speech). */
  sourceSceneId: z.string().min(1).max(80).optional(),
});
export type AudioClip = z.infer<typeof audioClipSchema>;

export const mixAudioTrackSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(AUDIO_TRACK_KINDS),
  labelKey: z.string().max(120).optional(),
  muted: z.boolean().default(false),
  gainDb: z.number().min(-60).max(12).default(0),
  licensed: z.boolean(),
  rights: audioRightsDeclarationSchema.optional(),
  clips: z.array(audioClipSchema).max(48).default([]),
  provenance: aiProvenanceSchema.optional(),
});
export type MixAudioTrack = z.infer<typeof mixAudioTrackSchema>;

export const duckingRegionSchema = z.object({
  id: z.string().min(1).max(80),
  startFrame: z.number().int().nonnegative(),
  endFrame: z.number().int().positive(),
  musicGainDb: z.number().min(-60).max(0),
  reason: z.enum(['speech', 'narration']),
});
export type DuckingRegion = z.infer<typeof duckingRegionSchema>;

export const duckingProfileSchema = z.object({
  enabled: z.boolean().default(true),
  musicGainDuringSpeechDb: z.number().min(-60).max(0).default(-14),
  attackFrames: z.number().int().nonnegative().max(60).default(6),
  releaseFrames: z.number().int().nonnegative().max(90).default(18),
  regions: z.array(duckingRegionSchema).max(240).default([]),
});
export type DuckingProfile = z.infer<typeof duckingProfileSchema>;

export const subtitleCueSchema = z.object({
  id: z.string().min(1).max(80),
  startFrame: z.number().int().nonnegative(),
  endFrame: z.number().int().positive(),
  text: z.string().min(1).max(280),
  locale: launchLanguageSchema.optional(),
  source: z.enum(['transcript', 'narration_script', 'manual']).default('manual'),
  segmentId: z.string().max(80).optional(),
});
export type SubtitleCue = z.infer<typeof subtitleCueSchema>;

export const subtitleTrackSchema = z.object({
  id: z.string().min(1).max(80),
  locale: launchLanguageSchema,
  attached: z.boolean().default(false),
  burnIn: z.boolean().default(true),
  cues: z.array(subtitleCueSchema).max(500).default([]),
});
export type SubtitleTrack = z.infer<typeof subtitleTrackSchema>;

export const narrationTakeSchema = z.object({
  id: z.string().min(1).max(80),
  src: z.string().min(1).max(400),
  assetId: z.string().min(1).max(80).optional(),
  durationFrames: z.number().int().positive().max(30 * 60 * 30),
  approved: z.boolean().default(false),
  selected: z.boolean().default(false),
  scriptText: z.string().max(2000).optional(),
  /** Spoken excerpt approved for film may supply narration without TTS. */
  excerptId: z.string().max(80).optional(),
  ttsStatus: z.enum(AUDIO_TTS_STATUSES).default('unavailable'),
});
export type NarrationTake = z.infer<typeof narrationTakeSchema>;

export const audioMixContractSchema = z
  .object({
    schemaVersion: z.literal(AUDIO_MIX_CONTRACT_VERSION),
    revision: z.number().int().nonnegative().default(0),
    masterProfile: z.enum(AUDIO_MASTER_PROFILES).default('ceremony_safe'),
    tracks: z.array(mixAudioTrackSchema).max(16).default([]),
    ducking: duckingProfileSchema.default({
      enabled: true,
      musicGainDuringSpeechDb: -14,
      attackFrames: 6,
      releaseFrames: 18,
      regions: [],
    }),
    subtitles: z.array(subtitleTrackSchema).max(8).default([]),
    narrationTakes: z.array(narrationTakeSchema).max(12).default([]),
    selectedNarrationTakeId: z.string().max(80).optional(),
    ttsProvider: z
      .object({
        available: z.literal(false),
        status: z.enum(AUDIO_TTS_STATUSES),
        reason: z.string().max(120),
      })
      .default({
        available: false,
        status: 'blocked_xb009',
        reason: 'voice_recreation_requires_legal_review',
      }),
    beatAwareEditing: z
      .object({
        available: z.literal(false),
        reason: z.string().max(120).default('no_reliable_beat_analyser'),
      })
      .default({ available: false, reason: 'no_reliable_beat_analyser' }),
  })
  .superRefine((mix, ctx) => {
    const trackIds = new Set<string>();
    for (const [index, track] of mix.tracks.entries()) {
      if (trackIds.has(track.id)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Audio track ids must be unique',
          path: ['tracks', index, 'id'],
        });
      }
      trackIds.add(track.id);
      if (track.kind === 'music' && track.licensed !== true) {
        const rightsOk =
          track.rights?.source === 'synthetic_rights_declared' &&
          track.rights.syntheticOrRightsCleared === true;
        if (!rightsOk) {
          ctx.addIssue({
            code: 'custom',
            message: 'Music track requires license or synthetic rights declaration',
            path: ['tracks', index, 'rights'],
          });
        }
      }
    }
    for (const [index, region] of mix.ducking.regions.entries()) {
      if (region.endFrame <= region.startFrame) {
        ctx.addIssue({
          code: 'custom',
          message: 'Ducking region endFrame must be greater than startFrame',
          path: ['ducking', 'regions', index, 'endFrame'],
        });
      }
    }
    for (const [tIndex, track] of mix.subtitles.entries()) {
      for (const [cIndex, cue] of track.cues.entries()) {
        if (cue.endFrame <= cue.startFrame) {
          ctx.addIssue({
            code: 'custom',
            message: 'Subtitle cue endFrame must be greater than startFrame',
            path: ['subtitles', tIndex, 'cues', cIndex, 'endFrame'],
          });
        }
      }
    }
    if (mix.selectedNarrationTakeId) {
      const found = mix.narrationTakes.some((take) => take.id === mix.selectedNarrationTakeId);
      if (!found) {
        ctx.addIssue({
          code: 'custom',
          message: 'selectedNarrationTakeId must reference a narration take',
          path: ['selectedNarrationTakeId'],
        });
      }
    }
  });
export type AudioMixContract = z.infer<typeof audioMixContractSchema>;

export function parseAudioMixContract(input: unknown): AudioMixContract {
  return audioMixContractSchema.parse(input);
}

export function emptyAudioMix(revision = 0): AudioMixContract {
  return parseAudioMixContract({
    schemaVersion: AUDIO_MIX_CONTRACT_VERSION,
    revision,
    masterProfile: 'ceremony_safe',
    tracks: [],
    ducking: {
      enabled: true,
      musicGainDuringSpeechDb: -14,
      attackFrames: 6,
      releaseFrames: 18,
      regions: [],
    },
    subtitles: [],
    narrationTakes: [],
    ttsProvider: {
      available: false,
      status: 'blocked_xb009',
      reason: 'voice_recreation_requires_legal_review',
    },
    beatAwareEditing: { available: false, reason: 'no_reliable_beat_analyser' },
  });
}
