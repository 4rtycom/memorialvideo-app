import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  deleteMediaFile,
  finalizeUploadToMedia,
  mediaFilePath,
  mediaPublicPath,
  replaceMediaBytes,
} from '@/server/media-storage';
import { deleteObject, downloadObject, mediaBackend, uploadObject } from '@/server/object-storage';

export type FinalizedUpload = {
  tributePublicId: string;
  assetId: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  mediaPath: string;
  bytes: Buffer;
};

/**
 * Turn a finished upload into stored bytes the complete route can validate.
 * local: the chunks on disk are copied into `.data/media`. supabase: the browser already uploaded the
 * object, so we download it and check it against what was declared at authorize time.
 */
export async function finalizeStoredUpload(input: {
  uploadId: string;
  tributePublicId: string;
  assetId: string;
  declared: { contentType: string; byteSize: number } | null;
}): Promise<{ ok: true; upload: FinalizedUpload } | { ok: false; reason: string }> {
  if (mediaBackend() === 'local') {
    const finalized = await finalizeUploadToMedia(input.uploadId);
    if (!finalized.ok) return { ok: false, reason: finalized.reason };
    if (
      finalized.session.tributePublicId !== input.tributePublicId ||
      finalized.session.assetId !== input.assetId
    ) {
      return { ok: false, reason: 'mismatch' };
    }
    return {
      ok: true,
      upload: {
        tributePublicId: input.tributePublicId,
        assetId: input.assetId,
        contentType: finalized.contentType,
        byteSize: finalized.byteSize,
        sha256: finalized.sha256,
        mediaPath: finalized.mediaPath,
        bytes: await readFile(mediaFilePath(input.tributePublicId, input.assetId)),
      },
    };
  }
  if (!input.declared) return { ok: false, reason: 'not_found' };
  const object = await downloadObject(input.tributePublicId, input.assetId);
  if (!object) return { ok: false, reason: 'media_missing' };
  if (object.bytes.byteLength !== input.declared.byteSize) {
    await deleteObject(input.tributePublicId, input.assetId);
    return { ok: false, reason: 'size_mismatch' };
  }
  return {
    ok: true,
    upload: {
      tributePublicId: input.tributePublicId,
      assetId: input.assetId,
      contentType: input.declared.contentType,
      byteSize: object.bytes.byteLength,
      sha256: createHash('sha256').update(object.bytes).digest('hex'),
      mediaPath: mediaPublicPath(input.tributePublicId, input.assetId),
      bytes: object.bytes,
    },
  };
}

export async function deleteStoredMedia(tributePublicId: string, assetId: string): Promise<void> {
  if (mediaBackend() === 'local') {
    await deleteMediaFile(tributePublicId, assetId);
    return;
  }
  await deleteObject(tributePublicId, assetId);
}

export async function replaceStoredMedia(
  tributePublicId: string,
  assetId: string,
  bytes: Buffer,
  contentType: string,
): Promise<{ sha256: string; byteSize: number }> {
  if (mediaBackend() === 'local') {
    return replaceMediaBytes(tributePublicId, assetId, bytes, contentType);
  }
  await uploadObject(tributePublicId, assetId, bytes, contentType);
  return { sha256: createHash('sha256').update(bytes).digest('hex'), byteSize: bytes.byteLength };
}

/** Run `fn` with a real file path for tools that need one (ffprobe). Local backend reuses the stored file. */
export async function withLocalCopy<T>(
  upload: Pick<FinalizedUpload, 'tributePublicId' | 'assetId' | 'bytes'>,
  fn: (absolutePath: string) => Promise<T>,
): Promise<T> {
  if (mediaBackend() === 'local') {
    return fn(mediaFilePath(upload.tributePublicId, upload.assetId));
  }
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mv-media-'));
  try {
    const file = path.join(dir, upload.assetId);
    await writeFile(file, upload.bytes);
    return await fn(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
