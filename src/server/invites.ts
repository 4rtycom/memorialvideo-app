import {
  canAcceptContributorUpload,
  defaultInviteExpiry,
  hashToken,
  inviteIsUsable,
  inviteUnusableReason,
  issueHashedToken,
  summarizeInvite,
  type CollectionStatus,
  type InviteSummary,
} from '@memorialvideo/domain';
import { creatorEnv } from './env';
import { resolveShareTokenPepper } from './share-pepper';
import {
  createGuestSession,
  findInviteByTokenHash,
  getGuestSession,
  getTribute,
  incrementInviteUse,
  persistContributorInvite,
  revokeContributorInvite,
  setTributeCollectionStatus,
  type GuestSession,
  type StoredContributorInvite,
  type Tribute,
} from './store';

export type InviteListRow = InviteSummary & {
  status: 'active' | 'revoked' | 'expired' | 'max_uses';
};

function withInviteStatus(invite: StoredContributorInvite): InviteListRow {
  const summary = summarizeInvite(invite);
  const reason = inviteUnusableReason(invite);
  return {
    ...summary,
    status: summary.usable ? 'active' : (reason ?? 'expired'),
  };
}

export type IssuedInvite = {
  inviteId: string;
  /** Shown once — never persisted. */
  token: string;
  expiresAt: string;
  actionUrl: string;
  summary: InviteListRow;
};

export async function createOwnerInvite(publicId: string): Promise<
  | { ok: true; issued: IssuedInvite }
  | { ok: false; reason: 'not_found' | 'pepper_unavailable' }
> {
  const pepper = resolveShareTokenPepper();
  if (!pepper) {
    return { ok: false, reason: 'pepper_unavailable' };
  }
  const tribute = await getTribute(publicId);
  if (!tribute) {
    return { ok: false, reason: 'not_found' };
  }
  const issued = issueHashedToken(pepper);
  const expiresAt = defaultInviteExpiry().toISOString();
  const invite: StoredContributorInvite = {
    id: `inv_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
    tokenHash: issued.tokenHash,
    scope: 'upload_only',
    expiresAt,
    useCount: 0,
    maxUses: 20,
    revokedAt: null,
    createdAt: new Date().toISOString(),
  };
  const next = await persistContributorInvite(publicId, invite);
  if (!next) {
    return { ok: false, reason: 'not_found' };
  }
  const base = creatorEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  return {
    ok: true,
    issued: {
      inviteId: invite.id,
      token: issued.token,
      expiresAt,
      actionUrl: `${base}/guest#t=${encodeURIComponent(issued.token)}`,
      summary: withInviteStatus(invite),
    },
  };
}

export async function listOwnerInvites(publicId: string): Promise<{
  invites: InviteListRow[];
  collectionStatus: CollectionStatus;
  progress: { photoCount: number; contributorPhotoCount: number; inviteUseCount: number };
} | null> {
  const tribute = await getTribute(publicId);
  if (!tribute) {
    return null;
  }
  return {
    invites: tribute.invites.map((invite) => withInviteStatus(invite)),
    collectionStatus: tribute.collectionStatus,
    progress: {
      photoCount: tribute.memories.length,
      contributorPhotoCount: tribute.memories.filter((m) => m.source === 'contributor').length,
      inviteUseCount: tribute.invites.reduce((sum, invite) => sum + invite.useCount, 0),
    },
  };
}

export async function setOwnerCollectionStatus(
  publicId: string,
  action: 'open' | 'lock',
): Promise<
  | { ok: true; collectionStatus: CollectionStatus }
  | { ok: false; reason: 'not_found' }
> {
  const result = await setTributeCollectionStatus(publicId, action);
  if (!result) {
    return { ok: false, reason: 'not_found' };
  }
  return { ok: true, collectionStatus: result.collectionStatus };
}

export async function revokeOwnerInvite(
  publicId: string,
  inviteId: string,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' }> {
  const next = await revokeContributorInvite(publicId, inviteId);
  if (!next) {
    return { ok: false, reason: 'not_found' };
  }
  return { ok: true };
}

export type RedeemedGuest = {
  sessionId: string;
  tributePublicId: string;
  displayName: string;
  years: string;
  expiresAt: string;
  scope: StoredContributorInvite['scope'];
};

export async function redeemInviteToken(token: string): Promise<
  | { ok: true; guest: RedeemedGuest }
  | { ok: false; reason: 'unavailable' | 'not_found' | 'revoked' | 'expired' | 'locked' }
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
  const found = await findInviteByTokenHash(tokenHash);
  if (!found) {
    return { ok: false, reason: 'not_found' };
  }
  const unusable = inviteUnusableReason(found.invite);
  if (unusable === 'revoked') {
    return { ok: false, reason: 'revoked' };
  }
  if (unusable === 'expired' || unusable === 'max_uses') {
    return { ok: false, reason: 'expired' };
  }
  if (
    !canAcceptContributorUpload({
      collectionStatus: found.tribute.collectionStatus,
      inviteUsable: inviteIsUsable(found.invite),
    })
  ) {
    return { ok: false, reason: 'locked' };
  }
  const session = await createGuestSession({
    inviteId: found.invite.id,
    tributePublicId: found.tribute.publicId,
    expiresAt: found.invite.expiresAt,
  });
  const years = [found.tribute.bornLabel, found.tribute.rememberedLabel].filter(Boolean).join(' – ');
  return {
    ok: true,
    guest: {
      sessionId: session.sessionId,
      tributePublicId: found.tribute.publicId,
      displayName: found.tribute.displayName,
      years,
      expiresAt: found.invite.expiresAt,
      scope: found.invite.scope,
    },
  };
}

export async function resolveGuestContext(sessionId: string): Promise<
  | {
      ok: true;
      session: GuestSession;
      tribute: Tribute;
      invite: StoredContributorInvite;
    }
  | { ok: false; reason: 'not_found' | 'expired' | 'locked' }
> {
  const session = await getGuestSession(sessionId);
  if (!session) {
    return { ok: false, reason: 'not_found' };
  }
  const tribute = await getTribute(session.tributePublicId);
  if (!tribute) {
    return { ok: false, reason: 'not_found' };
  }
  const invite = tribute.invites.find((row) => row.id === session.inviteId);
  if (!invite) {
    return { ok: false, reason: 'not_found' };
  }
  if (!inviteIsUsable(invite)) {
    return { ok: false, reason: 'expired' };
  }
  if (
    !canAcceptContributorUpload({
      collectionStatus: tribute.collectionStatus,
      inviteUsable: true,
    })
  ) {
    return { ok: false, reason: 'locked' };
  }
  return { ok: true, session, tribute, invite };
}

export async function recordGuestUploadUse(
  tributePublicId: string,
  inviteId: string,
): Promise<void> {
  await incrementInviteUse(tributePublicId, inviteId);
}
