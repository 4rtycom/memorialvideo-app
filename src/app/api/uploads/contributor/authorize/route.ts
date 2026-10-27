import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { proposePlacementForContributorAsset } from '@/server/collaboration-local';
import { isHeicFilename } from '@/server/ingest';
import { resolveGuestContext, recordGuestUploadUse } from '@/server/invites';
import {
  createUploadSession,
  isAllowedUploadContentType,
  MAX_UPLOAD_BYTES,
  TUS_CHUNK_HINT,
} from '@/server/media-storage';
import { allowRequest } from '@/server/rate-limit';
import { addMemory, guestSessionCookieName } from '@/server/store';

export const runtime = 'nodejs';

const bodySchema = z.object({
  title: z.string().trim().min(1).max(160),
  filename: z.string().trim().min(1).max(180),
  contentType: z.string().trim().min(3).max(120),
  byteSize: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  year: z.string().max(16).optional(),
  contributorName: z.string().trim().max(40).optional(),
  contributorNote: z.string().trim().max(280).optional(),
});

/** Guest authorize — requires redeemed invite session cookie (no account). */
export async function POST(request: Request) {
  if (!allowRequest('creator-contributor-auth', 40)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const jar = await cookies();
  const sessionId = jar.get(guestSessionCookieName())?.value;
  if (!sessionId) {
    return NextResponse.json({ error: 'guest_session_required' }, { status: 401 });
  }
  const guest = await resolveGuestContext(sessionId);
  if (!guest.ok) {
    return NextResponse.json({ error: guest.reason }, { status: guest.reason === 'not_found' ? 401 : 409 });
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

  const memory = await addMemory(guest.tribute.publicId, {
    title: parsed.data.title,
    year: parsed.data.year,
    filename: parsed.data.filename,
    contentType: parsed.data.contentType,
    byteSize: parsed.data.byteSize,
    awaitBytes: !isHeicFilename(parsed.data.filename),
    imagePath: '/fixtures/memory-a.png',
    source: 'contributor',
    contributorName: parsed.data.contributorName,
    contributorNote: parsed.data.contributorNote,
    inviteId: guest.invite.id,
    reviewState: 'pending',
  });
  if (!memory) {
    return NextResponse.json({ error: 'create_failed' }, { status: 500 });
  }

  await recordGuestUploadUse(guest.tribute.publicId, guest.invite.id);

  // Propose-only placement — never mutates TimelineContract (MV-119).
  await proposePlacementForContributorAsset({
    publicId: guest.tribute.publicId,
    assetId: memory.id,
  });

  if (memory.failureCode === 'heic') {
    return NextResponse.json(
      {
        assetId: memory.id,
        mode: 'rejected_heic',
        note: 'This photo is HEIC. Convert it to JPG or PNG on your phone or computer, then upload again. We keep it listed so nothing is lost — we do not invent a conversion.',
      },
      { status: 201 },
    );
  }

  const session = await createUploadSession({
    tributePublicId: guest.tribute.publicId,
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
      supabaseTus: false,
      blocker:
        'Supabase Storage resumable TUS requires Docker/local Supabase or hosted credentials (not configured here).',
    },
    { status: 201 },
  );
}
