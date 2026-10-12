import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashToken } from '@memorialvideo/domain';

describe('creator hashed contributor invites', () => {
  let cwd: string;
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-creator-inv-'));
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

  it('issues invite with plaintext once and stores only hash', async () => {
    const store = await import('./store');
    const invites = await import('./invites');
    const pepper = (await import('./share-pepper')).resolveShareTokenPepper();
    expect(pepper).toBeTruthy();

    const tribute = await store.createTribute({ displayName: 'Invite Person' });
    const created = await invites.createOwnerInvite(tribute.publicId);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(created.issued.token.length).toBeGreaterThanOrEqual(16);
    expect(created.issued.actionUrl).toContain('/guest#t=');
    expect(created.issued.actionUrl).toContain(encodeURIComponent(created.issued.token));

    const reloaded = await store.getTribute(tribute.publicId);
    expect(reloaded?.invites).toHaveLength(1);
    const stored = reloaded!.invites[0]!;
    expect(stored.tokenHash).toBe(hashToken(created.issued.token, pepper!));
    expect(JSON.stringify(reloaded)).not.toContain(created.issued.token);
    expect(reloaded?.collectionStatus).toBe('OPEN');

    const listed = await invites.listOwnerInvites(tribute.publicId);
    expect(listed?.invites[0]?.usable).toBe(true);
    expect(JSON.stringify(listed)).not.toContain(created.issued.token);
  });

  it('redeems guest session and accepts contributor memory without owner cookie', async () => {
    const store = await import('./store');
    const invites = await import('./invites');
    const tribute = await store.createTribute({ displayName: 'Guest Person' });
    const created = await invites.createOwnerInvite(tribute.publicId);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const redeemed = await invites.redeemInviteToken(created.issued.token);
    expect(redeemed.ok).toBe(true);
    if (!redeemed.ok) return;
    expect(redeemed.guest.sessionId.startsWith('gs_')).toBe(true);
    expect(redeemed.guest.displayName).toBe('Guest Person');

    const guest = await invites.resolveGuestContext(redeemed.guest.sessionId);
    expect(guest.ok).toBe(true);
    if (!guest.ok) return;

    const memory = await store.addMemory(guest.tribute.publicId, {
      title: 'Park afternoon',
      filename: 'park.jpg',
      source: 'contributor',
      contributorName: 'Alex',
      contributorNote: 'A quiet walk',
      inviteId: guest.invite.id,
      alreadyReady: true,
    });
    expect(memory?.source).toBe('contributor');
    expect(memory?.reviewState).toBe('pending');
    await invites.recordGuestUploadUse(guest.tribute.publicId, guest.invite.id);

    const listed = await invites.listOwnerInvites(tribute.publicId);
    expect(listed?.progress.contributorPhotoCount).toBe(1);
    expect(listed?.progress.inviteUseCount).toBe(1);

    const revoked = await invites.revokeOwnerInvite(tribute.publicId, created.issued.inviteId);
    expect(revoked.ok).toBe(true);
    const again = await invites.redeemInviteToken(created.issued.token);
    expect(again).toEqual({ ok: false, reason: 'revoked' });
  });
});
