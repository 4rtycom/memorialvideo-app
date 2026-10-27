import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashToken } from '@memorialvideo/domain';

describe('creator private share + download honesty', () => {
  let cwd: string;
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-creator-shr-'));
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

  it('requires Memorial Pack + TimelineContract; stores hash only', async () => {
    const store = await import('./store');
    const shares = await import('./shares-local');
    const pepper = (await import('./share-pepper')).resolveShareTokenPepper()!;

    const tribute = await store.createTribute({ displayName: 'Share Person' });
    const noPack = await shares.createPrivateViewShare(tribute.publicId);
    expect(noPack).toEqual({ ok: false, reason: 'no_entitlement' });

    await store.fulfillLocalMemorialPack(tribute.publicId);
    const noTimeline = await shares.createPrivateViewShare(tribute.publicId);
    expect(noTimeline).toEqual({ ok: false, reason: 'no_timeline' });

    for (let i = 0; i < store.FIRST_FILM_READY_PHOTO_THRESHOLD; i += 1) {
      await store.addMemory(tribute.publicId, {
        title: `M${i}`,
        filename: `m${i}.jpg`,
        alreadyReady: true,
      });
    }
    for (let i = 0; i < 6; i += 1) {
      const step = await store.advanceFirstFilm(tribute.publicId);
      if (step.ok && step.stage === 'ready_to_review') break;
    }

    const created = await shares.createPrivateViewShare(tribute.publicId);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.issued.actionUrl).toContain('/watch#t=');
    const reloaded = await store.getTribute(tribute.publicId);
    expect(reloaded?.shares[0]?.tokenHash).toBe(hashToken(created.issued.token, pepper));
    expect(JSON.stringify(reloaded)).not.toContain(created.issued.token);

    const redeemed = await shares.redeemShareToken(created.issued.token);
    expect(redeemed.ok).toBe(true);
    if (!redeemed.ok) return;
    expect(redeemed.tribute.timeline).toBeTruthy();

    const revoked = await shares.revokeOwnerShare(tribute.publicId, created.issued.shareId);
    expect(revoked).toEqual({ ok: true });
    expect(await shares.redeemShareToken(created.issued.token)).toEqual({
      ok: false,
      reason: 'revoked',
    });

    const download = shares.planCreatorDownload(reloaded);
    expect(download.canDownloadMp4).toBe(false);
    expect(download.canExportMetadata).toBe(true);
  });
});
