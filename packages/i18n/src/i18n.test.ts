import { LAUNCH_LANGUAGES } from '@memorialvideo/contracts';
import { describe, expect, it } from 'vitest';

import { catalogs, commonKeys } from './catalogs';
import { ENGLISH_IDENTIFIERS } from './locale-drafts';
import { missingKeys, resolveLanguage, t } from './resolve';

describe('locale foundation', () => {
  it('has every common key in all eight launch languages', () => {
    for (const language of LAUNCH_LANGUAGES) {
      expect(missingKeys(language)).toEqual([]);
      expect(Object.keys(catalogs[language].messages)).toHaveLength(commonKeys.length);
    }
  });

  it('resolves BCP 47 tags deterministically', () => {
    expect(resolveLanguage({ explicit: 'de-DE' })).toBe('de');
    expect(resolveLanguage({ pathnameLocale: 'pt-BR' })).toBe('pt');
    expect(resolveLanguage({ acceptLanguage: 'pl-PL,pl;q=0.9,en;q=0.8' })).toBe('pl');
    expect(resolveLanguage({ acceptLanguage: 'sv-SE' })).toBe('en');
  });

  it('returns Polish and German copy rather than raw keys', () => {
    expect(t('pl', 'nav.ceremony')).toContain('ceremonię');
    expect(t('de', 'brand.tagline')).toContain('würd');
    expect(t('nl', 'brand.tagline')).toContain('eerbetoon');
  });

  it('keeps leftover English out of draft catalogs except product identifiers', () => {
    const allowed = new Set<string>(ENGLISH_IDENTIFIERS);
    const leftovers: string[] = [];
    for (const language of LAUNCH_LANGUAGES) {
      if (language === 'en') {
        continue;
      }
      for (const key of commonKeys) {
        if (allowed.has(key)) {
          continue;
        }
        if (catalogs[language].messages[key] === catalogs.en.messages[key]) {
          leftovers.push(`${language} ${key}`);
        }
      }
    }
    expect(leftovers).toEqual([]);
  });
});
