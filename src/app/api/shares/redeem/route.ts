import { NextResponse } from 'next/server';
import { z } from 'zod';
import { allowRequest } from '@/server/rate-limit';
import { redeemShareToken } from '@/server/shares-local';

export const runtime = 'nodejs';

const bodySchema = z.object({
  token: z.string().trim().min(16).max(200),
});

export async function POST(request: Request) {
  if (!allowRequest('share-redeem', 30)) {
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
  const result = await redeemShareToken(parsed.data.token);
  if (!result.ok) {
    const status =
      result.reason === 'not_found'
        ? 404
        : result.reason === 'unavailable'
          ? 503
          : 409;
    return NextResponse.json({ error: result.reason }, { status });
  }
  return NextResponse.json({
    displayName: result.tribute.displayName,
    tributePublicId: result.tribute.publicId,
    scope: result.share.scope,
    expiresAt: result.share.expiresAt,
    hasTimeline: Boolean(result.tribute.timeline),
    timeline: result.tribute.timeline,
  });
}
