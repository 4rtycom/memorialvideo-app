import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;
export const TUS_CHUNK_HINT = 6 * 1024 * 1024;

const sessionSchema = z.object({
  uploadId: z.string().min(8).max(80),
  tributePublicId: z.string(),
  assetId: z.string(),
  contentType: z.string().max(120),
  byteSize: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  offset: z.number().int().nonnegative(),
  createdAt: z.string(),
  completed: z.boolean(),
});

export type UploadSession = z.infer<typeof sessionSchema>;

function dataRoot(): string {
  return path.join(process.cwd(), '.data');
}

function tusDir(): string {
  return path.join(dataRoot(), 'tus');
}

function mediaDir(tributePublicId: string): string {
  return path.join(dataRoot(), 'media', tributePublicId);
}

function sessionPath(uploadId: string): string {
  return path.join(tusDir(), `${uploadId}.json`);
}

function sessionBinPath(uploadId: string): string {
  return path.join(tusDir(), `${uploadId}.bin`);
}

export function mediaFilePath(tributePublicId: string, assetId: string): string {
  return path.join(mediaDir(tributePublicId), assetId);
}

export function mediaPublicPath(tributePublicId: string, assetId: string): string {
  return `/api/media/${tributePublicId}/${assetId}`;
}

async function writeSession(session: UploadSession): Promise<void> {
  const target = sessionPath(session.uploadId);
  const tmp = `${target}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(sessionSchema.parse(session), null, 2)}\n`, 'utf8');
  await rename(tmp, target);
}

export async function createUploadSession(input: {
  tributePublicId: string;
  assetId: string;
  contentType: string;
  byteSize: number;
}): Promise<UploadSession> {
  if (input.byteSize <= 0 || input.byteSize > MAX_UPLOAD_BYTES) {
    throw new Error('invalid_size');
  }
  await mkdir(tusDir(), { recursive: true });
  const uploadId = `up_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const session = sessionSchema.parse({
    uploadId,
    tributePublicId: input.tributePublicId,
    assetId: input.assetId,
    contentType: input.contentType.slice(0, 120),
    byteSize: input.byteSize,
    offset: 0,
    createdAt: new Date().toISOString(),
    completed: false,
  });
  await writeSession(session);
  await writeFile(sessionBinPath(uploadId), Buffer.alloc(0));
  return session;
}

export async function readUploadSession(uploadId: string): Promise<UploadSession | null> {
  try {
    const raw = JSON.parse(await readFile(sessionPath(uploadId), 'utf8')) as unknown;
    return sessionSchema.parse(raw);
  } catch {
    return null;
  }
}

export async function appendUploadChunk(
  uploadId: string,
  expectedOffset: number,
  chunk: Buffer,
): Promise<{ ok: true; session: UploadSession } | { ok: false; reason: string; status: number }> {
  const session = await readUploadSession(uploadId);
  if (!session || session.completed) {
    return { ok: false, reason: 'not_found', status: 404 };
  }
  if (expectedOffset !== session.offset) {
    return { ok: false, reason: 'offset_mismatch', status: 409 };
  }
  if (chunk.byteLength === 0) {
    return { ok: false, reason: 'empty_body', status: 400 };
  }
  if (session.offset + chunk.byteLength > session.byteSize) {
    return { ok: false, reason: 'too_large', status: 413 };
  }
  const existing = await readFile(sessionBinPath(uploadId));
  const nextBytes = Buffer.concat([existing, chunk]);
  await writeFile(sessionBinPath(uploadId), nextBytes);
  const next = sessionSchema.parse({
    ...session,
    offset: nextBytes.byteLength,
  });
  await writeSession(next);
  return { ok: true, session: next };
}

export async function finalizeUploadToMedia(uploadId: string): Promise<
  | {
      ok: true;
      mediaPath: string;
      contentType: string;
      byteSize: number;
      sha256: string;
      session: UploadSession;
    }
  | { ok: false; reason: string }
> {
  const session = await readUploadSession(uploadId);
  if (!session) {
    return { ok: false, reason: 'not_found' };
  }
  if (session.offset !== session.byteSize) {
    return { ok: false, reason: 'incomplete' };
  }
  const binStat = await stat(sessionBinPath(uploadId));
  if (binStat.size !== session.byteSize) {
    return { ok: false, reason: 'size_mismatch' };
  }
  await mkdir(mediaDir(session.tributePublicId), { recursive: true });
  const dest = mediaFilePath(session.tributePublicId, session.assetId);
  const bytes = await readFile(sessionBinPath(uploadId));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  await writeFile(dest, bytes);
  const next = sessionSchema.parse({ ...session, completed: true });
  await writeSession(next);
  return {
    ok: true,
    mediaPath: mediaPublicPath(session.tributePublicId, session.assetId),
    contentType: session.contentType,
    byteSize: session.byteSize,
    sha256,
    session: next,
  };
}

export async function readMediaFile(
  tributePublicId: string,
  assetId: string,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const file = mediaFilePath(tributePublicId, assetId);
  if (!existsSync(file)) {
    return null;
  }
  const bytes = await readFile(file);
  let contentType = 'application/octet-stream';
  try {
    const names = await readdir(tusDir());
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const session = await readUploadSession(name.replace(/\.json$/, ''));
      if (session?.tributePublicId === tributePublicId && session.assetId === assetId) {
        contentType = session.contentType || contentType;
        break;
      }
    }
  } catch {
    // ignore
  }
  return { bytes, contentType };
}

export function isAllowedUploadContentType(contentType: string, filename: string): boolean {
  const type = contentType.toLowerCase();
  const name = filename.toLowerCase();
  if (type.startsWith('image/jpeg') || type.startsWith('image/png') || type === 'image/jpg') {
    return true;
  }
  if (type === 'image/heic' || type === 'image/heif' || name.endsWith('.heic') || name.endsWith('.heif')) {
    return true;
  }
  if (type === 'video/mp4' || name.endsWith('.mp4')) {
    return true;
  }
  return false;
}

export { MAX_UPLOAD_BYTES };
