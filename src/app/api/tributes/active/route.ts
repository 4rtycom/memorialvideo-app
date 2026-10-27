import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthRequiredError, withRequestOwner } from '@/server/account-session';
import { loadActiveTribute, setActiveTributeId } from '@/server/session';
import { entitlementView, getTribute, updateTribute } from '@/server/store';

export const runtime = 'nodejs';

const patchSchema = z.object({
  publicId: z
    .string()
    .regex(/^mv_[a-f0-9]{16}$/i)
    .optional(),
  displayName: z.string().trim().min(1).max(160).optional(),
  bornLabel: z.string().max(80).optional(),
  rememberedLabel: z.string().max(80).optional(),
  about: z.string().max(500).optional(),
  themeKey: z.enum(['timeless', 'joyful', 'peaceful']).optional(),
  locale: z.enum(['en', 'nl', 'de', 'fr', 'es', 'pt', 'it', 'pl']).optional(),
  firstFilmStage: z
    .enum([
      'idle',
      'preparing_memories',
      'building_story',
      'arranging_film',
      'finishing',
      'ready_to_review',
      'blocked',
    ])
    .optional(),
  soundtrackTrackId: z.string().max(80).nullable().optional(),
  musicRightsConfirmed: z.boolean().optional(),
  openingTitle: z.string().max(180).optional(),
  enhancementConsentLocal: z.boolean().optional(),
  storyChapters: z
    .array(
      z.object({
        id: z.string().min(2).max(40),
        title: z.string().trim().min(1).max(120),
        yearHint: z.string().max(16).default(''),
        memoryIds: z.array(z.string()).max(80).default([]),
      }),
    )
    .max(40)
    .optional(),
});

export async function GET() {
  const tribute = await loadActiveTribute();
  if (!tribute) {
    return NextResponse.json({ tribute: null, entitlement: entitlementView(null) });
  }
  return NextResponse.json({ tribute, entitlement: entitlementView(tribute) });
}

export async function PATCH(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  try {
    if (parsed.data.publicId) {
      const existing = await withRequestOwner(() => getTribute(parsed.data.publicId!));
      if (!existing) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
      }
      await setActiveTributeId(parsed.data.publicId);
      return NextResponse.json({ tribute: existing, entitlement: entitlementView(existing) });
    }

    const active = await loadActiveTribute();
    if (!active) {
      return NextResponse.json({ error: 'no_active_tribute' }, { status: 404 });
    }
    const { publicId: _ignore, ...patch } = parsed.data;
    const updated = await withRequestOwner(() => updateTribute(active.publicId, patch));
    if (!updated) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ tribute: updated, entitlement: entitlementView(updated) });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: 'auth_required' }, { status: 401 });
    }
    throw error;
  }
}
