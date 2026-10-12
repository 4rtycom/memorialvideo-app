import { NextResponse } from 'next/server';
import { loadOwnerCollaboration } from '@/server/collaboration-local';
import { loadActiveTribute } from '@/server/session';

export const runtime = 'nodejs';

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET() {
  try {
    const tribute = await loadActiveTribute();
    if (!tribute) {
      return noStore({ error: 'no_active_tribute' }, 404);
    }
    const result = await loadOwnerCollaboration(tribute.publicId);
    if ('error' in result) {
      return noStore({ error: result.error }, result.status);
    }
    return noStore(result);
  } catch {
    return noStore({ error: 'inbox_failed' }, 500);
  }
}
