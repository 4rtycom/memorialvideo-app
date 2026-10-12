import { createHash, randomUUID } from 'node:crypto';

import { buildRenderSnapshot } from '@memorialvideo/domain';

import { createWorkerSmokeTimeline } from '../src/timelines';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function rest(
  method: string,
  pathName: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  if (!supabaseUrl || !serviceKey) {
    throw new Error('no_local_queue');
  }
  const response = await fetch(`${supabaseUrl}/rest/v1${pathName}`, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, json: response.ok ? await response.json() : await response.text() };
}

async function main(): Promise<void> {
  if (!supabaseUrl || !serviceKey || process.env.APP_ENV === 'production') {
    process.stdout.write(`${JSON.stringify({ empty: true, reason: 'no_local_queue' })}\n`);
    return;
  }
  const localTag = randomUUID().slice(0, 8);
  const created = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: `local-queue-${localTag}@example.test`,
      password: randomUUID(),
      email_confirm: true,
    }),
  });
  const user = (await created.json()) as { id?: string };
  if (!user.id) {
    process.stdout.write(`${JSON.stringify({ empty: true, reason: 'user_create_failed' })}\n`);
    process.exitCode = 1;
    return;
  }
  const publicId = `mv_${createHash('sha256').update(localTag).digest('hex').slice(0, 16)}`;
  const project = await rest('POST', '/projects', {
    public_id: publicId,
    owner_user_id: user.id,
    display_name: 'Local queue walk',
    locale: 'en',
    draft_json: { displayName: 'Local queue walk', locale: 'en' },
  });
  const projectRow = Array.isArray(project.json) ? (project.json[0] as { id?: string }) : null;
  if (!projectRow?.id) {
    process.stdout.write(`${JSON.stringify({ empty: true, reason: 'project_create_failed' })}\n`);
    process.exitCode = 1;
    return;
  }
  await rest('POST', '/project_members', {
    project_id: projectRow.id,
    user_id: user.id,
    role: 'owner',
    accepted_at: new Date().toISOString(),
  });
  const timeline = await rest('POST', '/timelines', {
    project_id: projectRow.id,
    version: 1,
    status: 'published',
    story_mode: 'chronological',
    fps: 30,
    width: 1920,
    height: 1080,
    duration_frames: 90,
    theme_key: 'timeless',
    created_by: user.id,
    published_at: new Date().toISOString(),
  });
  const timelineRow = Array.isArray(timeline.json) ? (timeline.json[0] as { id?: string }) : null;
  if (!timelineRow?.id) {
    process.stdout.write(`${JSON.stringify({ empty: true, reason: 'timeline_create_failed' })}\n`);
    process.exitCode = 1;
    return;
  }
  const snapshot = buildRenderSnapshot({
    kind: 'preview',
    timeline: createWorkerSmokeTimeline(true),
    assets: [],
    projectId: projectRow.id,
    themeBuildSha: 'local-theme-v1',
  });
  if (!snapshot.ok) {
    process.stdout.write(`${JSON.stringify({ empty: true, reason: snapshot.error })}\n`);
    process.exitCode = 1;
    return;
  }
  const stored = await rest('POST', '/render_snapshots', {
    project_id: projectRow.id,
    timeline_id: timelineRow.id,
    snapshot_hash: snapshot.snapshotHash,
    render_spec: snapshot.spec,
    created_by: user.id,
  });
  const snapshotRow = Array.isArray(stored.json) ? (stored.json[0] as { id?: string }) : null;
  if (!snapshotRow?.id) {
    process.stdout.write(`${JSON.stringify({ empty: true, reason: 'snapshot_create_failed' })}\n`);
    process.exitCode = 1;
    return;
  }
  const job = await rest('POST', '/render_jobs', {
    project_id: projectRow.id,
    snapshot_id: snapshotRow.id,
    kind: 'preview',
    status: 'QUEUED',
    idempotency_key: `local-queue-${localTag}`,
  });
  const jobRow = Array.isArray(job.json) ? (job.json[0] as { id?: string }) : null;
  process.stdout.write(`${JSON.stringify({ jobId: jobRow?.id ?? null, queued: Boolean(jobRow?.id) })}\n`);
  process.exitCode = jobRow?.id ? 0 : 1;
}

await main();
