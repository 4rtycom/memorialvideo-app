import { NextResponse } from 'next/server';
import { z } from 'zod';
import { allowRequest } from '@/server/rate-limit';
import { loadActiveTribute } from '@/server/session';
import {
  advanceEnhancementOnce,
  applyEnhancementToFilm,
  getTribute,
  requestLocalEnhancement,
  updateTribute,
} from '@/server/store';

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
  return NextResponse.json({
    consentLocal: tribute.enhancementConsentLocal,
    requests: tribute.enhancementRequests,
    generative: false,
    note: 'Local consent only. Generative reconstruction / face synthesis is not available and not COMPLETE.',
  });
}

const postSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('consent'), granted: z.boolean() }),
  z.object({ action: z.literal('request'), memoryId: z.string().min(8).max(80) }),
  z.object({ action: z.literal('advance') }),
  z.object({
    action: z.literal('use_in_film'),
    requestId: z.string().regex(/^enh_[a-zA-Z0-9]+$/),
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
      generative: false,
    });
  }

  if (parsed.data.action === 'request') {
    const result = await requestLocalEnhancement(active.publicId, parsed.data.memoryId);
    if (!result.ok) {
      const status = result.reason === 'no_consent' ? 403 : 404;
      return NextResponse.json({ error: result.reason }, { status });
    }
    return NextResponse.json({ request: result.request, generative: false }, { status: 201 });
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
      return NextResponse.json({ error: result.reason, generative: false }, { status });
    }
    return NextResponse.json({
      ok: true,
      request: result.request,
      scenesUpdated: result.scenesUpdated,
      filmSrc: result.filmSrc,
      timelineVersion: result.tribute.timelineVersion,
      generative: false,
      note: 'Local pixel-ops variant bound into the film. Generative Finish / reconstruction is not COMPLETE.',
    });
  }

  const advanced = await advanceEnhancementOnce(active.publicId);
  return NextResponse.json({
    advanced: advanced.advanced,
    note: advanced.note,
    generative: false,
  });
}
