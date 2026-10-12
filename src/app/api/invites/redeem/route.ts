import { NextResponse } from 'next/server';
import { z } from 'zod';
import { redeemInviteToken } from '@/server/invites';
import { allowRequest } from '@/server/rate-limit';
import { guestSessionCookieName } from '@/server/store';

export const runtime = 'nodejs';

const bodySchema = z.object({
  token: z.string().trim().min(16).max(200),
});

export async function POST(request: Request) {
  if (!allowRequest('invite-redeem', 20)) {
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
  const result = await redeemInviteToken(parsed.data.token);
  if (!result.ok) {
    const status =
      result.reason === 'not_found'
        ? 404
        : result.reason === 'unavailable'
          ? 503
          : 409;
    return NextResponse.json({ error: result.reason }, { status });
  }

  const response = NextResponse.json({
    displayName: result.guest.displayName,
    years: result.guest.years,
    expiresAt: result.guest.expiresAt,
    scope: result.guest.scope,
  });
  response.cookies.set(guestSessionCookieName(), result.guest.sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  });
  return response;
}
