import { NextResponse } from 'next/server';
import { z } from 'zod';
import { allowRequest } from '@/server/rate-limit';
import { enqueueRenderJob, summarizeRenderJobs } from '@/server/render';
import { loadActiveTribute } from '@/server/session';
import { getTribute } from '@/server/store';

export const runtime = 'nodejs';

const bodySchema = z.object({
  kind: z.enum(['preview', 'final']).default('preview'),
});

export async function GET() {
  const active = await loadActiveTribute();
  if (!active) {
    return NextResponse.json({ error: 'no_active_tribute' }, { status: 404 });
  }
  const tribute = await getTribute(active.publicId);
  if (!tribute) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ jobs: summarizeRenderJobs(tribute) });
}

export async function POST(request: Request) {
  const active = await loadActiveTribute();
  if (!active) {
    return NextResponse.json({ error: 'no_active_tribute' }, { status: 404 });
  }
  if (!allowRequest(`render-enqueue:${active.publicId}`, 10)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const result = await enqueueRenderJob(active.publicId, parsed.data.kind);
  if (!result.ok) {
    const status =
      result.reason === 'not_found'
        ? 404
        : result.reason === 'no_timeline'
          ? 409
          : 403;
    return NextResponse.json({ error: result.reason }, { status });
  }
  return NextResponse.json(
    {
      job: {
        id: result.job.id,
        kind: result.job.kind,
        status: result.job.status,
        snapshotHash: result.job.snapshotHash.slice(0, 12),
        timelineVersion: result.job.timelineVersion,
      },
      reused: result.reused,
      note: 'READY only after Output QC on a real 1080p H.264/AAC file. Advance the local worker to encode (ffmpeg; optional CREATOR_USE_REMOTION=1).',
    },
    { status: result.reused ? 200 : 201 },
  );
}
