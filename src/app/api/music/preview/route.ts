import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NextResponse } from 'next/server';
import { catalogTrackById } from '@memorialvideo/domain';
import { isMusicCatalogEnabled } from '@memorialvideo/config/env';
import { creatorEnv } from '@/server/env';

export const runtime = 'nodejs';

const VIDEO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../../video');

/**
 * Serves the synthetic development preview WAV for catalog tracks.
 * Never invents commercial masters; XB-002 remains open for licensed files.
 */
export async function GET(request: Request) {
  const env = creatorEnv();
  if (!isMusicCatalogEnabled(env)) {
    return NextResponse.json({ error: 'catalog_disabled' }, { status: 404 });
  }
  const trackId = new URL(request.url).searchParams.get('trackId') ?? '';
  const track = catalogTrackById(trackId);
  if (!track || track.licenseStatus === 'retired') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (!track.licensedForPreview) {
    return NextResponse.json({ error: 'preview_not_licensed' }, { status: 403 });
  }
  const absolute = path.join(VIDEO_ROOT, 'public', track.previewSrc);
  try {
    await access(absolute);
  } catch {
    return NextResponse.json(
      {
        error: 'preview_bytes_missing',
        note: 'Development catalog entry exists; preview fixture file is not on disk in this environment.',
        licenseStatus: track.licenseStatus,
      },
      { status: 404 },
    );
  }
  const bytes = await readFile(absolute);
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'audio/wav',
      'Cache-Control': 'private, max-age=300',
      'X-Music-License-Status': track.licenseStatus,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
