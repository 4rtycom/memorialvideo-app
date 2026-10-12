import { NextResponse } from 'next/server';
import { loadActiveTribute } from '@/server/session';
import { advanceFirstFilm, firstFilmProgress } from '@/server/store';

export const runtime = 'nodejs';

export async function POST() {
  const active = await loadActiveTribute();
  if (!active) {
    return NextResponse.json({ error: 'no_active_tribute' }, { status: 404 });
  }
  const result = await advanceFirstFilm(active.publicId);
  if (!result.ok) {
    const status = result.reason === 'need_more_memories' ? 409 : result.reason === 'already_ready' ? 409 : 404;
    return NextResponse.json({ error: result.reason }, { status });
  }
  return NextResponse.json({
    tribute: result.tribute,
    stage: result.stage,
    progress: firstFilmProgress(result.stage),
  });
}
