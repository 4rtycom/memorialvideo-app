'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { LaunchLanguage } from '@memorialvideo/contracts';
import { Button } from '@/components/ui';
import { creatorT } from '@/lib/creator-ui-messages';

export function FirstFilmArrange({
  canArrange,
  alreadyReady,
  locale = 'en',
}: {
  canArrange: boolean;
  alreadyReady: boolean;
  locale?: LaunchLanguage;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (alreadyReady) {
    return (
      <Button href="/film" className="btn-block">
        {creatorT(locale, 'creator.creating.watchFilm')}
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
            ? creatorT(locale, 'creator.creating.errorNeedMore')
            : creatorT(locale, 'creator.creating.errorAdvance'),
        );
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={arrange} disabled={!canArrange || pending} className={pending ? 'opacity-70' : ''}>
        {pending
          ? creatorT(locale, 'creator.creating.arranging')
          : canArrange
            ? creatorT(locale, 'creator.creating.arrangeCta')
            : creatorT(locale, 'creator.creating.needMore')}
      </Button>
      {error ? (
        <p className="text-[12px] text-red-700 m-0" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
