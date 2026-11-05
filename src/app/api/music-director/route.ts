import { NextResponse } from 'next/server';
import {
  applyCreatorMusicDirector,
  loadCreatorMusicDirector,
  saveCreatorMusicDirector,
} from '@/server/music-director-local';
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
    const result = await loadCreatorMusicDirector(tribute);
    return noStore(result);
  } catch {
    return noStore({ error: 'music_director_failed' }, 500);
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
    if (!raw.action || raw.plan === undefined) {
      return noStore({ error: 'bad_request' }, 400);
    }

    if (raw.action === 'save') {
      const result = await saveCreatorMusicDirector(tribute.publicId, raw.plan);
      if (!result.ok) {
        return noStore({ error: result.error }, result.status);
      }
      return noStore(result);
    }

    if (raw.action === 'apply') {
      const result = await applyCreatorMusicDirector(tribute.publicId, raw.plan);
      if (!result.ok) {
        return noStore(
          {
            error: result.error,
            message:
              result.error === 'needs_timeline'
                ? 'Create your first film before adding music to it.'
                : result.error === 'music_rights'
                  ? 'Confirm these songs are cleared for a private ceremony screening.'
                  : 'Could not update music for your film.',
          },
          result.status,
        );
      }
      return noStore(result);
    }

    return noStore({ error: 'bad_request' }, 400);
  } catch {
    return noStore({ error: 'music_director_failed' }, 500);
  }
}
