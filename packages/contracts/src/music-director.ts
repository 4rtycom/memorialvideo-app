import { z } from 'zod';

/** Family-facing ceremony song moments (MV-AUD-003). */
export const MUSIC_DIRECTOR_SLOTS = ['opening', 'memories', 'farewell'] as const;
export type MusicDirectorSlotId = (typeof MUSIC_DIRECTOR_SLOTS)[number];

/**
 * Honest audio source state — never claim embedded playback when only a reference exists.
 * - empty: slot unused
 * - song_identified: title/artist/link known; no playable audio in the product
 * - audio_available: development catalog (or cleared personal) audio can preview
 * - venue_playback: family expects the venue to play this song live
 * - embedded_audio_licensed: licensed masters cleared for film embed (XB-002 gated)
 */
export const MUSIC_SOURCE_STATES = [
  'empty',
  'song_identified',
  'audio_available',
  'venue_playback',
  'embedded_audio_licensed',
] as const;
export type MusicSourceState = (typeof MUSIC_SOURCE_STATES)[number];

export const MUSIC_LINK_PLATFORMS = ['spotify', 'apple_music', 'youtube', 'other'] as const;
export type MusicLinkPlatform = (typeof MUSIC_LINK_PLATFORMS)[number];

export const musicSongReferenceSchema = z.object({
  title: z.string().trim().max(160).default(''),
  artist: z.string().trim().max(160).default(''),
  /** External stream link kept as a reference only — never auto-fetched as audio. */
  linkUrl: z.string().trim().max(500).nullable().default(null),
  linkPlatform: z.enum(MUSIC_LINK_PLATFORMS).nullable().default(null),
  /** Synthetic/dev catalog id when chosen from the in-app catalog. */
  catalogTrackKey: z.string().min(1).max(80).nullable().default(null),
  /**
   * Known or family-entered song length in ms.
   * Used for pack projection — never invent a silent trim from a missing value.
   */
  durationMs: z.number().int().positive().max(60 * 60 * 1000).nullable().default(null),
  notes: z.string().trim().max(280).default(''),
});
export type MusicSongReference = z.infer<typeof musicSongReferenceSchema>;

export const musicDirectorSlotSchema = z.object({
  id: z.enum(MUSIC_DIRECTOR_SLOTS),
  label: z.string().min(1).max(40),
  order: z.number().int().min(0).max(20),
  sourceState: z.enum(MUSIC_SOURCE_STATES).default('empty'),
  song: musicSongReferenceSchema.default({
    title: '',
    artist: '',
    linkUrl: null,
    linkPlatform: null,
    catalogTrackKey: null,
    durationMs: null,
    notes: '',
  }),
});
export type MusicDirectorSlot = z.infer<typeof musicDirectorSlotSchema>;

/** Speech / silence cue between film moments — operator resumes in ceremony mode. */
export const ceremonySpeechPauseSchema = z.object({
  id: z.string().min(4).max(80),
  /** After which music slot the pause waits (null = before opening). */
  afterSlot: z.enum(MUSIC_DIRECTOR_SLOTS).nullable().default(null),
  label: z.string().trim().min(1).max(120),
  /** Soft still / waiting note for the operator cue sheet. */
  waitingNote: z.string().trim().max(280).default(''),
  enabled: z.boolean().default(true),
});
export type CeremonySpeechPause = z.infer<typeof ceremonySpeechPauseSchema>;

export const musicDirectorPlanSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  slots: z.array(musicDirectorSlotSchema).min(1).max(8),
  speechPauses: z.array(ceremonySpeechPauseSchema).max(12).default([]),
  rightsConfirmed: z.boolean().default(false),
  updatedAt: z.string().min(10).max(40).nullable().default(null),
});
export type MusicDirectorPlan = z.infer<typeof musicDirectorPlanSchema>;

export function parseMusicDirectorPlan(input: unknown): MusicDirectorPlan {
  return musicDirectorPlanSchema.parse(input);
}
