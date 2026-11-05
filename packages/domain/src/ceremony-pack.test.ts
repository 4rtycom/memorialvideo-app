import { describe, expect, it } from 'vitest';

import {
  buildCeremonyPackManifest,
  canBuildCeremonyPack,
  ceremonyChecklistText,
  ceremonyCueSheetText,
  safeCeremonyFileStem,
} from './ceremony-pack';

describe('ceremony pack', () => {
  it('names files from the opaque public id, never a person name', () => {
    const pack = buildCeremonyPackManifest('mv_abcd1234');
    expect(pack.videoFileName).toBe('mv_abcd1234-1080p.mp4');
    expect(pack.cueSheetFileName).toBe('mv_abcd1234-cue-sheet.txt');
    expect(pack.notes.length).toBeGreaterThan(0);
    expect(safeCeremonyFileStem('Helena Żurawska')).toBe('Helenaurawska');
    expect(canBuildCeremonyPack({ includesCeremonyPack: true, outputVerified: true, qcPassed: true })).toBe(true);
    expect(canBuildCeremonyPack({ includesCeremonyPack: true, outputVerified: false, qcPassed: true })).toBe(false);
  });

  it('prints an honest cue sheet with running order and manual pause guidance', () => {
    const text = ceremonyCueSheetText({
      publicId: 'mv_abcd1234',
      displayName: 'Alex',
      totalLabel: '04:12',
      interactivePlayerReady: false,
      chapters: [
        { title: 'Opening', startLabel: '00:00' },
        { title: 'Early years', startLabel: '00:45' },
      ],
    });
    expect(text).toContain('Ceremony cue sheet');
    expect(text).toContain('01  Opening');
    expect(text).toContain('02  Early years');
    expect(text).toContain('not included in this ZIP');
    expect(ceremonyChecklistText('mv_abcd1234')).toContain('Pause for live words');
  });
});
