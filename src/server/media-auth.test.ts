import { mkdtempSync, rmSync } from 'node:fs';
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

describe('private media reads', () => {
  let cwd: string;
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-media-auth-'));
    cwd = process.cwd();
    process.chdir(dataRoot);
    jar.clear();
    process.env.APP_ENV = 'local';
    process.env.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3002';
    process.env.CREATOR_SESSION_SECRET = 'test-session-secret-0123456789';
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(dataRoot, { recursive: true, force: true });
  });

  it('serves media to the owner and hides it from another account', async () => {
    const accounts = await import('./accounts');
    const actor = await import('./actor');
    const store = await import('./store');
    const media = await import('./media-storage');
    const session = await import('./account-session');
    const route = await import('../app/api/media/[tributeId]/[assetId]/route');

    const owner = await accounts.registerAccount('owner.media@example.com', 'correct horse battery');
    const other = await accounts.registerAccount('other.media@example.com', 'another secret phrase');
    if (!owner.ok || !other.ok) {
      throw new Error('accounts');
    }
    const tribute = await actor.runWithAccount(owner.accountId, () =>
      store.createTribute({ displayName: 'Media Person' }),
    );
    const upload = await media.createUploadSession({
      tributePublicId: tribute.publicId,
      assetId: 'mem_abcdef0123456789',
      contentType: 'image/jpeg',
      byteSize: 4,
    });
    await media.appendUploadChunk(upload.uploadId, 0, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    await media.finalizeUploadToMedia(upload.uploadId);

    jar.set('mv_creator_tribute', tribute.publicId);
    jar.set(
      'mv_creator_account',
      session.signAccountSession(owner.accountId, 'test-session-secret-0123456789'),
    );
    const allowed = await route.GET(new Request('http://127.0.0.1:3002/api/media'), {
      params: Promise.resolve({ tributeId: tribute.publicId, assetId: 'mem_abcdef0123456789' }),
    });
    expect(allowed.status).toBe(200);

    jar.set(
      'mv_creator_account',
      session.signAccountSession(other.accountId, 'test-session-secret-0123456789'),
    );
    const denied = await route.GET(new Request('http://127.0.0.1:3002/api/media'), {
      params: Promise.resolve({ tributeId: tribute.publicId, assetId: 'mem_abcdef0123456789' }),
    });
    expect(denied.status).toBe(404);
  });
});
