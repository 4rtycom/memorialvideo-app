import { NextResponse } from 'next/server';
import { z } from 'zod';
import { revokeOwnerInvite } from '@/server/invites';
import { allowRequest } from '@/server/rate-limit';
import { loadActiveTribute } from '@/server/session';

export const runtime = 'nodejs';

const bodySchema = z.object({
  inviteId: z.string().trim().min(8).max(80),
});

export async function POST(request: Request) {
  const active = await loadActiveTribute();
  if (!active) {
    return NextResponse.json({ error: 'no_active_tribute' }, { status: 404 });
  }
  if (!allowRequest(`invite-revoke:${active.publicId}`, 12)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
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
  const result = await revokeOwnerInvite(active.publicId, parsed.data.inviteId);
  if (!result.ok) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
