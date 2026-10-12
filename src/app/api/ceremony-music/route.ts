import { NextResponse } from 'next/server';
import { ceremonyMusicPlanSchema } from '@memorialvideo/contracts';
import {
  applyCreatorCeremonyMusic,
  loadCreatorCeremonyMusic,
  previewCreatorCeremonyMusic,
} from '@/server/ceremony-music-local';
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
    const result = await loadCreatorCeremonyMusic(tribute);
    return noStore(result);
  } catch {
    return noStore({ error: 'ceremony_music_failed' }, 500);
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
    const raw = body as { action?: string; plan?: unknown };
    if (!raw.action) {
      return noStore({ error: 'bad_request' }, 400);
    }
    const planParsed = ceremonyMusicPlanSchema.safeParse(raw.plan);
    if (!planParsed.success) {
      return noStore({ error: 'bad_request' }, 400);
    }

    if (raw.action === 'preview') {
      const result = await previewCreatorCeremonyMusic(tribute.publicId, planParsed.data);
      if (!result.ok) {
        return noStore({ error: result.error }, result.status);
      }
      return noStore(result);
    }

    if (raw.action === 'apply') {
      const result = await applyCreatorCeremonyMusic(tribute.publicId, planParsed.data);
      if (!result.ok) {
        return noStore({ error: result.error }, result.status);
      }
      return noStore(result);
    }

    return noStore({ error: 'bad_request' }, 400);
  } catch {
    return noStore({ error: 'ceremony_music_failed' }, 500);
  }
}
