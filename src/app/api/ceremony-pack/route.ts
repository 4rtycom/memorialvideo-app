import { NextResponse } from 'next/server';
import { allowRequest } from '@/server/rate-limit';
import { buildCeremonyPackZip, planCeremonyPackWithReadiness } from '@/server/ceremony-pack-local';
import { loadActiveTribute } from '@/server/session';
import { getTribute } from '@/server/store';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const active = await loadActiveTribute();
  if (!active) {
    return NextResponse.json({ error: 'no_active_tribute' }, { status: 404 });
  }
  if (!allowRequest(`ceremony-pack:${active.publicId}`, 10)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const tribute = await getTribute(active.publicId);
  if (!tribute) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const url = new URL(request.url);
  if (url.searchParams.get('probe') === '1') {
    return NextResponse.json(await planCeremonyPackWithReadiness(tribute));
  }

  const built = await buildCeremonyPackZip(tribute);
  if (!built.ok) {
    return NextResponse.json(
      { error: built.reason, ...(await planCeremonyPackWithReadiness(tribute)) },
      { status: 409 },
    );
  }
  const body = new Uint8Array(built.bytes);
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': String(body.byteLength),
      'Content-Disposition': `attachment; filename="${built.fileName}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
