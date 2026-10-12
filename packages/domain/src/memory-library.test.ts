import { describe, expect, it } from 'vitest';

import type { OwnerSafeAnalysis } from '@memorialvideo/contracts';

import {
  confirmDateFromCandidate,
  contextWithoutPrivateNote,
  emptyMemoryContext,
  filterLibraryItems,
  memoryNeedsReview,
  paginateLibraryItems,
  planDuplicateDecisionSave,
  planMemoryContextSave,
  searchLibraryItems,
  sortLibraryItems,
  type LibraryListItem,
} from './memory-library';

const analysis = (assetId: string, patch: Partial<OwnerSafeAnalysis> = {}): OwnerSafeAnalysis => ({
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
});

const item = (assetId: string, patch: Partial<LibraryListItem> = {}): LibraryListItem => ({
  assetId,
  createdAt: '2026-01-02T00:00:00.000Z',
  mediaKind: 'photo',
  usedInTribute: false,
  analysis: analysis(assetId),
  context: emptyMemoryContext(assetId),
  decisions: [],
  ...patch,
});

describe('memory library rules', () => {
  it('confirms a machine date without treating the candidate as already biography', () => {
    const context = confirmDateFromCandidate({
      context: emptyMemoryContext('a1'),
      candidate: '2018-04-01T10:00:00',
    });
    expect(context.dateValue).toBe('2018-04-01');
    expect(context.dateProvenance).toBe('family_confirmed');
    expect(context.datePrecision).toBe('exact');
  });

  it('strips private notes from public and render-facing copies', () => {
    const context = { ...emptyMemoryContext('a1'), privateNote: 'Keep this between us' };
    expect(contextWithoutPrivateNote(context).privateNote).toBeUndefined();
    expect(JSON.stringify(contextWithoutPrivateNote(context))).not.toContain('Keep this');
  });

  it('rejects a stale context version and no-ops an identical retry', () => {
    const existing = { ...emptyMemoryContext('a1'), familyTitle: 'Garden', version: 2 };
    expect(
      planMemoryContextSave({ existing, next: { ...existing, familyTitle: 'Porch' }, expectedVersion: 1 }),
    ).toEqual({ ok: false, reason: 'conflict' });
    expect(
      planMemoryContextSave({ existing, next: existing, expectedVersion: 2 }),
    ).toMatchObject({ ok: true, noop: true });
    expect(
      planMemoryContextSave({ existing, next: { ...existing, familyTitle: 'Porch' }, expectedVersion: 2 }),
    ).toMatchObject({ ok: true, noop: false, context: { version: 3, familyTitle: 'Porch' } });
  });

  it('records a duplicate decision without hiding or rewriting the film', () => {
    const planned = planDuplicateDecisionSave({
      assetId: 'b',
      otherAssetId: 'a',
      kind: 'exact',
      decision: 'same',
      expectedVersion: 0,
      existing: null,
    });
    expect(planned).toMatchObject({
      ok: true,
      hideAsset: false,
      changeTimeline: false,
      decision: { assetIdLow: 'a', assetIdHigh: 'b', decision: 'same' },
    });
    expect(planDuplicateDecisionSave({
      assetId: 'a',
      otherAssetId: 'a',
      kind: 'exact',
      decision: 'same',
      expectedVersion: 0,
      existing: null,
    })).toEqual({ ok: false, reason: 'self_pair' });
  });

  it('filters needs-review, used, and quality without changing sort stability', () => {
    const rows = [
      item('a', { createdAt: '2026-01-01T00:00:00.000Z', usedInTribute: true }),
      item('b', {
        createdAt: '2026-01-03T00:00:00.000Z',
        analysis: analysis('b', { qualityCodes: ['soft_focus'] }),
      }),
      item('c', {
        createdAt: '2026-01-02T00:00:00.000Z',
        mediaKind: 'video',
        analysis: analysis('c', { mediaKind: 'video', pipelineStatus: 'queued' }),
      }),
    ];
    expect(filterLibraryItems(rows, 'used').map((row) => row.assetId)).toEqual(['a']);
    expect(filterLibraryItems(rows, 'quality').map((row) => row.assetId)).toEqual(['b']);
    expect(filterLibraryItems(rows, 'analysing').map((row) => row.assetId)).toEqual(['c']);
    const preparing = [
      item('ready', { ingestStatus: 'READY' }),
      item('busy', { ingestStatus: 'PROCESSING' }),
    ];
    expect(filterLibraryItems(preparing, 'processing').map((row) => row.assetId)).toEqual(['busy']);
    expect(sortLibraryItems(rows, 'recent').map((row) => row.assetId)).toEqual(['b', 'c', 'a']);
    expect(paginateLibraryItems(rows, 1, 1)).toEqual({ items: [rows[1]], total: 3, offset: 1 });
  });

  it('allows family context when analysis failed and never rewrites the film from a decision', () => {
    const failed = item('x', { analysis: analysis('x', { pipelineStatus: 'failed' }) });
    const planned = planMemoryContextSave({
      existing: failed.context,
      next: { ...failed.context, familyTitle: 'Garden path' },
      expectedVersion: 0,
    });
    expect(planned).toMatchObject({ ok: true, context: { familyTitle: 'Garden path' } });
    expect(failed.analysis.pipelineStatus).toBe('failed');
  });

  it('searches only confirmed family context, not private notes', () => {
    const rows = [
      item('a', { context: { ...emptyMemoryContext('a'), familyTitle: 'Harbour walk', privateNote: 'secret' } }),
      item('b', { context: { ...emptyMemoryContext('b'), locationLabel: 'Lisbon' } }),
    ];
    expect(searchLibraryItems(rows, 'harbour').map((row) => row.assetId)).toEqual(['a']);
    expect(searchLibraryItems(rows, 'secret')).toEqual([]);
    expect(memoryNeedsReview(rows[0]!)).toBe(true);
  });
});
