import { NextResponse } from 'next/server';
import { parseTimelineContract } from '@memorialvideo/contracts';
import { z } from 'zod';
import { loadActiveTribute } from '@/server/session';
import { saveTimeline, undoTimeline } from '@/server/store';
import { applyTimelineOp, type TimelineEditOp } from '@/server/timeline-ops';
import { chapterLabels, timelineClock } from '@/server/timeline';

export const runtime = 'nodejs';

const editSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('set_caption'),
    sceneId: z.string().min(1),
    caption: z.string().max(180),
    expectedVersion: z.number().int().nonnegative(),
    clientUpdatedAt: z.string().min(10).max(40).optional(),
  }),
  z.object({
    op: z.literal('set_duration'),
    sceneId: z.string().min(1),
    durationFrames: z.number().int().positive().max(1800),
    expectedVersion: z.number().int().nonnegative(),
    clientUpdatedAt: z.string().min(10).max(40).optional(),
  }),
  z.object({
    op: z.literal('set_transition'),
    sceneId: z.string().min(1),
    transitionIn: z.enum(['none', 'fade', 'dissolve']),
    expectedVersion: z.number().int().nonnegative(),
    clientUpdatedAt: z.string().min(10).max(40).optional(),
  }),
  z.object({
    op: z.literal('move_scene'),
    sceneId: z.string().min(1),
    toIndex: z.number().int().nonnegative().max(240),
    expectedVersion: z.number().int().nonnegative(),
    clientUpdatedAt: z.string().min(10).max(40).optional(),
  }),
  z.object({
    op: z.literal('set_aspect'),
    aspect: z.enum(['16:9', '9:16', '1:1']),
    expectedVersion: z.number().int().nonnegative(),
    clientUpdatedAt: z.string().min(10).max(40).optional(),
  }),
  z.object({
    op: z.literal('replace_image'),
    sceneId: z.string().min(1),
    assetId: z.string().min(1),
    src: z.string().min(1).max(400),
    expectedVersion: z.number().int().nonnegative(),
    clientUpdatedAt: z.string().min(10).max(40).optional(),
  }),
  z.object({
    op: z.literal('undo'),
    expectedVersion: z.number().int().nonnegative(),
  }),
]);

export async function GET() {
  const tribute = await loadActiveTribute();
  if (!tribute) {
    return NextResponse.json({ error: 'no_active_tribute' }, { status: 404 });
  }
  if (!tribute.timeline) {
    return NextResponse.json({
      timeline: null,
      timelineVersion: tribute.timelineVersion,
      updatedAt: tribute.updatedAt,
      stage: tribute.firstFilmStage,
      reason: tribute.firstFilmStage === 'ready_to_review' ? 'missing_timeline' : 'not_ready',
    });
  }
  const timeline = parseTimelineContract(tribute.timeline);
  const clock = timelineClock(timeline);
  return NextResponse.json({
    timeline,
    timelineVersion: tribute.timelineVersion,
    updatedAt: tribute.updatedAt,
    canUndo: Boolean(tribute.timelinePrevious),
    stage: tribute.firstFilmStage,
    chapters: chapterLabels(timeline),
    totalLabel: clock.totalLabel,
    totalFrames: clock.totalFrames,
    displayName: tribute.displayName,
  });
}

export async function PATCH(request: Request) {
  const tribute = await loadActiveTribute();
  if (!tribute) {
    return NextResponse.json({ error: 'no_active_tribute' }, { status: 404 });
  }
  if (!tribute.timeline) {
    return NextResponse.json({ error: 'no_timeline' }, { status: 409 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = editSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (parsed.data.op === 'undo') {
    const undone = await undoTimeline(tribute.publicId, parsed.data.expectedVersion);
    if (!undone.ok) {
      const status = undone.reason === 'missing_revision' ? 400 : 409;
      return NextResponse.json(
        {
          error: undone.reason,
          timelineVersion: undone.timelineVersion,
          updatedAt: undone.updatedAt,
        },
        { status },
      );
    }
    return NextResponse.json({
      timeline: undone.tribute.timeline ? parseTimelineContract(undone.tribute.timeline) : null,
      timelineVersion: undone.tribute.timelineVersion,
      updatedAt: undone.tribute.updatedAt,
      stage: undone.tribute.firstFilmStage,
      canUndo: Boolean(undone.tribute.timelinePrevious),
    });
  }

  const current = parseTimelineContract(tribute.timeline);
  const { expectedVersion, clientUpdatedAt, ...edit } = parsed.data;
  const next = applyTimelineOp(current, edit as TimelineEditOp);
  const saved = await saveTimeline(tribute.publicId, next, {
    expectedVersion,
    clientUpdatedAt,
  });
  if (!saved.ok) {
    const status = saved.reason === 'missing_revision' ? 400 : saved.reason === 'not_found' ? 404 : 409;
    return NextResponse.json(
      {
        error: saved.reason,
        timelineVersion: saved.timelineVersion,
        updatedAt: saved.updatedAt,
      },
      { status },
    );
  }
  return NextResponse.json({
    timeline: parseTimelineContract(saved.tribute.timeline!),
    timelineVersion: saved.tribute.timelineVersion,
    updatedAt: saved.tribute.updatedAt,
    stage: saved.tribute.firstFilmStage,
    canUndo: Boolean(saved.tribute.timelinePrevious),
  });
}
