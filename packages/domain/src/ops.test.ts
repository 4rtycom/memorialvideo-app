import { describe, expect, it } from 'vitest';

import { canIssueSignedDownload, planByteRange, signedUrlTtl } from './download';
import {
  buildDeletionManifest,
  canRequestDeletion,
  canRunRetentionSweep,
  isRetentionDue,
  nextDeletionState,
  planRetentionSweep,
} from './deletion';
import { canFulfillLocalFakeCheckout, checkoutProviderMode } from './checkout-mode';
import { canResolveComment } from './comments';
import { canAcceptContributorUpload, nextCollectionStatus, planCollectionReminder } from './collection';
import { estimateRenderBudget, planLoadAdmission } from './reliability';
import { planOrphanSweep } from './deletion';
import { buildProjectExportManifest } from './export';
import { parseFuneralLead } from './funeral-lead';
import { canProbeMailpit, mailpitHealthUrl } from './mailpit';
import { reviewableTimeline } from './review-timeline';
import { inviteIsUsable, issueHashedToken, summarizeInvite } from './invites';
import { canApprovalComment, shareIsUsable } from './shares';
import { planTimelinePublish } from './timeline-publish';
import { nextOrderStatus, shouldRevokeEntitlement } from './refund';
import {
  assertFinalEntitlement,
  beginRendering,
  claimQueuedJob,
  consumeFinalRenderSlot,
  finishVerifiedJob,
  opaquePosterOutputKey,
  opaqueRenderOutputKey,
  planJobCompletion,
  planPosterAttachment,
  selectNextQueuedJob,
  storageVariantKey,
} from './render-worker';
import { emailTemplateCoverage, renderTransactionalEmail } from './email';
import { buildSendableEmail, planEmailDispatch } from './email-send';
import { BETA_MUSIC_CATALOG, catalogTrackById } from './music-catalog';
import { canAttachCatalogTrack } from './music';
import { tokensMatch } from './tokens';

describe('render worker', () => {
  it('walks queued → ready only after QC and consumes a final slot', () => {
    const preparing = claimQueuedJob('QUEUED');
    const rendering = beginRendering(preparing);
    expect(rendering).toBe('RENDERING');
    expect(finishVerifiedJob({ status: rendering, qcReady: true, attemptCount: 0, retryable: true })).toEqual({
      status: 'READY',
      attemptCount: 0,
    });
    expect(
      finishVerifiedJob({ status: 'VERIFYING', qcReady: false, attemptCount: 0, retryable: true }).status,
    ).toBe('FAILED_RETRYABLE');
    expect(consumeFinalRenderSlot({ kind: 'final', nextStatus: 'READY', finalRendersUsed: 1 })).toBe(2);
    expect(consumeFinalRenderSlot({ kind: 'preview', nextStatus: 'READY', finalRendersUsed: 1 })).toBe(1);
    expect(
      assertFinalEntitlement({
        kind: 'final',
        packageKey: 'ceremony',
        finalRendersUsed: 3,
        isTechnicalRetry: false,
      }),
    ).toBe(false);
    expect(opaqueRenderOutputKey('p1', 'j1')).toBe('projects/p1/renders/j1/output.mp4');
    expect(opaquePosterOutputKey('p1', 'j1')).toBe('projects/p1/renders/j1/poster.jpg');
    expect(storageVariantKey('storage://project-variants/projects/p1/v.jpg')).toBe('projects/p1/v.jpg');
    expect(storageVariantKey('https://example.test/x')).toBeNull();
    expect(planPosterAttachment({ jobStatus: 'READY', extractOk: false })).toEqual({
      attachPoster: false,
      failJob: false,
      posterError: 'poster_extract_failed',
    });
    expect(planPosterAttachment({ jobStatus: 'READY', extractOk: true }).attachPoster).toBe(true);
    expect(
      selectNextQueuedJob([
        { id: 'later', status: 'QUEUED', queuedAt: '2026-01-02T00:00:00.000Z' },
        { id: 'first', status: 'QUEUED', queuedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'busy', status: 'RENDERING', queuedAt: '2025-12-01T00:00:00.000Z' },
      ]),
    ).toBe('first');
    expect(
      planJobCompletion({ kind: 'preview', status: 'QUEUED', qcReady: true, attemptCount: 0 }),
    ).toEqual({
      jobStatus: 'READY',
      attemptCount: 0,
      writeOutput: true,
      incrementFinalSlot: false,
    });
  });
});

