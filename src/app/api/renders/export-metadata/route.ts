import { NextResponse } from 'next/server';
import { exportOwnerTributeMetadata } from '@/server/export-local';
import { allowRequest } from '@/server/rate-limit';
import { loadActiveTribute } from '@/server/session';
import { getTribute } from '@/server/store';

export const runtime = 'nodejs';

/**
 * Metadata-only ZIP export (Prompt 18 / GDPR project export).
 * Uses domain `buildProjectExportManifest` + store zip — no media bytes, filenames, or tokens.
 */
export async function GET() {
  const active = await loadActiveTribute();
  if (!active) {
    return NextResponse.json({ error: 'no_active_tribute' }, { status: 404 });
  }
  if (!allowRequest(`render-export-meta:${active.publicId}`, 20)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const tribute = await getTribute(active.publicId);
  const result = exportOwnerTributeMetadata(tribute);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return new NextResponse(Buffer.from(result.bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': String(result.bytes.byteLength),
      'Content-Disposition': `attachment; filename="${result.fileName}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
