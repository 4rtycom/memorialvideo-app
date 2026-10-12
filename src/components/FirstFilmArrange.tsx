'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui';

export function FirstFilmArrange({
  canArrange,
  alreadyReady,
}: {
  canArrange: boolean;
  alreadyReady: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (alreadyReady) {
    return (
      <Button href="/film" className="btn-block">
        ▶  Watch the film
      </Button>
    );
  }

  function arrange() {
    setError(null);
    startTransition(async () => {
      const response = await fetch('/api/tributes/active/first-film', { method: 'POST' });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(
          body.error === 'need_more_memories'
            ? 'Add a few more ready memories first.'
            : 'We could not advance the film. Please try again.',
        );
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={arrange} disabled={!canArrange || pending} className={pending ? 'opacity-70' : ''}>
        {pending ? 'Arranging…' : canArrange ? 'Arrange the first film  ↗' : 'Add more memories first'}
      </Button>
      {error ? (
        <p className="text-[12px] text-red-700 m-0" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
