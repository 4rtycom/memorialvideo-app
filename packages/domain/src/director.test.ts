import { describe, expect, it } from 'vitest';

import {
  captureDirectorSnapshot,
  createDirectorRun,
  directorChapterCount,
  paceDurationSeconds,
  preflightMemorial,
  proposeDirectorPlan,
  revertDirectorFiles,
} from './director';

describe('memorial director', () => {
  it('blocks a first cut until a name and memories exist', () => {
    const empty = proposeDirectorPlan({
      displayName: '',
      themeKey: 'timeless',
      readyCount: 0,
      chapterTitles: ['Early years', 'A life shared', 'Held close'],
    });
    expect(empty.canApply).toBe(false);
    expect(preflightMemorial({ displayName: '', readyCount: 0 }).blockers).toEqual([
      'needs_name',
      'needs_memories',
    ]);
  });

  it('proposes paced chapters without inventing facts', () => {
    expect(paceDurationSeconds(3)).toBe(6);
    expect(paceDurationSeconds(20)).toBe(3);
    expect(directorChapterCount(6)).toBe(2);
    const plan = proposeDirectorPlan({
      displayName: 'Alex',
      themeKey: 'warm_light',
      readyCount: 6,
      datedCount: 2,
      chapterTitles: ['Early years', 'A life shared', 'Held close'],
    });
    expect(plan.canApply).toBe(true);
    expect(plan.chapterTitles).toEqual(['Early years', 'Held close']);
    // warm_light FilmStyleManifest scales pace (4s → 4.4s) and prefers fade
    expect(plan.imageDurationSeconds).toBe(4.4);
    expect(plan.transitionIn).toBe('fade');
    expect(plan.music).toBe('placeholder');
    expect(plan.reasons).toContain('opening_from_name');
    expect(plan.reasons).toContain('dated_first');
    expect(plan.reasons).not.toContain('needs_name');
  });

  it('reverts a first cut to the stored snapshot without inventing files', () => {
    const before = captureDirectorSnapshot({
      chapterTitle: '',
      chapters: [],
      music: 'none',
      files: [{ localId: 'a', durationSeconds: 8, transitionIn: 'none' }],
    });
    const run = createDirectorRun(
      proposeDirectorPlan({
        displayName: 'Alex',
        themeKey: 'timeless',
        readyCount: 1,
        chapterTitles: ['Early years'],
      }),
      '2026-08-28T00:00:00.000Z',
      'dir-test',
    );
    expect(run.action).toBe('first_cut');
    expect(run.reasons).toContain('opening_from_name');
    const restored = revertDirectorFiles(
      [{ localId: 'a', durationSeconds: 3, transitionIn: 'dissolve' as const }],
      before,
    );
    expect(restored[0]?.durationSeconds).toBe(8);
    expect(restored[0]?.transitionIn).toBe('none');
    const afterReload = revertDirectorFiles(
      [{ localId: 'story-asset-1', assetId: 'asset-1', durationSeconds: 3, transitionIn: 'dissolve' as const }],
      captureDirectorSnapshot({
        chapterTitle: '',
        chapters: [],
        music: 'none',
        files: [{ localId: 'old', assetId: 'asset-1', durationSeconds: 6, transitionIn: 'none' }],
      }),
    );
    expect(afterReload[0]?.durationSeconds).toBe(6);
  });
});
