import { LAUNCH_LANGUAGES } from '@memorialvideo/contracts';
import { describe, expect, it } from 'vitest';

import { draftOnlyLanguages, localeQaReport, pseudoLocalize, sourceChecksum } from './qa';

describe('locale QA harness', () => {
  it('reports every launch language and expands source copy', () => {
    const report = localeQaReport();
    expect(report.map((row) => row.language)).toEqual([...LAUNCH_LANGUAGES]);
    expect(report.every((row) => row.missing.length === 0)).toBe(true);
    expect(report.every((row) => row.sourceChecksum === sourceChecksum())).toBe(true);
    expect(pseudoLocalize('Ready')).toContain('[[');
    expect(pseudoLocalize('Ready').length).toBeGreaterThan('Ready'.length * 1.2);
  });

  it('keeps non-English catalogs as draft until native review', () => {
    expect(draftOnlyLanguages()).toEqual(['nl', 'de', 'fr', 'es', 'pt', 'it', 'pl']);
  });
});
