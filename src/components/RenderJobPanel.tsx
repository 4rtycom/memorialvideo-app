'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button, Card } from '@/components/ui';

type JobRow = {
  id: string;
  kind: string;
  status: string;
  snapshotHash: string;
  timelineVersion: number;
  attemptCount: number;
  qcFailures: string[];
  outputVerified: boolean;
  failureReason: string | null;
  updatedAt: string;
  /** Prompt 17: null while in-flight; false when READY but film changed. */
  isCurrent?: boolean | null;
  hasPoster?: boolean;
};

export function RenderJobPanel({ initialJobs }: { initialJobs: JobRow[] }) {
  const router = useRouter();
  const [jobs, setJobs] = useState(initialJobs);
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function enqueue(kind: 'preview' | 'final') {
    setError(null);
    startTransition(async () => {
      const response = await fetch('/api/renders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        note?: string;
        job?: JobRow;
      };
      if (!response.ok) {
        setError(
          body.error === 'entitlement_required'
            ? 'Memorial Pack is required for a final render.'
            : body.error === 'no_timeline'
              ? 'Arrange a TimelineContract before rendering.'
              : 'Could not enqueue that render.',
        );
        return;
      }
      setNote(body.note ?? null);
      const listed = await fetch('/api/renders');
      if (listed.ok) {
        const data = (await listed.json()) as { jobs: JobRow[] };
        setJobs(data.jobs);
      }
      router.refresh();
    });
  }

  function tickWorker() {
    setError(null);
    startTransition(async () => {
      const response = await fetch('/api/worker/render-once', { method: 'POST' });
      const body = (await response.json().catch(() => ({}))) as {
        note?: string;
        advanced?: { status: string; qcFailures?: string[] };
      };
      if (!response.ok) {
        setError('Worker tick unavailable outside local APP_ENV.');
        return;
      }
      setNote(body.note ?? null);
      const listed = await fetch('/api/renders');
      if (listed.ok) {
        const data = (await listed.json()) as { jobs: JobRow[] };
        setJobs(data.jobs);
      }
      router.refresh();
    });
  }

  return (
    <Card className="!p-6 mb-5">
      <h3 className="serif text-[28px] m-0 mb-2">Ceremony render</h3>
      <p className="text-[color:var(--muted)] mb-4">
        Jobs follow QUEUED → PREPARING → RENDERING → VERIFYING → READY. READY only after Output QC on a
        real 1080p H.264/AAC file. Local encode uses ffmpeg by default; set CREATOR_USE_REMOTION=1 to
        try Remotion when Chrome is present (ffmpeg remains the fallback).
      </p>
      <div className="flex flex-wrap gap-3 mb-4">
        <Button disabled={pending} onClick={() => enqueue('preview')}>
          Enqueue preview
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => enqueue('final')}>
          Enqueue final
        </Button>
        <Button variant="secondary" disabled={pending} onClick={tickWorker}>
          Advance worker once
        </Button>
      </div>
      {note ? (
        <p className="text-[13px] text-[color:var(--muted)] mb-3" role="status">
          {note}
        </p>
      ) : null}
      {error ? (
        <p className="text-[13px] text-[color:var(--accent)] mb-3" role="alert">
          {error}
        </p>
      ) : null}
      {jobs.length === 0 ? (
        <p className="text-[14px] text-[color:var(--muted)] m-0">No render jobs yet.</p>
      ) : (
        <ul className="list-none p-0 m-0 grid gap-2 text-[13px]">
          {jobs.map((job) => (
            <li key={job.id} className="border-t border-[color:var(--border)] pt-2 flex flex-wrap items-center gap-3">
              {job.status === 'READY' && job.hasPoster ? (
                <img
                  className="tribute-poster tribute-poster-desk"
                  src={`/api/renders/poster?jobId=${job.id}`}
                  alt=""
                  width={96}
                  height={54}
                  data-testid="render-desk-poster"
                />
              ) : null}
              <div>
                <strong>{job.kind}</strong> · {job.status}
                {job.outputVerified ? ' · verified' : ''}
                {job.hasPoster ? ' · poster' : ''}
                {job.isCurrent === false ? (
                  <span data-testid="ceremony-render-stale" className="text-[color:var(--accent)]">
                    {' '}
                    · film changed — enqueue an updated copy
                  </span>
                ) : null}
                {job.isCurrent === true ? ' · current' : ''}
                {job.qcFailures.length > 0 ? ` · QC: ${job.qcFailures.join(', ')}` : ''}
                {job.failureReason ? ` · ${job.failureReason}` : ''}
                <span className="text-[color:var(--muted)]"> · v{job.timelineVersion}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
