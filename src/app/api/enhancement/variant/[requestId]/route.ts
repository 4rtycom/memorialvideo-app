import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { loadActiveTribute } from '@/server/session';
import { getTribute } from '@/server/store';

export const runtime = 'nodejs';

type Params = { params: Promise<{ requestId: string }> };

/** Serves a local pixel-ops variant only — never generative reconstruction. */
export async function GET(_request: Request, { params }: Params) {
  const { requestId } = await params;
  if (!requestId.startsWith('enh_')) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const active = await loadActiveTribute();
  if (!active) {
    return NextResponse.json({ error: 'no_active_tribute' }, { status: 404 });
  }
  const tribute = await getTribute(active.publicId);
  const row = tribute?.enhancementRequests.find((r) => r.id === requestId);
  if (!row || row.status !== 'ready_local' || !row.variantPath) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const absolute = path.isAbsolute(row.variantPath)
    ? row.variantPath
    : path.join(/* turbopackIgnore: true */ process.cwd(), row.variantPath);
  try {
    const bytes = await readFile(absolute);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        'X-Enhancement-Kind': 'local_pixel_ops',
      },
    });
  } catch {
    return NextResponse.json({ error: 'missing_bytes' }, { status: 404 });
  }
}
