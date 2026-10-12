import {
  resolveFilmStyleManifest,
  type FilmStyleManifest,
  type ThemeKey,
} from '@memorialvideo/contracts';

/** Remotion presentation tokens derived from the canonical FilmStyleManifest. */
export type ThemeTokens = {
  key: ThemeKey;
  version: FilmStyleManifest['version'];
  background: string;
  ink: string;
  muted: string;
  accent: string;
  paper: string;
  watermark: string;
  mediaMatte: string;
  titleFamily: string;
  bodyFamily: string;
  titleSize: number;
  letterSpacing: string;
  imageTreatment: FilmStyleManifest['imageTreatment'];
  motionIntensity: number;
  grainOpacity: number;
  soundtrackProfile: FilmStyleManifest['soundtrackProfile'];
  chapterTreatment: FilmStyleManifest['chapterTreatment'];
  captionTreatment: FilmStyleManifest['captionTreatment'];
  preferredTransition: FilmStyleManifest['preferredTransition'];
};

export const videoSafe = {
  paddingX: 160,
  paddingY: 110,
} as const;

function tokensFromManifest(manifest: FilmStyleManifest): ThemeTokens {
  return {
    key: manifest.key,
    version: manifest.version,
    background: manifest.background,
    ink: manifest.ink,
    muted: manifest.muted,
    accent: manifest.accent,
    paper: manifest.paper,
    watermark: manifest.watermark,
    mediaMatte: manifest.mediaMatte,
    titleFamily: manifest.titleFamily,
    bodyFamily: manifest.bodyFamily,
    titleSize: manifest.titleSize,
    letterSpacing: manifest.letterSpacing,
    imageTreatment: manifest.imageTreatment,
    motionIntensity: manifest.motionIntensity,
    grainOpacity: manifest.grainOpacity,
    soundtrackProfile: manifest.soundtrackProfile,
    chapterTreatment: manifest.chapterTreatment,
    captionTreatment: manifest.captionTreatment,
    preferredTransition: manifest.preferredTransition,
  };
}

export function resolveTheme(key: ThemeKey): ThemeTokens {
  return tokensFromManifest(resolveFilmStyleManifest(key));
}

export const timeless = resolveTheme('timeless');
export const warmLight = resolveTheme('warm_light');
export const cinematicDark = resolveTheme('cinematic_dark');
export const familyAlbum = resolveTheme('family_album');
export const simpleContemporary = resolveTheme('simple_contemporary');

export const THEME_TOKENS = {
  timeless,
  warm_light: warmLight,
  cinematic_dark: cinematicDark,
  family_album: familyAlbum,
  simple_contemporary: simpleContemporary,
} as const;
