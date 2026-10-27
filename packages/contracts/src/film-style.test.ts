import { describe, expect, it } from 'vitest';

import {
  FILM_STYLE_MANIFESTS,
  preferredTransitionForTheme,
  resolveFilmStyleManifest,
  scaleImageDurationSeconds,
  THEME_KEYS,
} from './index';

describe('FilmStyleManifest', () => {
  it('defines a structured manifest for every theme key', () => {
    for (const key of THEME_KEYS) {
      const manifest = resolveFilmStyleManifest(key);
      expect(manifest.key).toBe(key);
      expect(manifest.version).toBe(1);
      expect(manifest.imageDurationScale).toBeGreaterThan(0);
      expect(FILM_STYLE_MANIFESTS[key]).toEqual(manifest);
    }
  });

  it('produces visibly different pacing and treatment across looks', () => {
    const timeless = resolveFilmStyleManifest('timeless');
    const dark = resolveFilmStyleManifest('cinematic_dark');
    const contemporary = resolveFilmStyleManifest('simple_contemporary');
    const warm = resolveFilmStyleManifest('warm_light');
    expect(timeless.imageTreatment).not.toBe(dark.imageTreatment);
    expect(dark.grainOpacity).toBeGreaterThan(contemporary.grainOpacity);
    expect(warm.gradeWarmth).toBeGreaterThan(dark.gradeWarmth);
    expect(dark.gradeContrast).toBeGreaterThan(contemporary.gradeContrast);
    expect(preferredTransitionForTheme('warm_light')).toBe('fade');
    expect(scaleImageDurationSeconds('cinematic_dark', 4)).toBeGreaterThan(
      scaleImageDurationSeconds('simple_contemporary', 4),
    );
  });
});

