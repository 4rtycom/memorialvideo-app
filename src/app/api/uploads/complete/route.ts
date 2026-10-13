import { cookies } from 'next/headers';
import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveGuestContext } from '@/server/invites';
import { probeWithFfprobe } from '@/server/local-encode';
import {
  deleteMediaFile,
  finalizeUploadToMedia,
  mediaFilePath,
  sniffedMatchesDeclared,
  sniffMediaBytes,
} from '@/server/media-storage';
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

  const finalized = await finalizeUploadToMedia(parsed.data.uploadId);
  if (!finalized.ok) {
    return NextResponse.json({ error: finalized.reason }, { status: 409 });
  }
  if (
    finalized.session.tributePublicId !== tributePublicId ||
    finalized.session.assetId !== parsed.data.assetId
  ) {
    return NextResponse.json({ error: 'mismatch' }, { status: 403 });
  }

  const absolute = mediaFilePath(finalized.session.tributePublicId, finalized.session.assetId);
  const storedBytes = await readFile(absolute);
  const sniffed = sniffMediaBytes(storedBytes);
  if (!sniffed || !sniffedMatchesDeclared(finalized.contentType, sniffed)) {
    await deleteMediaFile(finalized.session.tributePublicId, finalized.session.assetId);
    await markMemoryRejected(tributePublicId, parsed.data.assetId);
    return NextResponse.json({ error: 'content_mismatch' }, { status: 415 });
  }
  if (sniffed.startsWith('audio/')) {
    const current = await getTribute(tributePublicId);
    const memory = current?.memories.find((item) => item.id === parsed.data.assetId);
    if (memory?.rightsConfirmed !== true) {
      await deleteMediaFile(finalized.session.tributePublicId, finalized.session.assetId);
      await markMemoryRejected(tributePublicId, parsed.data.assetId);
      return NextResponse.json({ error: 'rights_required' }, { status: 400 });
    }
  }

  let durationMs: number | undefined;
  if (sniffed === 'video/mp4') {
    const probe = await probeWithFfprobe(absolute);
    if (probe.durationSeconds && Number.isFinite(probe.durationSeconds) && probe.durationSeconds > 0) {
      durationMs = Math.round(probe.durationSeconds * 1000);
    }
  }

  const memory = await attachMemoryBytes(tributePublicId, parsed.data.assetId, {
    imagePath: finalized.mediaPath,
    contentType: sniffed,
    durationMs,
    checksumSha256: finalized.sha256,
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
    sha256: finalized.sha256,
    byteSize: finalized.byteSize,
  });
}
