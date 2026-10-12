import { NextResponse } from 'next/server';
import { z } from 'zod';
import { allowRequest } from '@/server/rate-limit';
import { loadActiveTribute } from '@/server/session';
import { addMember, getTribute, revokeMember } from '@/server/store';

export const runtime = 'nodejs';

export async function GET() {
  const active = await loadActiveTribute();
  if (!active) {
    return NextResponse.json({ error: 'no_active_tribute' }, { status: 404 });
  }
  const tribute = await getTribute(active.publicId);
  if (!tribute) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({
    members: tribute.members.map((m) => ({
      id: m.id,
      label: m.label,
      role: m.role,
      status: m.status,
      createdAt: m.createdAt,
    })),
    activity: tribute.activity.slice(0, 40).map((event) => ({
      id: event.id,
      code: event.code,
      correlationId: event.correlationId,
      createdAt: event.createdAt,
    })),
  });
}

const postSchema = z.object({
  label: z.string().trim().min(1).max(80),
  role: z.enum(['editor', 'viewer']).default('viewer'),
});

export async function POST(request: Request) {
  const active = await loadActiveTribute();
  if (!active) {
    return NextResponse.json({ error: 'no_active_tribute' }, { status: 404 });
  }
  if (!allowRequest(`members:${active.publicId}`, 20)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const member = await addMember(active.publicId, parsed.data);
  if (!member) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ member }, { status: 201 });
}

const patchSchema = z.object({
  memberId: z.string().min(8).max(80),
  action: z.literal('revoke'),
});

export async function PATCH(request: Request) {
  const active = await loadActiveTribute();
  if (!active) {
    return NextResponse.json({ error: 'no_active_tribute' }, { status: 404 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const member = await revokeMember(active.publicId, parsed.data.memberId);
  if (!member) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ member });
}
