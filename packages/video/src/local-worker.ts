import { totalDurationFrames, type TimelineContract } from '@memorialvideo/contracts';
import { evaluateOutputQc, planJobCompletion, selectNextQueuedJob, type QueuedJobCandidate } from '@memorialvideo/domain';

export type WorkerProbe = {
  width?: number;
  height?: number;
  durationSeconds?: number;
  hasVideo?: boolean;
  hasAudio?: boolean;
  container?: string;
  exists: boolean;
  sizeBytes: number;
};

export type WorkerWork = {
  jobId: string;
  kind: 'preview' | 'final' | 'fallback';
  attemptCount: number;
  timeline: TimelineContract;
};

export async function runLocalQueuedJob(input: {
  jobs: readonly QueuedJobCandidate[];
  loadWork: (jobId: string) => Promise<WorkerWork | null>;
  render: (work: WorkerWork) => Promise<string>;
  probe: (file: string) => Promise<WorkerProbe>;
  persist: (work: WorkerWork, file: string, probe: WorkerProbe, qcReady: boolean) => Promise<void>;
}): Promise<{ jobId: string; status: string } | { empty: true }> {
  const jobId = selectNextQueuedJob(input.jobs);
  if (!jobId) {
    return { empty: true };
  }
  const work = await input.loadWork(jobId);
  if (!work) {
    return { empty: true };
  }
  const file = await input.render(work);
  const probe = await input.probe(file);
  const qc = evaluateOutputQc({
    expectedDurationSeconds: totalDurationFrames(work.timeline) / work.timeline.fps,
    requireAudio: true,
    expectedWidth: work.timeline.width,
    expectedHeight: work.timeline.height,
    probe,
  });
  const plan = planJobCompletion({
    kind: work.kind,
    status: 'QUEUED',
    qcReady: qc.ready,
    attemptCount: work.attemptCount,
  });
  await input.persist(work, file, probe, qc.ready);
  return { jobId: work.jobId, status: plan.jobStatus };
}
