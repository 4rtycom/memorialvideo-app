import { describe, expect, it } from 'vitest';

import {
  buildCeremonyPackManifest,
  canBuildCeremonyPack,
  ceremonyChecklistText,
  ceremonyCueSheetText,
  ceremonyOfflinePlayerHtml,
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
    expect(ceremonyChecklistText('mv_abcd1234')).toContain('ceremony-player.html');
  });

  it('points operators at the offline interactive player when packed', () => {
    const text = ceremonyCueSheetText({
      publicId: 'mv_abcd1234',
      displayName: 'Alex',
      interactivePlayerReady: true,
      interactivePlayerFileName: 'ceremony-player.html',
      chapters: [{ title: '⏸ Live words — Eulogy', startLabel: '02:10' }],
    });
    expect(text).toContain('ceremony-player.html');
    expect(text).toContain('Live words — Eulogy');
  });

  it('builds offline ceremony-player.html with pause/resume and local MP4', () => {
    const html = ceremonyOfflinePlayerHtml({
      videoFileName: 'mv_abcd1234-1080p.mp4',
      displayName: 'Alex',
      cues: [{ title: 'Eulogy', startLabel: '2:10', startSeconds: 130 }],
    });
    expect(html).toContain('Ceremony Player');
    expect(html).toContain('./mv_abcd1234-1080p.mp4');
    expect(html).toContain('Pause for speech');
    expect(html).toContain('Resume film');
    expect(html).toContain('Fullscreen display');
    expect(html).toContain('Eulogy');
  });
});
