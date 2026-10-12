import { describe, expect, it } from 'vitest';

import type { OwnerSafeAnalysis } from '@memorialvideo/contracts';

import {
  emptyMemoryContext,
  filterLibraryItems,
  paginateLibraryItems,
  searchLibraryItems,
  sortLibraryItems,
  type LibraryListItem,
} from './memory-library';

function analysis(assetId: string, patch: Partial<OwnerSafeAnalysis> = {}): OwnerSafeAnalysis {
  return {
    analysisId: `an-${assetId}`,
    assetId,
    pipelineStatus: 'ready',
    mediaKind: 'photo',
    qualityCodes: [],
    exactDuplicate: false,
    likelyDuplicate: false,
    capturedAtUnconfirmed: true,
    capturedAtCandidate: '2018-04-01T10:00:00',
    locationUnconfirmed: false,
    correctionState: 'unreviewed',
    ...patch,
  };
}

function makeItem(index: number): LibraryListItem {
  const assetId = `asset-${index}`;
  const mediaKind = index % 3 === 0 ? 'video' : index % 3 === 1 ? 'audio' : 'photo';
  return {
    assetId,
    createdAt: new Date(Date.UTC(2026, 0, 1 + (index % 28))).toISOString(),
    mediaKind,
    ingestStatus: index % 11 === 0 ? 'PROCESSING' : 'READY',
    usedInTribute: index % 4 === 0,
    analysis: analysis(assetId, {
      mediaKind,
      pipelineStatus: index % 13 === 0 ? 'processing' : 'ready',
      qualityCodes: index % 7 === 0 ? ['blurry'] : [],
      exactDuplicate: index % 17 === 0,
      likelyDuplicate: index % 19 === 0,
      durationMs: index % 3 === 0 ? 5000 : undefined,
    }),
    context: {
      ...emptyMemoryContext(assetId),
      familyTitle: index % 5 === 0 ? `Memory ${index}` : '',
      caption: index % 9 === 0 ? `caption-${index}` : '',
    },
    decisions: [],
  };
}

describe('memory library performance (local CI)', () => {
  it('filters/sorts/paginates 500 cards under a soft budget', () => {
    const items = Array.from({ length: 500 }, (_, index) => makeItem(index));
    const started = performance.now();
    const filtered = filterLibraryItems(items, 'photos');
    const sorted = sortLibraryItems(filtered, 'recent');
    const searched = searchLibraryItems(sorted, 'Memory');
    const page = paginateLibraryItems(searched, 0, 48);
    const elapsedMs = performance.now() - started;
    expect(page.items.length).toBeLessThanOrEqual(48);
    expect(page.total).toBeGreaterThan(0);
    // Soft ceiling for CI hosts; not a hard product SLA.
    expect(elapsedMs).toBeLessThan(250);
  });
});
