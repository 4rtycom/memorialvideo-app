import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  applyGuidedAudio,
  loadGuidedAudioOverview,
  placePersonalSongs,
  previewGuidedAudio,
  proposeGuidedAudio,
  revertGuidedAudio,
} from '@/server/guided-audio-local';
import { loadActiveTribute } from '@/server/session';

export const runtime = 'nodejs';

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET() {
  try {
    const tribute = await loadActiveTribute();
    if (!tribute) {
      return noStore({ error: 'no_active_tribute' }, 404);
    }
    return noStore(loadGuidedAudioOverview(tribute));
  } catch {
    return noStore({ error: 'audio_failed' }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const tribute = await loadActiveTribute();
    if (!tribute) {
      return noStore({ error: 'no_active_tribute' }, 404);
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return noStore({ error: 'invalid_json' }, 400);
    }
    const action = (body as { action?: string }).action;
    if (!action) {
      return noStore({ error: 'bad_request' }, 400);
    }

    if (action === 'place_personal') {
      const parsed = z
        .object({
          songs: z
            .array(
              z.object({
                memoryId: z.string().min(8).max(80),
                startFrame: z.number().int().nonnegative(),
                durationFrames: z.number().int().positive(),
                fadeInFrames: z.number().int().nonnegative(),
                fadeOutFrames: z.number().int().nonnegative(),
                gainDb: z.number(),
              }),
            )
            .length(2),
        })
        .safeParse(body);
      if (!parsed.success) {
        return noStore({ error: 'invalid_body' }, 400);
      }
      const placed = await placePersonalSongs(tribute.publicId, parsed.data.songs);
      if (!placed.ok) {
        return noStore({ error: placed.error }, placed.status);
      }
      return noStore(placed);
    }

    const run =
      action === 'propose'
        ? proposeGuidedAudio
        : action === 'preview' || action === 'preview_patch'
          ? previewGuidedAudio
          : action === 'apply'
            ? applyGuidedAudio
            : action === 'revert'
              ? revertGuidedAudio
              : null;
    if (!run) {
      return noStore({ error: 'bad_request' }, 400);
    }
    const result = await run(tribute.publicId);
    if (!result.ok) {
      return noStore({ error: result.error }, result.status);
    }
    return noStore(result);
  } catch {
    return noStore({ error: 'audio_failed' }, 500);
  }
}
