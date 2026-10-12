/**
 * Prompt 02 / 23 — owner-initiated tribute + account deletion confirmation (pure rules).
 * Dangerous; never auto-delete without explicit confirmation phrase.
 */

export const TRIBUTE_DELETE_CONFIRMATION = 'DELETE_TRIBUTE';
export const ACCOUNT_DELETE_CONFIRMATION = 'DELETE_ACCOUNT';

export function confirmTributeDeletion(confirmation: string | undefined): boolean {
  return (confirmation ?? '').trim() === TRIBUTE_DELETE_CONFIRMATION;
}

export function confirmAccountDeletion(confirmation: string | undefined): boolean {
  return (confirmation ?? '').trim() === ACCOUNT_DELETE_CONFIRMATION;
}

export type TributeDeletionPlan =
  | { action: 'deny'; reason: 'confirmation_required' | 'unavailable' }
  | { action: 'purge'; projectPublicId: string };

/** @deprecated Prefer TributeDeletionPlan — kept for call-site clarity during rename. */
export type AccountDeletionPlan = TributeDeletionPlan;

export function planTributeDeletion(input: {
  projectPublicId: string | undefined;
  confirmation: string | undefined;
  serviceAvailable: boolean;
}): TributeDeletionPlan {
  if (!input.serviceAvailable) {
    return { action: 'deny', reason: 'unavailable' };
  }
  if (!input.projectPublicId || input.projectPublicId.length < 8) {
    return { action: 'deny', reason: 'unavailable' };
  }
  if (!confirmTributeDeletion(input.confirmation)) {
    return { action: 'deny', reason: 'confirmation_required' };
  }
  return { action: 'purge', projectPublicId: input.projectPublicId };
}

export type FullAccountDeletionPlan =
  | { action: 'deny'; reason: 'confirmation_required' | 'unavailable' }
  | { action: 'purge_all_owned'; userId: string };

export function planFullAccountDeletion(input: {
  userId: string | undefined;
  confirmation: string | undefined;
  serviceAvailable: boolean;
}): FullAccountDeletionPlan {
  if (!input.serviceAvailable || !input.userId) {
    return { action: 'deny', reason: 'unavailable' };
  }
  if (!confirmAccountDeletion(input.confirmation)) {
    return { action: 'deny', reason: 'confirmation_required' };
  }
  return { action: 'purge_all_owned', userId: input.userId };
}
