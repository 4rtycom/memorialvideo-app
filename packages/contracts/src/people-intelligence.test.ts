import { describe, expect, it } from 'vitest';

import {
  faceObservationSchema,
  peopleConsentSchema,
  personClusterSchemaV2,
  personProfileSchema,
  sanitizePersonLabel,
} from './people-intelligence';

const provenance = { provider: 'vladmandic-face-api', model: 'tiny_face_detector', version: 'v1-local' };

describe('people intelligence contracts', () => {
  it('defaults consent to disabled and never changes the film timeline', () => {
    const consent = peopleConsentSchema.parse({
      schemaVersion: 1,
      tributePublicId: 'mv_test',
      state: 'disabled',
    });
    expect(consent.localApproved).toBe(false);
    expect(consent.externalApproved).toBe(false);
    expect(consent.changeTimeline).toBe(false);
  });

  it('stores face observations without demographic or emotion fields', () => {
    const observation = faceObservationSchema.parse({
      schemaVersion: 1,
      id: 'fo_1',
      tributePublicId: 'mv_test',
      assetId: 'asset_1',
      bbox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      detectionConfidence: 0.9,
      detectorName: 'tiny_face_detector',
      detectorVersion: 'v1-local',
      provenance,
      pipelineStatus: 'ready',
      createdAt: new Date().toISOString(),
    });
    expect(observation).not.toHaveProperty('gender');
    expect(observation).not.toHaveProperty('age');
    expect(observation).not.toHaveProperty('emotion');
  });

  it('keeps clusters unreviewed and unnamed by default', () => {
    const cluster = personClusterSchemaV2.parse({
      schemaVersion: 1,
      id: 'pc_1',
      tributePublicId: 'mv_test',
      memberObservationIds: ['fo_1', 'fo_2'],
      method: 'cosine_threshold_v1',
      methodVersion: 'v1-local',
      similarityThresholdVersion: 'v1',
      representativeObservationId: 'fo_1',
      provenance,
      createdAt: new Date().toISOString(),
    });
    expect(cluster.reviewState).toBe('unreviewed');
    expect(cluster).not.toHaveProperty('displayName');
  });

  it('requires a family-supplied label for a person profile', () => {
    expect(() =>
      personProfileSchema.parse({
        schemaVersion: 1,
        id: 'pp_1',
        tributePublicId: 'mv_test',
        createdAt: new Date().toISOString(),
      }),
    ).toThrow();
  });

  it('strips markup from person labels', () => {
    expect(sanitizePersonLabel('<script>alert(1)</script>Grandfather')).toBe('scriptalert(1)/scriptGrandfather');
  });
});
