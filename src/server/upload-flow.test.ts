import { existsSync } from 'node:fs';
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

const SECRET = 'test-session-secret-0123456789';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9]);
const WAV = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20,
]);
const PDF = Buffer.from('%PDF-1.4 not a photo');

async function signIn(accountId: string, tributeId: string) {
  const session = await import('./account-session');
  jar.set('mv_creator_account', session.signAccountSession(accountId, SECRET));
  jar.set('mv_creator_tribute', tributeId);
}

async function uploadBytes(input: {
  filename: string;
  contentType: string;
  bytes: Buffer;
  musicRightsConfirmed?: boolean;
}) {
  const authorize = await import('../app/api/uploads/authorize/route');
  const tus = await import('../app/api/uploads/tus/[uploadId]/route');
  const complete = await import('../app/api/uploads/complete/route');
  const auth = await authorize.POST(
    new Request('http://127.0.0.1:3002/api/uploads/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Fixture memory',
        filename: input.filename,
        contentType: input.contentType,
        byteSize: input.bytes.length,
        musicRightsConfirmed: input.musicRightsConfirmed,
      }),
    }),
  );
  const authBody = (await auth.json()) as {
    assetId?: string;
    uploadUrl?: string;
    error?: string;
    mode?: string;
  };
  if (!auth.ok || !authBody.uploadUrl || !authBody.assetId) {
    return { auth, authBody, patched: null, done: null };
  }
  const uploadId = authBody.uploadUrl.split('/').pop() ?? '';
  const patched = await tus.PATCH(
    new Request(`http://127.0.0.1:3002${authBody.uploadUrl}`, {
      method: 'PATCH',
      headers: {
        'Tus-Resumable': '1.0.0',
        'Upload-Offset': '0',
        'Content-Type': 'application/offset+octet-stream',
      },
      body: input.bytes,
    }),
    { params: Promise.resolve({ uploadId }) },
  );
  const done = await complete.POST(
    new Request('http://127.0.0.1:3002/api/uploads/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ uploadId, assetId: authBody.assetId }),
    }),
  );
  return { auth, authBody, patched, done };
}

