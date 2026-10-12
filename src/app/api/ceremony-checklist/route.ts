import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadActiveTribute } from '@/server/session';
import { getTribute, updateCeremonyChecklist } from '@/server/store';

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
  return NextResponse.json({ checklist: tribute.ceremonyChecklist });
}

const bodySchema = z.object({
  downloadDevice: z.boolean().optional(),
  testVenue: z.boolean().optional(),
  soundtrackCleared: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  const active = await loadActiveTribute();
  if (!active) {
    return NextResponse.json({ error: 'no_active_tribute' }, { status: 404 });
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
  const next = await updateCeremonyChecklist(active.publicId, parsed.data);
  if (!next) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ checklist: next.ceremonyChecklist });
}
