import { describe, expect, it } from 'vitest';
import {
  applyCreatorLibraryView,
  filterCreatorLibrary,
  type CreatorLibraryCard,
} from './library-filters';

function card(partial: Partial<CreatorLibraryCard> & Pick<CreatorLibraryCard, 'id' | 'uiStatus'>): CreatorLibraryCard {
  return {
    title: partial.title ?? `Title ${partial.id}`,
    year: partial.year ?? '2000',
    label: partial.label ?? 'Ready for film',
    imagePath: '/fixtures/memory-a.png',
    createdAt: partial.createdAt ?? '2026-01-02T00:00:00.000Z',
    source: partial.source ?? 'owner',
    reviewState: partial.reviewState ?? 'accepted',
    ...partial,
  };
}

describe('creator library filters', () => {
  const cards = [
    card({ id: 'a', uiStatus: 'ready', title: 'Garden', createdAt: '2026-01-03T00:00:00.000Z' }),
    card({ id: 'b', uiStatus: 'processing', title: 'Park', label: 'Still preparing', createdAt: '2026-01-02T00:00:00.000Z' }),
    card({
      id: 'c',
      uiStatus: 'needs_attention',
      title: 'Phone',
      label: 'HEIC needs conversion',
      createdAt: '2026-01-01T00:00:00.000Z',
    }),
    card({
      id: 'd',
      uiStatus: 'ready',
      title: 'Family',
      source: 'contributor',
      reviewState: 'pending',
      createdAt: '2026-01-04T00:00:00.000Z',
    }),
  ];

  it('filters Still preparing (processing) and contributor memories', () => {
    expect(filterCreatorLibrary(cards, 'processing').map((c) => c.id)).toEqual(['b']);
    expect(filterCreatorLibrary(cards, 'ready').map((c) => c.id)).toEqual(['a', 'd']);
    expect(filterCreatorLibrary(cards, 'needs_attention').map((c) => c.id)).toEqual(['c']);
    expect(filterCreatorLibrary(cards, 'from_contributors').map((c) => c.id)).toEqual(['d']);
  });

  it('searches and sorts newest first by default', () => {
    const view = applyCreatorLibraryView(cards, {
      filter: 'all',
      query: 'fa',
      sort: 'newest',
    });
    expect(view.map((c) => c.id)).toEqual(['d']);
    const newest = applyCreatorLibraryView(cards, { filter: 'all', query: '', sort: 'newest' });
    expect(newest[0]?.id).toBe('d');
  });
});
