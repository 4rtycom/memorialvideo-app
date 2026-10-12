import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { allowRequest } from '@/server/rate-limit';
import { resolveOwnerPosterAbsolutePath } from '@/server/render';

export const runtime = 'nodejs';

/**
 * Owner-only READY JPEG still. Local creator store is single-tenant owner;
 * jobId must belong to a stored tribute with a verified poster beside the MP4.
 * Never serves marker files or unverified outputs. No Remotion/Chrome.
 */
export async function GET(request: Request) {
  const jobId = new URL(request.url).searchParams.get('jobId');
  if (!jobId) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  if (!allowRequest(`render-poster:${jobId}`, 40)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const resolved = await resolveOwnerPosterAbsolutePath(jobId);
  if (!resolved) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const bytes = await readFile(resolved.absolute);
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