describe('download and deletion', () => {
  it('issues signed downloads only for verified ready outputs', () => {
    expect(
      canIssueSignedDownload({
        kind: 'final',
        jobReady: true,
        outputVerified: true,
        deleted: false,
        allowsPrivatePlayback: true,
      }),
    ).toBe(true);
    expect(
      canIssueSignedDownload({
        kind: 'final',
        jobReady: true,
        outputVerified: true,
        deleted: false,
        allowsPrivatePlayback: false,
      }),
    ).toBe(false);
    expect(
      canIssueSignedDownload({
        kind: 'final',
        jobReady: true,
        outputVerified: false,
        deleted: false,
        allowsPrivatePlayback: true,
      }),
    ).toBe(false);
    expect(signedUrlTtl('preview')).toBeLessThan(signedUrlTtl('final'));
    expect(planByteRange({ sizeBytes: 1000 })).toEqual({ action: 'full' });
    expect(planByteRange({ sizeBytes: 1000, rangeHeader: 'bytes=0-99' })).toEqual({
      action: 'partial',
      start: 0,
      end: 99,
    });
    expect(planByteRange({ sizeBytes: 1000, rangeHeader: 'bytes=900-' })).toEqual({
      action: 'partial',
      start: 900,
      end: 999,
    });
    expect(planByteRange({ sizeBytes: 1000, rangeHeader: 'bytes=2000-2001' }).action).toBe('unsatisfiable');
    expect(canRequestDeletion('ACTIVE')).toBe(true);
    expect(canRequestDeletion('DELETION_PENDING')).toBe(false);
    expect(nextDeletionState('requested', 'processing')).toBe('processing');
    expect(isRetentionDue('2020-01-01T00:00:00.000Z', new Date('2026-01-01'))).toBe(true);
    expect(
      planRetentionSweep(
        [
          {
            projectId: 'due-unpaid',
            lifecycleStatus: 'DRAFT',
            scheduledDeleteAt: '2020-01-01T00:00:00.000Z',
            hasPaidEntitlement: false,
          },
          {
            projectId: 'paid',
            lifecycleStatus: 'ACTIVE',
            scheduledDeleteAt: '2020-01-01T00:00:00.000Z',
            hasPaidEntitlement: true,
          },
          {
            projectId: 'fresh',
            lifecycleStatus: 'DRAFT',
            scheduledDeleteAt: '2099-01-01T00:00:00.000Z',
            hasPaidEntitlement: false,
          },
        ],
        new Date('2026-01-01'),
      ),
    ).toEqual(['due-unpaid']);
    const manifest = buildDeletionManifest({ projectId: 'p', assetIds: ['a'], jobIds: ['j'] });
    expect(manifest.storagePrefixes.some((prefix) => prefix.includes('/assets/a/'))).toBe(true);
  });
});

