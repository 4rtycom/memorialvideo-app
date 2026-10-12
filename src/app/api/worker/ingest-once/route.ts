import { NextResponse } from 'next/server';
import { canFulfillLocalFakeCheckout } from '@memorialvideo/domain';
import { creatorEnv } from '@/server/env';
import { loadActiveTribute } from '@/server/session';
import { advanceIngestJobs } from '@/server/store';

export const runtime = 'nodejs';

/** Local worker:once for ingest — advances durable jobs one step. */
export async function POST() {
  const env = creatorEnv();
  if (!canFulfillLocalFakeCheckout(env.APP_ENV)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const active = await loadActiveTribute();
  if (!active) {
    return NextResponse.json({ error: 'no_active_tribute' }, { status: 404 });
  }
  const result = await advanceIngestJobs(active.publicId);
  return NextResponse.json({
    advanced: result.advanced,
    tributePublicId: result.tribute?.publicId ?? null,
  });
}
