import { describe, expect, it } from 'vitest';

import {
  authorizeOpsToken,
  canOpsRetryRender,
  confirmDangerousOpsAction,
  OPS_REVOKE_CONFIRMATION,
  sanitizeOpsProjectSummary,
} from './ops-access';

describe('ops access', () => {
  it('rejects short or missing ops tokens', () => {
    expect(authorizeOpsToken({ configuredToken: 'short', presentedToken: 'short' }).ok).toBe(false);
    expect(
      authorizeOpsToken({
        configuredToken: 'x'.repeat(32),
        presentedToken: undefined,
      }),
    ).toEqual({ ok: false, reason: 'unauthorized' });
  });

  it('accepts matching configured tokens', () => {
    const token = `ops-token-${'a'.repeat(24)}`;
    expect(authorizeOpsToken({ configuredToken: token, presentedToken: token })).toEqual({ ok: true });
  });

  it('requires confirmation for dangerous revoke', () => {
    expect(confirmDangerousOpsAction({ action: 'revoke_share', confirmation: 'nope' })).toEqual({
      ok: false,
      reason: 'confirmation_required',
    });
    expect(
      confirmDangerousOpsAction({ action: 'revoke_share', confirmation: OPS_REVOKE_CONFIRMATION }),
    ).toEqual({ ok: true });
    expect(confirmDangerousOpsAction({ action: 'retry_render', confirmation: undefined })).toEqual({ ok: true });
  });

  it('allows retry only for FAILED_RETRYABLE jobs', () => {
    expect(canOpsRetryRender('FAILED_RETRYABLE')).toBe(true);
    expect(canOpsRetryRender('FAILED_FINAL')).toBe(false);
    expect(canOpsRetryRender('CANCELED')).toBe(false);
    expect(canOpsRetryRender('READY')).toBe(false);
    expect(canOpsRetryRender('QUEUED')).toBe(false);
  });

  it('sanitizes summaries to metadata-only fields', () => {
    const summary = sanitizeOpsProjectSummary({
      projectPublicId: 'prj_opaque',
      lifecycleStatus: 'DRAFT',
      packageKey: 'ceremony',
      paymentStatus: 'paid',
      memoryCount: 3,
      storageBytes: 1024,
      renderCounts: { queued: 0, running: 0, ready: 1, failed: 0 },
      failedJobCount: 0,
      inviteState: { active: 1, redeemed: 0, revoked: 0 },
      shareActiveCount: 1,
      usageWindow: { renderAttempts: 1, enhancements: 0, intelligenceCalls: 0 },
      finishCounts: { queued: 0, previewReady: 1, approved: 0, failed: 0 },
      signedMediaUrl: 'https://evil.example/secret.jpg',
      deceasedName: 'should-not-leak',
    });
    expect(summary.projectPublicId).toBe('prj_opaque');
    expect(summary.finishCounts.previewReady).toBe(1);
    expect(summary).not.toHaveProperty('signedMediaUrl');
    expect(summary).not.toHaveProperty('deceasedName');
  });
});
