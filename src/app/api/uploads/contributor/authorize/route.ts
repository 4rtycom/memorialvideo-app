import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { proposePlacementForContributorAsset } from '@/server/collaboration-local';
import { isHeicFilename } from '@/server/ingest';
import { resolveGuestContext, recordGuestUploadUse } from '@/server/invites';
import {
  createUploadSession,
  isAllowedUploadContentType,
  isAudioUpload,
  MAX_UPLOAD_BYTES,
  mediaPublicPath,
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
  musicRightsConfirmed: z.boolean().optional(),
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
  const audio = isAudioUpload(parsed.data.contentType, parsed.data.filename);
  if (audio && parsed.data.musicRightsConfirmed !== true) {
    return NextResponse.json({ error: 'rights_required' }, { status: 400 });
  }

  const assetId = `mem_${randomBytes(8).toString('hex')}`;
  const memory = await addMemory(guest.tribute.publicId, {
    id: assetId,
    title: parsed.data.title,
    year: parsed.data.year,
    filename: parsed.data.filename,
    contentType: parsed.data.contentType,
    byteSize: parsed.data.byteSize,
    awaitBytes: !isHeicFilename(parsed.data.filename),
    imagePath: mediaPublicPath(guest.tribute.publicId, assetId),
    rightsConfirmed: audio ? true : undefined,
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
        note: 'HEIC is not auto-converted; convert on device and re-upload JPG/PNG.',
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
    },
    { status: 201 },
  );
}
