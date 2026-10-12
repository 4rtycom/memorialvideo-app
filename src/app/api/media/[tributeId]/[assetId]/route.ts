import { NextResponse } from 'next/server';
import { isProjectPublicId } from '@memorialvideo/domain';
import { readMediaFile } from '@/server/media-storage';
import { readActiveTributeId } from '@/server/session';

export const runtime = 'nodejs';

type Params = { params: Promise<{ tributeId: string; assetId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { tributeId, assetId } = await params;
  if (!isProjectPublicId(tributeId) || !assetId.startsWith('mem_')) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const active = await readActiveTributeId();
  if (active !== tributeId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const media = await readMediaFile(tributeId, assetId);
  if (!media) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(media.bytes), {
    status: 200,
    headers: {
      'Content-Type': media.contentType,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
