import { describe, expect, it } from 'vitest';

import { createThemeGoldenTimeline, createWorkerSmokeTimeline } from './timelines';
import { cinematicDark, familyAlbum, resolveTheme, simpleContemporary, timeless, warmLight } from './theme';

describe('theme versions', () => {
  it('keeps five dignified and visually distinct palettes', () => {
    expect(
      new Set([
        timeless.background,
        warmLight.background,
        cinematicDark.background,
        familyAlbum.background,
        simpleContemporary.background,
      ]).size,
    ).toBe(5);
    expect(new Set([timeless.imageTreatment, warmLight.imageTreatment, cinematicDark.imageTreatment]).size).toBe(3);
    expect(resolveTheme('cinematic_dark').ink).not.toBe(resolveTheme('timeless').ink);
    expect(timeless.version).toBe(1);
    expect(warmLight.gradeWarmth).toBeGreaterThan(cinematicDark.gradeWarmth);
    expect(cinematicDark.grainOpacity).toBeGreaterThan(simpleContemporary.grainOpacity);
  });

  it('builds a dedicated golden contract for each theme', () => {
    const timelessGold = createThemeGoldenTimeline('timeless', true);
    const warmGold = createThemeGoldenTimeline('warm_light', true);
    const darkGold = createThemeGoldenTimeline('cinematic_dark', false);
    const albumGold = createThemeGoldenTimeline('family_album', true);
    const contemporaryGold = createThemeGoldenTimeline('simple_contemporary', true);
    expect(timelessGold.themeKey).toBe('timeless');
    expect(warmGold.themeKey).toBe('warm_light');
    expect(darkGold.themeKey).toBe('cinematic_dark');
    expect(albumGold.themeKey).toBe('family_album');
    expect(contemporaryGold.themeKey).toBe('simple_contemporary');
    expect(timelessGold.watermark).toBe(true);
    expect(darkGold.watermark).toBe(false);
    expect(resolveTheme(warmGold.themeKey).imageTreatment).toBe('fullBleed');
    expect(resolveTheme(darkGold.themeKey).imageTreatment).toBe('spotlight');
    expect(resolveTheme(albumGold.themeKey).imageTreatment).toBe('editorial');
    expect(resolveTheme(contemporaryGold.themeKey).imageTreatment).toBe('fullBleed');
    for (const gold of [timelessGold, warmGold, albumGold, contemporaryGold, darkGold]) {
      expect(gold.width).toBe(1920);
      expect(gold.height).toBe(1080);
      expect(gold.fps).toBe(30);
      expect(gold.seed).toBe(42);
      expect(gold.scenes.map((scene) => scene.type)).toEqual([
        'intro',
        'chapter',
        'image',
        'image',
        'quote',
        'outro',
      ]);
    }
  });

  it('keeps the worker smoke timeline under four seconds', () => {
    const smoke = createWorkerSmokeTimeline(true);
    const frames = smoke.scenes.reduce((sum, scene) => sum + scene.durationFrames, 0);
    expect(frames).toBe(90);
    expect(smoke.watermark).toBe(true);
    expect(smoke.music?.trackId).toBe('still-water');
    expect(createWorkerSmokeTimeline(true, 'cinematic_dark').themeKey).toBe('cinematic_dark');
  });
});
