import { describe, expect, it } from 'vitest';

import {
  ENHANCEMENT_LOCAL_ENGINE,
  ENHANCEMENT_MODEL_PROVIDER,
  enhancementConsentSchema,
  enhancementOperationSchema,
  enhancementRequestSchema,
  enhancementReviewSchema,
  enhancementVariantSchemaV2,
} from './media-enhancement';
import { updateAssetOpSchema } from './director-v2';

describe('media enhancement contracts', () => {
  it('requires immutable originals and reversible variants', () => {
    const variant = enhancementVariantSchemaV2.parse({
      schemaVersion: 1,
      id: 'ev_1',
      tributePublicId: 'mv_test',
      assetId: 'asset_1',
      requestId: 'er_1',
      status: 'ready',
      appliedOperations: [
        enhancementOperationSchema.parse({
          kind: 'exposure.adjust',
          strength: 0.4,
          implementationMethod: 'deterministic',
          maySynthesiseDetail: false,
          provider: ENHANCEMENT_LOCAL_ENGINE.name,
          version: ENHANCEMENT_LOCAL_ENGINE.version,
        }),
      ],
      provenance: {
        provider: ENHANCEMENT_LOCAL_ENGINE.name,
        model: 'pixel-ops',
        version: ENHANCEMENT_LOCAL_ENGINE.version,
      },
      generativeAlteration: false,
      maySynthesiseDetail: false,
      implementationLabel: 'deterministic_correction',
      originalImmutable: true,
      reversible: true,
      visibleAlteration: true,
      createdAt: '2026-08-30T12:00:00.000Z',
    });
    expect(variant.originalImmutable).toBe(true);
    expect(variant.reversible).toBe(true);
    expect(variant.implementationLabel).toBe('deterministic_correction');
  });

  it('keeps external consent off by default and model provider blocked', () => {
    const consent = enhancementConsentSchema.parse({
      schemaVersion: 1,
      tributePublicId: 'mv_test',
      state: 'disabled',
    });
    expect(consent.localApproved).toBe(false);
    expect(consent.externalApproved).toBe(false);
    expect(ENHANCEMENT_MODEL_PROVIDER.available).toBe(false);
  });

  it('parses requests, reviews, and update_asset ops', () => {
    const request = enhancementRequestSchema.parse({
      schemaVersion: 1,
      id: 'er_1',
      tributePublicId: 'mv_test',
      assetId: 'asset_1',
      operations: [
        {
          kind: 'contrast.adjust',
          strength: 0.35,
          implementationMethod: 'deterministic',
          provider: ENHANCEMENT_LOCAL_ENGINE.name,
          version: ENHANCEMENT_LOCAL_ENGINE.version,
        },
      ],
      preset: 'gentle_correction',
      providerMode: 'local',
      qualityMode: 'preview',
      idempotencyKey: 'enhancement:asset_1:gentle:v1',
      status: 'queued',
      requestedAt: '2026-08-30T12:00:00.000Z',
    });
    expect(request.operations).toHaveLength(1);

    const review = enhancementReviewSchema.parse({
      schemaVersion: 1,
      id: 'erv_1',
      variantId: 'ev_1',
      decision: 'approve_for_film',
      timestamp: '2026-08-30T12:01:00.000Z',
    });
    expect(review.decision).toBe('approve_for_film');

    const op = updateAssetOpSchema.parse({
      op: 'update_asset',
      sceneId: 'scene_1',
      asset: {
        assetId: 'asset_1',
        src: 'storage://project-variants/opaque',
        enhancementVariantId: 'ev_1',
      },
    });
    expect(op.asset.enhancementVariantId).toBe('ev_1');
  });

  it('rejects model ops that claim no synthesis when maySynthesiseDetail is required by caller', () => {
    const op = enhancementOperationSchema.parse({
      kind: 'upscale',
      strength: 1,
      implementationMethod: 'deterministic',
      maySynthesiseDetail: false,
      provider: ENHANCEMENT_LOCAL_ENGINE.name,
      version: ENHANCEMENT_LOCAL_ENGINE.version,
      warnings: ['resampling_not_ai_super_resolution'],
    });
    expect(op.kind).toBe('upscale');
    expect(op.warnings).toContain('resampling_not_ai_super_resolution');
  });
});
