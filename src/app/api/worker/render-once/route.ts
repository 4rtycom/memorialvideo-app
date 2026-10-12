import { NextResponse } from 'next/server';
import { advanceRenderOnce } from '@/server/render';
import { isLocalCreatorEnv } from '@/server/env';
import { loadActiveTribute } from '@/server/session';

export const runtime = 'nodejs';

/** Local worker tick — advances one render job; never fakes READY without QC. */
export async function POST() {
  if (!isLocalCreatorEnv()) {
    return NextResponse.json({ error: 'local_only' }, { status: 404 });
  }
  const active = await loadActiveTribute();
  if (!active) {
    return NextResponse.json({ error: 'no_active_tribute' }, { status: 404 });
  }
  const result = await advanceRenderOnce(active.publicId);
  return NextResponse.json({
    advanced: result.advanced
      ? {
          id: result.advanced.id,
          status: result.advanced.status,
          qcFailures: result.advanced.qcFailures,
          failureReason: result.advanced.failureReason,
          outputVerified: result.advanced.outputVerified,
        }
      : null,
    note: result.note,
  });
}
