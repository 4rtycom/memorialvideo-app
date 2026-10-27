import { describe, expect, it } from 'vitest';
import { THEME_KEYS } from '@memorialvideo/contracts';
import { resolveCreatorThemeKey } from './creator-themes';

describe('resolveCreatorThemeKey', () => {
  it('passes through all five first-class ThemeKeys', () => {
    for (const key of THEME_KEYS) {
      expect(resolveCreatorThemeKey(key)).toBe(key);
    }
  });

  it('maps legacy joyful/peaceful aliases', () => {
    expect(resolveCreatorThemeKey('joyful')).toBe('warm_light');
    expect(resolveCreatorThemeKey('peaceful')).toBe('family_album');
  });

  it('falls back to timeless for unknown or empty input', () => {
    expect(resolveCreatorThemeKey(undefined)).toBe('timeless');
    expect(resolveCreatorThemeKey('')).toBe('timeless');
    expect(resolveCreatorThemeKey('not-a-style')).toBe('timeless');
  });
});
