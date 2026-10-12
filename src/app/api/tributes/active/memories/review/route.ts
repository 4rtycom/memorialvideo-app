import { NextResponse } from 'next/server';
import { z } from 'zod';
import { allowRequest } from '@/server/rate-limit';
import { loadActiveTribute } from '@/server/session';
import { setMemoryReviewState } from '@/server/store';

export const runtime = 'nodejs';

const bodySchema = z.object({
  memoryId: z.string().trim().min(8).max(80),
  reviewState: z.enum(['accepted', 'declined']),
});

export async function POST(request: Request) {
  const active = await loadActiveTribute();
  if (!active) {
    return NextResponse.json({ error: 'no_active_tribute' }, { status: 404 });
  }
  if (!allowRequest(`memory-review:${active.publicId}`, 40)) {
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
  const memory = await setMemoryReviewState(
    active.publicId,
    parsed.data.memoryId,
    parsed.data.reviewState,
  );
  if (!memory) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ memory });
}
