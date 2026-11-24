import { NextResponse } from 'next/server';
import { allowRequest } from '@/server/rate-limit';
import { buildCeremonyPackZip, planCeremonyPackWithReadiness } from '@/server/ceremony-pack-local';
import { createRenderReadUrl, mediaBackend, renderObjectExists } from '@/server/object-storage';
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

  if (mediaBackend() === 'supabase') {
    const plan = await planCeremonyPackWithReadiness(tribute);
    const job = tribute.renderJobs.find((j) => j.kind === 'final' && j.status === 'READY' && j.outputVerified);
    if (!plan.canBuild || !job) {
      return NextResponse.json({ error: plan.reason, ...plan }, { status: 409 });
    }
    if (!(await renderObjectExists(tribute.publicId, job.id, 'pack'))) {
      return NextResponse.json({ error: 'pack_unavailable_hosted', ...plan, canBuild: false, reason: 'pack_unavailable_hosted' }, { status: 409 });
    }
    const signed = await createRenderReadUrl(tribute.publicId, job.id, 'pack', {
      seconds: 300,
      downloadName: 'memorial-ceremony-pack.zip',
    });
    return signed
      ? NextResponse.redirect(signed, 307)
      : NextResponse.json({ error: 'pack_unavailable_hosted' }, { status: 409 });
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
