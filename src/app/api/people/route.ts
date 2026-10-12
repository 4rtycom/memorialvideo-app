import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadActiveTribute } from '@/server/session';
import {
  peopleIntelOverview,
  updatePeopleConsent,
  upsertPeopleProfile,
} from '@/server/store';

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
    return noStore(peopleIntelOverview(tribute));
  } catch {
    return noStore({ error: 'people_failed' }, 500);
  }
}

const postSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('grant_local'),
    expectedVersion: z.number().int().nonnegative().optional(),
  }),
  z.object({
    action: z.literal('revoke'),
    expectedVersion: z.number().int().nonnegative().optional(),
  }),
  z.object({
    action: z.literal('delete_derived'),
    expectedVersion: z.number().int().nonnegative().optional(),
  }),
  z.object({
    action: z.literal('add_label'),
    displayLabel: z.string().trim().min(1).max(80),
    approvedForStory: z.boolean().optional(),
    approvedForFilm: z.boolean().optional(),
  }),
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
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return noStore({ error: 'bad_request' }, 400);
    }

    if (parsed.data.action === 'add_label') {
      const result = await upsertPeopleProfile(tribute.publicId, {
        displayLabel: parsed.data.displayLabel,
        approvedForStory: parsed.data.approvedForStory,
        approvedForFilm: parsed.data.approvedForFilm,
      });
      if (!result.ok) {
        const status =
          result.reason === 'consent_required' ? 403 : result.reason === 'invalid_label' ? 400 : 404;
        return noStore({ error: result.reason }, status);
      }
      return noStore(result.overview);
    }

    const result = await updatePeopleConsent(
      tribute.publicId,
      parsed.data.action,
      parsed.data.expectedVersion,
    );
    if (!result.ok) {
      return noStore({ error: result.reason }, result.reason === 'conflict' ? 409 : 404);
    }
    return noStore(result.overview);
  } catch {
    return noStore({ error: 'people_failed' }, 500);
  }
}
