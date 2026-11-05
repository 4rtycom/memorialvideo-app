import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
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

async function signIn(accountId: string, tributeId: string) {
  const session = await import('./account-session');
  jar.set('mv_creator_account', session.signAccountSession(accountId, SECRET));
  jar.set('mv_creator_tribute', tributeId);
}

describe('HEIC contribution conversion (MV-AUD-007)', () => {
  let cwd: string;
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-heic-upload-'));
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

  it('lets a guest upload HEIC and stores converted JPEG without device-convert rejection', async () => {
    const accounts = await import('./accounts');
    const actor = await import('./actor');
    const store = await import('./store');
    const invitesRoute = await import('../app/api/invites/route');
    const redeemRoute = await import('../app/api/invites/redeem/route');
    const authorize = await import('../app/api/uploads/contributor/authorize/route');
    const tus = await import('../app/api/uploads/tus/[uploadId]/route');
    const complete = await import('../app/api/uploads/complete/route');
    const media = await import('./media-storage');

    const heicBytes = await readFile(path.join(cwd, 'src/server/__fixtures__/sample.heic'));
    expect(heicBytes.byteLength).toBeGreaterThan(1000);

    const owner = await accounts.registerAccount('owner.heic@example.com', 'correct horse battery');
    if (!owner.ok) throw new Error('account');
    const tribute = await actor.runWithAccount(owner.accountId, () =>
      store.createTribute({ displayName: 'Heic Guest Target' }),
    );

    await signIn(owner.accountId, tribute.publicId);
    const created = await invitesRoute.POST();
    expect(created.status).toBe(201);
    const issued = (await created.json()) as { token: string };

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
    jar.set('mv_creator_guest', guestCookie!);

    const auth = await authorize.POST(
      new Request('http://127.0.0.1:3002/api/uploads/contributor/authorize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Phone still',
          filename: 'IMG_HEIC.HEIC',
          contentType: 'image/heic',
          byteSize: heicBytes.byteLength,
          contributorName: 'Sam',
        }),
      }),
    );
    expect(auth.status).toBe(201);
    const authBody = (await auth.json()) as {
      assetId: string;
      uploadUrl: string;
      mode: string;
    };
    expect(authBody.mode).toBe('local_tus');
    expect(authBody.mode).not.toBe('rejected_heic');

    const uploadId = authBody.uploadUrl.split('/').pop() ?? '';
    const patched = await tus.PATCH(
      new Request('http://127.0.0.1:3002/api/uploads/tus', {
        method: 'PATCH',
        headers: { 'Tus-Resumable': '1.0.0', 'Upload-Offset': '0' },
        body: heicBytes,
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
    const body = (await done.json()) as {
      ok: boolean;
      convertedFromHeic?: boolean;
      memory: { contentType?: string; failureCode?: string | null; ingestStatus: string };
    };
    expect(body.ok).toBe(true);
    expect(body.convertedFromHeic).toBe(true);
    expect(body.memory.contentType).toBe('image/jpeg');
    expect(body.memory.failureCode ?? null).toBeNull();
    expect(body.memory.ingestStatus).toBe('UPLOADED');

    const stored = await media.readMediaFile(tribute.publicId, authBody.assetId);
    expect(stored).not.toBeNull();
    expect(media.sniffMediaBytes(stored!.bytes)).toBe('image/jpeg');
  });
});
