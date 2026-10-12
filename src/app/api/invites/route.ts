import { NextResponse } from 'next/server';
import { allowRequest } from '@/server/rate-limit';
import { createOwnerInvite, listOwnerInvites } from '@/server/invites';
import { loadActiveTribute } from '@/server/session';

export const runtime = 'nodejs';

export async function GET() {
  const active = await loadActiveTribute();
  if (!active) {
    return NextResponse.json({ error: 'no_active_tribute' }, { status: 404 });
  }
  if (!allowRequest(`invite-list:${active.publicId}`, 30)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const listed = await listOwnerInvites(active.publicId);
  if (!listed) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json(listed);
}

export async function POST() {
  const active = await loadActiveTribute();
  if (!active) {
    return NextResponse.json({ error: 'no_active_tribute' }, { status: 404 });
  }
  if (!allowRequest(`invite-create:${active.publicId}`, 8)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const result = await createOwnerInvite(active.publicId);
  if (!result.ok) {
    const status = result.reason === 'pepper_unavailable' ? 503 : 404;
    return NextResponse.json({ error: result.reason }, { status });
  }
  return NextResponse.json(
    {
      inviteId: result.issued.inviteId,
      token: result.issued.token,
      expiresAt: result.issued.expiresAt,
      actionUrl: result.issued.actionUrl,
      summary: result.issued.summary,
      note: 'Token shown once — only the hash is stored.',
    },
    { status: 201 },
  );
}
