import { describe, expect, it } from 'vitest';

import { buildCeremonyPackManifest, canBuildCeremonyPack, safeCeremonyFileStem } from './ceremony-pack';

describe('ceremony pack', () => {
  it('names files from the opaque public id, never a person name', () => {
    const pack = buildCeremonyPackManifest('mv_abcd1234');
    expect(pack.videoFileName).toBe('mv_abcd1234-1080p.mp4');
    expect(pack.notes.length).toBeGreaterThan(0);
    expect(safeCeremonyFileStem('Helena Żurawska')).toBe('Helenaurawska');
    expect(canBuildCeremonyPack({ includesCeremonyPack: true, outputVerified: true, qcPassed: true })).toBe(true);
    expect(canBuildCeremonyPack({ includesCeremonyPack: true, outputVerified: false, qcPassed: true })).toBe(false);
  });
});
