import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  PersistenceUnavailableError,
  persistenceErrorResponse,
} from '@/server/persistence';
import { allowRequest } from '@/server/rate-limit';
import { clearActiveTributeId, readActiveTributeId, setActiveTributeId } from '@/server/session';
import { createTribute, deleteTribute, listTributeSummaries } from '@/server/store';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const tributes = await listTributeSummaries();
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
    throw error;
  }
}

const createBodySchema = z.object({
  displayName: z.string().trim().min(1).max(160),
  bornLabel: z.string().max(80).optional(),
  rememberedLabel: z.string().max(80).optional(),
  about: z.string().max(500).optional(),
  ownerInitial: z.string().max(2).optional(),
});

export async function POST(request: Request) {
  if (!allowRequest('tributes-create', 20)) {
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
    const tribute = await createTribute(parsed.data);
    await setActiveTributeId(tribute.publicId);
    return NextResponse.json({ tribute }, { status: 201 });
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) {
      const mapped = persistenceErrorResponse(error);
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    throw error;
  }
}

const deleteSchema = z.object({
  publicId: z.string().regex(/^mv_[a-f0-9]{16}$/i),
});

export async function DELETE(request: Request) {
  if (!allowRequest('tributes-delete', 20)) {
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
    const removed = await deleteTribute(parsed.data.publicId);
    if (!removed) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (activeId === parsed.data.publicId) {
      await clearActiveTributeId();
    }
    return NextResponse.json({
      deleted: true,
      note: 'Local tribute removed from the durable JSON store. Opaque media files may remain until local cleanup.',
    });
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) {
      const mapped = persistenceErrorResponse(error);
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    throw error;
  }
}
