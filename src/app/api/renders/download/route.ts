import { readFile, stat } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { planServedByteRange, sliceBytes } from '@/server/byte-range';
import { allowRequest } from '@/server/rate-limit';
import { planDownloadFromJobs, resolveReadyFinalAbsolutePath } from '@/server/render';
import { loadActiveTribute } from '@/server/session';
import { getTribute } from '@/server/store';

export const runtime = 'nodejs';

/**
 * Owner download of a QC-verified READY final MP4 only.
 * Supports HTTP Range (206 / 416) via domain `planByteRange` — never serves marker files.
 */
export async function GET(request: Request) {
  const active = await loadActiveTribute();
  if (!active) {
    return NextResponse.json({ error: 'no_active_tribute' }, { status: 404 });
  }
  if (!allowRequest(`render-download:${active.publicId}`, 20)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const tribute = await getTribute(active.publicId);
  if (!tribute) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const plan = planDownloadFromJobs(tribute);
  if (!plan.canDownloadMp4 || !plan.readyJobId) {
    return NextResponse.json(
      { error: 'not_ready', reason: plan.reason },
      { status: 409 },
    );
  }
  const absolute = await resolveReadyFinalAbsolutePath(tribute);
  if (!absolute || !absolute.endsWith('.mp4')) {
    return NextResponse.json({ error: 'output_missing' }, { status: 404 });
  }

  const fileStat = await stat(absolute);
  const sizeBytes = fileStat.size;
  const rangePlan = planServedByteRange({
    sizeBytes,
    rangeHeader: request.headers.get('range'),
  });

  if (rangePlan.action === 'unsatisfiable') {
    return new NextResponse(null, {
      status: 416,
      headers: {
        'Content-Range': `bytes */${sizeBytes}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  const bytes = await readFile(absolute);
  const body =
    rangePlan.action === 'partial'
      ? sliceBytes(new Uint8Array(bytes), rangePlan.start, rangePlan.end)
      : new Uint8Array(bytes);

  const headers: Record<string, string> = {
    'Content-Type': 'video/mp4',
    'Content-Length': String(body.byteLength),
    'Accept-Ranges': 'bytes',
    'Content-Disposition': 'attachment; filename="memorial-ceremony.mp4"',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (rangePlan.action === 'partial') {
    headers['Content-Range'] = `bytes ${rangePlan.start}-${rangePlan.end}/${sizeBytes}`;
  }

  return new NextResponse(Buffer.from(body), {
    status: rangePlan.action === 'partial' ? 206 : 200,
    headers,
  });
}
