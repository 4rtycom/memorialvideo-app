import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { convertHeicBufferToJpeg } from '@/server/heic-convert';
import { resolveGuestContext } from '@/server/invites';
import { probeWithFfprobe } from '@/server/local-encode';
import { deleteStoredMedia, finalizeStoredUpload, replaceStoredMedia, withLocalCopy } from '@/server/media-backend';
import { sniffedMatchesDeclared, sniffMediaBytes } from '@/server/media-storage';
import { loadActiveTribute } from '@/server/session';
import { attachMemoryBytes, getTribute, guestSessionCookieName, markMemoryRejected } from '@/server/store';

export const runtime = 'nodejs';

const bodySchema = z.object({
  uploadId: z.string().min(8).max(80),
  assetId: z.string().min(8).max(80),
});

export async function POST(request: Request) {
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

  const active = await loadActiveTribute();
  const jar = await cookies();
  const guestSessionId = jar.get(guestSessionCookieName())?.value;
  const guest = guestSessionId ? await resolveGuestContext(guestSessionId) : null;

  let tributePublicId: string | null = active?.publicId ?? null;
  if (!tributePublicId && guest?.ok) {
    tributePublicId = guest.tribute.publicId;
  }
  if (!tributePublicId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const current = await getTribute(tributePublicId);
  const declaredMemory = current?.memories.find((item) => item.id === parsed.data.assetId);
  if (!declaredMemory) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const result = await finalizeStoredUpload({
    uploadId: parsed.data.uploadId,
    tributePublicId,
    assetId: parsed.data.assetId,
    declared:
      declaredMemory.contentType && declaredMemory.declaredByteSize
        ? { contentType: declaredMemory.contentType, byteSize: declaredMemory.declaredByteSize }
        : null,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.reason === 'mismatch' ? 403 : 409 });
  }
  const finalized = {
    ...result.upload,
    session: { tributePublicId: result.upload.tributePublicId, assetId: result.upload.assetId },
  };

  let storedBytes = finalized.bytes;
  let sniffed = sniffMediaBytes(storedBytes);
  let convertedFromHeic = false;
  let sha256 = finalized.sha256;
  let byteSize = finalized.byteSize;

  if (sniffed === 'image/heic') {
    if (!sniffedMatchesDeclared(finalized.contentType, sniffed)) {
      await deleteStoredMedia(finalized.session.tributePublicId, finalized.session.assetId);
      await markMemoryRejected(tributePublicId, parsed.data.assetId, 'heic');
      return NextResponse.json({ error: 'content_mismatch' }, { status: 415 });
    }
    const converted = await convertHeicBufferToJpeg(storedBytes);
    if (!converted.ok) {
      await deleteStoredMedia(finalized.session.tributePublicId, finalized.session.assetId);
      await markMemoryRejected(tributePublicId, parsed.data.assetId, 'heic');
      return NextResponse.json(
        {
          error: 'heic_convert_failed',
          note: 'We could not prepare this iPhone photo automatically. Please try again.',
        },
        { status: 422 },
      );
    }
    const replaced = await replaceStoredMedia(
      finalized.session.tributePublicId,
      finalized.session.assetId,
      converted.jpeg,
      'image/jpeg',
    );
    storedBytes = converted.jpeg;
    sniffed = 'image/jpeg';
    convertedFromHeic = true;
    sha256 = replaced.sha256;
    byteSize = replaced.byteSize;
  } else if (!sniffed || !sniffedMatchesDeclared(finalized.contentType, sniffed)) {
    await deleteStoredMedia(finalized.session.tributePublicId, finalized.session.assetId);
    await markMemoryRejected(tributePublicId, parsed.data.assetId);
    return NextResponse.json({ error: 'content_mismatch' }, { status: 415 });
  }

  if (sniffed.startsWith('audio/')) {
    if (declaredMemory.rightsConfirmed !== true) {
      await deleteStoredMedia(finalized.session.tributePublicId, finalized.session.assetId);
      await markMemoryRejected(tributePublicId, parsed.data.assetId);
      return NextResponse.json({ error: 'rights_required' }, { status: 400 });
    }
  }

  let durationMs: number | undefined;
  if (sniffed === 'video/mp4') {
    const probe = await withLocalCopy(
      { tributePublicId, assetId: parsed.data.assetId, bytes: storedBytes },
      (absolute) => probeWithFfprobe(absolute),
    );
    if (probe.durationSeconds && Number.isFinite(probe.durationSeconds) && probe.durationSeconds > 0) {
      durationMs = Math.round(probe.durationSeconds * 1000);
    }
  }

  const memory = await attachMemoryBytes(tributePublicId, parsed.data.assetId, {
    imagePath: finalized.mediaPath,
    contentType: sniffed,
    durationMs,
    checksumSha256: sha256,
  });
  if (!memory) {
    return NextResponse.json({ error: 'attach_failed' }, { status: 404 });
  }
  const tribute = await getTribute(tributePublicId);
  return NextResponse.json({
    ok: true,
    memory,
    tribute,
    mediaPath: finalized.mediaPath,
    sha256,
    byteSize,
    convertedFromHeic,
  });
}
