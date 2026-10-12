import { NextResponse } from 'next/server';
import {
  applyGuidedVariant,
  loadGuidedVariantsOverview,
  previewGuidedVariant,
  proposeGuidedVariant,
  revertGuidedVariant,
} from '@/server/guided-variants-local';
import {
  PersistenceUnavailableError,
  persistenceErrorResponse,
} from '@/server/persistence';
import { loadActiveTribute } from '@/server/session';

export const runtime = 'nodejs';

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function mapActionFailure(result: {
  ok: false;
  error: string;
  status: number;
  persistenceError?: PersistenceUnavailableError;
}) {
  if (result.error === 'persistence_unavailable' && result.persistenceError) {
    const mapped = persistenceErrorResponse(result.persistenceError);
    return noStore(mapped.body, mapped.status);
  }
  return noStore({ error: result.error }, result.status);
}

export async function GET() {
  try {
    const tribute = await loadActiveTribute();
    if (!tribute) {
      return noStore({ error: 'no_active_tribute' }, 404);
    }
    return noStore(await loadGuidedVariantsOverview(tribute));
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) {
      const mapped = persistenceErrorResponse(error);
      return noStore(mapped.body, mapped.status);
    }
    return noStore({ error: 'variants_failed' }, 500);
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

    if (action === 'propose') {
      const result = await proposeGuidedVariant(tribute.publicId, {
        kind: (body as { kind?: unknown }).kind,
        aspect: (body as { aspect?: unknown }).aspect,
      });
      if (!result.ok) {
        return mapActionFailure(result);
      }
      return noStore(result);
    }

    const run =
      action === 'preview' || action === 'preview_patch'
        ? previewGuidedVariant
        : action === 'apply'
          ? applyGuidedVariant
          : action === 'revert'
            ? revertGuidedVariant
            : null;
    if (!run) {
      return noStore({ error: 'bad_request' }, 400);
    }
    const result = await run(tribute.publicId);
    if (!result.ok) {
      return mapActionFailure(result);
    }
    return noStore(result);
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) {
      const mapped = persistenceErrorResponse(error);
      return noStore(mapped.body, mapped.status);
    }
    return noStore({ error: 'variants_failed' }, 500);
  }
}
