import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_DELETE_CONFIRMATION,
  confirmAccountDeletion,
  confirmTributeDeletion,
  planFullAccountDeletion,
  planTributeDeletion,
  TRIBUTE_DELETE_CONFIRMATION,
} from './account-deletion';

describe('account tribute deletion', () => {
  it('requires the exact confirmation phrase', () => {
    expect(confirmTributeDeletion('delete')).toBe(false);
    expect(confirmTributeDeletion(TRIBUTE_DELETE_CONFIRMATION)).toBe(true);
  });

  it('plans purge only when service and confirmation are present', () => {
    expect(
      planTributeDeletion({
        projectPublicId: 'mv_abcdefghijklmn',
        confirmation: TRIBUTE_DELETE_CONFIRMATION,
        serviceAvailable: true,
      }),
    ).toEqual({ action: 'purge', projectPublicId: 'mv_abcdefghijklmn' });
    expect(
      planTributeDeletion({
        projectPublicId: 'mv_abcdefghijklmn',
        confirmation: 'nope',
        serviceAvailable: true,
      }),
    ).toEqual({ action: 'deny', reason: 'confirmation_required' });
    expect(
      planTributeDeletion({
        projectPublicId: 'mv_abcdefghijklmn',
        confirmation: TRIBUTE_DELETE_CONFIRMATION,
        serviceAvailable: false,
      }),
    ).toEqual({ action: 'deny', reason: 'unavailable' });
  });

  it('plans full account purge only with DELETE_ACCOUNT confirmation', () => {
    expect(confirmAccountDeletion('DELETE_TRIBUTE')).toBe(false);
    expect(confirmAccountDeletion(ACCOUNT_DELETE_CONFIRMATION)).toBe(true);
    expect(
      planFullAccountDeletion({
        userId: 'user-1',
        confirmation: ACCOUNT_DELETE_CONFIRMATION,
        serviceAvailable: true,
      }),
    ).toEqual({ action: 'purge_all_owned', userId: 'user-1' });
    expect(
      planFullAccountDeletion({
        userId: 'user-1',
        confirmation: 'nope',
        serviceAvailable: true,
      }),
    ).toEqual({ action: 'deny', reason: 'confirmation_required' });
  });
});
