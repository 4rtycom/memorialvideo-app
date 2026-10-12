import { describe, expect, it } from 'vitest';

import {
  clusterObservationsBySimilarity,
  cosineSimilarity,
  peopleProcessingAllowed,
  planClusterMerge,
  planClusterSplit,
  planVideoSampleTimestamps,
} from './people-intelligence';

const now = new Date().toISOString();

function observation(id: string, tribute = 'mv_a') {
  return {
    schemaVersion: 1 as const,
    id,
    tributePublicId: tribute,
    assetId: 'asset_1',
    bbox: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
    detectionConfidence: 0.9,
    qualityCodes: [],
    poseOcclusionCodes: [],
    detectorName: 'tiny_face_detector',
    detectorVersion: 'v1-local',
    provenance: { provider: 'test', model: 'tiny', version: 'v1' },
    pipelineStatus: 'ready' as const,
    reviewState: 'unreviewed' as const,
    exclusionState: 'none' as const,
    createdAt: now,
  };
}

describe('people intelligence domain', () => {
  it('blocks processing without local consent', () => {
    expect(peopleProcessingAllowed(null)).toBe(false);
    expect(
      peopleProcessingAllowed({
        schemaVersion: 1,
        tributePublicId: 'mv_a',
        state: 'disabled',
        localApproved: false,
        externalApproved: false,
        policyVersion: 'people-intelligence-v1',
        version: 0,
        changeTimeline: false,
        retainFamilyLabelsOnDeletion: false,
      }),
    ).toBe(false);
  });

  it('clusters similar embeddings within one tribute only', () => {
    const clusters = clusterObservationsBySimilarity({
      tributePublicId: 'mv_a',
      createdAt: now,
      threshold: 0.9,
      items: [
        { observation: observation('fo_1'), embedding: new Float32Array([1, 0, 0]) },
        { observation: observation('fo_2'), embedding: new Float32Array([0.99, 0.01, 0]) },
        { observation: observation('fo_3', 'mv_b'), embedding: new Float32Array([1, 0, 0]) },
        { observation: observation('fo_4'), embedding: new Float32Array([0, 1, 0]) },
      ],
    });
    expect(clusters.some((cluster) => cluster.memberObservationIds.includes('fo_3'))).toBe(false);
    const same = clusters.find((cluster) => cluster.memberObservationIds.includes('fo_1'));
    expect(same?.memberObservationIds).toContain('fo_2');
    expect(same?.reviewState).toBe('unreviewed');
  });

  it('rejects cross-tribute merges', () => {
    const left = clusterObservationsBySimilarity({
      tributePublicId: 'mv_a',
      createdAt: now,
      items: [{ observation: observation('fo_1'), embedding: new Float32Array([1, 0]) }],
    })[0]!;
    const right = clusterObservationsBySimilarity({
      tributePublicId: 'mv_b',
      createdAt: now,
      items: [{ observation: observation('fo_2', 'mv_b'), embedding: new Float32Array([1, 0]) }],
    })[0]!;
    expect(
      planClusterMerge({
        left,
        right,
        expectedLeftVersion: 0,
        expectedRightVersion: 0,
        createdAt: now,
      }).ok,
    ).toBe(false);
  });

  it('splits clusters with optimistic concurrency', () => {
    const cluster = clusterObservationsBySimilarity({
      tributePublicId: 'mv_a',
      createdAt: now,
      items: [
        { observation: observation('fo_1'), embedding: new Float32Array([1, 0]) },
        { observation: observation('fo_2'), embedding: new Float32Array([1, 0]) },
      ],
    })[0]!;
    const split = planClusterSplit({
      cluster,
      keepObservationIds: ['fo_1'],
      moveObservationIds: ['fo_2'],
      expectedVersion: 0,
      createdAt: now,
    });
    expect(split.ok).toBe(true);
    if (split.ok) {
      expect(split.kept.memberObservationIds).toEqual(['fo_1']);
      expect(split.moved.memberObservationIds).toEqual(['fo_2']);
    }
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
  });

  it('plans evenly spaced video sample timestamps across the middle of a clip', () => {
    expect(planVideoSampleTimestamps({ durationMs: 0 })).toEqual([0]);
    expect(planVideoSampleTimestamps({ durationMs: 1000 })).toEqual([500]);
    const stamps = planVideoSampleTimestamps({ durationMs: 10_000, maxFrames: 5 });
    expect(stamps).toHaveLength(5);
    expect(stamps[0]).toBeGreaterThanOrEqual(1000);
    expect(stamps[stamps.length - 1]).toBeLessThanOrEqual(9000);
    expect(stamps).toEqual([...stamps].sort((a, b) => a - b));
    // Short clips stay sparse (~1 frame/sec).
    expect(planVideoSampleTimestamps({ durationMs: 4_000, maxFrames: 12 })).toHaveLength(4);
  });
});
