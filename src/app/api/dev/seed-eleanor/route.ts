import { NextResponse } from 'next/server';
import { canFulfillLocalFakeCheckout } from '@memorialvideo/domain';
import { creatorEnv } from '@/server/env';
import { setActiveTributeId } from '@/server/session';
import { seedEleanorFixture } from '@/server/store';

export const runtime = 'nodejs';

/** Local-only Eleanor fixture seed. Production must not expose this path. */
export async function POST() {
  const env = creatorEnv();
  if (!canFulfillLocalFakeCheckout(env.APP_ENV)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const result = await seedEleanorFixture();
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 404 });
  }
  await setActiveTributeId(result.tribute.publicId);
  return NextResponse.json({ ok: true, tribute: result.tribute }, { status: 201 });
}
