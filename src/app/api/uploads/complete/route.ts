import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveGuestContext } from '@/server/invites';
import { probeWithFfprobe } from '@/server/local-encode';
import { finalizeUploadToMedia, mediaFilePath } from '@/server/media-storage';
import { loadActiveTribute } from '@/server/session';
import { attachMemoryBytes, getTribute, guestSessionCookieName } from '@/server/store';

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

  let durationMs: number | undefined;
  if (finalized.contentType.toLowerCase().startsWith('video/')) {
    const absolute = mediaFilePath(finalized.session.tributePublicId, finalized.session.assetId);
    const probe = await probeWithFfprobe(absolute);
    if (probe.durationSeconds && Number.isFinite(probe.durationSeconds) && probe.durationSeconds > 0) {
      durationMs = Math.round(probe.durationSeconds * 1000);
    }
  }

  const memory = await attachMemoryBytes(tributePublicId, parsed.data.assetId, {
    imagePath: finalized.mediaPath,
    contentType: finalized.contentType,
    durationMs,
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
