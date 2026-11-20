import { beforeEach, describe, expect, it, vi } from 'vitest';

const objects = vi.hoisted(() => ({
  mediaBackend: vi.fn(),
  downloadObject: vi.fn(),
  deleteObject: vi.fn(),
  uploadObject: vi.fn(),
}));
vi.mock('@/server/object-storage', () => objects);

import { createHash } from 'node:crypto';
import { deleteStoredMedia, finalizeStoredUpload, replaceStoredMedia, withLocalCopy } from './media-backend';

const T = 'mv_aaaaaaaaaaaaaaaa';

beforeEach(() => {
  for (const fn of Object.values(objects)) fn.mockReset();
  objects.mediaBackend.mockReturnValue('supabase');
});

describe('hosted (supabase) uploads', () => {
  it('verifies the stored object against the declared size and hashes it', async () => {
    const bytes = Buffer.from('hello');
    objects.downloadObject.mockResolvedValue({ bytes, contentType: 'image/jpeg' });
    const result = await finalizeStoredUpload({
      uploadId: 'mem_1',
      tributePublicId: T,
      assetId: 'mem_1',
      declared: { contentType: 'image/jpeg', byteSize: 5 },
    });
    expect(result).toMatchObject({ ok: true, upload: { byteSize: 5, mediaPath: `/api/media/${T}/mem_1` } });
    expect(result.ok && result.upload.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
  });

  it('rejects and deletes an object whose size differs from what was declared', async () => {
    objects.downloadObject.mockResolvedValue({ bytes: Buffer.from('hello world'), contentType: null });
    const result = await finalizeStoredUpload({
      uploadId: 'mem_1',
      tributePublicId: T,
      assetId: 'mem_1',
      declared: { contentType: 'image/jpeg', byteSize: 5 },
    });
    expect(result).toEqual({ ok: false, reason: 'size_mismatch' });
    expect(objects.deleteObject).toHaveBeenCalledWith(T, 'mem_1');
  });

  it('reports a missing object, and an upload with nothing declared', async () => {
    objects.downloadObject.mockResolvedValue(null);
    expect(
      await finalizeStoredUpload({ uploadId: 'a', tributePublicId: T, assetId: 'mem_1', declared: { contentType: 'x', byteSize: 1 } }),
    ).toEqual({ ok: false, reason: 'media_missing' });
    expect(await finalizeStoredUpload({ uploadId: 'a', tributePublicId: T, assetId: 'mem_1', declared: null })).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('delegates delete and replace to object storage and gives tools a temp file', async () => {
    await deleteStoredMedia(T, 'mem_1');
    expect(objects.deleteObject).toHaveBeenCalledWith(T, 'mem_1');
    const out = await replaceStoredMedia(T, 'mem_1', Buffer.from('jpeg'), 'image/jpeg');
    expect(objects.uploadObject).toHaveBeenCalledWith(T, 'mem_1', Buffer.from('jpeg'), 'image/jpeg');
    expect(out.byteSize).toBe(4);
    const seen = await withLocalCopy({ tributePublicId: T, assetId: 'mem_1', bytes: Buffer.from('abc') }, async (file) => {
      const { readFile } = await import('node:fs/promises');
      return (await readFile(file)).toString();
    });
    expect(seen).toBe('abc');
  });
});
