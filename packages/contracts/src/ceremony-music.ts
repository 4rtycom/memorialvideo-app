import { z } from 'zod';

export const CEREMONY_MUSIC_MOMENTS = ['opening', 'tribute', 'reflection', 'closing'] as const;
export type CeremonyMusicMoment = (typeof CEREMONY_MUSIC_MOMENTS)[number];

export const CEREMONY_MUSIC_MODES = ['single', 'moments'] as const;
export type CeremonyMusicMode = (typeof CEREMONY_MUSIC_MODES)[number];

export const CEREMONY_MUSIC_MOODS = ['calm', 'warm', 'uplifting'] as const;
export type CeremonyMusicMood = (typeof CEREMONY_MUSIC_MOODS)[number];

export const ceremonyMusicSlotSchema = z.object({
  trackKey: z.string().min(1).max(80).nullable(),
  venueHandled: z.boolean().optional(),
});
export type CeremonyMusicSlot = z.infer<typeof ceremonyMusicSlotSchema>;

export const ceremonyMusicPlanSchema = z.object({
  mode: z.enum(CEREMONY_MUSIC_MODES).default('single'),
  slots: z.object({
    opening: ceremonyMusicSlotSchema,
    tribute: ceremonyMusicSlotSchema,
    reflection: ceremonyMusicSlotSchema,
    closing: ceremonyMusicSlotSchema,
  }),
});
export type CeremonyMusicPlan = z.infer<typeof ceremonyMusicPlanSchema>;

export const catalogTrackDtoSchema = z.object({
  trackKey: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  artistDisplay: z.string().min(1).max(120),
  durationMs: z.number().int().positive(),
  momentTags: z.array(z.enum(CEREMONY_MUSIC_MOMENTS)).min(1),
  moodTags: z.array(z.enum(CEREMONY_MUSIC_MOODS)).default([]),
  previewUrl: z.string().min(1).max(400),
  licenseStatus: z.enum(['development_only', 'approved', 'retired']),
  licensedForPreview: z.boolean(),
});
export type CatalogTrackDto = z.infer<typeof catalogTrackDtoSchema>;
