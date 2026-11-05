import { describe, expect, it } from 'vitest';
import { mobileHomeCopy, possessive, shellProject } from './tribute-view';
import type { Tribute } from '@/server/store';

/** Minimal tribute for copy helpers — only fields `mobileHomeCopy` reads. */
function stubTribute(input: {
  displayName: string;
  firstFilmStage?: Tribute['firstFilmStage'];
  isFixtureSeed?: boolean;
  memories?: Array<{ imagePath: string }>;
}): Tribute {
  return {
    displayName: input.displayName,
    firstFilmStage: input.firstFilmStage ?? 'idle',
    isFixtureSeed: input.isFixtureSeed ?? false,
    memories: (input.memories ?? []).map((m, index) => ({
      id: `mem_${String(index).padStart(16, 'a')}`,
      title: 'Memory',
      year: '',
      ingestStatus: 'READY',
      imagePath: m.imagePath,
      source: 'owner',
      reviewState: 'accepted',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })),
  } as Tribute;
}

describe('mobileHomeCopy (MV-AUD-006)', () => {
  it('does not invent Eleanor or 48 memories when no tribute is open', () => {
    const copy = mobileHomeCopy(null);
    const blob = JSON.stringify(copy);
    expect(blob).not.toMatch(/eleanor/i);
    expect(blob).not.toContain('48');
    expect(copy.meta).toBe('No tribute open yet');
    expect(copy.primaryHref).toBe('/setup');
    expect(copy.posterSrc).toBe('/fixtures/workspace-family.png');
  });

  it('binds eyebrow, counts, and film title to the live tribute', () => {
    const tribute = stubTribute({
      displayName: 'Anna',
      firstFilmStage: 'ready_to_review',
      memories: [{ imagePath: '/api/media/mv_abcdef0123456789/mem_aaaaaaaaaaaaaaaa' }],
    });
    const copy = mobileHomeCopy(tribute);
    expect(copy.eyebrow).toBe("ANNA'S PERSONAL WORKSPACE");
    expect(copy.meta).toBe('1 memory collected  ·  First film ready');
    expect(copy.filmTitle).toBe("Anna's remembrance");
    expect(copy.primaryHref).toBe('/film');
    expect(copy.posterSrc).toBe('/api/media/mv_abcdef0123456789/mem_aaaaaaaaaaaaaaaa');
    expect(JSON.stringify(copy)).not.toMatch(/eleanor/i);
    expect(JSON.stringify(copy)).not.toContain('48');
  });

  it('keeps shell chrome free of invented Eleanor names', () => {
    expect(shellProject(null).person).toBe('');
    expect(shellProject(null).title).toBe('Your remembrance');
    expect(possessive('James')).toBe("James'");
  });
});
