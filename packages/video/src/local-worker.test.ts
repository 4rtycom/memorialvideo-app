import { describe, expect, it } from 'vitest';

import { createGoldenTimeline } from './timelines';
import { runLocalQueuedJob } from './local-worker';

describe('local queued worker', () => {
  it('picks the oldest queued job, QCs, and persists only when asked', async () => {
    const timeline = createGoldenTimeline(true);
    let persisted = '';
    const result = await runLocalQueuedJob({
      jobs: [
        { id: 'job-b', status: 'QUEUED', queuedAt: '2026-02-01T00:00:00.000Z' },
        { id: 'job-a', status: 'QUEUED', queuedAt: '2026-01-01T00:00:00.000Z' },
      ],
      loadWork: async (jobId) => ({
        jobId,
        kind: 'preview',
        attemptCount: 0,
        timeline,
      }),
      render: async () => '/tmp/out.mp4',
      probe: async () => ({
        exists: true,
        sizeBytes: 2_000_000,
        width: 1920,
        height: 1080,
        durationSeconds: totalSeconds(timeline),
        hasVideo: true,
        hasAudio: true,
        container: 'mp4',
      }),
      persist: async (work) => {
        persisted = work.jobId;
      },
    });
    expect(result).toEqual({ jobId: 'job-a', status: 'READY' });
    expect(persisted).toBe('job-a');
  });

  it('returns empty when nothing is queued', async () => {
    const result = await runLocalQueuedJob({
      jobs: [{ id: 'busy', status: 'RENDERING', queuedAt: '2026-01-01T00:00:00.000Z' }],
      loadWork: async () => null,
      render: async () => '',
      probe: async () => ({ exists: false, sizeBytes: 0 }),
      persist: async () => undefined,
    });
    expect(result).toEqual({ empty: true });
  });
});

function totalSeconds(timeline: { scenes: Array<{ durationFrames: number }>; fps: number }): number {
  return timeline.scenes.reduce((sum, scene) => sum + scene.durationFrames, 0) / timeline.fps;
}
