import { NextResponse } from 'next/server';
import {
  applyGuidedAudio,
  loadGuidedAudioOverview,
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
