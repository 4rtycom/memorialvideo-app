import { NextResponse } from 'next/server';
import { z } from 'zod';
import { memoryView } from '@/server/ingest';
import { loadActiveTribute } from '@/server/session';
import { addMemory, advanceIngestJobs, getTribute } from '@/server/store';

export const runtime = 'nodejs';

const bodySchema = z.object({
  title: z.string().trim().min(1).max(160),
  year: z.string().max(16).optional(),
  imagePath: z.string().max(240).optional(),
  filename: z.string().max(120).optional(),
});

export async function GET(request: Request) {
  const active = await loadActiveTribute();
  if (!active) {
    return NextResponse.json({ error: 'no_active_tribute' }, { status: 404 });
  }
  const url = new URL(request.url);
  const advance = url.searchParams.get('advanceJobs') === '1';
  const result = advance
    ? await advanceIngestJobs(active.publicId)
    : { tribute: await getTribute(active.publicId), advanced: 0 };
  if (!result.tribute) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({
    tribute: result.tribute,
    advanced: result.advanced,
    memories: result.tribute.memories.map((m) => ({
      ...m,
      ...memoryView({ ingestStatus: m.ingestStatus, failureCode: m.failureCode }),
    })),
  });
}

export async function POST(request: Request) {
  const active = await loadActiveTribute();
  if (!active) {
    return NextResponse.json({ error: 'no_active_tribute' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const memory = await addMemory(active.publicId, parsed.data);
  if (!memory) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const tribute = await getTribute(active.publicId);
  return NextResponse.json(
    {
      memory: {
        ...memory,
        ...memoryView({ ingestStatus: memory.ingestStatus, failureCode: memory.failureCode }),
      },
      tribute,
    },
    { status: 201 },
  );
}
