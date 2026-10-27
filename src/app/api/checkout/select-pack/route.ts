import { NextResponse } from 'next/server';
import { z } from 'zod';

import { allowRequest } from '@/server/rate-limit';
import { selectConsumerPack } from '@/server/pack-duration-local';
import { loadActiveTribute } from '@/server/session';

export const runtime = 'nodejs';

const bodySchema = z.object({
  planId: z.enum(['memorial-tribute', 'life-story', 'forever-legacy']),
  projectPublicId: z
    .string()
    .regex(/^mv_[a-f0-9]{16}$/i)
    .optional(),
});

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Persist a commercial pack selection. Duration floors still apply
 * (over 8:00 / over 20:00 auto-move). Never starts a charge.
 */
export async function POST(request: Request) {
  if (!allowRequest('creator-select-pack', 20)) {
    return noStore({ error: 'rate_limited', retryable: true }, 429);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return noStore({ error: 'invalid_json' }, 400);
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return noStore({ error: 'invalid_body' }, 400);
  }

  let publicId = parsed.data.projectPublicId ?? '';
  if (!publicId) {
    const active = await loadActiveTribute();
    publicId = active?.publicId ?? '';
  }
  if (!publicId) {
    return noStore({ error: 'project_required' }, 400);
  }

  const result = await selectConsumerPack(publicId, parsed.data.planId);
  if (!result) {
    return noStore({ error: 'not_found' }, 404);
  }

  return noStore({
    selectedPlanId: result.tribute.selectedConsumerPackId,
    recommendation: result.view.recommendation,
    checkoutBlock: result.view.recommendation.checkoutBlock,
    note: 'Selection stored only — consumer pack checkout remains stripe_not_wired.',
  });
}
