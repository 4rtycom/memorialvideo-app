import { NextResponse } from 'next/server';
import { z } from 'zod';
import { allowRequest } from '@/server/rate-limit';
import { loadActiveTribute } from '@/server/session';
import {
  advanceEnhancementOnce,
  advanceEnhancementUntilSettled,
  applyEnhancementToFilm,
  getTribute,
  rejectEnhancementRequest,
  requestLocalEnhancement,
  revertEnhancementFromFilm,
  updateTribute,
} from '@/server/store';

export const runtime = 'nodejs';

const CAPABILITY = {
  generative: false,
  localPixelOps: true,
  videoPostProcessing: false,
  faceSynthesis: false,
} as const;

const CAPABILITY_NOTE =
  'Local deterministic pixel correction only. Generative restoration, face synthesis, and video post-processing are not available and not COMPLETE.';

export async function GET() {
  const active = await loadActiveTribute();
  if (!active) {
    return NextResponse.json({ error: 'no_active_tribute' }, { status: 404 });
  }
  const tribute = await getTribute(active.publicId);
  if (!tribute) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({
    consentLocal: tribute.enhancementConsentLocal,
    requests: tribute.enhancementRequests,
    ...CAPABILITY,
    note: CAPABILITY_NOTE,
  });
}

const requestIdSchema = z.string().regex(/^enh_[a-zA-Z0-9]+$/);

const postSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('consent'), granted: z.boolean() }),
  z.object({ action: z.literal('request'), memoryId: z.string().min(8).max(80) }),
  z.object({ action: z.literal('advance') }),
  z.object({
    action: z.literal('use_in_film'),
    requestId: requestIdSchema,
  }),
  z.object({
    action: z.literal('revert_film'),
    requestId: requestIdSchema,
  }),
  z.object({
    action: z.literal('reject'),
    requestId: requestIdSchema,
  }),
]);

export async function POST(request: Request) {
  const active = await loadActiveTribute();
  if (!active) {
    return NextResponse.json({ error: 'no_active_tribute' }, { status: 404 });
  }
  if (!allowRequest(`enhancement:${active.publicId}`, 30)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (parsed.data.action === 'consent') {
    const next = await updateTribute(active.publicId, {
      enhancementConsentLocal: parsed.data.granted,
    });
    return NextResponse.json({
      consentLocal: next?.enhancementConsentLocal ?? false,
      ...CAPABILITY,
      note: CAPABILITY_NOTE,
    });
  }

  if (parsed.data.action === 'request') {
    const result = await requestLocalEnhancement(active.publicId, parsed.data.memoryId);
    if (!result.ok) {
      const status = result.reason === 'no_consent' ? 403 : 404;
      return NextResponse.json(
        { error: result.reason, ...CAPABILITY, note: CAPABILITY_NOTE },
        { status },
      );
    }
    // Settle locally so families see before/after without a developer "advance job" control.
    const settled = await advanceEnhancementUntilSettled(active.publicId, result.request.id);
    return NextResponse.json(
      {
        request: settled.request ?? result.request,
        ...CAPABILITY,
        note: settled.note || CAPABILITY_NOTE,
      },
      { status: 201 },
    );
  }

  if (parsed.data.action === 'use_in_film') {
    const result = await applyEnhancementToFilm(active.publicId, parsed.data.requestId);
    if (!result.ok) {
      const status =
        result.reason === 'not_ready' || result.reason === 'asset_not_in_timeline'
          ? 409
          : result.reason === 'no_timeline'
            ? 409
            : 404;
      return NextResponse.json(
        { error: result.reason, ...CAPABILITY, note: CAPABILITY_NOTE },
        { status },
      );
    }
    return NextResponse.json({
      ok: true,
      request: result.request,
      scenesUpdated: result.scenesUpdated,
      filmSrc: result.filmSrc,
      timelineVersion: result.tribute.timelineVersion,
      ...CAPABILITY,
      note: 'Local pixel-ops variant bound into the film. Generative Finish / reconstruction is not COMPLETE.',
    });
  }

  if (parsed.data.action === 'revert_film') {
    const result = await revertEnhancementFromFilm(active.publicId, parsed.data.requestId);
    if (!result.ok) {
      const status =
        result.reason === 'not_bound' || result.reason === 'no_timeline' ? 409 : 404;
      return NextResponse.json(
        { error: result.reason, ...CAPABILITY, note: CAPABILITY_NOTE },
        { status },
      );
    }
    return NextResponse.json({
      ok: true,
      request: result.request,
      scenesUpdated: result.scenesUpdated,
      timelineVersion: result.tribute.timelineVersion,
      ...CAPABILITY,
      note: 'Original photograph restored in the film. Local improvement remains available to compare.',
    });
  }

  if (parsed.data.action === 'reject') {
    const result = await rejectEnhancementRequest(active.publicId, parsed.data.requestId);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.reason, ...CAPABILITY, note: CAPABILITY_NOTE },
        { status: 404 },
      );
    }
    return NextResponse.json({
      ok: true,
      request: result.request,
      filmReverted: result.filmReverted,
      ...CAPABILITY,
      note: 'Improvement discarded. Original kept. Generative reconstruction was not offered.',
    });
  }

  const advanced = await advanceEnhancementOnce(active.publicId);
  return NextResponse.json({
    advanced: advanced.advanced,
    ...CAPABILITY,
    note: advanced.note || CAPABILITY_NOTE,
  });
}
