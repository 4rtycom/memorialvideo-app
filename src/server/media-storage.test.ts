import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appendUploadChunk,
  createUploadSession,
  finalizeUploadToMedia,
  isAllowedUploadContentType,
  readMediaFile,
} from './media-storage';

describe('local TUS media storage', () => {
  let cwd: string;
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'mv-tus-'));
    cwd = process.cwd();
    process.chdir(root);
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(root, { recursive: true, force: true });
  });

  it('accepts allowed types and rejects random binaries by policy', () => {
    expect(isAllowedUploadContentType('image/jpeg', 'a.jpg')).toBe(true);
    expect(isAllowedUploadContentType('image/heic', 'a.HEIC')).toBe(true);
    expect(isAllowedUploadContentType('application/pdf', 'a.pdf')).toBe(false);
  });

  it('stores resumable chunks and finalizes opaque media bytes', async () => {
    const session = await createUploadSession({
      tributePublicId: 'mv_abcdef0123456789',
      assetId: 'mem_aaaaaaaaaaaaaaaa',
      contentType: 'image/jpeg',
      byteSize: 8,
    });
    const part1 = await appendUploadChunk(session.uploadId, 0, Buffer.from([1, 2, 3, 4]));
    expect(part1.ok).toBe(true);
    if (!part1.ok) return;
    expect(part1.session.offset).toBe(4);
    const mismatch = await appendUploadChunk(session.uploadId, 0, Buffer.from([9]));
    expect(mismatch.ok).toBe(false);
    const part2 = await appendUploadChunk(session.uploadId, 4, Buffer.from([5, 6, 7, 8]));
    expect(part2.ok).toBe(true);
    const done = await finalizeUploadToMedia(session.uploadId);
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.mediaPath).toContain('/api/media/mv_abcdef0123456789/mem_aaaaaaaaaaaaaaaa');
    expect(done.sha256).toHaveLength(64);
    const media = await readMediaFile('mv_abcdef0123456789', 'mem_aaaaaaaaaaaaaaaa');
    expect(media?.bytes.equals(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]))).toBe(true);
  });
});
