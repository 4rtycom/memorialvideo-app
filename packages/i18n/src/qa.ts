import { createHash } from 'node:crypto';

import { LAUNCH_LANGUAGES, type LaunchLanguage } from '@memorialvideo/contracts';

import { catalogs, commonKeys, type CatalogStatus } from './catalogs';

export type LocaleQaRow = {
  language: LaunchLanguage;
  status: CatalogStatus;
  missing: string[];
  sourceChecksum: string;
  expandedSample: string;
};

export function sourceChecksum(): string {
  return createHash('sha256').update(JSON.stringify(catalogs.en.messages)).digest('hex');
}

export function pseudoLocalize(value: string): string {
  const expanded = value.replace(/[aeiou]/gi, (char) => `${char}${char}`);
  return `[[ ${expanded} · ${expanded} ]]`;
}

export function localeQaReport(): LocaleQaRow[] {
  const checksum = sourceChecksum();
  return LAUNCH_LANGUAGES.map((language) => {
    const catalog = catalogs[language];
    const missing = commonKeys.filter((key) => !catalog.messages[key]);
    return {
      language,
      status: catalog.status,
      missing,
      sourceChecksum: checksum,
      expandedSample: pseudoLocalize(catalogs.en.messages['brand.tagline']),
    };
  });
}

export function releaseReadyLanguages(): LaunchLanguage[] {
  return localeQaReport().filter((row) => row.status === 'approved' && row.missing.length === 0).map(
    (row) => row.language,
  );
}

export function draftOnlyLanguages(): LaunchLanguage[] {
  return localeQaReport()
    .filter((row) => row.status === 'draft' || row.status === 'stale')
    .map((row) => row.language);
}
