import { NextResponse } from 'next/server';
import { isProjectPublicId } from '@memorialvideo/domain';
import { loadActiveTribute } from '@/server/session';
import { entitlementView, getTribute } from '@/server/store';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectPublicId = url.searchParams.get('projectPublicId');
  if (projectPublicId) {
    if (!isProjectPublicId(projectPublicId)) {
      return NextResponse.json({ error: 'invalid_project' }, { status: 400 });
    }
    const tribute = await getTribute(projectPublicId);
    return NextResponse.json({
      projectPublicId,
      entitlement: entitlementView(tribute),
    });
  }
  const active = await loadActiveTribute();
  return NextResponse.json({
    projectPublicId: active?.publicId ?? null,
    entitlement: entitlementView(active),
  });
}
