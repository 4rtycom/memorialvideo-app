import { z } from 'zod';

import { THEME_KEYS, type ThemeKey, type Transition } from './timeline';

/** Structured film style — atmosphere UI must resolve through this, not ad-hoc conditionals. */
export const FILM_STYLE_MANIFEST_VERSION = 1 as const;

export const filmStyleManifestSchema = z.object({
  key: z.enum(THEME_KEYS),
  version: z.literal(FILM_STYLE_MANIFEST_VERSION),
  label: z.string().min(1).max(40),
  background: z.string().min(4).max(32),
  ink: z.string().min(4).max(32),
  muted: z.string().min(4).max(32),
  accent: z.string().min(4).max(32),
  paper: z.string().min(4).max(32),
  watermark: z.string().min(4).max(64),
  mediaMatte: z.string().min(4).max(32),
  titleFamily: z.string().min(1).max(120),
  bodyFamily: z.string().min(1).max(120),
  titleSize: z.number().int().min(48).max(120),
  letterSpacing: z.string().min(1).max(16),
  imageTreatment: z.enum(['editorial', 'fullBleed', 'spotlight']),
  /** Preferred transition when Director / first-film arranges memories. */
  preferredTransition: z.enum(['none', 'fade', 'dissolve']),
  /** Multiplier on paced image durations (1 = default pace). */
  imageDurationScale: z.number().min(0.75).max(1.35),
  /** Ken Burns travel intensity (0 = still, 1 = full default motion). */
  motionIntensity: z.number().min(0).max(1.5),
  /** Optional soft film grain opacity for Remotion (0 = off). */
  grainOpacity: z.number().min(0).max(0.2),
  soundtrackProfile: z.enum(['quiet', 'warm', 'cinematic', 'album', 'minimal']),
  chapterTreatment: z.enum(['centered', 'editorial', 'bold']),
  captionTreatment: z.enum(['paper', 'matte', 'minimal']),
});

export type FilmStyleManifest = z.infer<typeof filmStyleManifestSchema>;

const base = {
  version: FILM_STYLE_MANIFEST_VERSION,
} as const;

export const FILM_STYLE_MANIFESTS = {
  timeless: filmStyleManifestSchema.parse({
    ...base,
    key: 'timeless',
    label: 'Timeless',
    background: '#F6F1E8',
    ink: '#1C2430',
    muted: '#5C6570',
    accent: '#A9784C',
    paper: '#FFFDF8',
    watermark: 'rgba(28, 36, 48, 0.28)',
    mediaMatte: '#1C2430',
    titleFamily: 'Georgia, "Times New Roman", serif',
    bodyFamily: 'system-ui, sans-serif',
    titleSize: 92,
    letterSpacing: '0.18em',
    imageTreatment: 'editorial',
    preferredTransition: 'dissolve',
    imageDurationScale: 1.05,
    motionIntensity: 0.85,
    grainOpacity: 0.02,
    soundtrackProfile: 'quiet',
    chapterTreatment: 'centered',
    captionTreatment: 'paper',
  }),
  warm_light: filmStyleManifestSchema.parse({
    ...base,
    key: 'warm_light',
    label: 'Warm Light',
    background: '#F3E3CF',
    ink: '#3A2416',
    muted: '#7A5340',
    accent: '#C46A3A',
    paper: '#FFF6EA',
    watermark: 'rgba(58, 36, 22, 0.32)',
    mediaMatte: '#2A1810',
    titleFamily: 'Georgia, "Palatino Linotype", serif',
    bodyFamily: 'Georgia, serif',
    titleSize: 88,
    letterSpacing: '0.08em',
    imageTreatment: 'fullBleed',
    preferredTransition: 'fade',
    imageDurationScale: 1.1,
    motionIntensity: 0.7,
    grainOpacity: 0.015,
    soundtrackProfile: 'warm',
    chapterTreatment: 'editorial',
    captionTreatment: 'paper',
  }),
  cinematic_dark: filmStyleManifestSchema.parse({
    ...base,
    key: 'cinematic_dark',
    label: 'Cinematic Dark',
    background: '#121418',
    ink: '#F4EFE6',
    muted: '#B8B1A6',
    accent: '#D4B483',
    paper: '#1A1D22',
    watermark: 'rgba(244, 239, 230, 0.34)',
    mediaMatte: '#0B0C0E',
    titleFamily: '"Iowan Old Style", Georgia, serif',
    bodyFamily: 'system-ui, sans-serif',
    titleSize: 84,
    letterSpacing: '0.22em',
    imageTreatment: 'spotlight',
    preferredTransition: 'dissolve',
    imageDurationScale: 1.15,
    motionIntensity: 1.1,
    grainOpacity: 0.06,
    soundtrackProfile: 'cinematic',
    chapterTreatment: 'bold',
    captionTreatment: 'matte',
  }),
  family_album: filmStyleManifestSchema.parse({
    ...base,
    key: 'family_album',
    label: 'Family Album',
    background: '#EFE6D6',
    ink: '#2C241C',
    muted: '#6B5A4A',
    accent: '#8B5A3C',
    paper: '#F7F1E6',
    watermark: 'rgba(44, 36, 28, 0.3)',
    mediaMatte: '#3A2F26',
    titleFamily: 'Georgia, "Palatino Linotype", serif',
    bodyFamily: 'Georgia, serif',
    titleSize: 80,
    letterSpacing: '0.06em',
    imageTreatment: 'editorial',
    preferredTransition: 'fade',
    imageDurationScale: 0.95,
    motionIntensity: 0.55,
    grainOpacity: 0.03,
    soundtrackProfile: 'album',
    chapterTreatment: 'editorial',
    captionTreatment: 'paper',
  }),
  simple_contemporary: filmStyleManifestSchema.parse({
    ...base,
    key: 'simple_contemporary',
    label: 'Simple & Contemporary',
    background: '#F4F2EE',
    ink: '#1A1A1A',
    muted: '#5A5A5A',
    accent: '#4A5560',
    paper: '#FFFFFF',
    watermark: 'rgba(26, 26, 26, 0.28)',
    mediaMatte: '#111111',
    titleFamily: 'system-ui, "Segoe UI", sans-serif',
    bodyFamily: 'system-ui, sans-serif',
    titleSize: 76,
    letterSpacing: '0.04em',
    imageTreatment: 'fullBleed',
    preferredTransition: 'fade',
    imageDurationScale: 0.9,
    motionIntensity: 0.4,
    grainOpacity: 0,
    soundtrackProfile: 'minimal',
    chapterTreatment: 'centered',
    captionTreatment: 'minimal',
  }),
} as const satisfies Record<ThemeKey, FilmStyleManifest>;

export function resolveFilmStyleManifest(key: ThemeKey): FilmStyleManifest {
  return FILM_STYLE_MANIFESTS[key];
}

export function preferredTransitionForTheme(key: ThemeKey): Transition {
  return resolveFilmStyleManifest(key).preferredTransition;
}

export function scaleImageDurationSeconds(key: ThemeKey, baseSeconds: number): number {
  const scaled = baseSeconds * resolveFilmStyleManifest(key).imageDurationScale;
  return Math.min(8, Math.max(2, Math.round(scaled * 10) / 10));
}
