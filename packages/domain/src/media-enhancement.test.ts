import { describe, expect, it } from 'vitest';

import { ENHANCEMENT_LOCAL_ENGINE, enhancementVariantSchemaV2 } from '@memorialvideo/contracts';

import {
  canUseVariantInFilm,
  defaultEnhancementConsent,
  detectCyclicLineage,
  enhancementIdempotencyKey,
  enhancementProcessingAllowed,
  externalEnhancementAllowed,
  isEnhancementJobInProgress,
  isEnhancementVariantReady,
  mapEnhancementJobStatusToUi,
  planEnhancementClaim,
  planEnhancementCompletion,
  planEnhancementRequest,
  planEnhancementReview,
  selectNextEnhancementJob,
} from './media-enhancement';

describe('media enhancement domain', () => {
  it('maps job statuses to calm UI without inventing ready', () => {
    expect(mapEnhancementJobStatusToUi('QUEUED')).toBe('queued');
    expect(mapEnhancementJobStatusToUi('PREPARING')).toBe('preparing');
    expect(mapEnhancementJobStatusToUi('READY')).toBe('ready');
    expect(mapEnhancementJobStatusToUi('FAILED_RETRYABLE')).toBe('failed');
    expect(isEnhancementJobInProgress('PREPARING')).toBe(true);
    expect(isEnhancementJobInProgress('READY')).toBe(false);
    expect(isEnhancementVariantReady('ready')).toBe(true);
    expect(isEnhancementVariantReady('processing')).toBe(false);
  });

  it('blocks processing until local consent and keeps external off', () => {
    const disabled = defaultEnhancementConsent('mv_test');
    expect(enhancementProcessingAllowed(disabled)).toBe(false);
    expect(externalEnhancementAllowed(disabled)).toBe(false);
    const local = {
      ...disabled,
      state: 'local_approved' as const,
      localApproved: true,
    };
    expect(enhancementProcessingAllowed(local)).toBe(true);
    expect(externalEnhancementAllowed(local)).toBe(false);
  });

  it('plans gentle correction request with idempotency', () => {
    const consent = {
      ...defaultEnhancementConsent('mv_test'),
      state: 'local_approved' as const,
      localApproved: true,
    };
    const planned = planEnhancementRequest({
      tributePublicId: 'mv_test',
      assetId: 'asset_1',
      requestId: 'er_1',
      checksum: 'abc123def4567890',
      preset: 'gentle_correction',
      consent,
      existingVariantCount: 0,
      requestedAt: '2026-08-30T12:00:00.000Z',
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.request.operations.length).toBeGreaterThan(0);
    expect(planned.request.operations.every((op) => op.implementationMethod === 'deterministic')).toBe(true);
    expect(planned.idempotencyKey).toContain('enhancement:asset_1:');
  });

  it('never fails the original asset on completion', () => {
    const result = planEnhancementCompletion({
      tributePublicId: 'mv_test',
      assetId: 'asset_1',
      requestId: 'er_1',
      variantId: 'ev_1',
      applied: [
        {
          kind: 'exposure.adjust',
          strength: 0.55,
          parameters: {},
          implementationMethod: 'deterministic',
          maySynthesiseDetail: false,
          provider: ENHANCEMENT_LOCAL_ENGINE.name,
          version: ENHANCEMENT_LOCAL_ENGINE.version,
          reversibleViaVariantSelection: true,
          warnings: [],
        },
      ],
      skipped: [],
      storageBucket: 'project-variants',
      storageKey: 'opaque',
      width: 320,
      height: 240,
      mime: 'image/jpeg',
      sizeBytes: 1200,
      technicalReport: {
        decodeOk: true,
        width: 320,
        height: 240,
        mime: 'image/jpeg',
        sizeBytes: 1200,
        blankOrBlack: false,
        extremeClipping: false,
        invalidCrop: false,
        renderCompatible: true,
        warnings: [],
      },
      createdAt: '2026-08-30T12:00:00.000Z',
    });
    expect(result.failAsset).toBe(false);
    expect(result.variant.originalImmutable).toBe(true);
    expect(result.variant.implementationLabel).toBe('deterministic_correction');
  });

  it('requires film approval before timeline use and detects cycles', () => {
    const variant = enhancementVariantSchemaV2.parse({
      schemaVersion: 1,
      id: 'ev_1',
      tributePublicId: 'mv_test',
      assetId: 'asset_1',
      requestId: 'er_1',
      status: 'ready',
      storageBucket: 'project-variants',
      storageKey: 'key',
      appliedOperations: [],
      provenance: { provider: 'x', model: 'y', version: '1' },
      generativeAlteration: false,
      maySynthesiseDetail: false,
      implementationLabel: 'deterministic_correction',
      approvedForFilm: false,
      originalImmutable: true,
      reversible: true,
      visibleAlteration: true,
      createdAt: '2026-08-30T12:00:00.000Z',
    });
    expect(canUseVariantInFilm(variant)).toBe(false);
    const reviewed = planEnhancementReview({
      variant,
      decision: 'approve_for_film',
      expectedVersion: 1,
      currentVersion: 1,
      now: '2026-08-30T12:05:00.000Z',
    });
    expect(reviewed.ok).toBe(true);
    if (reviewed.ok) {
      expect(canUseVariantInFilm({ ...variant, ...reviewed.next })).toBe(true);
    }
    expect(detectCyclicLineage('a', 'b', new Map([['b', 'a']]))).toBe(true);
    expect(detectCyclicLineage('a', 'b', new Map([['b', undefined]]))).toBe(false);
  });

  it('claims jobs with retry bounds', () => {
    const next = selectNextEnhancementJob([
      {
        id: 'j2',
        projectId: 'p',
        assetId: 'a',
        requestId: 'r',
        status: 'QUEUED',
        idempotencyKey: 'k2',
        attemptCount: 0,
        queuedAt: '2026-08-30T12:01:00.000Z',
      },
      {
        id: 'j1',
        projectId: 'p',
        assetId: 'a',
        requestId: 'r',
        status: 'QUEUED',
        idempotencyKey: 'k1',
        attemptCount: 0,
        queuedAt: '2026-08-30T12:00:00.000Z',
      },
    ]);
    expect(next?.id).toBe('j1');
    expect(planEnhancementClaim({ ...next!, attemptCount: 3 }).ok).toBe(false);
    expect(enhancementIdempotencyKey({
      assetId: 'a',
      checksum: '0123456789abcdef',
      operationsFingerprint: 'exposure',
      qualityMode: 'preview',
    })).toMatch(/^enhancement:a:/);
  });
});
