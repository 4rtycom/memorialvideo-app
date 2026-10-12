import { NextResponse } from 'next/server';
import type { CollaborationDecisionOutcome, CollaborationSubjectType } from '@memorialvideo/contracts';
import { recordOwnerCollaborationDecision } from '@/server/collaboration-local';
import { loadActiveTribute } from '@/server/session';

export const runtime = 'nodejs';

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

const KINDS = new Set(['fact', 'placement', 'approval', 'exclusion', 'comment']);
const OUTCOMES = new Set([
  'approve',
  'request_changes',
  'defer',
  'confirm',
  'dismiss',
  'keep_both',
  'leave_unresolved',
]);
const SUBJECTS = new Set([
  'review_comment',
  'story_conflict',
  'duplicate_pair',
  'placement_suggestion',
  'final_film',
  'review_task',
]);

export async function POST(request: Request) {
  try {
    const tribute = await loadActiveTribute();
    if (!tribute) {
      return noStore({ error: 'no_active_tribute' }, 404);
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return noStore({ error: 'invalid_json' }, 400);
    }
    const parsed = body as {
      kind?: string;
      outcome?: string;
      subjectType?: string;
      subjectId?: string;
      summary?: string;
      summaryKey?: string;
      relatedCommentId?: string;
      relatedConflictId?: string;
      relatedTaskId?: string;
    };
    if (
      !parsed.kind ||
      !parsed.outcome ||
      !parsed.subjectType ||
      !parsed.subjectId ||
      !KINDS.has(parsed.kind) ||
      !OUTCOMES.has(parsed.outcome) ||
      !SUBJECTS.has(parsed.subjectType)
    ) {
      return noStore({ error: 'invalid' }, 400);
    }
    const result = await recordOwnerCollaborationDecision({
      publicId: tribute.publicId,
      kind: parsed.kind as 'fact' | 'placement' | 'approval' | 'exclusion' | 'comment',
      outcome: parsed.outcome as CollaborationDecisionOutcome,
      subjectType: parsed.subjectType as CollaborationSubjectType,
      subjectId: parsed.subjectId,
      summary: parsed.summary,
      summaryKey: parsed.summaryKey,
      relatedCommentId: parsed.relatedCommentId,
      relatedConflictId: parsed.relatedConflictId,
      relatedTaskId: parsed.relatedTaskId,
    });
    if ('error' in result) {
      return noStore({ error: result.error }, result.status);
    }
    return noStore(result);
  } catch {
    return noStore({ error: 'decision_failed' }, 500);
  }
}
