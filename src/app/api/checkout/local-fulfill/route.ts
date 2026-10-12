import { NextResponse } from 'next/server';
import { canFulfillLocalFakeCheckout } from '@memorialvideo/domain';
import { z } from 'zod';
import { creatorEnv } from '@/server/env';
import { loadActiveTribute, setActiveTributeId } from '@/server/session';
import { entitlementView, fulfillLocalMemorialPack } from '@/server/store';

export const runtime = 'nodejs';

const bodySchema = z.object({
  projectPublicId: z.string().regex(/^mv_[a-f0-9]{16}$/i).optional(),
});

/**
 * Local-only Memorial Pack fulfillment. Never available outside APP_ENV=local.
 * Stripe remains the only production path (XB-005).
 */
export async function POST(request: Request) {
  const env = creatorEnv();
  if (!canFulfillLocalFakeCheckout(env.APP_ENV)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  let publicId = parsed.data.projectPublicId;
  if (!publicId) {
    const active = await loadActiveTribute();
    publicId = active?.publicId;
  }
  if (!publicId) {
    return NextResponse.json({ error: 'no_active_tribute' }, { status: 404 });
  }

  const result = await fulfillLocalMemorialPack(publicId);
  if (!result.ok) {
    const status = result.reason === 'not_found' ? 404 : result.reason === 'already_active' ? 409 : 404;
    return NextResponse.json({ error: result.reason }, { status });
  }
  await setActiveTributeId(result.tribute.publicId);
  return NextResponse.json({
    ok: true,
    tribute: result.tribute,
    entitlement: entitlementView(result.tribute),
  });
}
