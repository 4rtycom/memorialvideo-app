import { NextResponse } from 'next/server';
import {
  applyOwnerPlacementPatch,
  previewOwnerPlacementPatch,
  revertOwnerPlacementPatch,
} from '@/server/collaboration-local';
import { loadActiveTribute } from '@/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
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
    const parsed = body as { suggestionId?: string; action?: string };
    if (!parsed.suggestionId || !parsed.action) {
      return noStore({ error: 'invalid' }, 400);
    }
    if (parsed.action === 'preview') {
      const result = await previewOwnerPlacementPatch(tribute.publicId, {
        suggestionId: parsed.suggestionId,
      });
      if ('error' in result) {
        return noStore({ error: result.error }, result.status);
      }
      return noStore(result);
    }
    if (parsed.action === 'apply') {
      const result = await applyOwnerPlacementPatch(tribute.publicId, {
        suggestionId: parsed.suggestionId,
      });
      if ('error' in result) {
        return noStore({ error: result.error }, result.status);
      }
      return noStore(result);
    }
    if (parsed.action === 'revert') {
      const result = await revertOwnerPlacementPatch(tribute.publicId, {
        suggestionId: parsed.suggestionId,
      });
      if ('error' in result) {
        return noStore({ error: result.error }, result.status);
      }
      return noStore(result);
    }
    return noStore({ error: 'invalid' }, 400);
  } catch {
    return noStore({ error: 'placement_failed' }, 500);
  }
}
