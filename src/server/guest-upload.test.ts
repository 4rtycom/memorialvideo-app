import { mkdtempSync, rmSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = vi.hoisted(() => new Map<string, string>());

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = jar.get(name);
      return value ? { name, value } : undefined;
    },
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
    delete: (name: string) => {
      jar.delete(name);
    },
  }),
}));

const SECRET = 'test-session-secret-0123456789';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9]);

async function signIn(accountId: string, tributeId: string) {
  const session = await import('./account-session');
  jar.set('mv_creator_account', session.signAccountSession(accountId, SECRET));
  jar.set('mv_creator_tribute', tributeId);
}

describe('guest invite upload and owner review', () => {
  let cwd: string;
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-guest-upload-'));
    cwd = process.cwd();
    process.chdir(dataRoot);
    jar.clear();
    process.env.APP_ENV = 'local';
    process.env.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3002';
    process.env.CREATOR_SESSION_SECRET = SECRET;
    delete process.env.DATABASE_URL;
    delete process.env.SHARE_TOKEN_PEPPER;
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(dataRoot, { recursive: true, force: true });
  });

  it('lets a guest store a private photo, blocks other media, and lets the owner accept it', async () => {
    const accounts = await import('./accounts');
    const actor = await import('./actor');
    const store = await import('./store');
    const invitesRoute = await import('../app/api/invites/route');
    const redeemRoute = await import('../app/api/invites/redeem/route');
    const revokeRoute = await import('../app/api/invites/revoke/route');
    const authorize = await import('../app/api/uploads/contributor/authorize/route');
    const tus = await import('../app/api/uploads/tus/[uploadId]/route');
    const complete = await import('../app/api/uploads/complete/route');
    const review = await import('../app/api/tributes/active/memories/review/route');
    const mediaRoute = await import('../app/api/media/[tributeId]/[assetId]/route');
    const media = await import('./media-storage');

    const owner = await accounts.registerAccount('owner.guest@example.com', 'correct horse battery');
    const stranger = await accounts.registerAccount('stranger.guest@example.com', 'another secret phrase');
    if (!owner.ok || !stranger.ok) throw new Error('accounts');
    const tribute = await actor.runWithAccount(owner.accountId, () =>
      store.createTribute({ displayName: 'Guest Target' }),
    );
    const other = await actor.runWithAccount(stranger.accountId, () =>
      store.createTribute({ displayName: 'Other Memorial' }),
    );
    const foreign = await media.createUploadSession({
      tributePublicId: other.publicId,
      assetId: 'mem_bbbbbbbbbbbbbbbb',
      contentType: 'image/jpeg',
      byteSize: JPEG.length,
    });
    await media.appendUploadChunk(foreign.uploadId, 0, JPEG);
    await media.finalizeUploadToMedia(foreign.uploadId);

    await signIn(owner.accountId, tribute.publicId);
    const created = await invitesRoute.POST();
    expect(created.status).toBe(201);
    const issued = (await created.json()) as { token: string; actionUrl: string; inviteId: string };
    expect(issued.actionUrl).toContain('/guest#t=');
    expect(issued.token.length).toBeGreaterThanOrEqual(16);

    jar.delete('mv_creator_account');
    jar.delete('mv_creator_tribute');
    const redeemed = await redeemRoute.POST(
      new Request('http://127.0.0.1:3002/api/invites/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: issued.token }),
      }),
    );
    expect(redeemed.status).toBe(200);
    const guestCookie = redeemed.cookies.get('mv_creator_guest')?.value;
    expect(guestCookie?.startsWith('gs_')).toBe(true);
    jar.set('mv_creator_guest', guestCookie!);

    const foreignRead = await mediaRoute.GET(new Request('http://127.0.0.1:3002/api/media'), {
      params: Promise.resolve({ tributeId: other.publicId, assetId: 'mem_bbbbbbbbbbbbbbbb' }),
    });
    expect(foreignRead.status).toBe(403);

    const auth = await authorize.POST(
      new Request('http://127.0.0.1:3002/api/uploads/contributor/authorize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'From the guest',
          filename: 'visit.jpg',
          contentType: 'image/jpeg',
          byteSize: JPEG.length,
          contributorName: 'Sam',
        }),
      }),
    );
    expect(auth.status).toBe(201);
    const authBody = (await auth.json()) as { assetId: string; uploadUrl: string };
    const uploadId = authBody.uploadUrl.split('/').pop() ?? '';
    const patched = await tus.PATCH(
      new Request('http://127.0.0.1:3002/api/uploads/tus', {
        method: 'PATCH',
        headers: { 'Tus-Resumable': '1.0.0', 'Upload-Offset': '0' },
        body: JPEG,
      }),
      { params: Promise.resolve({ uploadId }) },
    );
    expect(patched.status).toBe(204);
    const done = await complete.POST(
      new Request('http://127.0.0.1:3002/api/uploads/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ uploadId, assetId: authBody.assetId }),
      }),
    );
    expect(done.status).toBe(200);

    jar.delete('mv_creator_guest');
    await signIn(stranger.accountId, tribute.publicId);
    const strangerReview = await review.POST(
      new Request('http://127.0.0.1:3002/api/tributes/active/memories/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ memoryId: authBody.assetId, reviewState: 'accepted' }),
      }),
    );
    expect(strangerReview.status).toBe(404);

    await signIn(owner.accountId, tribute.publicId);
    const accepted = await review.POST(
      new Request('http://127.0.0.1:3002/api/tributes/active/memories/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ memoryId: authBody.assetId, reviewState: 'accepted' }),
      }),
    );
    expect(accepted.status).toBe(200);
    const acceptedBody = (await accepted.json()) as { memory: { reviewState: string; source: string } };
    expect(acceptedBody.memory.reviewState).toBe('accepted');
    expect(acceptedBody.memory.source).toBe('contributor');

    const revoked = await revokeRoute.POST(
      new Request('http://127.0.0.1:3002/api/invites/revoke', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ inviteId: issued.inviteId }),
      }),
    );
    expect(revoked.status).toBe(200);
    jar.delete('mv_creator_account');
    jar.delete('mv_creator_tribute');
    const again = await redeemRoute.POST(
      new Request('http://127.0.0.1:3002/api/invites/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: issued.token }),
      }),
    );
    expect(again.status).toBe(409);
    const againBody = (await again.json()) as { error: string };
    expect(againBody.error).toBe('revoked');
  });

  it('rejects an expired invitation', async () => {
    const accounts = await import('./accounts');
    const actor = await import('./actor');
    const store = await import('./store');
    const invitesRoute = await import('../app/api/invites/route');
    const redeemRoute = await import('../app/api/invites/redeem/route');

    const owner = await accounts.registerAccount('owner.expire@example.com', 'correct horse battery');
    if (!owner.ok) throw new Error('account');
    const tribute = await actor.runWithAccount(owner.accountId, () =>
      store.createTribute({ displayName: 'Expire Target' }),
    );
    await signIn(owner.accountId, tribute.publicId);
    const created = await invitesRoute.POST();
    const issued = (await created.json()) as { token: string };
    const storeFile = path.join(dataRoot, '.data', 'creator-store.json');
    const document = JSON.parse(await readFile(storeFile, 'utf8')) as {
      tributes: Record<string, { invites: Array<{ expiresAt: string }> }>;
    };
    document.tributes[tribute.publicId]!.invites[0]!.expiresAt = '2000-01-01T00:00:00.000Z';
    await writeFile(storeFile, JSON.stringify(document));

    jar.clear();
    const expired = await redeemRoute.POST(
      new Request('http://127.0.0.1:3002/api/invites/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: issued.token }),
      }),
    );
    expect(expired.status).toBe(409);
    const body = (await expired.json()) as { error: string };
    expect(body.error).toBe('expired');
  });
});
