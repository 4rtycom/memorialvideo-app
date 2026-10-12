import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('creator collection lock/open', () => {
  let cwd: string;
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-creator-coll-'));
    cwd = process.cwd();
    process.chdir(dataRoot);
    vi.resetModules();
    process.env.APP_ENV = 'local';
    process.env.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3002';
    delete process.env.SHARE_TOKEN_PEPPER;
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(dataRoot, { recursive: true, force: true });
    vi.resetModules();
  });

  it('locks collection so guest redeem returns locked; open restores uploads', async () => {
    const store = await import('./store');
    const invites = await import('./invites');

    const tribute = await store.createTribute({ displayName: 'Lock Person' });
    const created = await invites.createOwnerInvite(tribute.publicId);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const listedOpen = await invites.listOwnerInvites(tribute.publicId);
    expect(listedOpen?.collectionStatus).toBe('OPEN');

    const locked = await invites.setOwnerCollectionStatus(tribute.publicId, 'lock');
    expect(locked).toEqual({ ok: true, collectionStatus: 'LOCKED' });

    const redeemLocked = await invites.redeemInviteToken(created.issued.token);
    expect(redeemLocked).toEqual({ ok: false, reason: 'locked' });

    // Creating another invite must not silently reopen a locked collection.
    const second = await invites.createOwnerInvite(tribute.publicId);
    expect(second.ok).toBe(true);
    const stillLocked = await store.getTribute(tribute.publicId);
    expect(stillLocked?.collectionStatus).toBe('LOCKED');
    expect(stillLocked?.activity.some((a) => a.code === 'collection_locked')).toBe(true);

    const opened = await invites.setOwnerCollectionStatus(tribute.publicId, 'open');
    expect(opened).toEqual({ ok: true, collectionStatus: 'OPEN' });
    const redeemOpen = await invites.redeemInviteToken(created.issued.token);
    expect(redeemOpen.ok).toBe(true);
    expect(stillLocked?.activity.some((a) => a.code === 'collection_locked')).toBe(true);
    const afterOpen = await store.getTribute(tribute.publicId);
    expect(afterOpen?.activity.some((a) => a.code === 'collection_opened')).toBe(true);
  });
});
