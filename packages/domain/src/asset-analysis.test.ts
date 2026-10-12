import { describe, expect, it } from 'vitest';

import {
  analysisIdempotencyKey,
  buildDuplicateRefs,
  canonicalizeDuplicatePair,
  normalizeAnalysisJobRow,
  planAnalysisCompletion,
  parseAssetAnalysis,
  selectNextAnalysisJob,
  toOwnerSafeAnalysis,
  transitionAnalysisJob,
} from './asset-analysis';

describe('asset analysis jobs', () => {
  it('is idempotent per asset checksum and analyser version', () => {
    expect(analysisIdempotencyKey('asset-1', 'abc')).toBe('asset_analysis:asset-1:abc:v1');
  });

  it('canonicalises pairs and rejects self-pairs', () => {
    expect(canonicalizeDuplicatePair('b', 'a')).toEqual(['a', 'b']);
    expect(canonicalizeDuplicatePair('same', 'same')).toBeNull();
  });

  it('never marks the original asset failed', () => {
    expect(
      planAnalysisCompletion({ status: 'QUEUED', inspectOk: false, partial: false, attemptCount: 0 }),
    ).toMatchObject({ pipelineStatus: 'failed', failAsset: false, jobStatus: 'FAILED_RETRYABLE' });
    expect(
      planAnalysisCompletion({ status: 'PREPARING', inspectOk: true, partial: true, attemptCount: 0 }),
    ).toMatchObject({ pipelineStatus: 'partial', jobStatus: 'READY', failAsset: false });
  });

  it('claims the oldest queued job, then a retryable failure', () => {
    expect(
      selectNextAnalysisJob([
        { id: 'later', status: 'QUEUED', queuedAt: '2026-01-02T00:00:00.000Z' },
        { id: 'first', status: 'QUEUED', queuedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'busy', status: 'PREPARING', queuedAt: '2025-12-01T00:00:00.000Z' },
      ]),
    ).toBe('first');
    expect(
      selectNextAnalysisJob([
        { id: 'retry', status: 'FAILED_RETRYABLE', queuedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'done', status: 'READY', queuedAt: '2025-12-01T00:00:00.000Z' },
      ]),
    ).toBe('retry');
  });

  it('rejects an illegal jump to ready', () => {
    expect(() => transitionAnalysisJob('QUEUED', 'READY')).toThrow('QUEUED');
  });
});

describe('duplicate refs and safe serialisation', () => {
  it('drops self-pairs and keeps likely matches unreviewed', () => {
    const refs = buildDuplicateRefs({
      assetId: 'a1',
      exactIds: ['a1', 'a2'],
      likelyIds: [{ id: 'a3', score: 0.9 }],
      likelyThreshold: 0.75,
    });
    expect(refs).toEqual([
      { otherAssetId: 'a2', kind: 'exact', method: 'sha256', score: 1, threshold: 1, reviewState: 'unreviewed' },
      {
        otherAssetId: 'a3',
        kind: 'likely',
        method: 'average-hash',
        score: 0.9,
        threshold: 0.75,
        reviewState: 'unreviewed',
      },
    ]);
  });

  it('omits checksums and raw scores from the owner-safe view', () => {
    const analysis = parseAssetAnalysis({
      schemaVersion: 1,
      analysisId: 'an-1',
      assetId: 'a1',
      pipelineStatus: 'ready',
      sourceChecksum: 'c'.repeat(64),
      media: { mediaKind: 'photo', width: 800, height: 600 },
      candidates: [
        {
          kind: 'captured_at',
          value: '2018-04-01T10:00:00',
          source: 'exif',
          status: 'uncertain',
          method: 'exif-datetime-original',
          confidence: 0.6,
        },
      ],
      quality: [{ code: 'soft_focus', severity: 'suggestion', method: 'laplacian-variance', confidence: 0.5 }],
      duplicates: [{ otherAssetId: 'a2', kind: 'likely', method: 'average-hash', score: 0.91, reviewState: 'unreviewed' }],
      confidence: 0.6,
      provenance: { provider: 'local', model: 'local-media-inspect', version: 'v1' },
    });
    const safe = toOwnerSafeAnalysis(analysis);
    expect(safe).not.toHaveProperty('sourceChecksum');
    expect(JSON.stringify(safe)).not.toContain('c'.repeat(64));
    expect(safe.likelyDuplicate).toBe(true);
    expect(safe.exactDuplicate).toBe(false);
    expect(safe.capturedAtUnconfirmed).toBe(true);
    expect(safe.qualityCodes).toEqual(['soft_focus']);
    expect(JSON.stringify(safe)).not.toContain('a2');
  });

  it('reads PostgREST snake_case queue timestamps', () => {
    expect(
      normalizeAnalysisJobRow({
        id: 'job-1',
        status: 'QUEUED',
        queued_at: '2026-01-01T00:00:00.000Z',
      }),
    ).toEqual({ id: 'job-1', status: 'QUEUED', queuedAt: '2026-01-01T00:00:00.000Z' });
  });
});
