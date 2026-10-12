import { NextResponse } from 'next/server';
import { evaluateCreatorReadiness, summarizeReadiness } from '@/server/readiness-local';
import { loadActiveTribute } from '@/server/session';
import { getTribute } from '@/server/store';

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
  const evaluated = await evaluateCreatorReadiness(tribute);
  return NextResponse.json({
    ...summarizeReadiness(evaluated.report),
    packAllowed: evaluated.packAllowed,
    packReason: evaluated.packReason,
    note: 'Deterministic Ceremony Readiness — composes Output QC; does not invent moderation or faces.',
  });
}
