import { NextResponse } from 'next/server';
import { z } from 'zod';
import { allowRequest } from '@/server/rate-limit';
import { loadActiveTribute } from '@/server/session';
import { createPrivateViewShare, planCreatorDownload, revokeOwnerShare } from '@/server/shares-local';
import { getTribute, summarizeShareList } from '@/server/share-list';

export const runtime = 'nodejs';

export async function GET() {
  const active = await loadActiveTribute();
  if (!active) {
    return NextResponse.json({ error: 'no_active_tribute' }, { status: 404 });
  }
  const tribute = await getTribute(active.publicId);
  if (!tribute) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({
    shares: summarizeShareList(tribute),
    download: planCreatorDownload(tribute),
  });
}

export async function POST() {
  const active = await loadActiveTribute();
  if (!active) {
    return NextResponse.json({ error: 'no_active_tribute' }, { status: 404 });
  }
  if (!allowRequest(`share-create:${active.publicId}`, 8)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const result = await createPrivateViewShare(active.publicId);
  if (!result.ok) {
    const status =
      result.reason === 'pepper_unavailable'
        ? 503
        : result.reason === 'not_found'
          ? 404
          : 409;
    return NextResponse.json({ error: result.reason }, { status });
  }
  return NextResponse.json(
    {
      shareId: result.issued.shareId,
      token: result.issued.token,
      expiresAt: result.issued.expiresAt,
      actionUrl: result.issued.actionUrl,
      scope: result.issued.scope,
      note: result.note,
    },
    { status: 201 },
  );
}

const revokeSchema = z.object({
  shareId: z.string().trim().min(8).max(80),
  action: z.literal('revoke'),
});

export async function PATCH(request: Request) {
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
  const parsed = revokeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const result = await revokeOwnerShare(active.publicId, parsed.data.shareId);
  if (!result.ok) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
