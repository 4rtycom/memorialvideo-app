import { NextResponse } from 'next/server';
import { buildOwnerCeremonyChecklist } from '@/server/ceremony-pack-local';
import { allowRequest } from '@/server/rate-limit';
import { loadActiveTribute } from '@/server/session';
import { getTribute } from '@/server/store';

export const runtime = 'nodejs';

/**
 * Owner-only playback checklist (.txt) — no Memorial Pack or READY final required.
 * Distinct from Ceremony Pack ZIP which stays entitlement + QC + readiness gated.
 */
export async function GET() {
  const active = await loadActiveTribute();
  if (!active) {
    return NextResponse.json({ error: 'no_active_tribute' }, { status: 404 });
  }
  if (!allowRequest(`ceremony-checklist-dl:${active.publicId}`, 20)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const tribute = await getTribute(active.publicId);
  const checklist = buildOwnerCeremonyChecklist(tribute);
  if (!checklist.ok) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return new NextResponse(checklist.text, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${checklist.fileName}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
