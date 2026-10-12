import { generateShareToken, hashToken } from './tokens';

export type InviteScope = 'upload_only' | 'upload_and_comment';
export type ShareScope = 'preview' | 'final_view' | 'approval';

export function issueHashedToken(pepper: string): { token: string; tokenHash: string } {
  const token = generateShareToken();
  return { token, tokenHash: hashToken(token, pepper) };
}

export type InviteUnusableReason = 'revoked' | 'expired' | 'max_uses';

export function inviteUnusableReason(input: {
  revokedAt: string | null;
  expiresAt: string;
  useCount: number;
  maxUses: number | null;
  now?: Date;
}): InviteUnusableReason | null {
  if (input.revokedAt) {
    return 'revoked';
  }
  if (Date.parse(input.expiresAt) <= (input.now ?? new Date()).getTime()) {
    return 'expired';
  }
  if (input.maxUses !== null && input.useCount >= input.maxUses) {
    return 'max_uses';
  }
  return null;
}

export function inviteIsUsable(input: {
  revokedAt: string | null;
  expiresAt: string;
  useCount: number;
  maxUses: number | null;
  now?: Date;
}): boolean {
  return inviteUnusableReason(input) === null;
}

export function defaultInviteExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);
}

export type InviteSummary = {
  id: string;
  scope: InviteScope;
  expiresAt: string;
  useCount: number;
  maxUses: number | null;
  revoked: boolean;
  usable: boolean;
};

export function summarizeInvite(input: {
  id: string;
  scope: InviteScope;
  expiresAt: string;
  useCount: number;
  maxUses: number | null;
  revokedAt: string | null;
  now?: Date;
}): InviteSummary {
  return {
    id: input.id,
    scope: input.scope,
    expiresAt: input.expiresAt,
    useCount: input.useCount,
    maxUses: input.maxUses,
    revoked: Boolean(input.revokedAt),
    usable: inviteIsUsable({
      revokedAt: input.revokedAt,
      expiresAt: input.expiresAt,
      useCount: input.useCount,
      maxUses: input.maxUses,
      now: input.now,
    }),
  };
}
