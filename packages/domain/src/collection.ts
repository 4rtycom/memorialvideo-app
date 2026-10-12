export type CollectionStatus = 'NOT_STARTED' | 'OPEN' | 'LOCKED';

export function canAcceptContributorUpload(input: {
  collectionStatus: CollectionStatus;
  inviteUsable: boolean;
  closesAt?: string | null;
  now?: Date;
}): boolean {
  if (!input.inviteUsable || input.collectionStatus === 'LOCKED') {
    return false;
  }
  if (input.closesAt && Date.parse(input.closesAt) <= (input.now ?? new Date()).getTime()) {
    return false;
  }
  return true;
}

export function nextCollectionStatus(
  current: CollectionStatus,
  action: 'open' | 'lock',
): CollectionStatus {
  if (action === 'lock') {
    return 'LOCKED';
  }
  return current === 'LOCKED' ? 'OPEN' : 'OPEN';
}

export const COLLECTION_REMINDER_WINDOW_MS = 48 * 60 * 60 * 1000;

export type CollectionReminderPlan =
  | 'send'
  | 'skip_locked'
  | 'skip_no_deadline'
  | 'skip_too_early'
  | 'skip_closed'
  | 'skip_already_sent';

export function planCollectionReminder(input: {
  collectionStatus: CollectionStatus;
  closesAt?: string | null;
  lastRemindedAt?: string | null;
  now?: Date;
}): CollectionReminderPlan {
  if (input.collectionStatus === 'LOCKED') {
    return 'skip_locked';
  }
  if (!input.closesAt) {
    return 'skip_no_deadline';
  }
  const now = (input.now ?? new Date()).getTime();
  const closes = Date.parse(input.closesAt);
  if (!Number.isFinite(closes)) {
    return 'skip_no_deadline';
  }
  if (closes <= now) {
    return 'skip_closed';
  }
  if (closes - now > COLLECTION_REMINDER_WINDOW_MS) {
    return 'skip_too_early';
  }
  if (input.lastRemindedAt) {
    return 'skip_already_sent';
  }
  return 'send';
}
