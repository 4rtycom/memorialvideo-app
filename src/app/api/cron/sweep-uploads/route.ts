import { NextResponse } from 'next/server';
import { creatorEnv } from '@/server/env';
import { mediaBackend, sweepDeletedTributeFolders, sweepOrphanUploads } from '@/server/object-storage';
import { listTributeAssetIndex } from '@/server/store';

export const runtime = 'nodejs';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Daily cleanup of uploads that were started but never completed. Protected by CRON_SECRET. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (mediaBackend(creatorEnv()) !== 'supabase') {
    return NextResponse.json({ ok: true, removed: 0, skipped: 'local_media' });
  }
  let removed = 0;
  const index = await listTributeAssetIndex();
  for (const tribute of index) {
    removed += await sweepOrphanUploads(tribute.publicId, tribute.assetIds, ONE_DAY_MS);
  }
  removed += await sweepDeletedTributeFolders(new Set(index.map((t) => t.publicId)), 7 * ONE_DAY_MS);
  return NextResponse.json({ ok: true, removed }, { headers: { 'Cache-Control': 'no-store' } });
}
