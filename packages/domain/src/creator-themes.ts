import { THEME_KEYS, type ThemeKey } from '@memorialvideo/contracts';

/**
 * Legacy creator UI aliases (pre–5-style desk) → canonical ThemeKey.
 * Keep forever so saved tributes and older clients still resolve.
 */
export const CREATOR_THEME_ALIASES = {
  joyful: 'warm_light',
  peaceful: 'family_album',
} as const satisfies Record<string, ThemeKey>;

export type CreatorThemeAlias = keyof typeof CREATOR_THEME_ALIASES;

/** Values the creator desk may persist or receive from older clients. */
export const CREATOR_THEME_INPUTS = [
  ...THEME_KEYS,
  ...(Object.keys(CREATOR_THEME_ALIASES) as CreatorThemeAlias[]),
] as const;

export type CreatorThemeInput = (typeof CREATOR_THEME_INPUTS)[number];

export function isThemeKey(value: string): value is ThemeKey {
  return (THEME_KEYS as readonly string[]).includes(value);
}

/**
 * Normalize any creator theme input (including joyful/peaceful) to a FilmStyleManifest key.
 */
export function resolveCreatorThemeKey(input: string | null | undefined): ThemeKey {
  if (!input) {
    return 'timeless';
  }
  const trimmed = input.trim();
  if (isThemeKey(trimmed)) {
    return trimmed;
  }
  const alias = CREATOR_THEME_ALIASES[trimmed as CreatorThemeAlias];
  if (alias) {
    return alias;
  }
  return 'timeless';
}
