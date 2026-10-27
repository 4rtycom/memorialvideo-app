import { NextResponse } from 'next/server';
import { isProjectPublicId } from '@memorialvideo/domain';
import { readAccountSession, withRequestOwner } from '@/server/account-session';
import { creatorEnv } from '@/server/env';
import { readMediaFile } from '@/server/media-storage';
import { readActiveTributeId } from '@/server/session';
import { getTribute } from '@/server/store';

export const runtime = 'nodejs';

type Params = { params: Promise<{ tributeId: string; assetId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { tributeId, assetId } = await params;
  if (!isProjectPublicId(tributeId) || !assetId.startsWith('mem_')) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const accountId = await readAccountSession();
  if (!accountId && creatorEnv().APP_ENV !== 'local') {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  }
  if (accountId) {
    const owned = await withRequestOwner(() => getTribute(tributeId));
    if (!owned) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
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
