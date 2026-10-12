import {
  canCreateFinalViewShare,
  canIssueSignedDownload,
  defaultShareExpiry,
  issueHashedShareToken,
  shareIsUsable,
  hashToken,
} from '@memorialvideo/domain';
import { creatorEnv } from './env';
import { resolveShareTokenPepper } from './share-pepper';
import {
  entitlementView,
  findShareByTokenHash,
  getTribute,
  persistPrivateShare,
  revokePrivateShare,
  type StoredPrivateShare,
  type Tribute,
} from './store';

export type IssuedShare = {
  shareId: string;
  token: string;
  expiresAt: string;
  actionUrl: string;
  scope: StoredPrivateShare['scope'];
};

/**
 * Local private viewing share. Hashed token only.
 * Honest: no verified READY final MP4 yet — watch uses TimelineContract Remotion Player when published.
 */
export async function createPrivateViewShare(publicId: string): Promise<
  | { ok: true; issued: IssuedShare; note: string }
  | { ok: false; reason: 'not_found' | 'pepper_unavailable' | 'no_entitlement' | 'no_timeline' }
> {
  const pepper = resolveShareTokenPepper();
  if (!pepper) {
    return { ok: false, reason: 'pepper_unavailable' };
  }
  const tribute = await getTribute(publicId);
  if (!tribute) {
    return { ok: false, reason: 'not_found' };
  }
  const entitlement = entitlementView(tribute);
  const hasTimeline = Boolean(tribute.timeline);
  const readyFinal = Boolean(
    tribute.renderJobs.find(
      (job) => job.kind === 'final' && job.status === 'READY' && job.outputVerified,
    ),
  );
  if (
    !canCreateFinalViewShare({
      allowsPrivatePlayback: entitlement.allowsPrivatePlayback,
      // Local interim: published TimelineContract stands in until verified final render exists.
      hasReadyFinal: hasTimeline,
    })
  ) {
    if (!entitlement.allowsPrivatePlayback) {
      return { ok: false, reason: 'no_entitlement' };
    }
    return { ok: false, reason: 'no_timeline' };
  }
  const issued = issueHashedShareToken(pepper);
  const expiresAt = defaultShareExpiry().toISOString();
  const share: StoredPrivateShare = {
    id: `shr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
    tokenHash: issued.tokenHash,
    scope: 'final_view',
    expiresAt,
    revokedAt: null,
    createdAt: new Date().toISOString(),
  };
  const next = await persistPrivateShare(publicId, share);
  if (!next) {
    return { ok: false, reason: 'not_found' };
  }
  const base = creatorEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  return {
    ok: true,
    issued: {
      shareId: share.id,
      token: issued.token,
      expiresAt,
      actionUrl: `${base}/watch#t=${encodeURIComponent(issued.token)}`,
      scope: share.scope,
    },
    note: readyFinal
      ? 'Private viewing link created. Verified MP4 download is also available from Share.'
      : 'Private TimelineContract screening — verified 1080p MP4 download unlocks after a READY final render.',
  };
}

export async function revokeOwnerShare(
  publicId: string,
  shareId: string,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' }> {
  const next = await revokePrivateShare(publicId, shareId);
  return next ? { ok: true } : { ok: false, reason: 'not_found' };
}

export async function redeemShareToken(token: string): Promise<
  | { ok: true; tribute: Tribute; share: StoredPrivateShare }
  | { ok: false; reason: 'unavailable' | 'not_found' | 'revoked' | 'expired' }
> {
  const pepper = resolveShareTokenPepper();
  if (!pepper || token.trim().length < 16) {
    return { ok: false, reason: 'unavailable' };
  }
  let tokenHash: string;
  try {
    tokenHash = hashToken(token.trim(), pepper);
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  const found = await findShareByTokenHash(tokenHash);
  if (!found) {
    return { ok: false, reason: 'not_found' };
  }
  if (found.share.revokedAt) {
    return { ok: false, reason: 'revoked' };
  }
  if (!shareIsUsable(found.share)) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, tribute: found.tribute, share: found.share };
}

/** Honest download gate — READY only after Output QC on a real final. */
export function planCreatorDownload(tribute: Tribute | null): {
  canDownloadMp4: boolean;
  canExportMetadata: boolean;
  reason: string;
} {
  const entitlement = entitlementView(tribute);
  const ready = tribute?.renderJobs.find(
    (job) => job.kind === 'final' && job.status === 'READY' && job.outputVerified,
  );
  const mp4 = canIssueSignedDownload({
    kind: 'final',
    jobReady: Boolean(ready),
    outputVerified: Boolean(ready?.outputVerified),
    deleted: false,
    allowsPrivatePlayback: entitlement.allowsPrivatePlayback,
  });
  return {
    canDownloadMp4: mp4,
    canExportMetadata: Boolean(tribute && entitlement.active),
    reason: mp4
      ? 'Verified READY final available'
      : entitlement.active
        ? 'Memorial Pack active — verified 1080p MP4 unlocks after a READY final render (local ffmpeg / optional Remotion).'
        : 'Memorial Pack required for ceremony download.',
  };
}
