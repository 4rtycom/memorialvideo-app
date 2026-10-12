import { describe, expect, it } from 'vitest';

import { inviteIsUsable, summarizeInvite } from './invites.js';

describe('contributor invites', () => {
  it('rejects revoked, expired, and exhausted invites', () => {
    const now = new Date('2026-10-10T12:00:00.000Z');
    expect(
      inviteIsUsable({
        revokedAt: null,
        expiresAt: '2026-10-20T00:00:00.000Z',
        useCount: 0,
        maxUses: 3,
        now,
      }),
    ).toBe(true);
    expect(
      inviteIsUsable({
        revokedAt: '2026-10-09T00:00:00.000Z',
        expiresAt: '2026-10-20T00:00:00.000Z',
        useCount: 0,
        maxUses: 3,
        now,
      }),
    ).toBe(false);
    expect(
      inviteIsUsable({
        revokedAt: null,
        expiresAt: '2026-10-01T00:00:00.000Z',
        useCount: 0,
        maxUses: 3,
        now,
      }),
    ).toBe(false);
    expect(
      inviteIsUsable({
        revokedAt: null,
        expiresAt: '2026-10-20T00:00:00.000Z',
        useCount: 3,
        maxUses: 3,
        now,
      }),
    ).toBe(false);
  });

  it('summarizes usable state without exposing tokens', () => {
    const summary = summarizeInvite({
      id: 'inv_1',
      scope: 'upload_only',
      expiresAt: '2026-10-20T00:00:00.000Z',
      useCount: 1,
      maxUses: 5,
      revokedAt: null,
      now: new Date('2026-10-10T12:00:00.000Z'),
    });
    expect(summary.usable).toBe(true);
    expect(summary.revoked).toBe(false);
    expect(JSON.stringify(summary)).not.toMatch(/token/i);
  });
});