describe('private photo and song upload', () => {
  let cwd: string;
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-upload-flow-'));
    cwd = process.cwd();
    process.chdir(dataRoot);
    jar.clear();
    process.env.APP_ENV = 'local';
    process.env.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3002';
    process.env.CREATOR_SESSION_SECRET = SECRET;
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(dataRoot, { recursive: true, force: true });
  });

  it('stores a jpeg privately with a checksum and hides it from another account', async () => {
    const accounts = await import('./accounts');
    const actor = await import('./actor');
    const store = await import('./store');
    const mediaRoute = await import('../app/api/media/[tributeId]/[assetId]/route');
    const tus = await import('../app/api/uploads/tus/[uploadId]/route');
    const media = await import('./media-storage');

    const owner = await accounts.registerAccount('owner.upload@example.com', 'correct horse battery');
    const other = await accounts.registerAccount('other.upload@example.com', 'another secret phrase');
    if (!owner.ok || !other.ok) throw new Error('accounts');
    const tribute = await actor.runWithAccount(owner.accountId, () =>
      store.createTribute({ displayName: 'Upload Person' }),
    );
    await signIn(owner.accountId, tribute.publicId);

    const uploaded = await uploadBytes({
      filename: 'garden.jpg',
      contentType: 'image/jpeg',
      bytes: JPEG,
    });
    expect(uploaded.auth.status).toBe(201);
    expect(uploaded.patched?.status).toBe(204);
    expect(uploaded.done?.status).toBe(200);
    const doneBody = (await uploaded.done!.json()) as {
      sha256: string;
      mediaPath: string;
      memory: { checksumSha256?: string; imagePath: string; ingestStatus: string };
    };
    expect(doneBody.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(doneBody.mediaPath.startsWith(`/api/media/${tribute.publicId}/`)).toBe(true);
    expect(doneBody.mediaPath.includes('/fixtures/')).toBe(false);
    expect(doneBody.memory.checksumSha256).toBe(doneBody.sha256);
    expect(doneBody.memory.ingestStatus).toBe('UPLOADED');

    const assetId = uploaded.authBody.assetId!;
    const file = media.mediaFilePath(tribute.publicId, assetId);
    expect(existsSync(file)).toBe(true);

    const allowed = await mediaRoute.GET(new Request('http://127.0.0.1:3002/api/media'), {
      params: Promise.resolve({ tributeId: tribute.publicId, assetId }),
    });
    expect(allowed.status).toBe(200);

    const reloaded = await actor.runWithAccount(owner.accountId, () => store.getTribute(tribute.publicId));
    expect(reloaded?.memories.some((item) => item.id === assetId && item.checksumSha256 === doneBody.sha256)).toBe(
      true,
    );

    await signIn(other.accountId, tribute.publicId);
    const denied = await mediaRoute.GET(new Request('http://127.0.0.1:3002/api/media'), {
      params: Promise.resolve({ tributeId: tribute.publicId, assetId }),
    });
    expect(denied.status).toBe(404);
    const uploadId = uploaded.authBody.uploadUrl!.split('/').pop() ?? '';
    const deniedPatch = await tus.PATCH(
      new Request('http://127.0.0.1:3002/api/uploads/tus', {
        method: 'PATCH',
        headers: { 'Tus-Resumable': '1.0.0', 'Upload-Offset': '0' },
        body: JPEG,
      }),
      { params: Promise.resolve({ uploadId }) },
    );
    expect(deniedPatch.status).toBe(404);
  });

  it('rejects a declared jpeg that is not a jpeg and deletes the bytes', async () => {
    const accounts = await import('./accounts');
    const actor = await import('./actor');
    const store = await import('./store');
    const media = await import('./media-storage');

    const owner = await accounts.registerAccount('spoof.upload@example.com', 'correct horse battery');
    if (!owner.ok) throw new Error('account');
    const tribute = await actor.runWithAccount(owner.accountId, () =>
      store.createTribute({ displayName: 'Spoof Person' }),
    );
    await signIn(owner.accountId, tribute.publicId);
    const uploaded = await uploadBytes({
      filename: 'not-a-photo.jpg',
      contentType: 'image/jpeg',
      bytes: PDF,
    });
    expect(uploaded.done?.status).toBe(415);
    const body = (await uploaded.done!.json()) as { error: string };
    expect(body.error).toBe('content_mismatch');
    expect(existsSync(media.mediaFilePath(tribute.publicId, uploaded.authBody.assetId!))).toBe(false);
  });

  it('requires rights for a song and stores a wav once confirmed', async () => {
    const accounts = await import('./accounts');
    const actor = await import('./actor');
    const store = await import('./store');

    const owner = await accounts.registerAccount('song.upload@example.com', 'correct horse battery');
    if (!owner.ok) throw new Error('account');
    const tribute = await actor.runWithAccount(owner.accountId, () =>
      store.createTribute({ displayName: 'Song Person' }),
    );
    await signIn(owner.accountId, tribute.publicId);

    const denied = await uploadBytes({
      filename: 'hymn.wav',
      contentType: 'audio/wav',
      bytes: WAV,
    });
    expect(denied.auth.status).toBe(400);
    expect(denied.authBody.error).toBe('rights_required');

    const allowed = await uploadBytes({
      filename: 'hymn.wav',
      contentType: 'audio/wav',
      bytes: WAV,
      musicRightsConfirmed: true,
    });
    expect(allowed.done?.status).toBe(200);
    const body = (await allowed.done!.json()) as {
      memory: { contentType?: string; rightsConfirmed?: boolean; checksumSha256?: string };
    };
    expect(body.memory.contentType).toBe('audio/wav');
    expect(body.memory.rightsConfirmed).toBe(true);
    expect(body.memory.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
