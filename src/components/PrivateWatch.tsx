'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { TimelineContract } from '@memorialvideo/contracts';
import { Button, ErrorState } from '@/components/ui';
import {
  classifyShareRedeemFailure,
  shareRedeemMessage,
} from '@/lib/async-ui';

const RemotionCinemaPlayer = dynamic(
  () =>
    import('@/components/RemotionCinemaPlayer').then((mod) => mod.RemotionCinemaPlayer),
  { ssr: false, loading: () => <p className="text-[color:var(--muted)]">Loading player…</p> },
);

export function PrivateWatch() {
  const [timeline, setTimeline] = useState<TimelineContract | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [, startTransition] = useTransition();
  const tokenRef = useRef('');
  const started = useRef(false);

  function redeem() {
    const token = tokenRef.current;
    if (!token) {
      setLoading(false);
      setError(shareRedeemMessage('incomplete'));
      setRetryable(false);
      return;
    }
    setLoading(true);
    setError(null);
    setRetryable(false);
    startTransition(async () => {
      try {
        const response = await fetch('/api/shares/redeem', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (!response.ok) {
          setLoading(false);
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          const reason = body.error;
          setError(shareRedeemMessage(reason));
          setRetryable(classifyShareRedeemFailure(reason) === 'retryable');
          return;
        }
        const body = (await response.json()) as {
          displayName: string;
          timeline: TimelineContract | null;
          hasTimeline: boolean;
        };
        setDisplayName(body.displayName);
        setTimeline(body.timeline);
        setLoading(false);
        window.history.replaceState(null, '', '/watch');
        tokenRef.current = '';
      } catch {
        setLoading(false);
        setError(shareRedeemMessage('unavailable'));
        setRetryable(true);
      }
    });
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
    const token = params.get('t') ?? '';
    if (!token || token.length < 16) {
      setLoading(false);
      setError(shareRedeemMessage('incomplete'));
      setRetryable(false);
      return;
    }
    tokenRef.current = token;
    redeem();
  }, []);

  if (loading) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="eyebrow">PRIVATE VIEWING</p>
        <h1 className="serif text-[40px] m-0">Opening…</h1>
      </main>
    );
  }

  if (error || !timeline) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="eyebrow">PRIVATE VIEWING</p>
        <h1 className="serif text-[40px] m-0 mb-4">Unable to play</h1>
        <div className="max-w-md mx-auto text-left">
          <ErrorState
            title={error ?? 'No published TimelineContract is available for this link.'}
            body="Your tribute work is still safe."
            action={
              retryable ? (
                <Button onClick={redeem}>Try again</Button>
              ) : undefined
            }
          />
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <p className="eyebrow">PRIVATE VIEWING</p>
      <h1 className="serif text-[42px] m-0 mb-2">{displayName}</h1>
      <p className="text-[color:var(--muted)] mb-6">
        Screening from a published TimelineContract · verified MP4 download is separate
      </p>
      <RemotionCinemaPlayer
        timeline={timeline}
        origin={typeof window !== 'undefined' ? window.location.origin : ''}
      />
    </main>
  );
}
