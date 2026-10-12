import { shareIsUsable } from '@memorialvideo/domain';
import type { Tribute } from './store';

export { getTribute } from './store';

export type ShareListStatus = 'active' | 'revoked' | 'expired';

export function shareListStatus(share: {
  revokedAt: string | null;
  expiresAt: string;
  now?: Date;
}): ShareListStatus {
  if (share.revokedAt) {
    return 'revoked';
  }
  if (!shareIsUsable(share)) {
    return 'expired';
  }
  return 'active';
}

export function summarizeShareList(tribute: Tribute): Array<{
  id: string;
  scope: string;
  expiresAt: string;
  revoked: boolean;
  usable: boolean;
  status: ShareListStatus;
}> {
  return tribute.shares.map((share) => {
    const status = shareListStatus(share);
    return {
      id: share.id,
      scope: share.scope,
      expiresAt: share.expiresAt,
      revoked: Boolean(share.revokedAt),
      usable: status === 'active',
      status,
    };
  });
}
