import type { ShareScope } from './invites';
import { generateShareToken, hashToken } from './tokens';

export type { ShareScope };

export function issueHashedShareToken(pepper: string): { token: string; tokenHash: string } {
  const token = generateShareToken();
  return { token, tokenHash: hashToken(token, pepper) };
}

export function shareIsUsable(input: {
  revokedAt: string | null;
  expiresAt: string;
  now?: Date;
}): boolean {
  if (input.revokedAt) {
    return false;
  }
  return Date.parse(input.expiresAt) > (input.now ?? new Date()).getTime();
}

export function defaultShareExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
}

export function canApprovalComment(input: {
  scope: ShareScope;
  shareUsable: boolean;
  body: string;
  timecodeMs: number;
  durationMs: number;
}): boolean {
  if (!input.shareUsable || input.scope !== 'approval') {
    return false;
  }
  if (input.body.trim().length < 1 || input.body.length > 500) {
    return false;
  }
  return input.timecodeMs >= 0 && input.timecodeMs <= input.durationMs;
}

export function approvalCannotDownload(): true {
  return true;
}

/** Private ceremony screening requires Memorial Pack private playback + a READY final. */
export function canCreateFinalViewShare(input: {
  allowsPrivatePlayback: boolean;
  hasReadyFinal: boolean;
}): boolean {
  return input.allowsPrivatePlayback === true && input.hasReadyFinal === true;
}

export function shareAllowsComments(scope: ShareScope): boolean {
  return scope === 'approval';
}

export function shareAllowsSignedPlayback(scope: ShareScope): boolean {
  return scope === 'final_view' || scope === 'preview';
}

export function shareExposesEditor(scope: ShareScope): false {
  void scope;
  return false;
}
