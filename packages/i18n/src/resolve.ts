import { LAUNCH_LANGUAGES, SOURCE_LOCALE, type LaunchLanguage } from '@memorialvideo/contracts';

import { catalogs, type CommonKey } from './catalogs';

export function isLaunchLanguage(value: string): value is LaunchLanguage {
  return (LAUNCH_LANGUAGES as readonly string[]).includes(value);
}

export function languageFromTag(tag: string): LaunchLanguage | null {
  const normalized = tag.trim().replace('_', '-');
  const language = normalized.split('-')[0]?.toLowerCase();
  if (!language) {
    return null;
  }
  return isLaunchLanguage(language) ? language : null;
}

export function resolveLanguage(input: {
  explicit?: string | null;
  pathnameLocale?: string | null;
  acceptLanguage?: string | null;
}): LaunchLanguage {
  const candidates = [input.explicit, input.pathnameLocale];
  if (input.acceptLanguage) {
    for (const part of input.acceptLanguage.split(',')) {
      const tag = part.split(';')[0];
      if (tag) {
        candidates.push(tag);
      }
    }
  }

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const language = languageFromTag(candidate);
    if (language) {
      return language;
    }
  }

  return SOURCE_LOCALE;
}

export function t(language: LaunchLanguage, key: CommonKey): string {
  const catalog = catalogs[language];
  const message = catalog.messages[key];
  if (!message) {
    throw new Error(`Missing translation key ${key} for ${language}`);
  }
  return message;
}

export function missingKeys(language: LaunchLanguage): CommonKey[] {
  const catalog = catalogs[language];
  return (Object.keys(catalogs.en.messages) as CommonKey[]).filter((key) => !catalog.messages[key]);
}

export function staleLanguages(): LaunchLanguage[] {
  return LAUNCH_LANGUAGES.filter((language) => catalogs[language].status === 'stale');
}
