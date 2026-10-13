'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, ErrorState } from '@/components/ui';

type Overview = {
  hasTimeline: boolean;
  hasAudioMix: boolean;
  musicRightsConfirmed: boolean;
  pending: boolean;
  duckingRegions: number;
  trackKinds: string[];
  personalSongs?: Array<{ id: string; title: string }>;
  musicClips?: Array<{ id: string; assetId?: string; startFrame: number; gainDb: number; fadeInFrames: number }>;
  tts: { available: false; status: string; reason: string };
  note: string;
};

export function GuidedAudioPanel() {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [rights, setRights] = useState(false);
  const [fadeFrames, setFadeFrames] = useState(15);
  const [secondGain, setSecondGain] = useState(-6);

  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>('loading');

  function reload() {
    setLoadState('loading');
    void fetch('/api/audio')
      .then(async (r) => {
        if (!r.ok) {
          setError('Could not load Guided Audio.');
          setLoadState('failed');
          return;
        }
        const body = (await r.json()) as Overview;
        setOverview(body);
        setRights(body.musicRightsConfirmed);
        setError(null);
        setLoadState('ready');
      })
      .catch(() => {
        setError('Could not load Guided Audio.');
        setLoadState('failed');
      });
  }

  useEffect(() => {
    reload();
  }, []);

  function placeSongs() {
    const songs = overview?.personalSongs ?? [];
    if (songs.length < 2 || !overview?.hasTimeline) {
      setError('Upload two personal songs and arrange a film first.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const listed = await fetch('/api/tributes/active/timeline');
      const timelineBody = (await listed.json().catch(() => null)) as { totalFrames?: number } | null;
      const total = timelineBody?.totalFrames ?? 0;
      const span = Math.max(30, Math.floor(total / 3));
      const response = await fetch('/api/audio', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'place_personal',
          songs: [
            {
              memoryId: songs[0]!.id,
              startFrame: 0,
              durationFrames: Math.min(span, total),
              fadeInFrames: fadeFrames,
              fadeOutFrames: fadeFrames,
              gainDb: 0,
            },
            {
              memoryId: songs[1]!.id,
              startFrame: Math.max(span, Math.min(total - span, span * 2)),
              durationFrames: Math.min(span, total - Math.max(span, Math.min(total - span, span * 2))),
              fadeInFrames: fadeFrames,
              fadeOutFrames: fadeFrames,
              gainDb: secondGain,
            },
          ],
        }),
      });
      if (!response.ok) {
        setError('Those songs could not be placed. Check rights, trim length, and that they start in different sections.');
        return;
      }
      setStatus('Two personal songs placed, trimmed, and faded.');
      reload();
      router.refresh();
    });
  }

  function run(action: string, okMessage: string) {
    setError(null);
    startTransition(async () => {
      const response = await fetch('/api/audio', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        duckingRegions?: number;
      };
      if (!response.ok) {
        setError(
          body.error === 'needs_timeline'
            ? 'Arrange a first film before Guided Audio.'
            : body.error === 'music_rights'
              ? 'Confirm music rights on the Music page first.'
              : body.error === 'needs_propose'
                ? 'Propose a mix before preview or apply.'
                : 'Guided Audio action failed.',
        );
        return;
      }
      setStatus(
        typeof body.duckingRegions === 'number'
          ? `${okMessage} · ${body.duckingRegions} ducking region(s)`
          : okMessage,
      );
      reload();
      router.refresh();
    });
  }

  return (
    <Card className="!p-7 mt-5" data-testid="guided-audio-panel">
      <h2 className="serif text-[30px] m-0 mb-2">Guided Audio</h2>
      <p className="text-[color:var(--muted)] mb-3">
        Propose a ceremony-safe AudioMixContract with automatic music ducking. Voice cloning stays
        blocked.
      </p>
      <p className="text-[12px] text-[color:var(--accent)] mb-4">
        TTS / voice recreation unavailable (XB-009).
      </p>
      {loadState === 'loading' && !overview ? (
        <p className="text-[13px] text-[color:var(--muted)] mb-4" role="status">
          Loading Guided Audio…
        </p>
      ) : null}
      {loadState === 'failed' && !overview ? (
        <ErrorState
          title={error ?? 'Could not load Guided Audio.'}
          body="Your tribute work is still safe."
          action={
            <Button variant="secondary" onClick={reload}>
              Retry
            </Button>
          }
        />
      ) : (
        <>
          <label className="flex items-start gap-3 text-[14px] mb-4">
            <input
              type="checkbox"
              checked={rights}
              disabled={pending}
              onChange={(e) => setRights(e.target.checked)}
            />
            <span>
              I confirm the selected catalog soundtrack is cleared for a private ceremony screening
              (development catalog).
            </span>
          </label>
          {(overview?.personalSongs?.length ?? 0) >= 2 ? (
            <div className="mb-4 grid gap-3">
              <p className="text-[14px] m-0">
                Place “{overview?.personalSongs?.[0]?.title}” at the opening and “
                {overview?.personalSongs?.[1]?.title}” later in the film. Trim length follows the film.
                Licensed catalogue masters stay unavailable.
              </p>
              <label className="text-[13px] text-[color:var(--muted)]">
                Fade in and out (frames)
                <input
                  className="field mt-1"
                  type="number"
                  min={0}
                  max={120}
                  value={fadeFrames}
                  onChange={(event) => setFadeFrames(Number(event.target.value))}
                />
              </label>
              <label className="text-[13px] text-[color:var(--muted)]">
                Second song gain (dB)
                <input
                  className="field mt-1"
                  type="number"
                  min={-60}
                  max={12}
                  value={secondGain}
                  onChange={(event) => setSecondGain(Number(event.target.value))}
                />
              </label>
              <Button variant="secondary" disabled={pending} onClick={placeSongs}>
                Place two personal songs
              </Button>
            </div>
          ) : (
            <p className="text-[13px] text-[color:var(--muted)] mb-4">
              Upload two personal songs and confirm you have the rights to include them. They can then be placed in
              different parts of the film.
            </p>
          )}
          {(overview?.musicClips?.length ?? 0) >= 2 ? (
            <p className="text-[13px] mb-4" role="status">
              {overview?.musicClips?.length} songs on the timeline
              {overview?.musicClips?.map((clip) => ` · ${clip.assetId ?? clip.id} at frame ${clip.startFrame}`).join('')}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3 mb-3">
            <Button
              variant="secondary"
              disabled={pending || !rights}
              onClick={() => run('propose', 'Mix proposed')}
            >
              Propose mix
            </Button>
            <Button
              variant="secondary"
              disabled={pending || !overview?.pending}
              onClick={() => run('preview', 'Preview ready')}
            >
              Preview
            </Button>
            <Button
              disabled={pending || !overview?.pending}
              onClick={() => run('apply', 'Mix applied to TimelineContract')}
            >
              Apply
            </Button>
            <Button
              variant="ghost"
              disabled={pending || !overview?.hasAudioMix}
              onClick={() => run('revert', 'Reverted last timeline revision')}
            >
              Revert
            </Button>
          </div>
          {overview ? (
            <p className="text-[12px] text-[color:var(--muted)] m-0 mb-2">
              {overview.hasAudioMix
                ? 'AudioMix on timeline'
                : overview.pending
                  ? 'Proposal pending'
                  : 'No mix yet'}
              {overview.trackKinds.length ? ` · tracks: ${overview.trackKinds.join(', ')}` : ''}
              {overview.duckingRegions ? ` · ducking ${overview.duckingRegions}` : ''}
            </p>
          ) : null}
          {overview?.note ? (
            <p className="text-[12px] text-[color:var(--muted)] m-0 mb-2">{overview.note}</p>
          ) : null}
          {status ? (
            <p className="text-[13px] text-[color:var(--primary)] m-0 mb-2">{status}</p>
          ) : null}
          {error ? (
            <ErrorState
              title={error}
              body="Your tribute work is still safe."
              action={
                <Button variant="secondary" onClick={reload}>
                  Retry
                </Button>
              }
            />
          ) : null}
        </>
      )}
    </Card>
  );
}
