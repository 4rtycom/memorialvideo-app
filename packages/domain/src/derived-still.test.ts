import { describe, expect, it } from 'vitest';

import {
  derivedStillIdempotencyKey,
  planDerivedStillCompletion,
  planIngestStill,
  selectNextDerivedJob,
  transitionDerivedJob,
} from './derived-still';

describe('ingest still planning', () => {
  it('attaches an embedded still on the request path', () => {
    expect(planIngestStill({ posterSource: 'embedded_jpeg', hasEmbeddedFrame: true })).toMatchObject({
      attachNow: true,
      enqueueDerived: false,
      sourceMethod: 'embedded_jpeg',
    });
  });

  it('queues H.264 extract off the request path', () => {
    const plan = planIngestStill({ posterSource: 'h264_extract', hasEmbeddedFrame: false });
    expect(plan.attachNow).toBe(false);
    expect(plan.enqueueDerived).toBe(true);
    expect(plan.provenance).toEqual({
      provider: 'remotion',
      model: 'renderStill',
      version: '4.0.518',
    });
    expect(derivedStillIdempotencyKey('asset-1')).toBe('poster_still:asset-1:v1');
  });

  it('does not invent a still when the source is unavailable', () => {
    expect(planIngestStill({ posterSource: 'unavailable', hasEmbeddedFrame: false })).toEqual({
      attachNow: false,
      enqueueDerived: false,
      sourceMethod: 'unavailable',
      provenance: null,
    });
  });
});

describe('derived still jobs', () => {
  it('claims the oldest queued job', () => {
    expect(
      selectNextDerivedJob([
        { id: 'later', status: 'QUEUED', queuedAt: '2026-01-02T00:00:00.000Z' },
        { id: 'first', status: 'QUEUED', queuedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'busy', status: 'PREPARING', queuedAt: '2025-12-01T00:00:00.000Z' },
      ]),
    ).toBe('first');
  });

  it('attaches a still without failing the original asset', () => {
    expect(
      planDerivedStillCompletion({ status: 'QUEUED', extractOk: true, attemptCount: 0 }),
    ).toEqual({
      status: 'READY',
      attemptCount: 0,
      attachPoster: true,
      failAsset: false,
    });
    expect(
      planDerivedStillCompletion({ status: 'PREPARING', extractOk: false, attemptCount: 0 }),
    ).toMatchObject({
      status: 'FAILED_RETRYABLE',
      attachPoster: false,
      failAsset: false,
    });
  });

  it('rejects an illegal jump to ready', () => {
    expect(() => transitionDerivedJob('QUEUED', 'READY')).toThrow('QUEUED');
  });
});
