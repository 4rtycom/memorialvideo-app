import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthRequiredError, withRequestOwner } from '@/server/account-session';
import {
  PersistenceUnavailableError,
  persistenceErrorResponse,
} from '@/server/persistence';
import { allowRequest, clientKey } from '@/server/rate-limit';
import { clearActiveTributeId, readActiveTributeId, setActiveTributeId } from '@/server/session';
import { createTribute, deleteTribute, getTribute, listTributeSummaries } from '@/server/store';
import { mediaBackend, removeTributeObjects } from '@/server/object-storage';
import { purgeTributeFiles } from '@/server/tribute-files';

export const runtime = 'nodejs';

function authRequiredResponse() {
  return NextResponse.json({ error: 'auth_required' }, { status: 401 });
}

export async function GET() {
  try {
    const tributes = await withRequestOwner(() => listTributeSummaries());
    const activeId = await readActiveTributeId();
    return NextResponse.json({
      activePublicId: activeId,
      tributes: tributes.map((t) => ({
        ...t,
        isActive: t.publicId === activeId,
      })),
    });
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) {
      const mapped = persistenceErrorResponse(error);
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    if (error instanceof AuthRequiredError) {
      return authRequiredResponse();
    }
    throw error;
  }
}

const createBodySchema = z.object({
  displayName: z.string().trim().min(1).max(160),
  bornLabel: z.string().max(80).optional(),
  rememberedLabel: z.string().max(80).optional(),
  about: z.string().max(500).optional(),
  ownerInitial: z.string().max(2).optional(),
  locale: z.enum(['en', 'nl', 'de', 'fr', 'es', 'pt', 'it', 'pl']).optional(),
});

export async function POST(request: Request) {
  if (!allowRequest(`tributes-create:${clientKey(request)}`, 20)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = createBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const tribute = await withRequestOwner(() => createTribute(parsed.data));
    await setActiveTributeId(tribute.publicId);
    return NextResponse.json({ tribute }, { status: 201 });
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) {
      const mapped = persistenceErrorResponse(error);
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    if (error instanceof AuthRequiredError) {
      return authRequiredResponse();
    }
    throw error;
  }
}

const deleteSchema = z.object({
  publicId: z.string().regex(/^mv_[a-f0-9]{16}$/i),
});

export async function DELETE(request: Request) {
  if (!allowRequest(`tributes-delete:${clientKey(request)}`, 20)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  try {
    const activeId = await readActiveTributeId();
    const renderJobIds = await withRequestOwner(async () => {
      const existing = await getTribute(parsed.data.publicId);
      return existing ? existing.renderJobs.map((job) => job.id) : [];
    });
    const removed = await withRequestOwner(() => deleteTribute(parsed.data.publicId));
    if (!removed) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    await purgeTributeFiles({ publicId: parsed.data.publicId, renderJobIds });
    if (mediaBackend() === 'supabase') {
      try {
        await removeTributeObjects(parsed.data.publicId);
      } catch {
        // The record is gone; the daily /api/cron/sweep-uploads job removes leftover storage folders of deleted tributes.
      }
    }
    if (activeId === parsed.data.publicId) {
      await clearActiveTributeId();
    }
    return NextResponse.json({
      deleted: true,
      note: 'Tribute and its uploaded media, enhancements and renders were removed.',
    });
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) {
      const mapped = persistenceErrorResponse(error);
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    if (error instanceof AuthRequiredError) {
      return authRequiredResponse();
    }
    throw error;
  }
}
