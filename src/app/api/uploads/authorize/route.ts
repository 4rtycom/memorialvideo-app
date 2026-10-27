import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { isHeicFilename } from '@/server/ingest';
import {
  createUploadSession,
  isAllowedUploadContentType,
  isAudioUpload,
  MAX_UPLOAD_BYTES,
  mediaPublicPath,
  TUS_CHUNK_HINT,
} from '@/server/media-storage';
import { allowRequest } from '@/server/rate-limit';
import { loadActiveTribute } from '@/server/session';
import { addMemory } from '@/server/store';

export const runtime = 'nodejs';

const bodySchema = z.object({
  title: z.string().trim().min(1).max(160),
  filename: z.string().trim().min(1).max(180),
  contentType: z.string().trim().min(3).max(120),
  byteSize: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  year: z.string().max(16).optional(),
  musicRightsConfirmed: z.boolean().optional(),
});

/**
 * Authorize a local TUS upload (file bytes on disk).
 * Honest blocker: Supabase Storage TUS is unavailable without Docker/hosted credentials.
 */
export async function POST(request: Request) {
  if (!allowRequest('creator-upload-auth', 40)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const active = await loadActiveTribute();
  if (!active) {
    return NextResponse.json({ error: 'no_active_tribute' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (!isAllowedUploadContentType(parsed.data.contentType, parsed.data.filename)) {
    return NextResponse.json({ error: 'unsupported_type' }, { status: 415 });
  }
  const audio = isAudioUpload(parsed.data.contentType, parsed.data.filename);
  if (audio && parsed.data.musicRightsConfirmed !== true) {
    return NextResponse.json({ error: 'rights_required' }, { status: 400 });
  }

  const assetId = `mem_${randomBytes(8).toString('hex')}`;
  const memory = await addMemory(active.publicId, {
    id: assetId,
    title: parsed.data.title,
    year: parsed.data.year,
    filename: parsed.data.filename,
    contentType: parsed.data.contentType,
    byteSize: parsed.data.byteSize,
    awaitBytes: !isHeicFilename(parsed.data.filename),
    imagePath: mediaPublicPath(active.publicId, assetId),
    rightsConfirmed: audio ? true : undefined,
  });
  if (!memory) {
    return NextResponse.json({ error: 'create_failed' }, { status: 500 });
  }

  if (memory.failureCode === 'heic') {
    return NextResponse.json(
      {
        assetId: memory.id,
        mode: 'rejected_heic',
        memory,
        note: 'This photo is HEIC. Convert it to JPG or PNG on your phone or computer, then upload again. We keep it listed so nothing is lost — we do not invent a conversion.',
      },
      { status: 201 },
    );
  }

  const session = await createUploadSession({
    tributePublicId: active.publicId,
    assetId: memory.id,
    contentType: parsed.data.contentType,
    byteSize: parsed.data.byteSize,
  });

  return NextResponse.json(
    {
      assetId: memory.id,
      mode: 'local_tus',
      uploadUrl: `/api/uploads/tus/${session.uploadId}`,
      tusResumable: '1.0.0',
      chunkHintBytes: TUS_CHUNK_HINT,
      byteSize: parsed.data.byteSize,
      memory,
    },
    { status: 201 },
  );
}