describe('invites and refunds', () => {
  it('hashes invite tokens and never stores the plaintext', () => {
    const pepper = 'pepper-pepper-16';
    const issued = issueHashedToken(pepper);
    expect(issued.token).not.toBe(issued.tokenHash);
    expect(tokensMatch(issued.token, pepper, issued.tokenHash)).toBe(true);
    expect(
      inviteIsUsable({
        revokedAt: null,
        expiresAt: '2099-01-01T00:00:00.000Z',
        useCount: 0,
        maxUses: 3,
      }),
    ).toBe(true);
    expect(
      inviteIsUsable({
        revokedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2099-01-01T00:00:00.000Z',
        useCount: 0,
        maxUses: 3,
      }),
    ).toBe(false);
  });

  it('refunds and disputes revoke paid entitlements', () => {
    expect(nextOrderStatus('PAID', 'charge.refunded')).toBe('REFUNDED');
    expect(nextOrderStatus('PAID', 'charge.dispute.created')).toBe('DISPUTED');
    expect(shouldRevokeEntitlement('REFUNDED')).toBe(true);
    expect(shouldRevokeEntitlement('PAID')).toBe(false);
  });

  it('locks a collection so contributor uploads stop', () => {
    expect(canAcceptContributorUpload({ collectionStatus: 'OPEN', inviteUsable: true })).toBe(true);
    expect(canAcceptContributorUpload({ collectionStatus: 'LOCKED', inviteUsable: true })).toBe(false);
    expect(
      canAcceptContributorUpload({
        collectionStatus: 'OPEN',
        inviteUsable: true,
        closesAt: '2020-01-01T00:00:00.000Z',
        now: new Date('2026-01-01'),
      }),
    ).toBe(false);
    expect(nextCollectionStatus('OPEN', 'lock')).toBe('LOCKED');
    expect(nextCollectionStatus('LOCKED', 'open')).toBe('OPEN');
  });

  it('rejects stale timeline publishes and approval downloads', () => {
    expect(planTimelinePublish({ currentVersion: 2, expectedVersion: 1 })).toEqual({ action: 'conflict' });
    expect(planTimelinePublish({ currentVersion: 2, expectedVersion: 2 })).toEqual({
      action: 'publish',
      nextVersion: 3,
    });
    expect(shareIsUsable({ revokedAt: null, expiresAt: '2099-01-01T00:00:00.000Z' })).toBe(true);
    expect(
      canApprovalComment({
        scope: 'approval',
        shareUsable: true,
        body: 'Hold this photograph a little longer.',
        timecodeMs: 1200,
        durationMs: 10_000,
      }),
    ).toBe(true);
    expect(
      canApprovalComment({
        scope: 'preview',
        shareUsable: true,
        body: 'note',
        timecodeMs: 0,
        durationMs: 10_000,
      }),
    ).toBe(false);
    expect(
      buildProjectExportManifest({
        projectPublicId: 'pub_test',
        locale: 'en',
        themeKey: 'timeless',
        timelineVersion: 1,
        assetCount: 3,
        includeMedia: false,
      }).excluded,
    ).toContain('source_binaries');
    expect(
      planOrphanSweep({
        listedKeys: ['projects/p1/assets/a1/original', 'projects/p1/tmp-orphan', 'projects/other/x'],
        knownKeys: ['projects/p1/assets/a1/original'],
        projectPrefix: 'projects/p1/',
      }),
    ).toEqual(['projects/p1/tmp-orphan']);
  });

  it('keeps Stripe honest and review timelines watermarked without storage URLs', () => {
    expect(checkoutProviderMode({ appEnv: 'production', hasStripeSecret: false })).toBe('unavailable');
    expect(checkoutProviderMode({ appEnv: 'local', hasStripeSecret: false })).toBe('local_fake');
    expect(checkoutProviderMode({ appEnv: 'local', hasStripeSecret: true })).toBe('stripe');
    expect(canFulfillLocalFakeCheckout('local')).toBe(true);
    expect(canFulfillLocalFakeCheckout('preview')).toBe(false);
    expect(canFulfillLocalFakeCheckout('staging')).toBe(false);
    expect(canFulfillLocalFakeCheckout('production')).toBe(false);
    expect(canResolveComment({ ownerUserId: 'a', actorUserId: 'a', resolvedAt: null })).toBe(true);
    expect(canProbeMailpit('local')).toBe(true);
    expect(canProbeMailpit('production')).toBe(false);
    expect(canRunRetentionSweep('local')).toBe(true);
    expect(canRunRetentionSweep('production')).toBe(false);
    expect(mailpitHealthUrl()).toContain('/api/v1/info');
    const reviewed = reviewableTimeline({
      schemaVersion: 1,
      fps: 30,
      width: 1920,
      height: 1080,
      seed: 1,
      locale: 'en',
      themeKey: 'timeless',
      watermark: false,
      displayName: 'Alex',
      scenes: [
        {
          id: 'intro',
          type: 'intro',
          durationFrames: 90,
          displayName: 'Alex',
          transitionIn: 'fade',
          transitionOut: 'fade',
        },
        {
          id: 'image-1',
          type: 'image',
          durationFrames: 120,
          asset: { assetId: 'asset-1', src: 'storage://secret' },
          transitionIn: 'dissolve',
          transitionOut: 'fade',
        },
        {
          id: 'outro',
          type: 'outro',
          durationFrames: 90,
          closingLine: 'Remembered.',
          transitionIn: 'fade',
          transitionOut: 'none',
        },
      ],
    });
    expect(reviewed.watermark).toBe(true);
    expect(JSON.stringify(reviewed)).not.toContain('storage://');
  });

  it('accepts a funeral-home lead without putting the email in the error shape', () => {
    const parsed = parseFuneralLead({
      locale: 'nl',
      organizationName: 'Example House',
      contactName: 'Alex',
      contactEmail: 'alex@example.test',
      notes: 'Quiet rooms',
    });
    expect('error' in parsed).toBe(false);
    expect(parseFuneralLead({ locale: 'xx', organizationName: 'A' })).toEqual({ error: 'invalid' });
    expect(
      planCollectionReminder({
        collectionStatus: 'OPEN',
        closesAt: '2026-08-29T12:00:00.000Z',
        now: new Date('2026-08-28T12:00:00.000Z'),
      }),
    ).toBe('send');
    expect(
      planCollectionReminder({
        collectionStatus: 'OPEN',
        closesAt: '2026-09-10T12:00:00.000Z',
        now: new Date('2026-08-28T12:00:00.000Z'),
      }),
    ).toBe('skip_too_early');
    expect(
      summarizeInvite({
        id: 'inv-1',
        scope: 'upload_only',
        expiresAt: '2026-09-01T00:00:00.000Z',
        useCount: 2,
        maxUses: 20,
        revokedAt: null,
        now: new Date('2026-08-28T00:00:00.000Z'),
      }).usable,
    ).toBe(true);
    expect(JSON.stringify(summarizeInvite({
      id: 'inv-1',
      scope: 'upload_only',
      expiresAt: '2026-09-01T00:00:00.000Z',
      useCount: 0,
      maxUses: 20,
      revokedAt: null,
    }))).not.toMatch(/token/i);
    expect(
      planLoadAdmission({
        assetCount: 200,
        renderingCount: 0,
        queuedPreviewCount: 7,
        queuedFinalCount: 0,
        kind: 'preview',
      }),
    ).toBe('accept');
    expect(
      planLoadAdmission({
        assetCount: 201,
        renderingCount: 0,
        queuedPreviewCount: 0,
        queuedFinalCount: 0,
        kind: 'preview',
      }),
    ).toBe('too_many_assets');
    expect(estimateRenderBudget({ durationFrames: 30 * 60 * 31, fps: 30 }).overLong).toBe(true);
    expect(nextCollectionStatus('OPEN', 'lock')).toBe('LOCKED');
  });

  it('renders eight-locale transactional emails without recipient addresses', () => {
    expect(emailTemplateCoverage()).toHaveLength(11);
    expect(renderTransactionalEmail({ template: 'collection_reminder', locale: 'en' }).body).toContain(
      'collection closes',
    );
    const message = renderTransactionalEmail({ template: 'render_ready', locale: 'de' });
    expect(message.subject.length).toBeGreaterThan(3);
    expect(JSON.stringify(message)).not.toMatch(/@/);
    expect(planEmailDispatch({ appEnv: 'local', hasProviderKey: false })).toBe('mailpit');
    expect(planEmailDispatch({ appEnv: 'production', hasProviderKey: false })).toBe('blocked_production');
    const sendable = buildSendableEmail({
      template: 'collection_reminder',
      locale: 'en',
      correlationId: 'corr-1',
    });
    expect(sendable.correlationId).toBe('corr-1');
    expect(JSON.stringify(sendable)).not.toMatch(/@/);
    expect(catalogTrackById('still-water')).toEqual(BETA_MUSIC_CATALOG[0]);
    const placeholder = catalogTrackById('still-water');
    expect(placeholder).toBeDefined();
    expect(
      canAttachCatalogTrack({
        licensedForDownload: placeholder?.licensedForDownload ?? false,
        licensedForPrivateStream: placeholder?.licensedForPrivateStream ?? false,
        userUploaded: false,
        featureUserUploads: false,
      }),
    ).toBe(false);
  });
});
