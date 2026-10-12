/** Classify redeem / fetch failures for retryable vs terminal UI. */

export type FailureKind = 'terminal' | 'retryable';

export function classifyInviteRedeemFailure(code: string | undefined): FailureKind {
  switch (code) {
    case 'revoked':
    case 'expired':
    case 'locked':
    case 'incomplete':
      return 'terminal';
    default:
      return 'retryable';
  }
}

export function inviteRedeemMessage(code: string | undefined): string {
  switch (code) {
    case 'revoked':
      return 'This invitation was revoked.';
    case 'expired':
      return 'This invitation has expired.';
    case 'locked':
      return 'Contributions are closed for now.';
    case 'incomplete':
      return 'This invitation link is missing or incomplete.';
    default:
      return 'We could not open this invitation.';
  }
}

export function classifyShareRedeemFailure(code: string | undefined): FailureKind {
  switch (code) {
    case 'revoked':
    case 'expired':
    case 'not_found':
    case 'incomplete':
      return 'terminal';
    default:
      return 'retryable';
  }
}

export function shareRedeemMessage(code: string | undefined): string {
  switch (code) {
    case 'expired':
      return 'This private viewing link has expired.';
    case 'revoked':
      return 'This private viewing link was revoked.';
    case 'not_found':
      return 'This private viewing link was not found.';
    case 'unavailable':
      return 'Private viewing is temporarily unavailable.';
    case 'incomplete':
      return 'This private viewing link is missing or incomplete.';
    default:
      return 'This private viewing link is unavailable.';
  }
}
